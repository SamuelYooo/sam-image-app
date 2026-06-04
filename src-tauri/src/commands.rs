use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::multipart;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use tauri::State;

use crate::api_endpoint::join_api_endpoint;
use crate::error::AppError;
use crate::generation::{
    GenerationInput, GenerationTask, RemoteImageModel, create_generation_with_model,
    export_asset_data_url, export_asset_metadata_json, image_http_client,
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
    pub api_path: Option<String>,
    pub api_protocol: Option<String>,
    pub api_key: String,
    pub api_secret: Option<String>,
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
            api_path: value.api_path,
            api_protocol: value.api_protocol,
            api_key: value.api_key,
            api_secret: value.api_secret,
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
            api_path: value.api_path,
            api_protocol: value.api_protocol,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCatalogItem {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub source: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelsResponse {
    data: Vec<OpenAiModelItem>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelItem {
    id: String,
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
pub async fn delete_generation_asset(
    task_id: String,
    asset_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    if task_id.trim().is_empty() || asset_id.trim().is_empty() {
        return Err(AppError::Validation("资源 ID 不能为空".into()));
    }
    state.delete_asset(task_id.trim(), asset_id.trim()).await
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconBundleEntry {
    pub name: String,
    pub data_url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportIconBundleRequest {
    pub entries: Vec<IconBundleEntry>,
    pub output_dir: String,
    pub bundle_name: String,
}

#[tauri::command]
pub async fn export_icon_bundle(
    request: ExportIconBundleRequest,
) -> Result<String, AppError> {
    if request.output_dir.trim().is_empty() {
        return Err(AppError::Validation("请设置导出目录".into()));
    }
    if request.entries.is_empty() {
        return Err(AppError::Validation("没有可导出的图标文件".into()));
    }

    let output_dir = std::path::Path::new(request.output_dir.trim());
    std::fs::create_dir_all(output_dir)?;

    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    for entry in &request.entries {
        let data = STANDARD
            .decode(entry.data_url_from_base64())
            .map_err(|error| AppError::Validation(format!("解码图标数据失败: {error}")))?;
        files.push((entry.name.clone(), data));
    }

    let zip_bytes = build_zip_stored(&files);
    let zip_name = format!("{}.zip", request.bundle_name.trim());
    let zip_path = output_dir.join(&zip_name);
    std::fs::write(&zip_path, &zip_bytes)?;

    Ok(zip_path.to_string_lossy().into_owned())
}

impl IconBundleEntry {
    fn data_url_from_base64(&self) -> &str {
        self.data_url
            .split_once(',')
            .map(|(_, data)| data)
            .unwrap_or(&self.data_url)
    }
}

fn build_zip_stored(files: &[(String, Vec<u8>)]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut local_offsets = Vec::new();

    for (name, data) in files {
        local_offsets.push(out.len());
        let name_bytes = name.as_bytes();
        let crc = crc32(data);

        // Local file header
        out.extend_from_slice(&0x04034b50u32.to_le_bytes());
        out.extend_from_slice(&20u16.to_le_bytes());   // version needed
        out.extend_from_slice(&0u16.to_le_bytes());     // flags
        out.extend_from_slice(&0u16.to_le_bytes());     // compression: STORED
        out.extend_from_slice(&0u16.to_le_bytes());     // mod time
        out.extend_from_slice(&0u16.to_le_bytes());     // mod date
        out.extend_from_slice(&crc.to_le_bytes());
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());  // compressed size
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());  // uncompressed size
        out.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());     // extra length
        out.extend_from_slice(name_bytes);
        out.extend_from_slice(data);
    }

    let central_offset = out.len();
    for (i, (name, data)) in files.iter().enumerate() {
        let name_bytes = name.as_bytes();
        let crc = crc32(data);

        out.extend_from_slice(&0x02014b50u32.to_le_bytes());
        out.extend_from_slice(&20u16.to_le_bytes());   // version made by
        out.extend_from_slice(&20u16.to_le_bytes());   // version needed
        out.extend_from_slice(&0u16.to_le_bytes());     // flags
        out.extend_from_slice(&0u16.to_le_bytes());     // compression: STORED
        out.extend_from_slice(&0u16.to_le_bytes());     // mod time
        out.extend_from_slice(&0u16.to_le_bytes());     // mod date
        out.extend_from_slice(&crc.to_le_bytes());
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(&(name_bytes.len() as u16).to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());     // extra length
        out.extend_from_slice(&0u16.to_le_bytes());     // comment length
        out.extend_from_slice(&0u16.to_le_bytes());     // disk number
        out.extend_from_slice(&0u16.to_le_bytes());     // internal attrs
        out.extend_from_slice(&0u32.to_le_bytes());     // external attrs
        out.extend_from_slice(&(local_offsets[i] as u32).to_le_bytes());
        out.extend_from_slice(name_bytes);
    }

    let central_size = out.len() - central_offset;
    out.extend_from_slice(&0x06054b50u32.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());         // disk number
    out.extend_from_slice(&0u16.to_le_bytes());         // central dir disk
    out.extend_from_slice(&(files.len() as u16).to_le_bytes());
    out.extend_from_slice(&(files.len() as u16).to_le_bytes());
    out.extend_from_slice(&(central_size as u32).to_le_bytes());
    out.extend_from_slice(&(central_offset as u32).to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());         // comment length

    out
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFFFFFF;
    for &byte in data {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB88320 } else { crc >> 1 };
        }
    }
    crc ^ 0xFFFFFFFF
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
pub async fn list_model_catalog(profile: ModelProfile) -> Result<Vec<ModelCatalogItem>, AppError> {
    if profile.provider != "openai-compatible" {
        return Err(AppError::Validation(
            "仅支持 OpenAI Compatible 模型列表接口".into(),
        ));
    }
    if profile.endpoint.trim().is_empty() {
        return Err(AppError::Validation("请填写 API 地址".into()));
    }
    if profile.api_key.trim().is_empty() {
        return Err(AppError::Validation("请填写 API Key".into()));
    }

    fetch_remote_model_catalog(&profile).await
}

async fn fetch_remote_model_catalog(
    profile: &ModelProfile,
) -> Result<Vec<ModelCatalogItem>, AppError> {
    let endpoint = model_catalog_endpoint(&profile.endpoint)?;
    let response = image_http_client()
        .map_err(|error| AppError::Validation(error.to_string()))?
        .get(endpoint)
        .bearer_auth(profile.api_key.trim())
        .timeout(std::time::Duration::from_secs(12))
        .send()
        .await?;
    let status = response.status();
    if !status.is_success() {
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "无法读取错误响应".into());
        return Err(AppError::Validation(format!(
            "模型列表获取失败: HTTP {} {}",
            status.as_u16(),
            message
        )));
    }

    let payload: OpenAiModelsResponse = response
        .json()
        .await
        .map_err(|error| AppError::Validation(format!("解析模型列表失败: {error}")))?;
    let mut models = payload
        .data
        .into_iter()
        .map(|item| {
            let kind = infer_catalog_model_kind(&item.id);
            ModelCatalogItem {
                name: item.id.clone(),
                id: item.id,
                kind: kind.into(),
                source: "remote".into(),
            }
        })
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(models)
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
    if profile.kind == "image"
        && profile.api_protocol.as_deref() == Some("mgtv-storyboard")
        && profile
            .api_secret
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
    {
        return Ok(ModelTestResult {
            ok: false,
            message: "请填写 MGTV 图像模型 Secret Key".into(),
        });
    }
    if profile.kind == "text" && profile.model.trim().is_empty() {
        return Ok(ModelTestResult {
            ok: false,
            message: "请填写文本模型 ID".into(),
        });
    }
    if profile.kind == "image" && profile.model.trim().is_empty() {
        return Ok(ModelTestResult {
            ok: false,
            message: "请填写图像模型 ID".into(),
        });
    }

    if profile.kind == "text" {
        return match polish_prompt_with_model(
            TextPolishInput {
                prompt: "连接检测".into(),
                mode_label: "提示词润色".into(),
                style: "自然".into(),
                task: None,
            },
            Some(profile.into()),
        )
        .await
        {
            Ok(_) => Ok(ModelTestResult {
                ok: true,
                message: "文本模型连接检测成功，可用于提示词润色".into(),
            }),
            Err(error) => Ok(ModelTestResult {
                ok: false,
                message: format!("文本模型连接检测失败：{error}"),
            }),
        };
    }

    match test_image_model_connection(&profile).await {
        Ok(message) => Ok(ModelTestResult { ok: true, message }),
        Err(message) => Ok(ModelTestResult {
            ok: false,
            message: format!("图像模型连接检测失败：{message}"),
        }),
    }
}

async fn test_image_model_connection(profile: &ModelProfile) -> Result<String, String> {
    if profile.provider != "openai-compatible" {
        return Err("不支持的图像模型提供方".into());
    }

    match fetch_remote_model_catalog(profile).await {
        Ok(models) => {
            let model_id = profile.model.trim();
            if models.iter().any(|model| model.id == model_id) {
                return Ok("图像模型连接检测成功，模型列表已包含该模型".into());
            }
            return Ok("图像模型连接检测成功，模型列表接口可用；当前模型未在列表中，生成时会继续由上游校验".into());
        }
        Err(_) => {
            // Some image-only providers do not expose /v1/models. Fall back to a protocol probe below.
        }
    }

    let protocol = profile.api_protocol.as_deref().unwrap_or("openai-images");
    let client = image_http_client().map_err(|error| error.to_string())?;
    let response = match protocol {
        "mgtv-storyboard" => {
            let endpoint =
                mgtv_openapi_endpoint(&profile.endpoint, "openapi/v1/storyboard/getAssetInfo");
            let body = serde_json::json!({
                "recordIds": []
            });
            mgtv_signed_request(&client, endpoint, profile, &body)?
                .timeout(std::time::Duration::from_secs(20))
                .send()
                .await
                .map_err(|error| format!("MGTV 图像模型请求失败: {error}"))?
        }
        "dashscope-wanxiang" => {
            let endpoint = join_api_endpoint(
                &profile.endpoint,
                profile.api_path.as_deref(),
                "api/v1/services/aigc/multimodal-generation/generation",
            )
            .map_err(|error| error.to_string())?;
            client
                .post(endpoint)
                .bearer_auth(profile.api_key.trim())
                .timeout(std::time::Duration::from_secs(20))
                .json(&serde_json::json!({
                    "model": profile.model.trim(),
                    "input": {
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    { "text": "连接检测" }
                                ]
                            }
                        ]
                    },
                    "parameters": {
                        "n": 1,
                        "size": "1024*1024"
                    }
                }))
                .send()
                .await
                .map_err(|error| format!("图像模型请求失败: {error}"))?
        }
        "multimodal-chat" => {
            let endpoint = join_api_endpoint(
                &profile.endpoint,
                profile.api_path.as_deref(),
                "v1/chat/completions",
            )
            .map_err(|error| error.to_string())?;
            client
                .post(endpoint)
                .bearer_auth(profile.api_key.trim())
                .timeout(std::time::Duration::from_secs(20))
                .json(&serde_json::json!({
                    "model": profile.model.trim(),
                    "messages": [
                        {
                            "role": "user",
                            "content": "连接检测"
                        }
                    ],
                    "max_tokens": 16
                }))
                .send()
                .await
                .map_err(|error| format!("图像模型请求失败: {error}"))?
        }
        "openai-image-edits" => {
            let endpoint = join_api_endpoint(
                &profile.endpoint,
                profile.api_path.as_deref(),
                "v1/images/edits",
            )
            .map_err(|error| error.to_string())?;
            let image_bytes = STANDARD
                .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
                .map_err(|error| format!("构造检测图片失败: {error}"))?;
            let image_part = multipart::Part::bytes(image_bytes)
                .file_name("connection-test.png")
                .mime_str("image/png")
                .map_err(|error| format!("构造检测图片失败: {error}"))?;
            let form = multipart::Form::new()
                .text("model", profile.model.trim().to_string())
                .text("prompt", "连接检测".to_string())
                .part("image", image_part);
            client
                .post(endpoint)
                .bearer_auth(profile.api_key.trim())
                .timeout(std::time::Duration::from_secs(20))
                .multipart(form)
                .send()
                .await
                .map_err(|error| format!("图像模型请求失败: {error}"))?
        }
        _ => {
            let endpoint = join_api_endpoint(
                &profile.endpoint,
                profile.api_path.as_deref(),
                "v1/images/generations",
            )
            .map_err(|error| error.to_string())?;
            client
                .post(endpoint)
                .bearer_auth(profile.api_key.trim())
                .timeout(std::time::Duration::from_secs(20))
                .json(&serde_json::json!({
                    "model": profile.model.trim(),
                    "prompt": "连接检测",
                    "n": 1,
                    "size": "1024x1024"
                }))
                .send()
                .await
                .map_err(|error| format!("图像模型请求失败: {error}"))?
        }
    };

    let status = response.status();
    if status.is_success() {
        return Ok("图像模型连接检测成功，图像端点可达".into());
    }

    let message = response
        .text()
        .await
        .unwrap_or_else(|_| "无法读取错误响应".into());
    classify_image_probe_response(status.as_u16(), &message)
}

