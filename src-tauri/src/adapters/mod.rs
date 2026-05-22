use crate::models::{
    AdapterInfo, AdapterKind, GenerationRequest, ModelListResult, ModelProfile, ModelValidationResult,
    WorkMode,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::Engine;
use serde::{Deserialize, Deserializer, Serialize};
use std::time::Instant;

pub mod comfyui;
pub mod gemini;
pub mod openai_chat;
pub mod openai_images;
pub mod stability;

#[async_trait]
pub trait ImageAdapter: Send + Sync {
    fn info(&self) -> AdapterInfo;

    async fn validate_model(
        &self,
        profile: &ModelProfile,
        network_check: bool,
    ) -> Result<ModelValidationResult> {
        let started = Instant::now();
        validate_common(profile)?;

        if network_check {
            self.network_probe(profile).await?;
        }

        Ok(ModelValidationResult {
            ok: true,
            adapter: profile.adapter.clone(),
            message: format!("{} 配置可用", self.info().name),
            latency_ms: started.elapsed().as_millis(),
        })
    }

    async fn network_probe(&self, profile: &ModelProfile) -> Result<()> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(profile.timeout_sec.min(20)))
            .build()?;
        let response = client.get(&profile.base_url).send().await?;
        if response.status().is_client_error() || response.status().is_server_error() {
            return Err(anyhow!("服务返回状态码 {}", response.status()));
        }
        Ok(())
    }

    async fn generate(&self, profile: &ModelProfile, request: &GenerationRequest) -> Result<String> {
        generate_openai_compatible_image(profile, request).await
    }

    async fn reverse_prompt(&self, profile: &ModelProfile, request: &GenerationRequest) -> Result<String> {
        reverse_openai_compatible_chat(profile, request).await
    }

}

pub fn all_infos() -> Vec<AdapterInfo> {
    vec![
        openai_images::OpenAiImagesAdapter.info(),
        openai_chat::OpenAiChatAdapter.info(),
        gemini::GeminiAdapter.info(),
        stability::StabilityAdapter.info(),
        comfyui::ComfyUiAdapter.info(),
    ]
}

pub fn validate_profile_shape(profile: &ModelProfile) -> Result<()> {
    adapter_for(&profile.adapter).and_then(|adapter| futures_validate(adapter.as_ref(), profile))
}

pub async fn validate_model(
    profile: &ModelProfile,
    network_check: bool,
) -> Result<ModelValidationResult> {
    let adapter = adapter_for(&profile.adapter)?;
    adapter.validate_model(profile, network_check).await
}

pub async fn generate(profile: &ModelProfile, request: &GenerationRequest) -> Result<String> {
    let adapter = adapter_for(&profile.adapter)?;
    adapter.generate(profile, request).await
}

pub async fn reverse_prompt(profile: &ModelProfile, request: &GenerationRequest) -> Result<String> {
    let adapter = adapter_for(&profile.adapter)?;
    adapter.reverse_prompt(profile, request).await
}

pub async fn list_models(profile: &ModelProfile) -> Result<ModelListResult> {
    validate_model_list_profile(profile)?;
    let _adapter = adapter_for(&profile.adapter)?;
    match fetch_remote_models(profile).await {
        Ok(models) => {
            let message = if models.is_empty() {
                "服务返回空模型列表".to_string()
            } else {
                "已从服务地址获取模型列表".to_string()
            };
            Ok(ModelListResult {
                models,
                source: "remote",
                message,
            })
        }
        Err(error) => Err(anyhow!("获取远程模型列表失败: {error}")),
    }
}

fn adapter_for(kind: &AdapterKind) -> Result<Box<dyn ImageAdapter>> {
    match kind {
        AdapterKind::OpenaiImages => Ok(Box::new(openai_images::OpenAiImagesAdapter)),
        AdapterKind::OpenaiChat => Ok(Box::new(openai_chat::OpenAiChatAdapter)),
        AdapterKind::Gemini => Ok(Box::new(gemini::GeminiAdapter)),
        AdapterKind::Stability => Ok(Box::new(stability::StabilityAdapter)),
        AdapterKind::Comfyui => Ok(Box::new(comfyui::ComfyUiAdapter)),
    }
}

fn futures_validate(adapter: &dyn ImageAdapter, profile: &ModelProfile) -> Result<()> {
    validate_common(profile)?;
    match adapter.info().id {
        AdapterKind::Comfyui if profile.base_url.starts_with("https://") => {
            Err(anyhow!("ComfyUI 通常使用本地 http 地址，请确认服务地址"))
        }
        _ => Ok(()),
    }
}

