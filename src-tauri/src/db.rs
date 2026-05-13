use crate::models::{AdapterKind, Artifact, ModelProfile, WorkMode};
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

pub fn open_database(app_handle: &tauri::AppHandle) -> Result<Connection> {
    let db_path = database_path(app_handle)?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).context("create SamImage data directory")?;
    }

    let conn = Connection::open(db_path).context("open SamImage SQLite database")?;
    conn.busy_timeout(Duration::from_secs(8))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

fn database_path(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    let base = app_handle
        .path()
        .app_data_dir()
        .context("resolve app data directory")?;
    Ok(base.join("samimage.sqlite3"))
}

fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            adapter TEXT NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            model TEXT NOT NULL,
            available_models TEXT NOT NULL DEFAULT '[]',
            chat_endpoint TEXT NOT NULL,
            image_endpoint TEXT NOT NULL,
            timeout_sec INTEGER NOT NULL,
            reference_image_limit INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL,
            mode TEXT NOT NULL,
            prompt TEXT NOT NULL,
            image_url TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        );
        "#,
    )?;
    ensure_column(conn, "profiles", "available_models", "TEXT NOT NULL DEFAULT '[]'")?;
    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for existing in columns {
        if existing? == column {
            return Ok(());
        }
    }
    conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"), [])?;
    Ok(())
}

pub fn list_profiles(conn: &Connection) -> Result<Vec<ModelProfile>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, name, adapter, base_url, api_key, model, available_models, chat_endpoint, image_endpoint,
               timeout_sec, reference_image_limit, created_at, updated_at
        FROM profiles
        ORDER BY updated_at DESC, name ASC
        "#,
    )?;

    let rows = stmt.query_map([], profile_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().context("load profiles")
}

pub fn upsert_profile(conn: &Connection, profile: &ModelProfile) -> Result<ModelProfile> {
    conn.execute(
        r#"
        INSERT INTO profiles (
            id, name, adapter, base_url, api_key, model, available_models, chat_endpoint, image_endpoint,
            timeout_sec, reference_image_limit, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            adapter = excluded.adapter,
            base_url = excluded.base_url,
            api_key = excluded.api_key,
            model = excluded.model,
            available_models = excluded.available_models,
            chat_endpoint = excluded.chat_endpoint,
            image_endpoint = excluded.image_endpoint,
            timeout_sec = excluded.timeout_sec,
            reference_image_limit = excluded.reference_image_limit,
            updated_at = datetime('now')
        "#,
        params![
            profile.id,
            profile.name,
            profile.adapter.as_str(),
            profile.base_url,
            profile.api_key,
            profile.model,
            serde_json::to_string(&profile.available_models).unwrap_or_else(|_| "[]".to_string()),
            profile.chat_endpoint,
            profile.image_endpoint,
            profile.timeout_sec,
            profile.reference_image_limit,
        ],
    )?;

    get_profile(conn, &profile.id)
}

pub fn get_profile(conn: &Connection, id: &str) -> Result<ModelProfile> {
    conn.query_row(
        r#"
        SELECT id, name, adapter, base_url, api_key, model, available_models, chat_endpoint, image_endpoint,
               timeout_sec, reference_image_limit, created_at, updated_at
        FROM profiles
        WHERE id = ?1
        "#,
        [id],
        profile_from_row,
    )
    .context("profile not found")
}

pub fn delete_profile(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM profiles WHERE id = ?1", [id])?;
    Ok(())
}

pub fn insert_artifact(conn: &Connection, artifact: &Artifact) -> Result<Artifact> {
    conn.execute(
        r#"
        INSERT INTO artifacts (id, profile_id, mode, prompt, image_url, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
        "#,
        params![
            artifact.id,
            artifact.profile_id,
            artifact.mode.as_str(),
            artifact.prompt,
            artifact.image_url,
        ],
    )?;
    list_artifacts(conn)?
        .into_iter()
        .find(|item| item.id == artifact.id)
        .context("inserted artifact not found")
}

pub fn delete_artifact(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM artifacts WHERE id = ?1", [id])?;
    Ok(())
}

pub fn list_artifacts(conn: &Connection) -> Result<Vec<Artifact>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, profile_id, mode, prompt, image_url, created_at
        FROM artifacts
        ORDER BY created_at DESC
        "#,
    )?;
    let rows = stmt.query_map([], artifact_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().context("load artifacts")
}

fn profile_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ModelProfile> {
    let adapter: String = row.get(2)?;
    Ok(ModelProfile {
        id: row.get(0)?,
        name: row.get(1)?,
        adapter: AdapterKind::try_from(adapter.as_str()).map_err(|err| {
            rusqlite::Error::FromSqlConversionFailure(
                2,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, err)),
            )
        })?,
        base_url: row.get(3)?,
        api_key: row.get(4)?,
        model: row.get(5)?,
        available_models: serde_json::from_str::<Vec<String>>(&row.get::<_, String>(6)?)
            .unwrap_or_default(),
        chat_endpoint: row.get(7)?,
        image_endpoint: row.get(8)?,
        timeout_sec: row.get::<_, i64>(9)? as u64,
        reference_image_limit: row.get::<_, i64>(10)? as u8,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn artifact_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Artifact> {
    let mode: String = row.get(2)?;
    let mode = match mode.as_str() {
        "txt2img" => WorkMode::Txt2img,
        "img2img" => WorkMode::Img2img,
        "reverse" => WorkMode::Reverse,
        "blend" => WorkMode::Blend,
        _ => WorkMode::Txt2img,
    };

    Ok(Artifact {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        mode,
        prompt: row.get(3)?,
        image_url: row.get(4)?,
        created_at: row.get(5)?,
    })
}
