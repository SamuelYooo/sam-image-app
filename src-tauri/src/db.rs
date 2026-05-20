use crate::models::{AdapterKind, Artifact, ArtifactUpdateRequest, ModelProfile, PromptTemplate, QueueTask, WorkflowPreset, WorkMode};
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
    let db_dir = base.join("db");
    let db_path = db_dir.join("samimage.sqlite3");
    let legacy_path = base.join("samimage.sqlite3");

    if !db_path.exists() && legacy_path.exists() {
        fs::create_dir_all(&db_dir).context("create SamImage db directory")?;
        fs::copy(&legacy_path, &db_path).context("migrate legacy SamImage database")?;
    }

    Ok(db_path)
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
            source TEXT NOT NULL DEFAULT 'generate',
            type TEXT NOT NULL DEFAULT 'type_default',
            tags TEXT NOT NULL DEFAULT '[]',
            favorite INTEGER NOT NULL DEFAULT 0,
            filter_adjustments TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS prompt_templates (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            prompt TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '通用',
            is_builtin INTEGER NOT NULL DEFAULT 0,
            tags TEXT NOT NULL DEFAULT '[]',
            favorite INTEGER NOT NULL DEFAULT 0,
            usage_count INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS workflow_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '通用',
            description TEXT NOT NULL DEFAULT '',
            prompt TEXT NOT NULL,
            negative_prompt TEXT NOT NULL DEFAULT '',
            size TEXT NOT NULL DEFAULT '1024x1024',
            mode TEXT NOT NULL DEFAULT 'txt2img',
            model_profile_id TEXT,
            seed INTEGER,
            reference_image_hints TEXT NOT NULL DEFAULT '[]',
            tags TEXT NOT NULL DEFAULT '[]',
            is_builtin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS queue_tasks (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            priority INTEGER NOT NULL DEFAULT 0,
            payload TEXT NOT NULL DEFAULT '{}',
            error TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )?;
    ensure_column(conn, "profiles", "available_models", "TEXT NOT NULL DEFAULT '[]'")?;
    ensure_column(conn, "artifacts", "source", "TEXT NOT NULL DEFAULT 'generate'")?;
    ensure_column(conn, "artifacts", "type", "TEXT NOT NULL DEFAULT 'type_default'")?;
    ensure_column(conn, "artifacts", "tags", "TEXT NOT NULL DEFAULT '[]'")?;
    ensure_column(conn, "artifacts", "favorite", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "artifacts", "filter_adjustments", "TEXT")?;
    ensure_column(conn, "prompt_templates", "tags", "TEXT NOT NULL DEFAULT '[]'")?;
    ensure_column(conn, "prompt_templates", "favorite", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "prompt_templates", "usage_count", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "prompt_templates", "source", "TEXT NOT NULL DEFAULT 'user'")?;
    seed_default_prompt_templates(conn)?;
    seed_default_workflow_presets(conn)?;

    // ── Storyboard Workshop ─────────────────────────────────────────────────
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS storyboard_projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            aspect_ratio TEXT NOT NULL DEFAULT '16:9',
            style TEXT NOT NULL DEFAULT '',
            color_palette TEXT NOT NULL DEFAULT '',
            shot_count INTEGER NOT NULL DEFAULT 9,
            master_prompt TEXT NOT NULL DEFAULT '',
            shot_size TEXT NOT NULL DEFAULT '1024x576',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS storyboard_characters (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            appearance TEXT NOT NULL DEFAULT '',
            reference_image TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES storyboard_projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS storyboard_scenes (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '场景 1',
            scene_index INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES storyboard_projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS storyboard_shots (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            scene_id TEXT,
            shot_index INTEGER NOT NULL,
            is_master INTEGER NOT NULL DEFAULT 0,
            framing TEXT NOT NULL DEFAULT 'MS',
            angle TEXT NOT NULL DEFAULT 'eye',
            focal_length TEXT NOT NULL DEFAULT '50mm',
            movement TEXT NOT NULL DEFAULT 'static',
            subject TEXT NOT NULL DEFAULT '',
            environment TEXT NOT NULL DEFAULT '',
            lighting TEXT NOT NULL DEFAULT '',
            mood TEXT NOT NULL DEFAULT '',
            style TEXT NOT NULL DEFAULT '',
            full_prompt TEXT NOT NULL DEFAULT '',
            generated_image_url TEXT,
            artifact_id TEXT,
            duration INTEGER,
            transition TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES storyboard_projects(id) ON DELETE CASCADE,
            FOREIGN KEY (scene_id) REFERENCES storyboard_scenes(id) ON DELETE CASCADE
        );
        "#,
    )?;

    // Migration: add new columns to existing storyboard tables
    ensure_column(conn, "storyboard_projects", "master_prompt", "TEXT NOT NULL DEFAULT ''")?;
    ensure_column(conn, "storyboard_projects", "shot_size", "TEXT NOT NULL DEFAULT '1024x576'")?;
    ensure_column(conn, "storyboard_shots", "scene_id", "TEXT")?;
    ensure_column(conn, "storyboard_shots", "is_master", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "storyboard_shots", "full_prompt", "TEXT NOT NULL DEFAULT ''")?;

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
    let filter_json = artifact.filter_adjustments.as_ref()
        .and_then(|f| serde_json::to_string(f).ok());
    conn.execute(
        r#"
        INSERT INTO artifacts (id, profile_id, mode, prompt, image_url, source, type, tags, favorite, filter_adjustments, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))
        "#,
        params![
            artifact.id,
            artifact.profile_id,
            artifact.mode.as_str(),
            artifact.prompt,
            artifact.image_url,
            artifact.source,
            artifact.type_,
            serde_json::to_string(&artifact.tags).unwrap_or_else(|_| "[]".to_string()),
            if artifact.favorite { 1 } else { 0 },
            filter_json,
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

pub fn update_artifact(conn: &Connection, id: &str, request: &ArtifactUpdateRequest) -> Result<Artifact> {
    let filter_json = request.filter_adjustments.as_ref()
        .and_then(|f| serde_json::to_string(f).ok());
    conn.execute(
        r#"
        UPDATE artifacts
        SET tags = ?2, favorite = ?3, filter_adjustments = ?4
        WHERE id = ?1
        "#,
        params![
            id,
            serde_json::to_string(&request.tags).unwrap_or_else(|_| "[]".to_string()),
            if request.favorite { 1 } else { 0 },
            filter_json,
        ],
    )?;
    list_artifacts(conn)?
        .into_iter()
        .find(|item| item.id == id)
        .context("updated artifact not found")
}

pub fn list_artifacts(conn: &Connection) -> Result<Vec<Artifact>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, profile_id, mode, prompt, image_url, source, type, tags, favorite, filter_adjustments, created_at
        FROM artifacts
        ORDER BY created_at DESC
        "#,
    )?;
    let rows = stmt.query_map([], artifact_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().context("load artifacts")
}

pub fn list_prompt_templates(conn: &Connection) -> Result<Vec<PromptTemplate>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, title, prompt, category, is_builtin, tags, favorite, usage_count, source, created_at, updated_at
        FROM prompt_templates
        ORDER BY is_builtin DESC, favorite DESC, updated_at DESC, title ASC
        "#,
    )?;
    let rows = stmt.query_map([], prompt_template_from_row)?;
    rows.collect::<Result<Vec<_>, _>>()
        .context("load prompt templates")
}