fn validate_common(profile: &ModelProfile) -> Result<()> {
    validate_model_list_profile(profile)?;
    if profile.model.trim().is_empty() {
        return Err(anyhow!("模型名称不能为空"));
    }
    if profile.timeout_sec < 10 || profile.timeout_sec > 1800 {
        return Err(anyhow!("超时时间必须在 10 到 1800 秒之间"));
    }
    if profile.reference_image_limit == 0 || profile.reference_image_limit > 16 {
        return Err(anyhow!("参考图数量必须在 1 到 16 之间"));
    }
    Ok(())
}

fn validate_model_list_profile(profile: &ModelProfile) -> Result<()> {
    if profile.name.trim().is_empty() {
        return Err(anyhow!("配置名称不能为空"));
    }
    if profile.base_url.trim().is_empty() {
        return Err(anyhow!("服务地址不能为空"));
    }
    if !(profile.base_url.starts_with("http://") || profile.base_url.starts_with("https://")) {
        return Err(anyhow!("服务地址必须以 http:// 或 https:// 开头"));
    }
    Ok(())
}

#[derive(Deserialize)]
struct RemoteModelList {
    #[serde(default)]
    data: Vec<RemoteModel>,
    #[serde(default)]
    models: Vec<RemoteModel>,
}

#[derive(Deserialize)]
struct RemoteModel {
    #[serde(deserialize_with = "deserialize_model_id")]
    id: String,
}

fn deserialize_model_id<'de, D>(deserializer: D) -> std::result::Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(match value {
        serde_json::Value::String(value) => value,
        serde_json::Value::Number(value) => value.to_string(),
        other => other.to_string().trim_matches('"').to_string(),
    })
}

async fn fetch_remote_models(profile: &ModelProfile) -> Result<Vec<String>> {
    let base = profile.base_url.trim().trim_end_matches('/');
    let url = format!("{base}/v1/models");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(profile.timeout_sec.min(30)))
        .build()?;
    let mut request = client.get(url);
    if !profile.api_key.trim().is_empty() {
        request = request.bearer_auth(first_api_key(&profile.api_key));
    }
    let response = request.send().await?;
    if !response.status().is_success() {
        return Err(anyhow!("模型列表接口返回状态码 {}", response.status()));
    }
    let body = response.json::<RemoteModelList>().await?;
    let mut models = body
        .data
        .into_iter()
        .chain(body.models.into_iter())
        .map(|item| item.id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncWriteExt;

    fn test_profile(base_url: String) -> ModelProfile {
        ModelProfile {
            id: "test-profile".to_string(),
            name: "Test profile".to_string(),
            adapter: AdapterKind::OpenaiImages,
            base_url,
            api_key: String::new(),
            model: String::new(),
            available_models: vec!["legacy-preset-a".to_string(), "legacy-preset-b".to_string()],
            chat_endpoint: "/v1/chat/completions".to_string(),
            image_endpoint: "/v1/images/generations".to_string(),
            timeout_sec: 10,
            reference_image_limit: 4,
            created_at: None,
            updated_at: None,
        }
    }

    #[tokio::test]
    async fn list_models_does_not_return_preset_models_when_remote_fails() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            stream
                .write_all(b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n")
                .await
                .unwrap();
        });

        let result = list_models(&test_profile(format!("http://{address}"))).await;

        assert!(result.is_err());
    }
}

#[derive(Serialize)]
struct ImageGenerationPayload<'a> {
    model: &'a str,
    prompt: String,
    size: &'a str,
    n: u8,
}

#[derive(Serialize)]
struct ChatCompletionPayload {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: Vec<ChatContent>,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ChatContent {
    Text { text: String },
    ImageUrl { image_url: ChatImageUrl },
}

#[derive(Serialize)]
struct ChatImageUrl {
    url: String,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatChoiceMessage,
}

#[derive(Deserialize)]
struct ChatChoiceMessage {
    content: Option<serde_json::Value>,
}

fn extract_chat_text(content: &serde_json::Value) -> Option<String> {
    match content {
        serde_json::Value::String(value) => Some(value.trim().to_string()),
        serde_json::Value::Array(items) => {
            let combined = items
                .iter()
                .filter_map(|item| item.get("text").and_then(|value| value.as_str()))
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>()
                .join("\n");
            if combined.is_empty() { None } else { Some(combined) }
        }
        _ => None,
    }
}

fn extract_image_candidate(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(text) => normalize_image_string(text),
        serde_json::Value::Array(items) => items.iter().find_map(extract_image_candidate),
        serde_json::Value::Object(map) => {
            if let Some(url) = map.get("url").and_then(|item| item.as_str()).and_then(normalize_image_string) {
                return Some(url);
            }
            if let Some(url) = map.get("image_url").and_then(extract_image_candidate) {
                return Some(url);
            }
            if let Some(b64) = map.get("b64_json").and_then(|item| item.as_str()) {
                return Some(format!("data:image/png;base64,{}", b64.trim()));
            }
            if let Some(b64) = map.get("base64").and_then(|item| item.as_str()) {
                return Some(format!("data:image/png;base64,{}", b64.trim()));
            }
            if let Some(data) = map.get("data").and_then(|item| item.as_str()) {
                let mime = map
                    .get("mime_type")
                    .or_else(|| map.get("mimeType"))
                    .and_then(|item| item.as_str())
                    .unwrap_or("image/png");
                if mime.starts_with("image/") {
                    return Some(format!("data:{mime};base64,{}", data.trim()));
                }
            }
            map.values().find_map(extract_image_candidate)
        }
        _ => None,
    }
}

