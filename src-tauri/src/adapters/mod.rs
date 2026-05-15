use crate::models::{
    AdapterInfo, AdapterKind, GenerationRequest, ModelListResult, ModelProfile, ModelValidationResult,
    WorkMode,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
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

    fn preset_models(&self) -> Vec<String> {
        Vec::new()
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

pub async fn list_models(profile: &ModelProfile) -> Result<ModelListResult> {
    validate_model_list_profile(profile)?;
    let adapter = adapter_for(&profile.adapter)?;
    match fetch_remote_models(profile).await {
        Ok(models) if !models.is_empty() => Ok(ModelListResult {
            models,
            source: "remote",
            message: "已从服务地址获取模型列表".to_string(),
        }),
        _ => {
            let mut models = adapter.preset_models();
            if !profile.model.trim().is_empty() {
                models.push(profile.model.trim().to_string());
            }
            models.sort();
            models.dedup();
            Ok(ModelListResult {
                models,
                source: "preset",
                message: "远程模型列表不可用，已显示适配器预设模型".to_string(),
            })
        }
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

#[derive(Serialize)]
struct ImageGenerationPayload<'a> {
    model: &'a str,
    prompt: String,
    size: &'a str,
    n: u8,
}

#[derive(Serialize)]
struct ImageEditPayload<'a> {
    model: &'a str,
    prompt: String,
    images: &'a [String],
    size: &'a str,
    n: u8,
}

#[derive(Deserialize)]
struct ImageResponse {
    data: Vec<ImageData>,
}

#[derive(Deserialize)]
struct ImageData {
    b64_json: Option<String>,
    url: Option<String>,
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
        http.json(&ImageEditPayload {
            model: profile.model.trim(),
            prompt,
            images: &request.reference_images,
            size: request.size.as_str(),
            n: 1,
        })
    } else {
        http.json(&ImageGenerationPayload {
            model: profile.model.trim(),
            prompt,
            size: request.size.as_str(),
            n: 1,
        })
    };

    let response = http.send().await?;
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        let message = serde_json::from_str::<ErrorResponse>(&text)
            .ok()
            .and_then(|body| body.error.and_then(|error| error.message))
            .unwrap_or_else(|| text.chars().take(400).collect());
        return Err(anyhow!("图像生成接口返回状态码 {status}: {message}"));
    }

    let body = serde_json::from_str::<ImageResponse>(&text)?;
    let first = body
        .data
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("图像生成接口没有返回图片数据"))?;
    if let Some(b64) = first.b64_json {
        return Ok(format!("data:image/png;base64,{b64}"));
    }
    if let Some(url) = first.url {
        return Ok(url);
    }
    Err(anyhow!("图像生成接口返回了未知图片格式"))
}

fn image_endpoint_for(profile: &ModelProfile, request: &GenerationRequest) -> String {
    let base = profile.base_url.trim().trim_end_matches('/');
    let configured = if should_use_edit_endpoint(request) {
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
