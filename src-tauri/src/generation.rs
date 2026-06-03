use std::{
    error::Error as StdError,
    path::{Path, PathBuf},
    time::Duration,
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::Utc;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Sha256;
use thiserror::Error;
use uuid::Uuid;

use crate::api_endpoint::join_api_endpoint;

const MAX_EXPORT_NAME_CHARS: usize = 80;
const IMAGE_REQUEST_TIMEOUT_SECS: u64 = 300;
const ASYNC_IMAGE_POLL_MAX_WAIT_SECS: u64 = 600;
const ASYNC_IMAGE_POLL_INITIAL_DELAY_SECS: u64 = 2;
const ASYNC_IMAGE_POLL_MAX_DELAY_SECS: u64 = 15;
const LOCAL_GIF_DATA_URL: &str =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH/C05FVFNDQVBFMi4wAwEAAAAh+QQAFAAAACwAAAAAAQABAAACAkQBACH5BAAUAAAALAAAAAABAAEAAAICTAEAOw==";
const OPENAI_IMAGES_PATH: &str = "v1/images/generations";
const OPENAI_IMAGE_EDITS_PATH: &str = "v1/images/edits";
const MULTIMODAL_CHAT_PATH: &str = "v1/chat/completions";
const DASHSCOPE_WANXIANG_PATH: &str = "api/v1/services/aigc/multimodal-generation/generation";

#[derive(Debug, Error)]
pub enum GenerationError {
    #[error("{0}")]
    Validation(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteImageModel {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub endpoint: String,
    pub api_path: Option<String>,
    pub api_protocol: Option<String>,
    pub api_key: String,
    pub api_secret: Option<String>,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GenerationMode {
    #[serde(rename = "txt2img")]
    Txt2Img,
    #[serde(rename = "img2img")]
    Img2Img,
    Cover,
    Icon,
    #[serde(rename = "3d")]
    ThreeD,
    Gif,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationInput {
    pub mode: GenerationMode,
    pub prompt: String,
    pub negative_prompt: String,
    pub model_id: String,
    pub width: u32,
    pub height: u32,
    pub batch_size: u8,
    pub steps: u8,
    pub seed: u64,
    pub style: String,
    pub reference_image: Option<String>,
    #[serde(default, rename = "modeOptions")]
    pub mode_options: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedAsset {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub data_url: String,
    pub local_path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationTask {
    pub id: String,
    pub mode: GenerationMode,
    pub prompt: String,
    pub negative_prompt: String,
    pub model_id: String,
    pub width: u32,
    pub height: u32,
    pub batch_size: u8,
    pub steps: u8,
    pub seed: u64,
    pub style: String,
    #[serde(default, rename = "modeOptions")]
    pub mode_options: Value,
    pub status: String,
    pub error: Option<String>,
    pub is_favorite: Option<bool>,
    pub assets: Vec<GeneratedAsset>,
    pub created_at: String,
}

pub fn validate_generation_input(input: &GenerationInput) -> Result<(), GenerationError> {
    let min_dimension = if input.mode == GenerationMode::Icon {
        16
    } else {
        128
    };
    if input.prompt.trim().is_empty() {
        return Err(GenerationError::Validation("请输入正向提示词".into()));
    }
    if input.model_id.trim().is_empty() {
        return Err(GenerationError::Validation("请选择图像模型".into()));
    }
    if !(min_dimension..=4096).contains(&input.width) {
        return Err(GenerationError::Validation(format!(
            "宽度必须在 {min_dimension} 到 4096 之间"
        )));
    }
    if !(min_dimension..=4096).contains(&input.height) {
        return Err(GenerationError::Validation(format!(
            "高度必须在 {min_dimension} 到 4096 之间"
        )));
    }
    if !(1..=4).contains(&input.batch_size) {
        return Err(GenerationError::Validation(
            "批量数量必须在 1 到 4 之间".into(),
        ));
    }
    if !(1..=80).contains(&input.steps) {
        return Err(GenerationError::Validation(
            "生成步数必须在 1 到 80 之间".into(),
        ));
    }
    Ok(())
}

pub fn create_local_generation(input: GenerationInput) -> Result<GenerationTask, GenerationError> {
    validate_generation_input(&input)?;
    let id = format!("task-{}", Uuid::new_v4());
    let created_at = Utc::now().to_rfc3339();
    let assets = (0..input.batch_size)
        .map(|index| create_preview_asset(&id, &input, index, &created_at))
        .collect();

    Ok(GenerationTask {
        id,
        mode: input.mode,
        prompt: input.prompt,
        negative_prompt: input.negative_prompt,
        model_id: input.model_id,
        width: input.width,
        height: input.height,
        batch_size: input.batch_size,
        steps: input.steps,
        seed: input.seed,
        style: input.style,
        mode_options: input.mode_options,
        status: "completed".into(),
        error: None,
        is_favorite: Some(false),
        assets,
        created_at,
    })
}

pub async fn create_generation_with_model(
    input: GenerationInput,
    model: Option<RemoteImageModel>,
) -> Result<GenerationTask, GenerationError> {
    let Some(model) = model else {
        return create_local_generation(input);
    };

    if model.provider == "local-preview" {
        return create_local_generation(input);
    }

    create_remote_generation(input, model).await
}

async fn create_remote_generation(
    input: GenerationInput,
    model: RemoteImageModel,
) -> Result<GenerationTask, GenerationError> {
    validate_generation_input(&input)?;
    let protocol = model.api_protocol.as_deref().unwrap_or("openai-images");
    if model.provider != "openai-compatible" {
        return Err(GenerationError::Validation("不支持的图像模型提供方".into()));
    }
    if model.endpoint.trim().is_empty() {
        return Err(GenerationError::Validation(
            "请填写图像模型 API 地址".into(),
        ));
    }
    if model.api_key.trim().is_empty() {
        return Err(GenerationError::Validation("请填写图像模型 API Key".into()));
    }
    if model.model.trim().is_empty() {
        return Err(GenerationError::Validation("请填写图像模型 ID".into()));
    }

    match protocol {
        "dashscope-wanxiang" => create_dashscope_wanxiang_generation(input, model).await,
        "mgtv-storyboard" => create_mgtv_storyboard_generation(input, model).await,
        "multimodal-chat" => create_multimodal_chat_generation(input, model).await,
        "openai-image-edits" => create_openai_image_edits_generation(input, model).await,
        _ => create_openai_images_generation(input, model).await,
    }
}

async fn create_openai_images_generation(
    input: GenerationInput,
    model: RemoteImageModel,
) -> Result<GenerationTask, GenerationError> {
    let protocol = model.api_protocol.as_deref().unwrap_or("openai-images");
    let endpoint = join_api_endpoint(
        &model.endpoint,
        model.api_path.as_deref(),
        OPENAI_IMAGES_PATH,
    )
    .map_err(|error| {
        GenerationError::Validation(format!("图像模型 API 地址格式不正确: {error}"))
    })?;
    let submit_endpoint = endpoint.clone();
    let client = image_http_client()?;
    let payload = send_remote_request(
        client
            .post(submit_endpoint.clone())
            .bearer_auth(model.api_key.trim())
            .json(&serde_json::json!({
                "model": model.model.trim(),
                "prompt": input.prompt.trim(),
                "n": input.batch_size,
                "size": format!("{}x{}", input.width, input.height)
            })),
        protocol,
        "POST",
        &submit_endpoint,
    )
    .await?;
    let images = resolve_openai_images_payload(&client, protocol, &endpoint, payload).await?;
    let id = format!("task-{}", Uuid::new_v4());
    let created_at = Utc::now().to_rfc3339();
    let assets = assets_from_image_data(&client, &id, &input, &created_at, images).await?;
    completed_task(input, id, created_at, assets)
}

async fn create_multimodal_chat_generation(
    input: GenerationInput,
    model: RemoteImageModel,
) -> Result<GenerationTask, GenerationError> {
    let protocol = model.api_protocol.as_deref().unwrap_or("multimodal-chat");
    let endpoint = join_api_endpoint(
        &model.endpoint,
        model.api_path.as_deref(),
        MULTIMODAL_CHAT_PATH,
    )
    .map_err(|error| {
        GenerationError::Validation(format!("图像模型 API 地址格式不正确: {error}"))
    })?;
    let client = image_http_client()?;
    let mut content = vec![serde_json::json!({
        "type": "text",
        "text": input.prompt.trim()
    })];
    if let Some(reference_image) = input
        .reference_image
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        content.push(serde_json::json!({
            "type": "image_url",
            "image_url": {
                "url": reference_image
            }
        }));
    }
    let payload = send_remote_request(
        client
            .post(endpoint.clone())
            .bearer_auth(model.api_key.trim())
            .json(&serde_json::json!({
                "model": model.model.trim(),
                "messages": [
                    {
                        "role": "user",
                        "content": content
                    }
                ],
                "n": input.batch_size,
                "size": format!("{}x{}", input.width, input.height)
            })),
        protocol,
        "POST",
        &endpoint,
    )
    .await?;
    let images = collect_image_outputs(&payload);
    if images.is_empty() {
        return Err(GenerationError::Validation(format!(
            "图像模型未返回图片: 协议 {protocol} POST {endpoint}"
        )));
    }
    let id = format!("task-{}", Uuid::new_v4());
    let created_at = Utc::now().to_rfc3339();
    let assets = assets_from_image_data(&client, &id, &input, &created_at, images).await?;
    completed_task(input, id, created_at, assets)
}

async fn create_openai_image_edits_generation(
    input: GenerationInput,
    model: RemoteImageModel,
) -> Result<GenerationTask, GenerationError> {
    let protocol = model
        .api_protocol
        .as_deref()
        .unwrap_or("openai-image-edits");
    let reference_image = input
        .reference_image
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| GenerationError::Validation("图像编辑协议需要先上传或拖入参考图".into()))?;
    let (mime, bytes) = decode_image_data_url(reference_image)?;
    let endpoint = join_api_endpoint(
        &model.endpoint,
        model.api_path.as_deref(),
        OPENAI_IMAGE_EDITS_PATH,
    )
    .map_err(|error| {
        GenerationError::Validation(format!("图像模型 API 地址格式不正确: {error}"))
    })?;
    let image_part = reqwest::multipart::Part::bytes(bytes)
        .file_name(format!("reference.{}", image_extension(&mime)))
        .mime_str(&mime)
        .map_err(|error| GenerationError::Validation(format!("构造参考图上传表单失败: {error}")))?;
    let form = reqwest::multipart::Form::new()
        .text("model", model.model.trim().to_string())
        .text("prompt", input.prompt.trim().to_string())
        .text("n", input.batch_size.to_string())
        .text("size", format!("{}x{}", input.width, input.height))
        .part("image", image_part);
    let client = image_http_client()?;
    let payload = send_remote_request(
        client
            .post(endpoint.clone())
            .bearer_auth(model.api_key.trim())
            .multipart(form),
        protocol,
        "POST",
        &endpoint,
    )
    .await?;
    let payload: OpenAiImageResponse = serde_json::from_value(payload).map_err(|error| {
        GenerationError::Validation(format!(
            "解析图像模型响应失败: 协议 {protocol} POST {endpoint}: {error}"
        ))
    })?;
    let id = format!("task-{}", Uuid::new_v4());
    let created_at = Utc::now().to_rfc3339();
    let assets = assets_from_image_data(&client, &id, &input, &created_at, payload.data).await?;
    completed_task(input, id, created_at, assets)
}

pub(crate) fn image_http_client() -> Result<reqwest::Client, GenerationError> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(IMAGE_REQUEST_TIMEOUT_SECS))
        .pool_max_idle_per_host(2)
        .user_agent("SamImage/3.0")
        .build()
        .map_err(|error| {
            GenerationError::Validation(format!("创建图像模型 HTTP 客户端失败: {error}"))
        })
}

async fn send_remote_request(
    request: reqwest::RequestBuilder,
    protocol: &str,
    method: &str,
    endpoint: &str,
) -> Result<serde_json::Value, GenerationError> {
    let response = request.send().await.map_err(|error| {
        let reason = if error.is_timeout() {
            "请求超时，可能是上游生成耗时过长或中转站响应过慢"
        } else {
            ""
        };
        GenerationError::Validation(format!(
            "图像模型请求失败: 协议 {protocol} {method} {endpoint}: {}{}",
            format_error_chain(&error),
            if reason.is_empty() {
                String::new()
            } else {
                format!(" ({reason})")
            }
        ))
    })?;
    let status = response.status();
    let text = response
        .text()
        .await
        .unwrap_or_else(|_| "无法读取错误响应".into());
    if !status.is_success() {
        return Err(GenerationError::Validation(format!(
            "图像模型响应失败: 协议 {protocol} {method} {endpoint} HTTP {} {}",
            status.as_u16(),
            text
        )));
    }
    serde_json::from_str(&text).map_err(|error| {
        GenerationError::Validation(format!(
            "解析图像模型响应失败: 协议 {protocol} {method} {endpoint}: {error}; {text}"
        ))
    })
}

fn format_error_chain(error: &dyn StdError) -> String {
    let mut parts = vec![error.to_string()];
    let mut current = error.source();
    while let Some(source) = current {
        let message = source.to_string();
        if !message.is_empty() {
            parts.push(message);
        }
        current = source.source();
    }
    parts.join(": ")
}

async fn assets_from_image_data(
    client: &reqwest::Client,
    task_id: &str,
    input: &GenerationInput,
    created_at: &str,
    images: Vec<OpenAiImageData>,
) -> Result<Vec<GeneratedAsset>, GenerationError> {
    let mut assets = Vec::new();
    for (index, image) in images.into_iter().enumerate() {
        assets.push(remote_response_asset(client, task_id, input, index, created_at, image).await?);
    }
    if assets.is_empty() {
        return Err(GenerationError::Validation("图像模型未返回图片".into()));
    }
    Ok(assets)
}

fn completed_task(
    input: GenerationInput,
    id: String,
    created_at: String,
    assets: Vec<GeneratedAsset>,
) -> Result<GenerationTask, GenerationError> {
    Ok(GenerationTask {
        id,
        mode: input.mode,
        prompt: input.prompt,
        negative_prompt: input.negative_prompt,
        model_id: input.model_id,
        width: input.width,
        height: input.height,
        batch_size: input.batch_size,
        steps: input.steps,
        seed: input.seed,
        style: input.style,
        mode_options: input.mode_options,
        status: "completed".into(),
        error: None,
        is_favorite: Some(false),
        assets,
        created_at,
    })
}

fn decode_image_data_url(data_url: &str) -> Result<(String, Vec<u8>), GenerationError> {
    let (metadata, payload) = data_url
        .split_once(',')
        .ok_or_else(|| GenerationError::Validation("参考图必须是 data URL".into()))?;
    let mime = metadata
        .strip_prefix("data:")
        .and_then(|value| value.split(';').next())
        .and_then(normalize_image_mime)
        .ok_or_else(|| GenerationError::Validation("参考图 data URL 必须是图片格式".into()))?;
    if !metadata
        .split(';')
        .any(|part| part.eq_ignore_ascii_case("base64"))
    {
        return Err(GenerationError::Validation(
            "参考图 data URL 必须使用 base64 编码".into(),
        ));
    }
    let bytes = STANDARD.decode(payload).map_err(|error| {
        GenerationError::Validation(format!("参考图 data URL 解码失败: {error}"))
    })?;
    Ok((mime, bytes))
}

fn image_extension(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

fn collect_image_outputs(value: &serde_json::Value) -> Vec<OpenAiImageData> {
    let mut output = Vec::new();
    collect_image_outputs_at_key(value, "", &mut output);
    let mut seen = std::collections::HashSet::new();
    output
        .into_iter()
        .filter(|image| {
            let key = image
                .b64_json
                .as_deref()
                .or(image.url.as_deref())
                .unwrap_or_default()
                .to_string();
            !key.is_empty() && seen.insert(key)
        })
        .collect()
}

fn collect_image_outputs_at_key(
    value: &serde_json::Value,
    parent_key: &str,
    output: &mut Vec<OpenAiImageData>,
) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, value) in map {
                let normalized = key
                    .chars()
                    .filter(|character| character.is_ascii_alphanumeric())
                    .collect::<String>()
                    .to_lowercase();
                match value {
                    serde_json::Value::String(text)
                        if normalized == "b64json" && !text.trim().is_empty() =>
                    {
                        output.push(OpenAiImageData {
                            b64_json: Some(text.trim().to_string()),
                            url: None,
                            mime_type: None,
                        });
                    }
                    serde_json::Value::String(text)
                        if looks_like_image_output_key(&normalized)
                            && is_supported_result_image_url(text) =>
                    {
                        output.push(OpenAiImageData {
                            b64_json: None,
                            url: Some(text.trim().to_string()),
                            mime_type: None,
                        });
                    }
                    serde_json::Value::String(text)
                        if text.trim().starts_with("data:image/")
                            && looks_like_image_output_key(parent_key) =>
                    {
                        output.push(OpenAiImageData {
                            b64_json: None,
                            url: Some(text.trim().to_string()),
                            mime_type: None,
                        });
                    }
                    other => collect_image_outputs_at_key(other, &normalized, output),
                }
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_image_outputs_at_key(item, parent_key, output);
            }
        }
        serde_json::Value::String(text)
            if text.trim().starts_with("data:image/")
                && looks_like_image_output_key(parent_key) =>
        {
            output.push(OpenAiImageData {
                b64_json: None,
                url: Some(text.trim().to_string()),
                mime_type: None,
            });
        }
        _ => {}
    }
}

