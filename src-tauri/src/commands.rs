use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::generation::{
    GenerationInput, GenerationTask, RemoteImageModel, create_generation_with_model,
    export_asset_data_url, export_asset_metadata_json,
};
use crate::state::AppState;
use crate::text::{TextPolishInput, TextPolishModel, TextPolishResult, polish_prompt_with_model};

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

impl From<ModelProfile> for RemoteImageModel {
    fn from(value: ModelProfile) -> Self {
        Self {
            id: value.id,
            name: value.name,
            provider: value.provider,
            endpoint: value.endpoint,
            api_key: value.api_key,
            model: value.model,
        }
    }
}

impl From<ModelProfile> for TextPolishModel {
    fn from(value: ModelProfile) -> Self {
        Self {
            id: value.id,
            name: value.name,
            provider: value.provider,
            endpoint: value.endpoint,
            api_key: value.api_key,
            model: value.model,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelTestResult {
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAssetRequest {
    pub data_url: String,
    pub output_dir: String,
    pub title: String,
    pub format: String,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAssetResult {
    pub path: String,
    pub metadata_path: Option<String>,
}

#[tauri::command]
pub async fn create_generation_task(
    input: GenerationInput,
    model: Option<ModelProfile>,
    state: State<'_, AppState>,
) -> Result<GenerationTask, AppError> {
    let task = create_generation_with_model(input, model.map(Into::into)).await?;
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
pub async fn clear_generation_tasks(state: State<'_, AppState>) -> Result<(), AppError> {
    state.clear_tasks().await
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
pub async fn load_app_state(
    state: State<'_, AppState>,
) -> Result<Option<serde_json::Value>, AppError> {
    state.load_app_state().await
}

#[tauri::command]
pub async fn save_app_state(
    value: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    if !value.is_object() {
        return Err(AppError::Validation("应用状态必须是对象".into()));
    }
    state.save_app_state(&value).await
}

#[tauri::command]
pub async fn export_generated_asset(
    request: ExportAssetRequest,
) -> Result<ExportAssetResult, AppError> {
    if request.output_dir.trim().is_empty() {
        return Err(AppError::Validation("请设置导出目录".into()));
    }

    let path = export_asset_data_url(
        &request.data_url,
        request.output_dir.trim(),
        &request.title,
        &request.format,
    )?;
    let metadata_path = match request.metadata_json.as_deref() {
        Some(metadata_json) => Some(export_asset_metadata_json(
            request.output_dir.trim(),
            &request.title,
            metadata_json,
        )?),
        None => None,
    };

    Ok(ExportAssetResult {
        path: path.to_string_lossy().into_owned(),
        metadata_path: metadata_path.map(|path| path.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
pub async fn polish_prompt(
    input: TextPolishInput,
    model: Option<ModelProfile>,
) -> Result<TextPolishResult, AppError> {
    polish_prompt_with_model(input, model.map(Into::into))
        .await
        .map_err(Into::into)
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
    if profile.kind == "text" && profile.model.trim().is_empty() {
        return Ok(ModelTestResult {
            ok: false,
            message: "请填写文本模型 ID".into(),
        });
    }

    if profile.kind == "text" {
        let response = reqwest::Client::new()
            .post(profile.endpoint.trim())
            .bearer_auth(profile.api_key.trim())
            .json(&serde_json::json!({
                "model": profile.model.trim(),
                "messages": [
                    {
                        "role": "user",
                        "content": "ping"
                    }
                ],
                "max_tokens": 1,
            }))
            .timeout(std::time::Duration::from_secs(8))
            .send()
            .await?;
        let status = response.status();

        return Ok(ModelTestResult {
            ok: status.is_success(),
            message: format!("文本模型端点响应：HTTP {}", status.as_u16()),
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
