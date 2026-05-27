use serde::Serialize;

use crate::{app_state::AppState, db::DATABASE_FILE_NAME, error::AppResult};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub ok: bool,
    pub app_data_dir: String,
    pub database_file: &'static str,
    pub schema_version: String,
}

pub async fn health_check(state: &AppState) -> AppResult<HealthResponse> {
    let schema_version =
        sqlx::query_scalar::<_, String>("SELECT value FROM app_meta WHERE key = 'schema_version'")
            .fetch_one(&state.db)
            .await?;

    Ok(HealthResponse {
        ok: true,
        app_data_dir: state.app_data_dir.to_string_lossy().to_string(),
        database_file: DATABASE_FILE_NAME,
        schema_version,
    })
}
