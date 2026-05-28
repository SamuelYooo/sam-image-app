use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::generation::{GenerationInput, GenerationTask, create_local_generation};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfile {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub endpoint: String,
    pub api_key: String,
    pub model: String,
    pub kind: String,
    pub is_primary: bool,
    pub status: String,
    pub last_checked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelTestResult {
    pub ok: bool,
    pub message: String,
}

#[tauri::command]
pub async fn create_generation_task(
    input: GenerationInput,
    state: State<'_, AppState>,
) -> Result<GenerationTask, AppError> {
    let task = create_local_generation(input)?;
    state.insert_task(&task).await?;
    Ok(task)
}

#[tauri::command]
pub async fn list_generation_tasks(
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<GenerationTask>, AppError> {
    state.list_tasks(limit.unwrap_or(100).clamp(1, 500)).await
}

#[tauri::command]
pub async fn save_app_settings(
    key: String,
    value: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    if key.trim().is_empty() {
        return Err(AppError::Validation("设置项不能为空".into()));
    }
    state.save_setting(&key, &value).await
}

#[tauri::command]
pub async fn test_model_profile(profile: ModelProfile) -> Result<ModelTestResult, AppError> {
    if profile.provider == "local-preview" {
        return Ok(ModelTestResult {
            ok: true,
            message: "本地预览模型可用".into(),
        });
    }
    if profile.endpoint.trim().is_empty() {
        return Ok(ModelTestResult {
            ok: false,
            message: "请填写 API 地址".into(),
        });
    }
    if profile.api_key.trim().is_empty() {
        return Ok(ModelTestResult {
            ok: false,
            message: "请填写 API Key".into(),
        });
    }

    let response = reqwest::Client::new()
        .get(profile.endpoint)
        .bearer_auth(profile.api_key)
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await?;
    let status = response.status();

    Ok(ModelTestResult {
        ok: status.is_success() || status.as_u16() == 405,
        message: format!("模型端点响应：HTTP {}", status.as_u16()),
    })
}