fn looks_like_image_output_key(key: &str) -> bool {
    matches!(
        key,
        "url"
            | "image"
            | "images"
            | "imageurl"
            | "imageurls"
            | "imgurl"
            | "imgurls"
            | "dataurl"
            | "resulturl"
            | "outputurl"
            | "b64json"
    )
}

async fn create_dashscope_wanxiang_generation(
    input: GenerationInput,
    model: RemoteImageModel,
) -> Result<GenerationTask, GenerationError> {
    let protocol = model
        .api_protocol
        .as_deref()
        .unwrap_or("dashscope-wanxiang");
    let endpoint = join_api_endpoint(
        &model.endpoint,
        model.api_path.as_deref(),
        DASHSCOPE_WANXIANG_PATH,
    )
    .map_err(|error| {
        GenerationError::Validation(format!("图像模型 API 地址格式不正确: {error}"))
    })?;
    let content = match input.reference_image.as_deref() {
        Some(reference_image) if !reference_image.trim().is_empty() => serde_json::json!([
            { "text": input.prompt.trim() },
            { "image": reference_image.trim() }
        ]),
        _ => serde_json::json!([{ "text": input.prompt.trim() }]),
    };
    let client = image_http_client()?;
    let payload = send_remote_request(
        client
            .post(endpoint.clone())
            .bearer_auth(model.api_key.trim())
            .json(&serde_json::json!({
                "model": model.model.trim(),
                "input": {
                    "messages": [
                        {
                            "role": "user",
                            "content": content
                        }
                    ]
                },
                "parameters": {
                    "n": input.batch_size,
                    "size": format!("{}*{}", input.width, input.height),
                    "negative_prompt": input.negative_prompt.trim()
                }
            })),
        protocol,
        "POST",
        &endpoint,
    )
    .await?;
    let payload: DashScopeImageResponse = serde_json::from_value(payload).map_err(|error| {
        GenerationError::Validation(format!(
            "解析图像模型响应失败: 协议 {protocol} POST {endpoint}: {error}"
        ))
    })?;
    let id = format!("task-{}", Uuid::new_v4());
    let created_at = Utc::now().to_rfc3339();
    let choices = payload.output.choices.unwrap_or_default();
    let mut assets = Vec::new();
    for (index, choice) in choices.into_iter().enumerate() {
        for block in choice.message.content.unwrap_or_default() {
            if let Some(image_url) = block.image {
                assets.push(
                    remote_response_asset(
                        &client,
                        &id,
                        &input,
                        index,
                        &created_at,
                        OpenAiImageData {
                            b64_json: None,
                            url: Some(image_url),
                            mime_type: None,
                        },
                    )
                    .await?,
                );
            }
        }
    }
    if assets.is_empty() {
        return Err(GenerationError::Validation("图像模型未返回图片".into()));
    }

    completed_task(input, id, created_at, assets)
}