type HmacSha256 = Hmac<Sha256>;

fn hmac_sha256_hex(secret: &str, message: &str) -> Result<String, String> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|error| format!("构造 MGTV 签名失败: {error}"))?;
    mac.update(message.as_bytes());
    let bytes = mac.finalize().into_bytes();
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn mgtv_openapi_endpoint(base_url: &str, api_path: &str) -> String {
    let normalized_base = if base_url.trim().contains("aigc-llm.mgtv.com") {
        "https://aigc.mgtv.com"
    } else {
        base_url.trim()
    };
    join_api_endpoint(normalized_base, Some(api_path), api_path).unwrap_or_else(|_| {
        format!(
            "{}/{}",
            normalized_base.trim_end_matches('/'),
            api_path.trim_matches('/')
        )
    })
}

fn mgtv_nonce() -> String {
    uuid::Uuid::new_v4()
        .simple()
        .to_string()
        .chars()
        .take(16)
        .collect()
}

fn mgtv_signature(
    method: &str,
    endpoint: &str,
    timestamp: &str,
    nonce: &str,
    secret: &str,
) -> Result<String, String> {
    let url = reqwest::Url::parse(endpoint)
        .map_err(|error| format!("MGTV API 地址格式不正确: {error}"))?;
    let query = url.query().unwrap_or("");
    hmac_sha256_hex(
        secret,
        &format!(
            "{}\n{}\n{}\n{}\n{}",
            method.to_uppercase(),
            url.path(),
            timestamp,
            nonce,
            query
        ),
    )
}

