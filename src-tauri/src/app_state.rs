use std::path::PathBuf;

use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

use crate::{
    db,
    error::{AppError, AppResult},
};

#[derive(Clone)]
pub struct AppState {
    pub app_data_dir: PathBuf,
    pub db: SqlitePool,
}

impl AppState {
    pub async fn initialize(app: &AppHandle) -> AppResult<Self> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| AppError::AppDir(error.to_string()))?;
        let db = db::init_sqlite(&app_data_dir).await?;

        Ok(Self { app_data_dir, db })
    }
}