fn normalize_image_string(text: &str) -> Option<String> {
    let value = text.trim();
    if value.starts_with("data:image/") || value.starts_with("http://") || value.starts_with("https://") {
        return Some(value.to_string());
    }
    None
}

#[derive(Deserialize)]
struct ErrorResponse {
    error: Option<ErrorBody>,
}

#[derive(Deserialize)]
struct ErrorBody {
    message: Option<String>,
}

async fn generate_openai_compatible_image(
    profile: &ModelProfile,
    request: &GenerationRequest,
) -> Result<String> {
    validate_common(profile)?;
    if profile.api_key.trim().is_empty() {
        return Err(anyhow!("缺少 API 密钥，无法调用真实图像生成接口"));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(profile.timeout_sec))
        .build()?;
    let endpoint = image_endpoint_for(profile, request);
    let prompt = build_generation_prompt(request);
    let mut http = client.post(endpoint).bearer_auth(first_api_key(&profile.api_key));

    http = if should_use_edit_endpoint(request) {
        if request.reference_images.is_empty() {
            return Err(anyhow!("{} 模式需要至少一张参考图", request.mode.as_str()));
        }
        if matches!(request.mode, WorkMode::Blend) && request.reference_images.len() < 2 {
            return Err(anyhow!("融合模式至少需要 2 张参考图"));
        }
        if matches!(profile.adapter, AdapterKind::OpenaiChat | AdapterKind::Gemini) {
            http.json(&build_multimodal_chat_payload(profile, request, prompt))
        } else {
            return generate_openai_image_edit(profile, request, prompt).await;
        }
    } else {
        http.json(&ImageGenerationPayload {
            model: profile.model.trim(),
            prompt,
            size: request.size.as_str(),
            n: 1,
        })
    };

    let response = http.send().await?;
    parse_image_response(response).await
}

async fn generate_openai_image_edit(
    profile: &ModelProfile,
    request: &GenerationRequest,
    prompt: String,
) -> Result<String> {
    let endpoint = image_endpoint_for(profile, request);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(profile.timeout_sec))
        .build()?;
    let mut form = reqwest::multipart::Form::new()
        .text("model", profile.model.trim().to_string())
        .text("prompt", prompt)
        .text("size", request.size.clone())
        .text("n", "1");

    for (index, source) in request.reference_images.iter().enumerate() {
        let bytes = image_source_bytes(source).await?;
        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(format!("reference-{index}.png"))
            .mime_str("image/png")?;
        form = form.part("image[]", part);
    }

    let response = client
        .post(endpoint)
        .bearer_auth(first_api_key(&profile.api_key))
        .multipart(form)
        .send()
        .await?;
    parse_image_response(response).await
}

fn build_multimodal_chat_payload(
    profile: &ModelProfile,
    request: &GenerationRequest,
    prompt: String,
) -> ChatCompletionPayload {
    let mut content = vec![ChatContent::Text { text: prompt }];
    for image in &request.reference_images {
        content.push(ChatContent::ImageUrl {
            image_url: ChatImageUrl { url: image.clone() },
        });
    }
    ChatCompletionPayload {
        model: profile.model.trim().to_string(),
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content,
        }],
        temperature: Some(0.7),
    }
}