type HmacSha256 = Hmac<Sha256>;

fn hmac_sha256_hex(secret: &str, message: &str) -> Result<String, GenerationError> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|error| GenerationError::Validation(format!("构造 MGTV 签名失败: {error}")))?;
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
    Uuid::new_v4()
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
) -> Result<String, GenerationError> {
    let url = reqwest::Url::parse(endpoint).map_err(|error| {
        GenerationError::Validation(format!("MGTV API 地址格式不正确: {error}"))
    })?;
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
    model: &RemoteImageModel,
    body: &serde_json::Value,
) -> Result<reqwest::RequestBuilder, GenerationError> {
    let secret = model.api_secret.as_deref().unwrap_or("").trim();
    if secret.is_empty() {
        return Err(GenerationError::Validation(
            "请填写 MGTV 图像模型 Secret Key".into(),
        ));
    }
    let timestamp = Utc::now().timestamp().to_string();
    let nonce = mgtv_nonce();
    let body_text = serde_json::to_string(body)
        .map_err(|error| GenerationError::Validation(format!("序列化 MGTV 请求失败: {error}")))?;
    let signature = mgtv_signature("POST", &endpoint, &timestamp, &nonce, secret)?;

    Ok(client
        .post(endpoint)
        .header("X-Access-Key", model.api_key.trim())
        .header("X-Timestamp", timestamp)
        .header("X-Nonce", nonce)
        .header("X-Signature", signature)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body_text))
}

