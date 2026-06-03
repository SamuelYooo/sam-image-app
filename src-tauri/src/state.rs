use std::path::Path;
use std::str::FromStr;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::generation::GenerationTask;
use crate::server;

const APP_STATE_KEY: &str = "frontend-state";

#[derive(Clone)]
pub struct AppState {
    pool: SqlitePool,
    pub health_url: String,
}

impl AppState {
    pub async fn initialize(app: &AppHandle) -> Result<Self, AppError> {
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| AppError::Io(error.to_string()))?;
        Self::initialize_for_path(app_dir).await
    }

    pub async fn initialize_for_path(app_dir: impl AsRef<Path>) -> Result<Self, AppError> {
        let app_dir = app_dir.as_ref();
        std::fs::create_dir_all(app_dir)?;

        let db_path = app_dir.join("samimage-v3.sqlite3");
        let db_path = db_path
            .to_str()
            .ok_or_else(|| AppError::Io("数据库路径不是有效 UTF-8".into()))?;

        let options = SqliteConnectOptions::from_str(db_path)
            .map_err(|error| AppError::Database(error.to_string()))?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .pragma("foreign_keys", "ON");

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        init_schema(&pool).await?;
        let health_url = server::spawn_health_server().await?;

        Ok(Self { pool, health_url })
    }

    pub async fn insert_task(&self, task: &GenerationTask) -> Result<(), AppError> {
        let payload =
            serde_json::to_string(task).map_err(|error| AppError::Unknown(error.to_string()))?;
        sqlx::query(
            "INSERT OR REPLACE INTO generation_tasks (id, status, created_at, payload) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(&task.id)
        .bind(&task.status)
        .bind(&task.created_at)
        .bind(payload)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn list_tasks(&self, limit: i64) -> Result<Vec<GenerationTask>, AppError> {
        let rows =
            sqlx::query("SELECT payload FROM generation_tasks ORDER BY created_at DESC LIMIT ?1")
                .bind(limit)
                .fetch_all(&self.pool)
                .await?;

        rows.into_iter()
            .map(|row| {
                let payload: String = row.try_get("payload")?;
                serde_json::from_str(&payload).map_err(|error| AppError::Unknown(error.to_string()))
            })
            .collect()
    }

    pub async fn clear_tasks(&self) -> Result<(), AppError> {
        sqlx::query("DELETE FROM generation_tasks")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_asset(&self, task_id: &str, asset_id: &str) -> Result<(), AppError> {
        let row = sqlx::query("SELECT payload FROM generation_tasks WHERE id = ?1")
            .bind(task_id)
            .fetch_optional(&self.pool)
            .await?;
        let Some(row) = row else {
            return Ok(());
        };

        let payload: String = row.try_get("payload")?;
        let mut task: GenerationTask =
            serde_json::from_str(&payload).map_err(|error| AppError::Unknown(error.to_string()))?;
        let before_count = task.assets.len();
        task.assets.retain(|asset| asset.id != asset_id);
        if task.assets.len() == before_count {
            return Ok(());
        }

        if task.assets.is_empty() {
            sqlx::query("DELETE FROM generation_tasks WHERE id = ?1")
                .bind(task_id)
                .execute(&self.pool)
                .await?;
            return Ok(());
        }

        self.insert_task(&task).await
    }

    pub async fn save_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        sqlx::query("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))")
            .bind(key)
            .bind(value)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn save_app_state(&self, value: &serde_json::Value) -> Result<(), AppError> {
        let payload =
            serde_json::to_string(value).map_err(|error| AppError::Unknown(error.to_string()))?;
        self.save_setting(APP_STATE_KEY, &payload).await
    }

    pub async fn load_app_state(&self) -> Result<Option<serde_json::Value>, AppError> {
        let row = sqlx::query("SELECT value FROM app_settings WHERE key = ?1")
            .bind(APP_STATE_KEY)
            .fetch_optional(&self.pool)
            .await?;
        let Some(row) = row else {
            return Ok(None);
        };
        let payload: String = row.try_get("value")?;
        serde_json::from_str(&payload)
            .map(Some)
            .map_err(|error| AppError::Unknown(error.to_string()))
    }
}

async fn init_schema(pool: &SqlitePool) -> Result<(), AppError> {
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS generation_tasks (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            payload TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await?;
    Ok(())
}