pub fn upsert_prompt_template(
    conn: &Connection,
    template: &PromptTemplate,
) -> Result<PromptTemplate> {
    conn.execute(
        r#"
        INSERT INTO prompt_templates (
            id, title, prompt, category, is_builtin, tags, favorite, usage_count, source, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            prompt = excluded.prompt,
            category = excluded.category,
            tags = excluded.tags,
            favorite = excluded.favorite,
            usage_count = excluded.usage_count,
            source = excluded.source,
            is_builtin = prompt_templates.is_builtin,
            updated_at = datetime('now')
        "#,
        params![
            template.id,
            template.title,
            template.prompt,
            template.category,
            if template.is_builtin { 1 } else { 0 },
            serde_json::to_string(&template.tags).unwrap_or_else(|_| "[]".to_string()),
            if template.favorite { 1 } else { 0 },
            template.usage_count,
            template.source,
        ],
    )?;

    get_prompt_template(conn, &template.id)
}

pub fn get_prompt_template(conn: &Connection, id: &str) -> Result<PromptTemplate> {
    conn.query_row(
        r#"
        SELECT id, title, prompt, category, is_builtin, tags, favorite, usage_count, source, created_at, updated_at
        FROM prompt_templates
        WHERE id = ?1
        "#,
        [id],
        prompt_template_from_row,
    )
    .context("prompt template not found")
}

pub fn delete_prompt_template(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM prompt_templates WHERE id = ?1", [id])?;
    Ok(())
}

pub fn list_workflow_presets(conn: &Connection) -> Result<Vec<WorkflowPreset>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, name, category, description, prompt, negative_prompt, size, mode,
               model_profile_id, seed, reference_image_hints, tags, is_builtin, created_at, updated_at
        FROM workflow_presets
        ORDER BY is_builtin DESC, updated_at DESC, name ASC
        "#,
    )?;
    let rows = stmt.query_map([], workflow_preset_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().context("load workflow presets")
}