fn simplified_ratio(width: u32, height: u32) -> String {
    fn gcd(mut left: u32, mut right: u32) -> u32 {
        while right != 0 {
            let next = left % right;
            left = right;
            right = next;
        }
        left.max(1)
    }
    let divisor = gcd(width, height);
    format!("{}:{}", width / divisor, height / divisor)
}

fn mgtv_style_id(input: &GenerationInput, model: &RemoteImageModel) -> u32 {
    input
        .mode_options
        .get("styleId")
        .and_then(|value| value.as_u64())
        .or_else(|| model.model.trim().parse::<u64>().ok())
        .unwrap_or(35)
        .clamp(1, u32::MAX as u64) as u32
}

fn mgtv_resolution(input: &GenerationInput) -> String {
    input
        .mode_options
        .get("resolution")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            if input.width.max(input.height) > 1536 {
                "2K"
            } else {
                "1K"
            }
        })
        .to_string()
}

fn mgtv_ratio(input: &GenerationInput) -> String {
    input
        .mode_options
        .get("ratio")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| simplified_ratio(input.width, input.height))
}

fn collect_mgtv_record_ids(value: &serde_json::Value, output: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, value) in map {
                let normalized = key.to_lowercase();
                if normalized.contains("record")
                    || normalized.contains("task")
                    || normalized.contains("asset")
                {
                    match value {
                        serde_json::Value::String(text) if !text.trim().is_empty() => {
                            output.push(text.trim().to_string())
                        }
                        serde_json::Value::Number(number) => output.push(number.to_string()),
                        serde_json::Value::Array(items) => {
                            for item in items {
                                match item {
                                    serde_json::Value::String(text) if !text.trim().is_empty() => {
                                        output.push(text.trim().to_string())
                                    }
                                    serde_json::Value::Number(number) => {
                                        output.push(number.to_string())
                                    }
                                    other => collect_mgtv_record_ids(other, output),
                                }
                            }
                        }
                        other => collect_mgtv_record_ids(other, output),
                    }
                } else {
                    collect_mgtv_record_ids(value, output);
                }
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_mgtv_record_ids(item, output);
            }
        }
        _ => {}
    }
}

fn collect_mgtv_image_urls(value: &serde_json::Value, output: &mut Vec<String>) {
    collect_mgtv_image_urls_at_key(value, "", output);
}

