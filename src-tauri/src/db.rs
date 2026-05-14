use crate::models::{AdapterKind, Artifact, ModelProfile, PromptTemplate, WorkMode};
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
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS prompt_templates (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            prompt TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '通用',
            is_builtin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )?;
    ensure_column(conn, "profiles", "available_models", "TEXT NOT NULL DEFAULT '[]'")?;
    ensure_column(conn, "artifacts", "source", "TEXT NOT NULL DEFAULT 'generate'")?;
    seed_default_prompt_templates(conn)?;
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
        INSERT INTO artifacts (id, profile_id, mode, prompt, image_url, source, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
        "#,
        params![
            artifact.id,
            artifact.profile_id,
            artifact.mode.as_str(),
            artifact.prompt,
            artifact.image_url,
            artifact.source,
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
        SELECT id, profile_id, mode, prompt, image_url, source, created_at
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
        SELECT id, title, prompt, category, is_builtin, created_at, updated_at
        FROM prompt_templates
        ORDER BY is_builtin DESC, updated_at DESC, title ASC
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
            id, title, prompt, category, is_builtin, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            prompt = excluded.prompt,
            category = excluded.category,
            is_builtin = prompt_templates.is_builtin,
            updated_at = datetime('now')
        "#,
        params![
            template.id,
            template.title,
            template.prompt,
            template.category,
            if template.is_builtin { 1 } else { 0 },
        ],
    )?;

    get_prompt_template(conn, &template.id)
}

pub fn get_prompt_template(conn: &Connection, id: &str) -> Result<PromptTemplate> {
    conn.query_row(
        r#"
        SELECT id, title, prompt, category, is_builtin, created_at, updated_at
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

    Ok(Artifact {
        id: row.get(0)?,
        profile_id: row.get(1)?,
        mode,
        prompt: row.get(3)?,
        image_url: row.get(4)?,
        source,
        created_at: row.get(6)?,
    })
}

fn prompt_template_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PromptTemplate> {
    Ok(PromptTemplate {
        id: row.get(0)?,
        title: row.get(1)?,
        prompt: row.get(2)?,
        category: row.get(3)?,
        is_builtin: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn seed_default_prompt_templates(conn: &Connection) -> Result<()> {
    for template in default_prompt_templates() {
        conn.execute(
            r#"
            INSERT OR IGNORE INTO prompt_templates (id, title, prompt, category, is_builtin, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, 1, datetime('now'), datetime('now'))
            "#,
            params![template.id, template.title, template.prompt, template.category],
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
            created_at: None,
            updated_at: None,
        },
        PromptTemplate {
            id: "preset-action-storyboard-3x3".to_string(),
            title: "港口动作分镜 3x3".to_string(),
            category: "分镜".to_string(),
            prompt: "做一张 3x3 的动作场景分镜，同一个运动感很强的角色在阳光下的港口集装箱区快速穿行。九格分别表现观察、起跑、翻越障碍、手部抓握特写、阳光扫过侧脸、背影冲刺、低机位移动、突然回头、远景跳上高处。风格干净、利落、速度感强，像 AAA 游戏过场镜头。".to_string(),
            is_builtin: true,
            created_at: None,
            updated_at: None,
        },
        PromptTemplate {
            id: "preset-scout-character-sheet".to_string(),
            title: "女侦察兵八面设定板".to_string(),
            category: "角色设定".to_string(),
            prompt: "做一张纯白背景的 8 面角色设定板，一个 28 岁女侦察兵，短黑发，左眼旁有一道浅疤，穿深墨绿色轻型战术外套和黑色靴子。上排是正面、背面、左侧、右侧全身，下排是头部正面、背面、左侧、右侧。要求比例精确、脸一致、衣服一致、不要道具、不要文字。".to_string(),
            is_builtin: true,
            created_at: None,
            updated_at: None,
        },
        PromptTemplate {
            id: "preset-chinese-newspaper-storm-frontpage".to_string(),
            title: "暴风雨中文大报头版".to_string(),
            category: "平面排版".to_string(),
            prompt: "做一张假的中文大报头版，像一份周日大报的头条封面。主题是一座海边城市遭遇百年一遇暴风雨。要有主标题、副标题、导语、栏目分区、天气栏、照片说明、边栏短讯，整体排版像真正能印出来的报纸头版。".to_string(),
            is_builtin: true,
            created_at: None,
            updated_at: None,
        },
        PromptTemplate {
            id: "preset-night-shift-city-magazine-spread".to_string(),
            title: "夜班城市杂志跨页".to_string(),
            category: "平面排版".to_string(),
            prompt: "做一组双页杂志跨页，主题是夜班城市。左页是一张横跨整页的夜间巴士站照片，右页是正文、引文、数据小框和小照片排版。气质像深度报道杂志，不要企业年报感。".to_string(),
            is_builtin: true,
            created_at: None,
            updated_at: None,
        },
        PromptTemplate {
            id: "preset-f1-evolution-infographic".to_string(),
            title: "F1 赛车进化信息图".to_string(),
            category: "信息图".to_string(),
            prompt: "做一张 F1 赛车进化信息图中文描述，从 1950 年代到 2026 年，横向排列五个关键时代的赛车外观轮廓，底部标注技术变化、空气动力学变化和轮胎特征。整体像赛车博物馆墙上的展示图。".to_string(),
            is_builtin: true,
            created_at: None,
            updated_at: None,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::{
        delete_prompt_template, list_prompt_templates, migrate, upsert_prompt_template,
    };
    use crate::models::PromptTemplate;
    use rusqlite::Connection;

    #[test]
    fn migrate_seeds_default_prompt_templates_once() {
        let conn = Connection::open_in_memory().unwrap();

        migrate(&conn).unwrap();
        let templates = list_prompt_templates(&conn).unwrap();

        assert_eq!(templates.len(), 6);
        assert!(templates.iter().all(|template| template.is_builtin));
        assert!(templates
            .iter()
            .any(|template| template.title == "东京街头电影分镜 3x4"));
        assert!(templates
            .iter()
            .any(|template| template.title == "F1 赛车进化信息图"));

        migrate(&conn).unwrap();
        assert_eq!(list_prompt_templates(&conn).unwrap().len(), 6);
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
                created_at: None,
                updated_at: None,
            },
        )
        .unwrap();

        assert_eq!(created.title, "自定义模板");
        assert!(!created.is_builtin);
        assert_eq!(list_prompt_templates(&conn).unwrap().len(), 7);

        let updated = upsert_prompt_template(
            &conn,
            &PromptTemplate {
                id: "custom-template".to_string(),
                title: "更新后的模板".to_string(),
                prompt: "一张干净的品牌海报".to_string(),
                category: "商业".to_string(),
                is_builtin: false,
                created_at: None,
                updated_at: None,
            },
        )
        .unwrap();

        assert_eq!(updated.title, "更新后的模板");
        assert_eq!(updated.prompt, "一张干净的品牌海报");

        delete_prompt_template(&conn, "custom-template").unwrap();
        assert_eq!(list_prompt_templates(&conn).unwrap().len(), 6);
    }
}