pub fn upsert_workflow_preset(conn: &Connection, preset: &WorkflowPreset) -> Result<WorkflowPreset> {
    conn.execute(
        r#"
        INSERT INTO workflow_presets (
            id, name, category, description, prompt, negative_prompt, size, mode, model_profile_id,
            seed, reference_image_hints, tags, is_builtin, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            category = excluded.category,
            description = excluded.description,
            prompt = excluded.prompt,
            negative_prompt = excluded.negative_prompt,
            size = excluded.size,
            mode = excluded.mode,
            model_profile_id = excluded.model_profile_id,
            seed = excluded.seed,
            reference_image_hints = excluded.reference_image_hints,
            tags = excluded.tags,
            is_builtin = workflow_presets.is_builtin,
            updated_at = datetime('now')
        "#,
        params![
            preset.id,
            preset.name,
            preset.category,
            preset.description,
            preset.prompt,
            preset.negative_prompt,
            preset.size,
            preset.mode.as_str(),
            preset.model_profile_id,
            preset.seed,
            serde_json::to_string(&preset.reference_image_hints).unwrap_or_else(|_| "[]".to_string()),
            serde_json::to_string(&preset.tags).unwrap_or_else(|_| "[]".to_string()),
            if preset.is_builtin { 1 } else { 0 },
        ],
    )?;
    get_workflow_preset(conn, &preset.id)
}

pub fn get_workflow_preset(conn: &Connection, id: &str) -> Result<WorkflowPreset> {
    conn.query_row(
        r#"
        SELECT id, name, category, description, prompt, negative_prompt, size, mode,
               model_profile_id, seed, reference_image_hints, tags, is_builtin, created_at, updated_at
        FROM workflow_presets
        WHERE id = ?1
        "#,
        [id],
        workflow_preset_from_row,
    )
    .context("workflow preset not found")
}

pub fn delete_workflow_preset(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM workflow_presets WHERE id = ?1 AND is_builtin = 0", [id])?;
    Ok(())
}

pub fn list_queue_tasks(conn: &Connection) -> Result<Vec<QueueTask>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, type, status, priority, payload, error, created_at, updated_at
        FROM queue_tasks
        ORDER BY priority DESC, created_at ASC
        "#,
    )?;
    let rows = stmt.query_map([], queue_task_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().context("load queue tasks")
}