fn collect_mgtv_image_urls_at_key(
    value: &serde_json::Value,
    parent_key: &str,
    output: &mut Vec<String>,
) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, value) in map {
                let normalized = key.to_lowercase();
                match value {
                    serde_json::Value::String(text)
                        if is_mgtv_result_image_key(&normalized)
                            && is_supported_result_image_url(text) =>
                    {
                        output.push(text.trim().to_string());
                    }
                    other => collect_mgtv_image_urls_at_key(other, &normalized, output),
                }
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_mgtv_image_urls_at_key(item, parent_key, output);
            }
        }
        serde_json::Value::String(text)
            if matches!(parent_key, "images" | "imageurls" | "imgurls")
                && is_supported_result_image_url(text) =>
        {
            output.push(text.trim().to_string());
        }
        _ => {}
    }
}

fn is_mgtv_result_image_key(key: &str) -> bool {
    matches!(
        key,
        "imgurl"
            | "img_url"
            | "imageurl"
            | "image_url"
            | "resulturl"
            | "result_url"
            | "outputurl"
            | "output_url"
            | "cosurl"
            | "cos_url"
    )
}

fn is_supported_result_image_url(value: &str) -> bool {
    let url = value.trim();
    if !(url.starts_with("http://")
        || url.starts_with("https://")
        || url.starts_with("data:image/"))
    {
        return false;
    }
    let normalized = url.to_lowercase();
    !normalized.contains("/model-logo/")
        && !normalized.contains("/logo/")
        && !normalized.contains("logo")
        && !normalized.contains("icon")
        && !normalized.contains("avatar")
        && !normalized.split('?').next().unwrap_or("").ends_with(".svg")
}

async fn mgtv_post_json(
    client: &reqwest::Client,
    endpoint: String,
    model: &RemoteImageModel,
    body: serde_json::Value,
) -> Result<serde_json::Value, GenerationError> {
    let response = mgtv_signed_request(client, endpoint.clone(), model, &body)?
        .send()
        .await
        .map_err(|error| GenerationError::Validation(format!("MGTV 图像模型请求失败: {error}")))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .unwrap_or_else(|_| "无法读取错误响应".into());
    if !status.is_success() {
        return Err(GenerationError::Validation(format!(
            "MGTV 图像模型响应失败: POST {} HTTP {} {}",
            endpoint,
            status.as_u16(),
            text
        )));
    }

    let payload: serde_json::Value = serde_json::from_str(&text).map_err(|error| {
        GenerationError::Validation(format!("解析 MGTV 图像模型响应失败: {error}; {text}"))
    })?;
    let code = payload
        .get("code")
        .and_then(|value| value.as_i64())
        .unwrap_or(200);
    if code != 0 && code != 200 {
        let message = payload
            .get("msg")
            .or_else(|| payload.get("message"))
            .and_then(|value| value.as_str())
            .unwrap_or("未知错误");
        return Err(GenerationError::Validation(format!(
            "MGTV 图像模型业务失败: code {code} {message}"
        )));
    }
    Ok(payload)
}

async fn create_mgtv_storyboard_generation(
    input: GenerationInput,
    model: RemoteImageModel,
) -> Result<GenerationTask, GenerationError> {
    let generate_endpoint = mgtv_openapi_endpoint(
        &model.endpoint,
        model
            .api_path
            .as_deref()
            .unwrap_or("openapi/v1/storyboard/generateByPromptV2"),
    );
    let info_endpoint =
        mgtv_openapi_endpoint(&model.endpoint, "openapi/v1/storyboard/getAssetInfo");
    let client = image_http_client()?;
    let body = serde_json::json!({
        "styleId": mgtv_style_id(&input, &model),
        "resolution": mgtv_resolution(&input),
        "ratio": mgtv_ratio(&input),
        "nums": input.batch_size,
        "imgUrls": [],
        "prompt": {
            "args": [],
            "prompt": input.prompt.trim()
        },
    });
    let payload = mgtv_post_json(&client, generate_endpoint, &model, body).await?;
    let mut record_ids = Vec::new();
    collect_mgtv_record_ids(&payload, &mut record_ids);
    record_ids.sort();
    record_ids.dedup();
    if record_ids.is_empty() {
        return Err(GenerationError::Validation(format!(
            "MGTV 图像模型未返回任务记录 ID: {payload}"
        )));
    }

    let mut image_urls = Vec::new();
    for attempt in 0..12 {
        let info_payload = mgtv_post_json(
            &client,
            info_endpoint.clone(),
            &model,
            serde_json::json!({
                "recordIds": record_ids.iter().map(|id| id.parse::<u64>().map_or(serde_json::Value::String(id.clone()), serde_json::Value::from)).collect::<Vec<_>>(),
            }),
        )
        .await?;
        collect_mgtv_image_urls(&info_payload, &mut image_urls);
        image_urls.sort();
        image_urls.dedup();
        if !image_urls.is_empty() {
            break;
        }
        if attempt < 11 {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        }
    }

    if image_urls.is_empty() {
        return Err(GenerationError::Validation(
            "MGTV 图像模型任务已提交，但查询结果未返回图片 URL".into(),
        ));
    }

    let id = format!("task-{}", Uuid::new_v4());
    let created_at = Utc::now().to_rfc3339();
    let mut assets = Vec::new();
    for (index, image_url) in image_urls
        .into_iter()
        .take(input.batch_size as usize)
        .enumerate()
    {
        assets.push(
            remote_response_asset(
                &client,
                &id,
                &input,
                index,
                &created_at,
                OpenAiImageData {
                    b64_json: None,
                    url: Some(image_url),
                    mime_type: None,
                },
            )
            .await?,
        );
    }

    Ok(GenerationTask {
        id,
        mode: input.mode,
        prompt: input.prompt,
        negative_prompt: input.negative_prompt,
        model_id: input.model_id,
        width: input.width,
        height: input.height,
        batch_size: input.batch_size,
        steps: input.steps,
        seed: input.seed,
        style: input.style,
        mode_options: input.mode_options,
        status: "completed".into(),
        error: None,
        is_favorite: Some(false),
        assets,
        created_at,
    })
}

