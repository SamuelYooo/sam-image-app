use std::path::Path;

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    SqlitePool,
};

use crate::error::AppResult;

pub mod asset_repo;
pub mod generation_task_repo;
pub mod model_profile_repo;
pub mod prompt_asset_repo;
pub mod storyboard_repo;

pub const DATABASE_FILE_NAME: &str = "samimage_v2.sqlite3";

pub async fn init_sqlite(app_data_dir: &Path) -> AppResult<SqlitePool> {
    std::fs::create_dir_all(app_data_dir)?;
    let database_path = app_data_dir.join(DATABASE_FILE_NAME);
    let options = SqliteConnectOptions::new()
        .filename(database_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true)
        .pragma("synchronous", "NORMAL")
        .pragma("busy_timeout", "5000");
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./src/db/migrations").run(&pool).await?;
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    #[tokio::test]
    async fn initializes_sqlite_with_wal_and_migrations() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("samimage-v2-db-test-{nonce}"));

        let pool = init_sqlite(&dir).await.expect("database should initialize");
        let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&pool)
            .await
            .expect("journal mode should be readable");
        let schema_version: String =
            sqlx::query_scalar("SELECT value FROM app_meta WHERE key = 'schema_version'")
                .fetch_one(&pool)
                .await
                .expect("schema version should exist");

        assert_eq!(journal_mode.to_lowercase(), "wal");
        assert_eq!(schema_version, "4");

        pool.close().await;
        drop(pool);

        // Windows can briefly hold SQLite WAL handles after pool shutdown.
        let _ = std::fs::remove_dir_all(&dir);
    }
}