fn mgtv_signed_request(
    client: &reqwest::Client,
    endpoint: String,
    profile: &ModelProfile,
    body: &serde_json::Value,
) -> Result<reqwest::RequestBuilder, String> {
    let secret = profile.api_secret.as_deref().unwrap_or("").trim();
    if secret.is_empty() {
        return Err("请填写 MGTV 图像模型 Secret Key".into());
    }
    let timestamp = Utc::now().timestamp().to_string();
    let nonce = mgtv_nonce();
    let body_text =
        serde_json::to_string(body).map_err(|error| format!("序列化 MGTV 请求失败: {error}"))?;
    let signature = mgtv_signature("POST", &endpoint, &timestamp, &nonce, secret)?;

    Ok(client
        .post(endpoint)
        .header("X-Access-Key", profile.api_key.trim())
        .header("X-Timestamp", timestamp)
        .header("X-Nonce", nonce)
        .header("X-Signature", signature)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body_text))
}

fn classify_image_probe_response(status: u16, message: &str) -> Result<String, String> {
    let normalized = message.to_lowercase();
    let auth_failed = status == 401
        || status == 403
        || normalized.contains("invalid api key")
        || normalized.contains("unauthorized")
        || normalized.contains("forbidden");
    if auth_failed {
        return Err(format!("图像模型鉴权失败: HTTP {status} {message}"));
    }

    let model_missing = normalized.contains("model not found")
        || normalized.contains("model_not_found")
        || normalized.contains("does not exist")
        || normalized.contains("unknown model")
        || normalized.contains("模型不存在");
    if model_missing {
        return Err(format!("图像模型 ID 无效: HTTP {status} {message}"));
    }

    if status == 404 {
        return Err(format!("图像模型端点不存在: HTTP {status} {message}"));
    }

    if matches!(status, 400 | 405 | 422) {
        return Ok(format!(
            "图像模型端点可达；上游拒绝了检测参数 HTTP {status}，生成时会使用正式参数"
        ));
    }

    Err(format!("图像模型响应失败: HTTP {status} {message}"))
}