async fn resolve_openai_images_payload(
    client: &reqwest::Client,
    protocol: &str,
    submit_endpoint: &str,
    payload: serde_json::Value,
) -> Result<Vec<OpenAiImageData>, GenerationError> {
    let images = collect_image_outputs(&payload);
    if !images.is_empty() {
        return Ok(images);
    }

    let Some(task) = extract_async_image_task(&payload) else {
        return Err(GenerationError::Validation(format!(
            "图像模型未返回图片或任务 ID: 协议 {protocol} POST {submit_endpoint} {payload}"
        )));
    };

    poll_openai_image_task(client, protocol, submit_endpoint, task).await
}

#[derive(Debug, Clone)]
struct AsyncImageTask {
    task_id: String,
    poll_endpoint: Option<String>,
    status: Option<String>,
}

fn extract_async_image_task(value: &serde_json::Value) -> Option<AsyncImageTask> {
    let task_id = find_string_by_keys(value, &["taskid", "jobid", "id"])?;
    let poll_endpoint = find_string_by_keys(
        value,
        &["pollingurl", "pollurl", "statusurl", "taskurl", "queryurl"],
    );
    let status = find_string_by_keys(value, &["status", "state", "taskstatus", "taskstate"]);
    Some(AsyncImageTask {
        task_id,
        poll_endpoint,
        status,
    })
}

fn find_string_by_keys(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    match value {
        serde_json::Value::Object(map) => {
            for (key, item) in map {
                let normalized = key
                    .chars()
                    .filter(|character| character.is_ascii_alphanumeric())
                    .collect::<String>()
                    .to_lowercase();
                if keys.iter().any(|candidate| *candidate == normalized)
                    && let Some(text) = item.as_str().map(str::trim).filter(|text| !text.is_empty())
                {
                    return Some(text.to_string());
                }
                if let Some(found) = find_string_by_keys(item, keys) {
                    return Some(found);
                }
            }
            None
        }
        serde_json::Value::Array(items) => {
            for item in items {
                if let Some(found) = find_string_by_keys(item, keys) {
                    return Some(found);
                }
            }
            None
        }
        _ => None,
    }
}

fn normalize_async_status(status: &str) -> String {
    status.trim().to_lowercase()
}

fn is_async_image_task_pending(status: Option<&str>) -> bool {
    let Some(status) = status else {
        return true;
    };
    matches!(
        normalize_async_status(status).as_str(),
        "queued" | "pending" | "created" | "submitted" | "running" | "processing" | "in_progress"
    )
}

fn is_async_image_task_finished(status: Option<&str>) -> bool {
    let Some(status) = status else {
        return false;
    };
    matches!(
        normalize_async_status(status).as_str(),
        "success" | "succeeded" | "completed" | "complete" | "done" | "finished"
    )
}

fn is_async_image_task_failed(status: Option<&str>) -> bool {
    let Some(status) = status else {
        return false;
    };
    matches!(
        normalize_async_status(status).as_str(),
        "failed" | "failure" | "error" | "cancelled" | "canceled" | "expired"
    )
}

async fn poll_openai_image_task(
    client: &reqwest::Client,
    protocol: &str,
    submit_endpoint: &str,
    task: AsyncImageTask,
) -> Result<Vec<OpenAiImageData>, GenerationError> {
    let mut poll_candidates = openai_image_poll_endpoints(submit_endpoint, &task.task_id);
    if let Some(explicit) = task.poll_endpoint {
        poll_candidates.insert(0, explicit);
    }

    let started_at = std::time::Instant::now();
    let mut delay = Duration::from_secs(ASYNC_IMAGE_POLL_INITIAL_DELAY_SECS);

    loop {
        for poll_endpoint in &poll_candidates {
            let payload = match send_remote_request(
                client.get(poll_endpoint),
                protocol,
                "GET",
                poll_endpoint,
            )
            .await
            {
                Ok(payload) => payload,
                Err(error) => {
                    let message = error.to_string();
                    if message.contains("HTTP 404") || message.contains("HTTP 405") {
                        continue;
                    }
                    return Err(error);
                }
            };

            let images = collect_image_outputs(&payload);
            if !images.is_empty() {
                return Ok(images);
            }

            if let Some(status) = find_string_by_keys(&payload, &["status", "state", "taskstatus"])
            {
                if is_async_image_task_failed(Some(&status)) {
                    return Err(GenerationError::Validation(format!(
                        "图像模型任务失败: 协议 {protocol} GET {poll_endpoint} {payload}"
                    )));
                }
                if is_async_image_task_finished(Some(&status)) {
                    return Err(GenerationError::Validation(format!(
                        "图像模型任务已完成，但未返回图片: 协议 {protocol} GET {poll_endpoint} {payload}"
                    )));
                }
                if is_async_image_task_pending(Some(&status)) {
                    break;
                }
            } else if task
                .status
                .as_deref()
                .map_or(true, |status| is_async_image_task_pending(Some(status)))
            {
                break;
            }
        }

        if started_at.elapsed() >= Duration::from_secs(ASYNC_IMAGE_POLL_MAX_WAIT_SECS) {
            return Err(GenerationError::Validation(format!(
                "图像模型任务轮询超时: 协议 {protocol} POST {submit_endpoint} {task_id}",
                task_id = task.task_id
            )));
        }

        tokio::time::sleep(delay).await;
        delay = std::cmp::min(
            delay.saturating_mul(2),
            Duration::from_secs(ASYNC_IMAGE_POLL_MAX_DELAY_SECS),
        );
    }
}

fn openai_image_poll_endpoints(submit_endpoint: &str, task_id: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    if let Ok(url) = reqwest::Url::parse(submit_endpoint) {
        candidates.push(join_url_path(&url, task_id));
        candidates.push(join_url_path(&url, &format!("tasks/{task_id}")));
        candidates.push(join_url_path(&url, &format!("jobs/{task_id}")));
        candidates.push(join_url_path(&url, &format!("images/{task_id}")));
    }
    dedup_strings(candidates)
}