async fn reverse_openai_compatible_chat(
    profile: &ModelProfile,
    request: &GenerationRequest,
) -> Result<String> {
    validate_common(profile)?;
    if profile.api_key.trim().is_empty() {
        return Err(anyhow!("缺少 API 密钥，无法调用反推接口"));
    }
    if request.reference_images.is_empty() {
        return Err(anyhow!("反推模式至少需要 1 张参考图"));
    }
    let instruction = if request.prompt.trim().is_empty() {
        "请分析参考图，输出一段可直接用于文生图模型的中文提示词。要求包含主体、场景、构图、光线、风格、材质和画面质量，不要解释过程。".to_string()
    } else {
        format!("{}\n\n请结合参考图，输出一段可直接用于文生图模型的中文提示词，不要解释过程。", request.prompt.trim())
    };
    let payload = build_multimodal_chat_payload(profile, request, instruction);
    let base = profile.base_url.trim().trim_end_matches('/');
    let endpoint = if profile.chat_endpoint.trim().is_empty() {
        "/v1/chat/completions".to_string()
    } else if profile.chat_endpoint.starts_with('/') {
        profile.chat_endpoint.clone()
    } else {
        format!("/{}", profile.chat_endpoint)
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(profile.timeout_sec))
        .build()?;
    let response = client
        .post(format!("{base}{endpoint}"))
        .bearer_auth(first_api_key(&profile.api_key))
        .json(&payload)
        .send()
        .await?;
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        let message = serde_json::from_str::<ErrorResponse>(&text)
            .ok()
            .and_then(|body| body.error.and_then(|error| error.message))
            .unwrap_or_else(|| text.chars().take(400).collect());
        return Err(anyhow!("反推接口返回状态码 {status}: {message}"));
    }
    let body = serde_json::from_str::<ChatCompletionResponse>(&text)?;
    body.choices
        .into_iter()
        .find_map(|choice| choice.message.content.and_then(|content| extract_chat_text(&content)))
        .filter(|content| !content.is_empty())
        .ok_or_else(|| anyhow!("反推接口没有返回提示词"))
}

async fn parse_image_response(response: reqwest::Response) -> Result<String> {
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        let message = serde_json::from_str::<ErrorResponse>(&text)
            .ok()
            .and_then(|body| body.error.and_then(|error| error.message))
            .unwrap_or_else(|| text.chars().take(400).collect());
        return Err(anyhow!("图像生成接口返回状态码 {status}: {message}"));
    }
    if let Some(candidate) = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|value| extract_image_candidate(&value))
    {
        return Ok(candidate);
    }
    if let Ok(body) = serde_json::from_str::<ChatCompletionResponse>(&text) {
        if let Some(value) = body
            .choices
            .into_iter()
            .find_map(|choice| choice.message.content.and_then(|content| extract_chat_text(&content)))
        {
            return Err(anyhow!("多模态生成接口返回了文本而不是图片 URL 或 data URL: {}", value.chars().take(120).collect::<String>()));
        }
    }
    Err(anyhow!("图像生成接口返回了未知图片格式"))
}

async fn image_source_bytes(source: &str) -> Result<Vec<u8>> {
    if let Some((meta, data)) = source.split_once(',') {
        if meta.starts_with("data:image/") {
            return base64::engine::general_purpose::STANDARD
                .decode(data.trim())
                .map_err(|err| anyhow!("参考图 base64 解码失败: {err}"));
        }
    }
    if source.starts_with("http://") || source.starts_with("https://") {
        let response = reqwest::get(source).await?;
        if !response.status().is_success() {
            return Err(anyhow!("下载参考图失败: {}", response.status()));
        }
        return Ok(response.bytes().await?.to_vec());
    }
    Err(anyhow!("参考图只支持 data URL 或 http(s) URL"))
}

fn image_endpoint_for(profile: &ModelProfile, request: &GenerationRequest) -> String {
    let base = profile.base_url.trim().trim_end_matches('/');
    let configured = if matches!(profile.adapter, AdapterKind::OpenaiChat | AdapterKind::Gemini) {
        profile.chat_endpoint.clone()
    } else if should_use_edit_endpoint(request) {
        derive_edit_endpoint(&profile.image_endpoint)
    } else {
        profile.image_endpoint.clone()
    };
    let endpoint = if configured.trim().is_empty() {
        "/v1/images/generations".to_string()
    } else if configured.starts_with('/') {
        configured
    } else {
        format!("/{configured}")
    };
    format!("{base}{endpoint}")
}

fn derive_edit_endpoint(image_endpoint: &str) -> String {
    let endpoint = image_endpoint.trim();
    if endpoint.contains("/edits") {
        endpoint.to_string()
    } else if endpoint.contains("/generations") {
        endpoint.replace("/generations", "/edits")
    } else {
        "/v1/images/edits".to_string()
    }
}

fn should_use_edit_endpoint(request: &GenerationRequest) -> bool {
    matches!(request.mode, WorkMode::Img2img | WorkMode::Blend) && !request.reference_images.is_empty()
}

fn build_generation_prompt(request: &GenerationRequest) -> String {
    let mut parts = vec![request.prompt.trim().to_string()];
    if !request.negative_prompt.trim().is_empty() {
        parts.push(format!("Avoid: {}", request.negative_prompt.trim()));
    }
    if let Some(seed) = request.seed {
        parts.push(format!("Seed hint: {seed}"));
    }
    if matches!(request.mode, WorkMode::Blend) {
        parts.push("Blend the supplied reference images into a coherent new image.".to_string());
    }
    parts.join("\n")
}

fn first_api_key(value: &str) -> &str {
    value
        .split(',')
        .map(str::trim)
        .find(|item| !item.is_empty())
        .unwrap_or("")
}