fn model_catalog_endpoint(endpoint: &str) -> Result<String, AppError> {
    join_api_endpoint(endpoint, None, "v1/models")
        .map_err(|error| AppError::Validation(error.to_string()))
}

fn infer_catalog_model_kind(model_id: &str) -> &'static str {
    let id = model_id.to_lowercase();
    // TTS 优先判定：避免被文本模型误判（例如 gpt-audio 实际是音频）
    let tts_markers = [
        "tts", "speech", "audio", "voice", "eleven",
        "kokoro", "bark", "tortoise", "cosyvoice", "melo", "f5-tts",
        "xtts", "silero", "edge-tts", "azure-speech",
    ];
    if tts_markers.iter().any(|marker| id.contains(marker)) {
        return "tts";
    }
    let image_markers = [
        "image",
        "dall-e",
        "dalle",
        "flux",
        "stable-diffusion",
        "sdxl",
        "ideogram",
        "recraft",
        "midjourney",
        "kolors",
    ];
    if image_markers.iter().any(|marker| id.contains(marker)) {
        return "image";
    }
    let text_markers = [
        "gpt", "chat", "claude", "deepseek", "qwen", "llama", "gemini", "moonshot", "glm",
        "mistral", "yi-",
    ];
    if text_markers.iter().any(|marker| id.contains(marker)) {
        return "text";
    }
    "unknown"
}