fn join_url_path(base: &reqwest::Url, suffix: &str) -> String {
    let mut url = base.clone();
    let mut segments = url
        .path_segments()
        .map(|segments| {
            segments
                .filter(|segment| !segment.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    segments.extend(
        suffix
            .trim_matches('/')
            .split('/')
            .filter(|segment| !segment.is_empty())
            .map(str::to_string),
    );
    url.set_path(&format!("/{}", segments.join("/")));
    url.set_query(None);
    url.into()
}

fn dedup_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    values
        .into_iter()
        .filter(|value| seen.insert(value.clone()))
        .collect()
}

#[derive(Debug, Deserialize)]
struct OpenAiImageResponse {
    data: Vec<OpenAiImageData>,
}

#[derive(Debug, Deserialize)]
struct OpenAiImageData {
    b64_json: Option<String>,
    url: Option<String>,
    mime_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DashScopeImageResponse {
    output: DashScopeImageOutput,
}

#[derive(Debug, Deserialize)]
struct DashScopeImageOutput {
    choices: Option<Vec<DashScopeImageChoice>>,
}

#[derive(Debug, Deserialize)]
struct DashScopeImageChoice {
    message: DashScopeImageMessage,
}

#[derive(Debug, Deserialize)]
struct DashScopeImageMessage {
    content: Option<Vec<DashScopeContentBlock>>,
}

#[derive(Debug, Deserialize)]
struct DashScopeContentBlock {
    image: Option<String>,
}

async fn remote_response_asset(
    client: &reqwest::Client,
    task_id: &str,
    input: &GenerationInput,
    index: usize,
    created_at: &str,
    image: OpenAiImageData,
) -> Result<GeneratedAsset, GenerationError> {
    let (mut data_url, mut format) = match image.b64_json {
        Some(payload) if !payload.trim().is_empty() => {
            let mime = image.mime_type.unwrap_or_else(|| "image/png".into());
            let format = mime
                .strip_prefix("image/")
                .unwrap_or("png")
                .replace("jpeg", "jpg");
            (format!("data:{mime};base64,{payload}"), format)
        }
        _ => {
            let url = image
                .url
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| GenerationError::Validation("图像模型返回缺少图片内容".into()))?;
            if url.trim().starts_with("data:image/") {
                let format = url
                    .split_once(';')
                    .and_then(|(mime, _)| mime.strip_prefix("data:image/"))
                    .unwrap_or("png")
                    .replace("jpeg", "jpg");
                (url.trim().into(), format)
            } else {
                let response = client.get(url.trim()).send().await.map_err(|error| {
                    GenerationError::Validation(format!("下载图像模型结果失败: {error}"))
                })?;
                let status = response.status();
                if !status.is_success() {
                    return Err(GenerationError::Validation(format!(
                        "下载图像模型结果失败: GET {} HTTP {}",
                        url.trim(),
                        status.as_u16()
                    )));
                }
                let header_mime = response
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|value| value.to_str().ok())
                    .and_then(normalize_image_mime);
                let bytes = response.bytes().await.map_err(|error| {
                    GenerationError::Validation(format!("读取图像模型结果失败: {error}"))
                })?;
                let mime = header_mime
                    .or_else(|| sniff_image_mime(&bytes).map(str::to_string))
                    .or_else(|| image.mime_type.and_then(|mime| normalize_image_mime(&mime)))
                    .ok_or_else(|| {
                        GenerationError::Validation(format!(
                            "图像模型结果 URL 返回的不是图片: {}",
                            url.trim()
                        ))
                    })?;
                let format = mime
                    .strip_prefix("image/")
                    .unwrap_or("png")
                    .replace("jpeg", "jpg");
                (
                    format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
                    format,
                )
            }
        }
    };

    Ok(GeneratedAsset {
        id: format!("asset-{}", Uuid::new_v4()),
        task_id: task_id.into(),
        title: format!("{} {}", mode_title(&input.mode), index + 1),
        width: input.width,
        height: input.height,
        format,
        data_url,
        local_path: None,
        created_at: created_at.into(),
    })
}

fn normalize_image_mime(value: &str) -> Option<String> {
    let mime = value.split(';').next()?.trim().to_lowercase();
    match mime.as_str() {
        "image/png" | "image/jpeg" | "image/jpg" | "image/webp" | "image/gif" => {
            Some(mime.replace("image/jpg", "image/jpeg"))
        }
        _ => None,
    }
}

fn sniff_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    None
}

pub fn export_asset_data_url(
    data_url: &str,
    output_dir: impl AsRef<Path>,
    title: &str,
    format: &str,
) -> Result<PathBuf, GenerationError> {
    let (_, payload) = data_url
        .split_once(',')
        .ok_or_else(|| GenerationError::Validation("导出内容必须是 data URL".into()))?;
    if !data_url.starts_with("data:") {
        return Err(GenerationError::Validation(
            "导出内容必须是 data URL".into(),
        ));
    }

    let bytes = STANDARD
        .decode(payload)
        .map_err(|error| GenerationError::Validation(format!("data URL 解码失败: {error}")))?;
    let output_dir = output_dir.as_ref();
    std::fs::create_dir_all(output_dir)
        .map_err(|error| GenerationError::Validation(format!("创建导出目录失败: {error}")))?;

    let extension = normalize_export_format(format)?;
    let file_name = format!("{}.{}", sanitize_export_name(title), extension);
    let path = output_dir.join(file_name);
    std::fs::write(&path, bytes)
        .map_err(|error| GenerationError::Validation(format!("写入导出文件失败: {error}")))?;
    Ok(path)
}

pub fn export_asset_metadata_json(
    output_dir: impl AsRef<Path>,
    title: &str,
    metadata_json: &str,
) -> Result<PathBuf, GenerationError> {
    let output_dir = output_dir.as_ref();
    std::fs::create_dir_all(output_dir)
        .map_err(|error| GenerationError::Validation(format!("创建导出目录失败: {error}")))?;

    let file_name = format!("{}.metadata.json", sanitize_export_name(title));
    let path = output_dir.join(file_name);
    std::fs::write(&path, metadata_json)
        .map_err(|error| GenerationError::Validation(format!("写入元数据文件失败: {error}")))?;
    Ok(path)
}