pub fn upsert_queue_task(conn: &Connection, task: &QueueTask) -> Result<QueueTask> {
    conn.execute(
        r#"
        INSERT INTO queue_tasks (id, type, status, priority, payload, error, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            status = excluded.status,
            priority = excluded.priority,
            payload = excluded.payload,
            error = excluded.error,
            updated_at = datetime('now')
        "#,
        params![
            task.id,
            task.type_,
            task.status,
            task.priority,
            task.payload.to_string(),
            task.error,
        ],
    )?;
    list_queue_tasks(conn)?
        .into_iter()
        .find(|item| item.id == task.id)
        .context("upserted queue task not found")
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

    let source: String = row.get(5)?;
    let type_: String = row.get(6)?;
    let tags = serde_json::from_str::<Vec<String>>(&row.get::<_, String>(7)?).unwrap_or_default();
    let filter_str: Option<String> = row.get(9)?;
    let filter_adjustments = filter_str.and_then(|s| serde_json::from_str(&s).ok());

    Ok(Artifact {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        mode,
        prompt: row.get(3)?,
        image_url: row.get(4)?,
        source,
        type_,
        tags,
        favorite: row.get::<_, i64>(8)? != 0,
        filter_adjustments,
        created_at: row.get(10)?,
    })
}

fn prompt_template_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PromptTemplate> {
    let tags = serde_json::from_str::<Vec<String>>(&row.get::<_, String>(5)?).unwrap_or_default();
    Ok(PromptTemplate {
        id: row.get(0)?,
        title: row.get(1)?,
        prompt: row.get(2)?,
        category: row.get(3)?,
        is_builtin: row.get::<_, i64>(4)? != 0,
        tags,
        favorite: row.get::<_, i64>(6)? != 0,
        usage_count: row.get::<_, i64>(7)? as u32,
        source: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn workflow_preset_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkflowPreset> {
    let mode: String = row.get(7)?;
    let mode = match mode.as_str() {
        "img2img" => WorkMode::Img2img,
        "reverse" => WorkMode::Reverse,
        "blend" => WorkMode::Blend,
        _ => WorkMode::Txt2img,
    };
    let reference_image_hints = serde_json::from_str::<Vec<String>>(&row.get::<_, String>(10)?).unwrap_or_default();
    let tags = serde_json::from_str::<Vec<String>>(&row.get::<_, String>(11)?).unwrap_or_default();
    Ok(WorkflowPreset {
        id: row.get(0)?,
        name: row.get(1)?,
        category: row.get(2)?,
        description: row.get(3)?,
        prompt: row.get(4)?,
        negative_prompt: row.get(5)?,
        size: row.get(6)?,
        mode,
        model_profile_id: row.get(8)?,
        seed: row.get(9)?,
        reference_image_hints,
        tags,
        is_builtin: row.get::<_, i64>(12)? != 0,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn queue_task_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<QueueTask> {
    let payload = serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(4)?).unwrap_or_else(|_| serde_json::json!({}));
    Ok(QueueTask {
        id: row.get(0)?,
        type_: row.get(1)?,
        status: row.get(2)?,
        priority: row.get(3)?,
        payload,
        error: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn storyboard_project_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<crate::models::StoryboardProject> {
    Ok(crate::models::StoryboardProject {
        id: row.get(0)?,
        name: row.get(1)?,
        aspect_ratio: row.get(2)?,
        style: row.get(3)?,
        color_palette: row.get(4)?,
        shot_count: row.get(5)?,
        master_prompt: row.get(6)?,
        shot_size: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}


fn storyboard_shot_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<crate::models::StoryboardShot> {
    Ok(crate::models::StoryboardShot {
        id: row.get(0)?,
        project_id: row.get(1)?,
        scene_id: row.get(2)?,
        shot_index: row.get(3)?,
        is_master: row.get::<_, i64>(4)? != 0,
        framing: row.get(5)?,
        angle: row.get(6)?,
        focal_length: row.get(7)?,
        movement: row.get(8)?,
        subject: row.get(9)?,
        environment: row.get(10)?,
        lighting: row.get(11)?,
        mood: row.get(12)?,
        style: row.get(13)?,
        full_prompt: row.get(14)?,
        generated_image_url: row.get(15)?,
        artifact_id: row.get(16)?,
        duration: row.get(17)?,
        transition: row.get(18)?,
        created_at: row.get(19)?,
    })
}

// ── Storyboard CRUD ──────────────────────────────────────────────────────────

pub fn list_storyboard_projects(conn: &Connection) -> Result<Vec<crate::models::StoryboardProject>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, aspect_ratio, style, color_palette, shot_count, master_prompt, shot_size, created_at, updated_at FROM storyboard_projects ORDER BY updated_at DESC, created_at DESC"
    )?;
    let rows = stmt.query_map([], storyboard_project_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().context("load storyboard projects")
}

pub fn insert_storyboard_project(conn: &Connection, project: &crate::models::StoryboardProject) -> Result<crate::models::StoryboardProject> {
    conn.execute(
        "INSERT INTO storyboard_projects (id, name, aspect_ratio, style, color_palette, shot_count, master_prompt, shot_size, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now'))",
        params![project.id, project.name, project.aspect_ratio, project.style, project.color_palette, project.shot_count, project.master_prompt, project.shot_size],
    )?;
    get_storyboard_project(conn, &project.id)
}

pub fn get_storyboard_project(conn: &Connection, id: &str) -> Result<crate::models::StoryboardProject> {
    conn.query_row(
        "SELECT id, name, aspect_ratio, style, color_palette, shot_count, master_prompt, shot_size, created_at, updated_at FROM storyboard_projects WHERE id = ?1",
        [id],
        storyboard_project_from_row,
    ).context("storyboard project not found")
}

pub fn update_storyboard_project(conn: &Connection, id: &str, req: &crate::api::UpdateStoryboardProjectRequest) -> Result<crate::models::StoryboardProject> {
    let current = get_storyboard_project(conn, id)?;
    let new_name = req.name.as_ref().unwrap_or(&current.name);
    let new_aspect_ratio = req.aspect_ratio.as_ref().unwrap_or(&current.aspect_ratio);
    let new_style = req.style.as_ref().unwrap_or(&current.style);
    let new_color_palette = req.color_palette.as_ref().unwrap_or(&current.color_palette);
    let new_master_prompt = req.master_prompt.as_ref().unwrap_or(&current.master_prompt);
    let new_shot_size = req.shot_size.as_ref().unwrap_or(&current.shot_size);
    conn.execute(
        "UPDATE storyboard_projects SET name = ?1, aspect_ratio = ?2, style = ?3, color_palette = ?4, master_prompt = ?5, shot_size = ?6, updated_at = datetime('now') WHERE id = ?7",
        params![new_name, new_aspect_ratio, new_style, new_color_palette, new_master_prompt, new_shot_size, id],
    )?;
    get_storyboard_project(conn, id)
}

pub fn delete_storyboard_project(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM storyboard_projects WHERE id = ?1", [id])?;
    Ok(())
}

pub fn list_storyboard_shots(conn: &Connection, project_id: &str, scene_id: Option<&str>) -> Result<Vec<crate::models::StoryboardShot>> {
    let sql = if scene_id.is_some() {
        "SELECT id, project_id, scene_id, shot_index, is_master, framing, angle, focal_length, movement, subject, environment, lighting, mood, style, full_prompt, generated_image_url, artifact_id, duration, transition, created_at FROM storyboard_shots WHERE project_id = ?1 AND scene_id = ?2 ORDER BY shot_index ASC"
    } else {
        "SELECT id, project_id, scene_id, shot_index, is_master, framing, angle, focal_length, movement, subject, environment, lighting, mood, style, full_prompt, generated_image_url, artifact_id, duration, transition, created_at FROM storyboard_shots WHERE project_id = ?1 ORDER BY shot_index ASC"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = if let Some(sid) = scene_id {
        stmt.query_map(params![project_id, sid], storyboard_shot_from_row)?
    } else {
        stmt.query_map([project_id], storyboard_shot_from_row)?
    };
    rows.collect::<Result<Vec<_>, _>>().context("load storyboard shots")
}

pub fn insert_storyboard_shot(conn: &Connection, shot: &crate::models::StoryboardShot) -> Result<crate::models::StoryboardShot> {
    conn.execute(
        "INSERT INTO storyboard_shots (id, project_id, scene_id, shot_index, is_master, framing, angle, focal_length, movement, subject, environment, lighting, mood, style, full_prompt, generated_image_url, artifact_id, duration, transition, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, datetime('now'))",
        params![
            shot.id, shot.project_id, shot.scene_id, shot.shot_index,
            if shot.is_master { 1 } else { 0 },
            shot.framing, shot.angle, shot.focal_length, shot.movement,
            shot.subject, shot.environment, shot.lighting, shot.mood, shot.style, shot.full_prompt,
            shot.generated_image_url, shot.artifact_id, shot.duration, shot.transition,
        ],
    )?;
    get_storyboard_shot(conn, &shot.id)
}

pub fn get_storyboard_shot(conn: &Connection, id: &str) -> Result<crate::models::StoryboardShot> {
    conn.query_row(
        "SELECT id, project_id, scene_id, shot_index, is_master, framing, angle, focal_length, movement, subject, environment, lighting, mood, style, full_prompt, generated_image_url, artifact_id, duration, transition, created_at FROM storyboard_shots WHERE id = ?1",
        [id],
        storyboard_shot_from_row,
    ).context("storyboard shot not found")
}

pub fn update_storyboard_shot(conn: &Connection, id: &str, req: &crate::api::UpdateShotRequest) -> Result<crate::models::StoryboardShot> {
    let current = get_storyboard_shot(conn, id)?;
    conn.execute(
        "UPDATE storyboard_shots SET framing = ?1, angle = ?2, focal_length = ?3, movement = ?4, subject = ?5, environment = ?6, lighting = ?7, mood = ?8, style = ?9, full_prompt = ?10, generated_image_url = ?11, artifact_id = ?12, duration = ?13, transition = ?14, shot_index = ?15, is_master = ?16 WHERE id = ?17",
        params![
            req.framing.as_ref().unwrap_or(&current.framing),
            req.angle.as_ref().unwrap_or(&current.angle),
            req.focal_length.as_ref().unwrap_or(&current.focal_length),
            req.movement.as_ref().unwrap_or(&current.movement),
            req.subject.as_ref().unwrap_or(&current.subject),
            req.environment.as_ref().unwrap_or(&current.environment),
            req.lighting.as_ref().unwrap_or(&current.lighting),
            req.mood.as_ref().unwrap_or(&current.mood),
            req.style.as_ref().unwrap_or(&current.style),
            req.full_prompt.as_ref().unwrap_or(&current.full_prompt),
            req.generated_image_url.as_ref().unwrap_or(&current.generated_image_url.unwrap_or_default()),
            req.artifact_id.as_ref().unwrap_or(&current.artifact_id.unwrap_or_default()),
            req.duration.unwrap_or(current.duration.unwrap_or(0)),
            req.transition.as_ref().unwrap_or(&current.transition.unwrap_or_default()),
            req.shot_index.unwrap_or(current.shot_index),
            if req.is_master.unwrap_or(current.is_master) { 1 } else { 0 },
            id,
        ],
    )?;
    get_storyboard_shot(conn, id)
}

pub fn delete_storyboard_shot(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM storyboard_shots WHERE id = ?1", [id])?;
    Ok(())
}

pub fn update_storyboard_shot_url(conn: &Connection, id: &str, image_url: &str, artifact_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE storyboard_shots SET generated_image_url = ?1, artifact_id = ?2 WHERE id = ?3",
        params![image_url, artifact_id, id],
    )?;
    Ok(())
}

fn seed_default_prompt_templates(conn: &Connection) -> Result<()> {
    for template in default_prompt_templates() {
        let tags_json = serde_json::to_string(&template.tags).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            r#"
            INSERT OR IGNORE INTO prompt_templates (id, title, prompt, category, is_builtin, tags, favorite, usage_count, source, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, 1, ?5, 0, 0, 'builtin', datetime('now'), datetime('now'))
            "#,
            params![
                template.id,
                template.title,
                template.prompt,
                template.category,
                tags_json,
            ],
        )?;
        conn.execute(
            r#"
            UPDATE prompt_templates
            SET title = ?2, prompt = ?3, category = ?4, tags = ?5, source = 'builtin', updated_at = datetime('now')
            WHERE id = ?1 AND is_builtin = 1
            "#,
            params![
                template.id,
                template.title,
                template.prompt,
                template.category,
                tags_json,
            ],
        )?;
    }
    Ok(())
}

fn seed_default_workflow_presets(conn: &Connection) -> Result<()> {
    let presets = [
        (
            "workflow-wechat-cover",
            "公众号大封面",
            "社交媒体封面",
            "适合公众号头图、文章封面和品牌视觉。",
            "一张有清晰主标题区域的公众号文章大封面，主体明确，构图稳重，背景干净，有高级品牌视觉质感。",
            "低清晰度，水印，错误文字，杂乱排版",
            "900x383",
            "社交媒体,公众号,封面",
        ),
        (
            "workflow-xiaohongshu-cover",
            "小红书图文封面",
            "社交媒体封面",
            "适合小红书竖版图文封面，突出主题与点击感。",
            "一张小红书竖版图文封面，视觉中心明确，色彩清爽，有生活方式质感，适合添加醒目标题。",
            "低清晰度，水印，过度复杂，主体不清晰",
            "1242x1660",
            "小红书,封面,图文",
        ),
        (
            "workflow-product-poster",
            "电商产品主图",
            "电商主图",
            "适合商品展示、品牌海报和推广图。",
            "一张干净高级的电商产品主图，产品位于画面中心，柔和摄影棚光线，背景简洁，突出材质和卖点。",
            "低清晰度，变形，杂乱背景，文字水印",
            "1024x1024",
            "电商,产品,主图",
        ),
        (
            "workflow-bilibili-cover",
            "B站视频封面",
            "视频封面",
            "适合横版视频封面和内容标题视觉。",
            "一张横版视频封面，主体强烈，画面有冲击力，左侧或右侧预留标题空间，整体适合内容平台推荐流。",
            "低清晰度，水印，模糊，主体过小",
            "1146x717",
            "B站,视频,封面",
        ),
    ];

    for (id, name, category, description, prompt, negative_prompt, size, tags) in presets {
        let tags_json = serde_json::to_string(&tags.split(',').map(str::to_string).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            r#"
            INSERT OR IGNORE INTO workflow_presets (
                id, name, category, description, prompt, negative_prompt, size, mode,
                reference_image_hints, tags, is_builtin, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'txt2img', '[]', ?8, 1, datetime('now'), datetime('now'))
            "#,
            params![id, name, category, description, prompt, negative_prompt, size, tags_json],
        )?;
    }
    Ok(())
}

fn default_prompt_templates() -> Vec<PromptTemplate> {
    vec![
        PromptTemplate {
            id: "preset-tokyo-storyboard-3x4".to_string(),
            title: "东京街头电影分镜 3x4".to_string(),
            category: "分镜".to_string(),
            prompt: "做一张 3x4 的电影分镜网格，同一个短发女主角穿米白色风衣，场景是晴天下午的东京街头。12 格分别是正面近景、眼神特写、背影中景、低机位仰拍、隔着咖啡店玻璃的反射镜头、穿过斑马线的跟拍镜头、侧脸迎光、地铁出口俯拍、从花店门口向外看的 POV、街角长焦压缩、站在阳光里的停顿、最后一格远景留白。要求角色身份高度一致，画面明亮、有空气感，像都市电影前期分镜。".to_string(),
            is_builtin: true,
            tags: Vec::new(),
            favorite: false,
            usage_count: 0,
            source: "builtin".to_string(),
            created_at: None,
            updated_at: None,
        },
        PromptTemplate {
            id: "preset-action-storyboard-3x3".to_string(),
            title: "港口动作分镜 3x3".to_string(),
            category: "分镜".to_string(),
            prompt: "做一张 3x3 的动作场景分镜，同一个运动感很强的角色在阳光下的港口集装箱区快速穿行。九格分别表现观察、起跑、翻越障碍、手部抓握特写、阳光扫过侧脸、背影冲刺、低机位移动、突然回头、远景跳上高处。风格干净、利落、速度感强，像 AAA 游戏过场镜头。".to_string(),
            is_builtin: true,
            tags: Vec::new(),
            favorite: false,
            usage_count: 0,
            source: "builtin".to_string(),
            created_at: None,
            updated_at: None,
        },
        PromptTemplate {
            id: "preset-scout-character-sheet".to_string(),
            title: "女侦察兵八面设定板".to_string(),
            category: "角色设定".to_string(),
            prompt: "做一张纯白背景的 8 面角色设定板，一个 28 岁女侦察兵，短黑发，左眼旁有一道浅疤，穿深墨绿色轻型战术外套和黑色靴子。上排是正面、背面、左侧、右侧全身，下排是头部正面、背面、左侧、右侧。要求比例精确、脸一致、衣服一致、不要道具、不要文字。".to_string(),
            is_builtin: true,
            tags: Vec::new(),
            favorite: false,
            usage_count: 0,
            source: "builtin".to_string(),
            created_at: None,
            updated_at: None,
        },
        PromptTemplate {
            id: "preset-chinese-newspaper-storm-frontpage".to_string(),
            title: "暴风雨中文大报头版".to_string(),
            category: "平面排版".to_string(),
            prompt: "做一张假的中文大报头版，像一份周日大报的头条封面。主题是一座海边城市遭遇百年一遇暴风雨。要有主标题、副标题、导语、栏目分区、天气栏、照片说明、边栏短讯，整体排版像真正能印出来的报纸头版。".to_string(),
            is_builtin: true,
            tags: Vec::new(),
            favorite: false,
            usage_count: 0,
            source: "builtin".to_string(),
            created_at: None,
            updated_at: None,
        },
        PromptTemplate {
            id: "preset-night-shift-city-magazine-spread".to_string(),
            title: "夜班城市杂志跨页".to_string(),
            category: "平面排版".to_string(),
            prompt: "做一组双页杂志跨页，主题是夜班城市。左页是一张横跨整页的夜间巴士站照片，右页是正文、引文、数据小框和小照片排版。气质像深度报道杂志，不要企业年报感。".to_string(),
            is_builtin: true,
            tags: Vec::new(),
            favorite: false,
            usage_count: 0,
            source: "builtin".to_string(),
            created_at: None,
            updated_at: None,
        },
        PromptTemplate {
            id: "preset-power-camera-movement-board".to_string(),
            title: "电源运镜电影制作板".to_string(),
            category: "分镜".to_string(),
            prompt: "创建一个电影制作板/视觉规划表，比例（16:9），展示短片或商业广告的完整概念（包含项目名称、概念简介等内容），高级电影质感镜头（禁止任何手绘或者漫画风格）。故事板部分：一个从多个角度展示的画面主体，部分镜头为空镜，部分镜头为人与空间的互动，生成一系列编号的分镜头（9 个镜头）展示场景的进展，整体分镜构图留白高级，充满电影叙事感。每个帧包括：摄像机类型/镜头感觉，镜头景别（广角、中景、特写、微距），拍摄视角（俯拍、仰拍、侧面拍摄），运镜方式（环绕、静态、跟踪、手持、悬臂等），动作和情绪进展的简要描述。灯光/情绪/风格备注：与灯光条件、氛围相关的视觉示例和简短描述。情绪和关键词块：指导作品的简洁情绪基调主题描述列表。音频/音调部分：环境声音、音乐风格和整体声音氛围的指示。电影摄影笔记：包括镜头特性、风格和后期处理感觉的总体视觉哲学。整个版面应感觉连贯、电影化且专业设计——就像导演的预制作指南，能一眼传达出基调、节奏和视觉叙事。字体清晰，中文展示。".to_string(),
            is_builtin: true,
            tags: vec!["分镜".to_string(), "运镜".to_string(), "电影制作板".to_string()],
            favorite: false,
            usage_count: 0,
            source: "builtin".to_string(),
            created_at: None,
            updated_at: None,
        },
        PromptTemplate {
            id: "preset-f1-evolution-infographic".to_string(),
            title: "F1 赛车进化信息图".to_string(),
            category: "信息图".to_string(),
            prompt: "做一张 F1 赛车进化信息图中文描述，从 1950 年代到 2026 年，横向排列五个关键时代的赛车外观轮廓，底部标注技术变化、空气动力学变化和轮胎特征。整体像赛车博物馆墙上的展示图。".to_string(),
            is_builtin: true,
            tags: Vec::new(),
            favorite: false,
            usage_count: 0,
            source: "builtin".to_string(),
            created_at: None,
            updated_at: None,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::{
        delete_prompt_template, list_artifacts, list_prompt_templates, migrate, upsert_prompt_template,
    };
    use crate::models::PromptTemplate;
    use rusqlite::Connection;

    #[test]
    fn migrate_seeds_default_prompt_templates_once() {
        let conn = Connection::open_in_memory().unwrap();

        migrate(&conn).unwrap();
        let templates = list_prompt_templates(&conn).unwrap();

        assert_eq!(templates.len(), 7);
        assert!(templates.iter().all(|template| template.is_builtin));
        assert!(templates
            .iter()
            .any(|template| template.title == "东京街头电影分镜 3x4"));
        assert!(templates
            .iter()
            .any(|template| template.title == "电源运镜电影制作板"));
        assert!(templates
            .iter()
            .any(|template| template.title == "F1 赛车进化信息图"));

        migrate(&conn).unwrap();
        assert_eq!(list_prompt_templates(&conn).unwrap().len(), 7);
    }

    #[test]
    fn migrate_adds_filter_adjustments_to_existing_artifacts() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE profiles (
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
            CREATE TABLE artifacts (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                mode TEXT NOT NULL,
                prompt TEXT NOT NULL,
                image_url TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'generate',
                type TEXT NOT NULL DEFAULT 'type_default',
                tags TEXT NOT NULL DEFAULT '[]',
                favorite INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO artifacts (id, profile_id, mode, prompt, image_url)
            VALUES ('artifact-1', 'profile-1', 'txt2img', 'prompt', 'data:image/png;base64,AAAA');
            "#,
        )
        .unwrap();

        migrate(&conn).unwrap();

        let artifacts = list_artifacts(&conn).unwrap();
        assert_eq!(artifacts.len(), 1);
        assert!(artifacts[0].filter_adjustments.is_none());
    }

    #[test]
    fn upserts_and_deletes_custom_prompt_templates() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();

        let created = upsert_prompt_template(
            &conn,
            &PromptTemplate {
                id: "custom-template".to_string(),
                title: "自定义模板".to_string(),
                prompt: "一张明亮的产品海报".to_string(),
                category: "商业".to_string(),
                is_builtin: false,
                tags: Vec::new(),
                favorite: false,
                usage_count: 0,
                source: "user".to_string(),
                created_at: None,
                updated_at: None,
            },
        )
        .unwrap();

        assert_eq!(created.title, "自定义模板");
        assert!(!created.is_builtin);
        assert_eq!(list_prompt_templates(&conn).unwrap().len(), 8);

        let updated = upsert_prompt_template(
            &conn,
            &PromptTemplate {
                id: "custom-template".to_string(),
                title: "更新后的模板".to_string(),
                prompt: "一张干净的品牌海报".to_string(),
                category: "商业".to_string(),
                is_builtin: false,
                tags: Vec::new(),
                favorite: false,
                usage_count: 0,
                source: "user".to_string(),
                created_at: None,
                updated_at: None,
            },
        )
        .unwrap();

        assert_eq!(updated.title, "更新后的模板");
        assert_eq!(updated.prompt, "一张干净的品牌海报");

        delete_prompt_template(&conn, "custom-template").unwrap();
        assert_eq!(list_prompt_templates(&conn).unwrap().len(), 7);
    }
}