#[cfg(test)]
mod infer_catalog_kind_tests {
    use super::infer_catalog_model_kind;

    #[test]
    fn detects_image_markers() {
        assert_eq!(infer_catalog_model_kind("gpt-image-1"), "image");
        assert_eq!(infer_catalog_model_kind("dall-e-3"), "image");
        assert_eq!(infer_catalog_model_kind("stable-diffusion-xl"), "image");
        assert_eq!(infer_catalog_model_kind("flux-dev"), "image");
    }

    #[test]
    fn detects_text_markers() {
        assert_eq!(infer_catalog_model_kind("gpt-4o-mini"), "text");
        assert_eq!(infer_catalog_model_kind("claude-3-5-sonnet"), "text");
        assert_eq!(infer_catalog_model_kind("qwen-max"), "text");
        assert_eq!(infer_catalog_model_kind("deepseek-chat"), "text");
    }

    #[test]
    fn detects_tts_markers() {
        assert_eq!(infer_catalog_model_kind("tts-1"), "tts");
        assert_eq!(infer_catalog_model_kind("tts-1-hd"), "tts");
        assert_eq!(infer_catalog_model_kind("eleven_multilingual_v2"), "tts");
        assert_eq!(infer_catalog_model_kind("kokoro-v0_19"), "tts");
        assert_eq!(infer_catalog_model_kind("azure-speech"), "tts");
    }

    #[test]
    fn returns_unknown_for_ambiguous_ids() {
        assert_eq!(infer_catalog_model_kind("custom-model-v1"), "unknown");
        assert_eq!(infer_catalog_model_kind(""), "unknown");
    }

    #[test]
    fn tts_takes_priority_over_text() {
        // gpt-audio 包含 audio marker 应识别为 tts
        assert_eq!(infer_catalog_model_kind("gpt-audio"), "tts");
    }
}