pub fn sanitize_export_name(value: &str) -> String {
    let mut output = String::new();
    let mut last_was_separator = false;

    for ch in value.trim().chars() {
        if ch.is_alphanumeric() || ch == '-' || ch == '_' {
            output.push(ch);
            last_was_separator = false;
        } else if !last_was_separator {
            output.push('_');
            last_was_separator = true;
        }
    }

    let output = output.trim_matches('_');
    if output.is_empty() {
        return "samimage-export".into();
    }

    let output = output
        .chars()
        .take(MAX_EXPORT_NAME_CHARS)
        .collect::<String>();
    let output = output.trim_matches('_');
    if output.is_empty() {
        "samimage-export".into()
    } else {
        output.into()
    }
}

fn normalize_export_format(value: &str) -> Result<&'static str, GenerationError> {
    let extension: String = value
        .trim()
        .trim_start_matches('.')
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect();
    match extension.to_ascii_lowercase().as_str() {
        "svg" => Ok("svg"),
        "png" => Ok("png"),
        "jpg" | "jpeg" => Ok("jpg"),
        "webp" => Ok("webp"),
        "gif" => Ok("gif"),
        "ico" => Ok("ico"),
        _ => Err(GenerationError::Validation(format!(
            "不支持的导出格式: {}",
            value.trim()
        ))),
    }
}

fn create_preview_asset(
    task_id: &str,
    input: &GenerationInput,
    index: u8,
    created_at: &str,
) -> GeneratedAsset {
    let label = mode_label(&input.mode);
    let (start, end) = mode_colors(&input.mode);
    let hash = stable_hash(&format!("{}-{}-{}", input.prompt, input.seed, index));
    let format = if input.mode == GenerationMode::Gif {
        "gif"
    } else {
        "svg"
    };
    let min_side = input.width.min(input.height) as f32;
    let title = format!("{} {}", mode_title(&input.mode), index + 1);
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="{start}"/><stop offset="1" stop-color="{end}"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".28"/></filter></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<circle cx="{c1x}" cy="{c1y}" r="{r1}" fill="rgba(255,255,255,.22)"/>
<circle cx="{c2x}" cy="{c2y}" r="{r2}" fill="rgba(255,255,255,.12)"/>
<rect x="{rx}" y="{ry}" width="{rw}" height="{rh}" rx="{rr}" fill="rgba(6,17,31,.42)" stroke="rgba(255,255,255,.32)" filter="url(#shadow)"/>
<text x="50%" y="45%" text-anchor="middle" fill="rgba(237,243,255,.94)" font-family="Segoe UI, Arial, sans-serif" font-size="{big}" font-weight="800">{label}</text>
<text x="50%" y="55%" text-anchor="middle" fill="rgba(237,243,255,.74)" font-family="Cascadia Mono, monospace" font-size="{small}">SAMIMAGE 3.0 · {hash}</text>
<text x="50%" y="64%" text-anchor="middle" fill="rgba(237,243,255,.82)" font-family="Segoe UI, Arial, sans-serif" font-size="{mid}">{prompt}</text>
</svg>"##,
        w = input.width,
        h = input.height,
        start = start,
        end = end,
        c1x = input.width as f32 * 0.24,
        c1y = input.height as f32 * 0.2,
        r1 = min_side * 0.18,
        c2x = input.width as f32 * 0.78,
        c2y = input.height as f32 * 0.72,
        r2 = min_side * 0.22,
        rx = input.width as f32 * 0.12,
        ry = input.height as f32 * 0.14,
        rw = input.width as f32 * 0.76,
        rh = input.height as f32 * 0.72,
        rr = min_side * 0.04,
        big = (min_side * 0.085).max(28.0),
        mid = (min_side * 0.03).max(16.0),
        small = (min_side * 0.026).max(14.0),
        label = escape_xml(label),
        hash = hash.to_uppercase(),
        prompt = escape_xml(&input.prompt.chars().take(36).collect::<String>()),
    );

    GeneratedAsset {
        id: format!("asset-{}", Uuid::new_v4()),
        task_id: task_id.into(),
        title,
        width: input.width,
        height: input.height,
        format: format.into(),
        data_url: if format == "gif" {
            LOCAL_GIF_DATA_URL.into()
        } else {
            format!("data:image/svg+xml;base64,{}", STANDARD.encode(svg))
        },
        local_path: None,
        created_at: created_at.into(),
    }
}

fn mode_label(mode: &GenerationMode) -> &'static str {
    match mode {
        GenerationMode::Txt2Img => "T2I",
        GenerationMode::Img2Img => "I2I",
        GenerationMode::Cover => "COVER",
        GenerationMode::Icon => "ICON",
        GenerationMode::ThreeD => "3D",
        GenerationMode::Gif => "GIF",
    }
}

fn mode_title(mode: &GenerationMode) -> &'static str {
    match mode {
        GenerationMode::Txt2Img => "文生图",
        GenerationMode::Img2Img => "图生图",
        GenerationMode::Cover => "封面图",
        GenerationMode::Icon => "ICON",
        GenerationMode::ThreeD => "3D 图",
        GenerationMode::Gif => "GIF 动图",
    }
}

fn mode_colors(mode: &GenerationMode) -> (&'static str, &'static str) {
    match mode {
        GenerationMode::Txt2Img => ("#1f6bff", "#7c3aed"),
        GenerationMode::Img2Img => ("#10b981", "#38bdf8"),
        GenerationMode::Cover => ("#ff4d8d", "#ffb86b"),
        GenerationMode::Icon => ("#111827", "#60a5fa"),
        GenerationMode::ThreeD => ("#6366f1", "#f97316"),
        GenerationMode::Gif => ("#14b8a6", "#a3e635"),
    }
}

fn stable_hash(input: &str) -> String {
    let mut hash = 5381u32;
    for byte in input.bytes() {
        hash = hash.wrapping_mul(33) ^ u32::from(byte);
    }
    format!("{hash:x}")
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
