use std::time::{Duration, Instant};

use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::{
    app_state::AppState,
    db::model_profile_repo,
    domain::model_auth,
    error::{AppError, AppResult},
};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelCapability {
    Text,
    Image,
    Multimodal,
}

impl ModelCapability {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Image => "image",
            Self::Multimodal => "multimodal",
        }
    }

    pub fn from_db(value: &str) -> Result<Self, AppError> {
        match value {
            "text" => Ok(Self::Text),
            "image" => Ok(Self::Image),
            "multimodal" => Ok(Self::Multimodal),
            other => Err(AppError::InvalidData(format!("未知模型能力: {other}"))),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfileDraft {
    #[serde(default)]
    pub id: String,
    pub capability: ModelCapability,
    pub name: String,
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub has_api_key: bool,
    pub model: String,
    pub chat_endpoint: String,
    pub image_endpoint: String,
    pub models_endpoint: String,
    pub enabled: bool,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOptionsResponse {
    pub models: Vec<String>,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEndpointCheckResponse {
    pub ok: bool,
    pub message: String,
    pub status_code: Option<u16>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelHealthCheckResult {
    pub model: String,
    pub ok: bool,
    pub latency_ms: Option<u64>,
    pub status_code: Option<u16>,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelHealthCheckResponse {
    pub results: Vec<ModelHealthCheckResult>,
    pub message: String,
}

#[derive(Clone, Debug)]
struct ModelHealthProbe {
    url: String,
    payload: Value,
}

const DEFAULT_MODEL_PROVIDER: &str = "openai-compatible";
const MODEL_HEALTH_CHECK_TIMEOUT_SECS: u64 = 15;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZhipuModelInfo {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub description: Option<String>,
    pub deprecated: Option<bool>,
    pub created_at: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZhipuModelsResponse {
    pub data: Vec<ZhipuModelInfo>,
    #[serde(default)]
    pub object: String,
}

fn normalize_model_profile(mut profile: ModelProfileDraft) -> ModelProfileDraft {
    let fallback_name = match profile.capability {
        ModelCapability::Text => "文本模型",
        ModelCapability::Image => "图像模型",
        ModelCapability::Multimodal => "多模态模型",
    };

    profile.name = if profile.name.trim().is_empty() {
        fallback_name.to_string()
    } else {
        profile.name.trim().to_string()
    };
    profile.provider = normalize_model_provider(&profile.provider);
    profile.base_url = profile.base_url.trim().to_string();
    profile.id = profile.id.trim().to_string();
    profile.api_key = profile.api_key.trim().to_string();
    profile.model = profile.model.trim().to_string();
    profile.chat_endpoint = profile.chat_endpoint.trim().to_string();
    profile.image_endpoint = profile.image_endpoint.trim().to_string();
    profile.models_endpoint = if profile.models_endpoint.trim().is_empty() {
        "/v1/models".to_string()
    } else {
        profile.models_endpoint.trim().to_string()
    };
    profile
}

fn normalize_model_provider(provider: &str) -> String {
    let normalized = provider.trim().to_lowercase();
    match normalized.as_str() {
        "" | "custom" | "zhipu" | "bigmodel" | "glm" | "stability" | "comfyui"
        | "openai compatible" | "openai_compatible" => DEFAULT_MODEL_PROVIDER.to_string(),
        "openai-compatible" | "openai" | "claude" | "gemini" | "azure" => normalized,
        _ => DEFAULT_MODEL_PROVIDER.to_string(),
    }
}

fn join_endpoint_url(base_url: &str, endpoint: &str) -> AppResult<String> {
    let base_url = base_url.trim().trim_end_matches('/');
    let endpoint = endpoint.trim().trim_start_matches('/');
    if base_url.is_empty() || endpoint.is_empty() {
        return Err(AppError::InvalidData(
            "请先配置服务地址和接口路径".to_string(),
        ));
    }
    Ok(format!("{base_url}/{endpoint}"))
}

fn model_endpoint_url(profile: &ModelProfileDraft) -> AppResult<String> {
    let base_url = profile.base_url.trim().trim_end_matches('/');
    let endpoint = profile.models_endpoint.trim().trim_start_matches('/');
    if base_url.is_empty() || endpoint.is_empty() {
        return Err(AppError::InvalidData(
            "请先配置服务地址和模型列表路径".to_string(),
        ));
    }
    Ok(format!("{base_url}/{endpoint}"))
}

fn model_check_url(profile: &ModelProfileDraft) -> AppResult<String> {
    let endpoint = match profile.capability {
        ModelCapability::Text => {
            if profile.chat_endpoint.trim().is_empty() {
                profile.models_endpoint.as_str()
            } else {
                profile.chat_endpoint.as_str()
            }
        }
        ModelCapability::Image | ModelCapability::Multimodal => {
            if profile.image_endpoint.trim().is_empty() {
                profile.models_endpoint.as_str()
            } else {
                profile.image_endpoint.as_str()
            }
        }
    };
    join_endpoint_url(profile.base_url.as_str(), endpoint)
}

fn model_candidate_keys(capability: ModelCapability) -> &'static [&'static str] {
    match capability {
        ModelCapability::Text => &[
            "id",
            "root",
            "code",
            "slug",
            "name",
            "model",
            "modelName",
            "model_name",
            "modelCode",
            "model_code",
            "modelId",
            "model_id",
            "displayName",
            "display_name",
            "value",
        ],
        ModelCapability::Image | ModelCapability::Multimodal => &[
            "id",
            "root",
            "code",
            "slug",
            "name",
            "model",
            "modelName",
            "model_name",
            "modelCode",
            "model_code",
            "modelId",
            "model_id",
            "displayName",
            "display_name",
            "value",
        ],
    }
}

const MODEL_COLLECTION_KEYS: &[&str] = &[
    "data",
    "models",
    "items",
    "result",
    "results",
    "list",
    "model_list",
    "modelList",
    "modelIds",
    "model_ids",
    "available_models",
    "availableModels",
    "available",
    "catalog",
    "model_catalog",
    "modelCatalog",
    "model_map",
    "modelMap",
    "supported_models",
    "supportedModels",
];

const NON_MODEL_CONTAINER_KEYS: &[&str] = &[
    "meta",
    "metadata",
    "page",
    "pages",
    "pagination",
    "links",
    "usage",
    "stats",
    "statistics",
];

fn is_model_collection_key(key: &str) -> bool {
    MODEL_COLLECTION_KEYS.contains(&key)
}

fn is_non_model_container_key(key: &str) -> bool {
    NON_MODEL_CONTAINER_KEYS.contains(&key)
}

fn is_display_label_key(key: &str) -> bool {
    matches!(key, "displayName" | "display_name")
}

fn looks_like_model_id(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && value.len() <= 128
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':' | '/'))
        && value
            .chars()
            .any(|ch| ch.is_ascii_digit() || matches!(ch, '-' | '.' | ':' | '/'))
}

fn collect_model_ids_in_context(
    payload: &Value,
    capability: ModelCapability,
    models: &mut Vec<String>,
    allow_bare_string: bool,
    allow_model_keys: bool,
) {
    match payload {
        Value::String(value) => {
            let value = value.trim();
            if allow_bare_string && !value.is_empty() {
                models.push(value.to_string());
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_model_ids_in_context(item, capability, models, true, allow_model_keys);
            }
        }
        Value::Object(record) => {
            let model_count_before_nested_collections = models.len();
            for key in MODEL_COLLECTION_KEYS {
                if let Some(value) = record.get(*key) {
                    collect_model_ids_in_context(value, capability, models, true, true);
                }
            }
            if models.len() > model_count_before_nested_collections {
                return;
            }

            let mut collected_model_key = false;
            if allow_model_keys {
                for key in record.keys() {
                    if !is_model_collection_key(key.as_str())
                        && !is_non_model_container_key(key.as_str())
                        && looks_like_model_id(key)
                    {
                        models.push(key.to_string());
                        collected_model_key = true;
                    }
                }
            }

            for key in model_candidate_keys(capability) {
                if collected_model_key && is_display_label_key(key) {
                    continue;
                }
                if let Some(value) = record.get(*key).and_then(Value::as_str) {
                    let value = value.trim();
                    if !value.is_empty() {
                        models.push(value.to_string());
                        return;
                    }
                }
            }

            for (key, value) in record {
                if is_model_collection_key(key.as_str()) || is_non_model_container_key(key.as_str())
                {
                    continue;
                }
                if allow_model_keys && looks_like_model_id(key) {
                    continue;
                }
                if value.is_array() || value.is_object() {
                    collect_model_ids_in_context(
                        value,
                        capability,
                        models,
                        false,
                        allow_model_keys,
                    );
                }
            }
        }
        _ => {}
    }
}

fn collect_model_ids(payload: &Value, capability: ModelCapability, models: &mut Vec<String>) {
    collect_model_ids_in_context(payload, capability, models, true, false);
}

fn parse_model_ids(payload: &Value, capability: ModelCapability) -> Vec<String> {
    let mut models = Vec::new();
    collect_model_ids(payload, capability, &mut models);
    let mut models: Vec<String> = models
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect();
    models.sort();
    models.dedup();
    models
}

fn merge_model_ids(primary: Vec<String>, fallback: Vec<String>) -> Vec<String> {
    let mut models: Vec<String> = primary
        .into_iter()
        .chain(fallback)
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect();
    models.sort();
    models.dedup();
    models
}

fn is_zhipu_profile(profile: &ModelProfileDraft) -> bool {
    let provider = profile.provider.to_lowercase();
    let base_url = profile.base_url.to_lowercase();
    provider.contains("zhipu")
        || provider.contains("bigmodel")
        || provider.contains("glm")
        || base_url.contains("bigmodel.cn")
        || base_url.contains("zhipuai.cn")
}

fn get_zhipu_recommended_models(capability: ModelCapability) -> Vec<String> {
    match capability {
        ModelCapability::Text => vec![
            "glm-4.7-flash",
            "glm-4.6",
            "glm-4.6v-flash",
            "glm-4.5",
            "glm-4.5-air",
            "glm-4.5-airx",
            "glm-4.5-flash",
            "glm-4.5v",
            "glm-4.5v-flash",
            "glm-4-flash",
            "glm-4-plus",
            "glm-4-air",
            "glm-4-long",
            "glm-4v-plus",
            "glm-4v-flash",
        ],
        ModelCapability::Image => vec!["cogview-3-flash", "cogview-4"],
        ModelCapability::Multimodal => vec![
            "glm-4.6v-flash",
            "glm-4.5v",
            "glm-4.5v-flash",
            "glm-4v-plus",
            "glm-4v-flash",
        ],
    }
    .into_iter()
    .map(str::to_string)
    .collect()
}

fn parse_zhipu_model_ids(payload: &Value, capability: ModelCapability) -> Vec<String> {
    let typed_models = serde_json::from_value::<ZhipuModelsResponse>(payload.clone())
        .map(|response| {
            response
                .data
                .into_iter()
                .map(|model| model.id)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    merge_model_ids(typed_models, parse_model_ids(payload, capability))
}

fn build_model_health_probe(
    profile: &ModelProfileDraft,
    model: &str,
) -> AppResult<ModelHealthProbe> {
    let model = model.trim();
    if model.is_empty() {
        return Err(AppError::InvalidData("模型名称不能为空".to_string()));
    }

    let (endpoint, payload) = match profile.capability {
        ModelCapability::Text | ModelCapability::Multimodal => (
            if profile.chat_endpoint.trim().is_empty() {
                profile.models_endpoint.as_str()
            } else {
                profile.chat_endpoint.as_str()
            },
            json!({
                "model": model,
                "messages": [
                    { "role": "user", "content": "ping" }
                ],
                "max_tokens": 1,
                "stream": false
            }),
        ),
        ModelCapability::Image => {
            return Err(AppError::InvalidData(
                "图像模型健康检查使用模型列表接口，不触发真实生图".to_string(),
            ));
        }
    };

    Ok(ModelHealthProbe {
        url: join_endpoint_url(profile.base_url.as_str(), endpoint)?,
        payload,
    })
}

fn extract_provider_error_message(payload: &Value) -> Option<String> {
    match payload {
        Value::String(value) => {
            let value = value.trim();
            if value.is_empty() {
                None
            } else {
                Some(value.to_string())
            }
        }
        Value::Array(items) => items.iter().find_map(extract_provider_error_message),
        Value::Object(record) => {
            for key in ["message", "error", "reason", "detail"] {
                if let Some(value) = record.get(key) {
                    if let Some(message) = extract_provider_error_message(value) {
                        return Some(message);
                    }
                }
            }
            None
        }
        _ => None,
    }
}

async fn provider_failure_message(status: u16, response: reqwest::Response) -> String {
    let body = response.text().await.unwrap_or_default();
    let provider_message = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|payload| extract_provider_error_message(&payload));
    match provider_message {
        Some(message) => format!("HTTP {status}: {message}"),
        None => format!("HTTP {status}"),
    }
}

fn apply_api_key(request: reqwest::RequestBuilder, api_key: &str) -> reqwest::RequestBuilder {
    match model_auth::first_api_key(api_key) {
        Some(api_key) => request.header(AUTHORIZATION, format!("Bearer {api_key}")),
        None => request,
    }
}

async fn check_single_model_health(
    client: &reqwest::Client,
    profile: &ModelProfileDraft,
    model: &str,
) -> ModelHealthCheckResult {
    let started_at = Instant::now();
    let probe = match build_model_health_probe(profile, model) {
        Ok(probe) => probe,
        Err(error) => {
            return ModelHealthCheckResult {
                model: model.to_string(),
                ok: false,
                latency_ms: None,
                status_code: None,
                message: error.to_string(),
            };
        }
    };

    let request = client
        .post(probe.url)
        .header(CONTENT_TYPE, "application/json")
        .body(probe.payload.to_string());
    let request = apply_api_key(request, &profile.api_key);

    match request.send().await {
        Ok(response) => {
            let status = response.status();
            let latency_ms = started_at.elapsed().as_millis().min(u64::MAX as u128) as u64;
            if status.is_success() {
                ModelHealthCheckResult {
                    model: model.to_string(),
                    ok: true,
                    latency_ms: Some(latency_ms),
                    status_code: Some(status.as_u16()),
                    message: "检查通过".to_string(),
                }
            } else {
                ModelHealthCheckResult {
                    model: model.to_string(),
                    ok: false,
                    latency_ms: Some(latency_ms),
                    status_code: Some(status.as_u16()),
                    message: provider_failure_message(status.as_u16(), response).await,
                }
            }
        }
        Err(error) => ModelHealthCheckResult {
            model: model.to_string(),
            ok: false,
            latency_ms: Some(started_at.elapsed().as_millis().min(u64::MAX as u128) as u64),
            status_code: None,
            message: error.to_string(),
        },
    }
}

fn model_id_matches(models: &[String], target: &str) -> bool {
    let target = target.trim();
    models
        .iter()
        .any(|model| model.eq_ignore_ascii_case(target))
}

fn image_health_results_from_message(
    models: &[String],
    ok: bool,
    latency_ms: Option<u64>,
    status_code: Option<u16>,
    message: String,
) -> Vec<ModelHealthCheckResult> {
    models
        .iter()
        .map(|model| ModelHealthCheckResult {
            model: model.clone(),
            ok,
            latency_ms,
            status_code,
            message: message.clone(),
        })
        .collect()
}

async fn check_image_models_health(
    client: &reqwest::Client,
    profile: &ModelProfileDraft,
    models: &[String],
) -> Vec<ModelHealthCheckResult> {
    let started_at = Instant::now();
    let url = match model_endpoint_url(profile) {
        Ok(url) => url,
        Err(error) => {
            return image_health_results_from_message(models, false, None, None, error.to_string());
        }
    };

    let request = client.get(url).header(CONTENT_TYPE, "application/json");
    let request = apply_api_key(request, &profile.api_key);

    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            return image_health_results_from_message(
                models,
                false,
                Some(started_at.elapsed().as_millis().min(u64::MAX as u128) as u64),
                None,
                error.to_string(),
            );
        }
    };

    let status = response.status();
    let latency_ms = started_at.elapsed().as_millis().min(u64::MAX as u128) as u64;
    if !status.is_success() {
        let message = provider_failure_message(status.as_u16(), response).await;
        return image_health_results_from_message(
            models,
            false,
            Some(latency_ms),
            Some(status.as_u16()),
            message,
        );
    }

    let status_code = Some(status.as_u16());
    let body = match response.text().await {
        Ok(body) => body,
        Err(error) => {
            return image_health_results_from_message(
                models,
                false,
                Some(latency_ms),
                status_code,
                error.to_string(),
            );
        }
    };
    let payload: Value = match serde_json::from_str(&body) {
        Ok(payload) => payload,
        Err(error) => {
            return image_health_results_from_message(
                models,
                false,
                Some(latency_ms),
                status_code,
                format!("模型列表响应无法解析: {error}"),
            );
        }
    };

    let fetched_models = if is_zhipu_profile(profile) {
        merge_model_ids(
            parse_zhipu_model_ids(&payload, profile.capability),
            get_zhipu_recommended_models(profile.capability),
        )
    } else {
        parse_model_ids(&payload, profile.capability)
    };

    if fetched_models.is_empty() {
        return image_health_results_from_message(
            models,
            false,
            Some(latency_ms),
            status_code,
            "模型列表响应中没有识别到模型名称".to_string(),
        );
    }

    models
        .iter()
        .map(|model| {
            let ok = model_id_matches(&fetched_models, model);
            ModelHealthCheckResult {
                model: model.clone(),
                ok,
                latency_ms: Some(latency_ms),
                status_code,
                message: if ok {
                    "检查通过".to_string()
                } else {
                    "模型列表中未找到该模型".to_string()
                },
            }
        })
        .collect()
}

fn build_model_health_response(results: Vec<ModelHealthCheckResult>) -> ModelHealthCheckResponse {
    let ok_count = results.iter().filter(|result| result.ok).count();
    let failed_count = results.len().saturating_sub(ok_count);
    ModelHealthCheckResponse {
        message: format!("健康检查完成：{ok_count} 个通过，{failed_count} 个异常"),
        results,
    }
}

async fn fetch_zhipu_models_directly(
    client: &reqwest::Client,
    profile: &ModelProfileDraft,
    url: &str,
) -> AppResult<Vec<String>> {
    let request = client.get(url).header(CONTENT_TYPE, "application/json");
    let request = apply_api_key(request, &profile.api_key);

    let response = request.send().await?;
    let status = response.status();
    if !status.is_success() {
        return Err(AppError::InvalidData(format!(
            "智谱模型列表请求失败，HTTP {}",
            status.as_u16()
        )));
    }

    let payload: Value = serde_json::from_str(response.text().await?.as_str())?;
    Ok(parse_zhipu_model_ids(&payload, profile.capability))
}

#[tauri::command]
pub async fn list_model_profiles(state: State<'_, AppState>) -> AppResult<Vec<ModelProfileDraft>> {
    model_profile_repo::list_model_profiles(&state.db).await
}

#[tauri::command]
pub async fn fetch_model_options(
    state: State<'_, AppState>,
    profile: ModelProfileDraft,
) -> AppResult<ModelOptionsResponse> {
    let mut profile = normalize_model_profile(profile);
    if profile.api_key.is_empty() && profile.has_api_key {
        profile.api_key =
            model_profile_repo::get_api_key_ref(&state.db, &profile.id, profile.capability)
                .await?
                .unwrap_or_default();
    }

    let url = model_endpoint_url(&profile)?;
    let client = reqwest::Client::new();
    let is_zhipu = is_zhipu_profile(&profile);

    if is_zhipu {
        let recommended_models = get_zhipu_recommended_models(profile.capability);
        let fetched_models = fetch_zhipu_models_directly(&client, &profile, &url)
            .await
            .unwrap_or_default();
        let models = merge_model_ids(fetched_models, recommended_models);
        if !models.is_empty() {
            return Ok(ModelOptionsResponse {
                message: format!("已获取 {} 个模型（含智谱推荐模型）", models.len()),
                models,
            });
        }
    }

    let request = client.get(url).header(CONTENT_TYPE, "application/json");
    let request = apply_api_key(request, &profile.api_key);

    let response = request.send().await?;
    let status = response.status();
    if !status.is_success() {
        return Err(AppError::InvalidData(format!(
            "模型列表请求失败，HTTP {}",
            status.as_u16()
        )));
    }

    let payload: Value = serde_json::from_str(response.text().await?.as_str())?;
    let models = parse_model_ids(&payload, profile.capability);
    if models.is_empty() {
        let capability_label = match profile.capability {
            ModelCapability::Text => "文本模型",
            ModelCapability::Image | ModelCapability::Multimodal => "图像模型",
        };
        return Err(AppError::InvalidData(format!(
            "{capability_label}列表响应中没有识别到模型名称，请检查模型列表路径或手动填写模型名称"
        )));
    }

    Ok(ModelOptionsResponse {
        message: format!("已获取 {} 个模型", models.len()),
        models,
    })
}

#[tauri::command]
pub async fn check_model_health(
    state: State<'_, AppState>,
    profile: ModelProfileDraft,
    models: Vec<String>,
) -> AppResult<ModelHealthCheckResponse> {
    let mut profile = normalize_model_profile(profile);
    if profile.api_key.is_empty() && profile.has_api_key {
        profile.api_key =
            model_profile_repo::get_api_key_ref(&state.db, &profile.id, profile.capability)
                .await?
                .unwrap_or_default();
    }

    let models = merge_model_ids(models, Vec::new());
    if models.is_empty() {
        return Err(AppError::InvalidData(
            "请先获取模型列表或填写模型名称".to_string(),
        ));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(MODEL_HEALTH_CHECK_TIMEOUT_SECS))
        .build()?;
    let results = if profile.capability == ModelCapability::Image {
        check_image_models_health(&client, &profile, &models).await
    } else {
        let mut results = Vec::with_capacity(models.len());
        for model in models {
            results.push(check_single_model_health(&client, &profile, &model).await);
        }
        results
    };

    Ok(build_model_health_response(results))
}

#[tauri::command]
pub async fn check_model_endpoint(
    state: State<'_, AppState>,
    profile: ModelProfileDraft,
) -> AppResult<ModelEndpointCheckResponse> {
    let mut profile = normalize_model_profile(profile);
    if profile.api_key.is_empty() && profile.has_api_key {
        profile.api_key =
            model_profile_repo::get_api_key_ref(&state.db, &profile.id, profile.capability)
                .await?
                .unwrap_or_default();
    }

    let client = reqwest::Client::new();
    let url = model_check_url(&profile)?;
    let request = client.head(&url).header(CONTENT_TYPE, "application/json");
    let request = apply_api_key(request, &profile.api_key);

    let response = match request.send().await {
        Ok(response) => response,
        Err(_) => {
            let fallback = client.get(&url).header(CONTENT_TYPE, "application/json");
            let fallback = apply_api_key(fallback, &profile.api_key);
            fallback.send().await?
        }
    };
    let status = response.status().as_u16();

    Ok(ModelEndpointCheckResponse {
        ok: true,
        message: format!("接口连通，HTTP {status}"),
        status_code: Some(status),
    })
}

#[tauri::command]
pub async fn save_model_profile(
    state: State<'_, AppState>,
    profile: ModelProfileDraft,
) -> AppResult<Vec<ModelProfileDraft>> {
    let profile = normalize_model_profile(profile);
    model_profile_repo::save_model_profile(&state.db, &profile).await
}

#[tauri::command]
pub async fn clear_model_profile(
    state: State<'_, AppState>,
    capability: ModelCapability,
) -> AppResult<Vec<ModelProfileDraft>> {
    model_profile_repo::clear_model_profile(&state.db, capability).await
}

#[tauri::command]
pub async fn delete_model_profile(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<ModelProfileDraft>> {
    model_profile_repo::delete_model_profile(&state.db, &id).await
}

#[tauri::command]
pub async fn set_default_model_profile(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<ModelProfileDraft>> {
    model_profile_repo::set_default_model_profile(&state.db, &id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_legacy_provider_values_to_openai_compatible() {
        let mut profile = ModelProfileDraft {
            id: String::new(),
            capability: ModelCapability::Text,
            name: "Text".to_string(),
            provider: " custom ".to_string(),
            base_url: "https://api.example.com/v1".to_string(),
            api_key: String::new(),
            has_api_key: false,
            model: "glm-4.5-flash".to_string(),
            chat_endpoint: "/chat/completions".to_string(),
            image_endpoint: String::new(),
            models_endpoint: "/models".to_string(),
            enabled: true,
            is_default: false,
        };

        assert_eq!(
            normalize_model_profile(profile.clone()).provider,
            "openai-compatible"
        );

        profile.provider = " zhipu ".to_string();
        assert_eq!(
            normalize_model_profile(profile.clone()).provider,
            "openai-compatible"
        );

        profile.provider = "  ".to_string();
        assert_eq!(
            normalize_model_profile(profile).provider,
            "openai-compatible"
        );
    }

    #[test]
    fn parses_model_ids_from_common_provider_shapes() {
        let payload = serde_json::json!({
            "data": [
                { "id": "gpt-image-1" },
                { "id": "gpt-image-1" },
                { "name": "custom-image" },
                "raw-model"
            ]
        });

        let models = parse_model_ids(&payload, ModelCapability::Image);

        assert_eq!(models, vec!["custom-image", "gpt-image-1", "raw-model"]);
    }

    #[test]
    fn parses_text_model_ids_from_nested_provider_shapes() {
        let payload = serde_json::json!({
            "result": {
                "items": [
                    { "model": "glm-4.5" },
                    { "model_name": "deepseek-chat" },
                    { "value": "qwen-max" }
                ]
            }
        });

        let models = parse_model_ids(&payload, ModelCapability::Text);

        assert_eq!(models, vec!["deepseek-chat", "glm-4.5", "qwen-max"]);
    }

    #[test]
    fn parses_model_ids_from_provider_catalogs_grouped_by_unknown_keys() {
        let payload = serde_json::json!({
            "data": {
                "glmSeries": [
                    { "id": "GLM-4.5-Flash" },
                    { "name": "GLM-4.6V-Flash" }
                ],
                "metadata": {
                    "model": "provider-metadata-model"
                }
            }
        });

        let models = parse_model_ids(&payload, ModelCapability::Text);

        assert_eq!(models, vec!["GLM-4.5-Flash", "GLM-4.6V-Flash"]);
    }

    #[test]
    fn parses_model_ids_from_provider_catalog_maps_and_alias_fields() {
        let payload = serde_json::json!({
            "data": {
                "glm-4.5-flash": {
                    "object": "model",
                    "owned_by": "zhipu"
                },
                "glm-4.6v-flash": {
                    "displayName": "GLM-4.6V-Flash"
                },
                "vision": [
                    { "root": "glm-4.5v" },
                    { "modelCode": "glm-4.5-airx" }
                ],
                "metadata": {
                    "model": "provider-metadata-model"
                }
            }
        });

        let models = parse_model_ids(&payload, ModelCapability::Text);

        assert_eq!(
            models,
            vec![
                "glm-4.5-airx",
                "glm-4.5-flash",
                "glm-4.5v",
                "glm-4.6v-flash"
            ]
        );
    }

    #[test]
    fn detects_zhipu_profiles_and_keeps_glm_fallback_models() {
        let text_profile = ModelProfileDraft {
            id: String::new(),
            capability: ModelCapability::Text,
            name: "智谱文本".to_string(),
            provider: "zhipu".to_string(),
            base_url: "https://open.bigmodel.cn/api/paas/v4".to_string(),
            api_key: String::new(),
            has_api_key: false,
            model: String::new(),
            chat_endpoint: "/chat/completions".to_string(),
            image_endpoint: String::new(),
            models_endpoint: "/models".to_string(),
            enabled: true,
            is_default: false,
        };

        assert!(is_zhipu_profile(&text_profile));

        let recommended = get_zhipu_recommended_models(ModelCapability::Text);

        assert!(recommended.contains(&"glm-4.5-flash".to_string()));
        assert!(recommended.contains(&"glm-4.6v-flash".to_string()));
        assert!(recommended.contains(&"glm-4.5v".to_string()));
    }

    #[test]
    fn supplements_zhipu_models_with_recommended_fallback_without_duplicates() {
        let merged = merge_model_ids(
            vec!["glm-4-plus".to_string(), "glm-4.6v-flash".to_string()],
            get_zhipu_recommended_models(ModelCapability::Text),
        );

        assert_eq!(
            merged,
            vec![
                "glm-4-air",
                "glm-4-flash",
                "glm-4-long",
                "glm-4-plus",
                "glm-4.5",
                "glm-4.5-air",
                "glm-4.5-airx",
                "glm-4.5-flash",
                "glm-4.5v",
                "glm-4.5v-flash",
                "glm-4.6",
                "glm-4.6v-flash",
                "glm-4.7-flash",
                "glm-4v-flash",
                "glm-4v-plus",
            ]
        );
    }

    #[test]
    fn builds_text_model_health_probe_with_selected_model() {
        let profile = ModelProfileDraft {
            id: String::new(),
            capability: ModelCapability::Text,
            name: "Text".to_string(),
            provider: "custom".to_string(),
            base_url: "https://api.example.com/v1".to_string(),
            api_key: String::new(),
            has_api_key: false,
            model: String::new(),
            chat_endpoint: "/chat/completions".to_string(),
            image_endpoint: String::new(),
            models_endpoint: "/models".to_string(),
            enabled: true,
            is_default: false,
        };

        let probe = build_model_health_probe(&profile, "glm-4.5-flash").unwrap();

        assert_eq!(probe.url, "https://api.example.com/v1/chat/completions");
        assert_eq!(probe.payload["model"], "glm-4.5-flash");
        assert_eq!(probe.payload["max_tokens"], 1);
        assert_eq!(probe.payload["messages"][0]["content"], "ping");
    }

    #[test]
    fn rejects_image_generation_probe_for_model_health_check() {
        let profile = ModelProfileDraft {
            id: String::new(),
            capability: ModelCapability::Image,
            name: "Image".to_string(),
            provider: "custom".to_string(),
            base_url: "https://api.example.com".to_string(),
            api_key: String::new(),
            has_api_key: false,
            model: String::new(),
            chat_endpoint: String::new(),
            image_endpoint: "/v1/images/generations".to_string(),
            models_endpoint: "/v1/models".to_string(),
            enabled: true,
            is_default: false,
        };

        let error = build_model_health_probe(&profile, "cogview-4")
            .expect_err("image health check should not call image generation");

        assert!(error.to_string().contains("不触发真实生图"));
    }

    #[test]
    fn matches_model_health_ids_case_insensitively() {
        let models = vec!["GLM-4.6V-Flash".to_string(), "cogview-4".to_string()];

        assert!(model_id_matches(&models, "glm-4.6v-flash"));
        assert!(!model_id_matches(&models, "glm-4.5-flash"));
    }

    #[test]
    fn summarizes_model_health_results() {
        let response = build_model_health_response(vec![
            ModelHealthCheckResult {
                model: "glm-ok".to_string(),
                ok: true,
                latency_ms: Some(960),
                status_code: Some(200),
                message: "检查通过".to_string(),
            },
            ModelHealthCheckResult {
                model: "glm-bad".to_string(),
                ok: false,
                latency_ms: None,
                status_code: Some(404),
                message: "HTTP 404".to_string(),
            },
        ]);

        assert_eq!(response.message, "健康检查完成：1 个通过，1 个异常");
    }

    #[test]
    fn prefers_nested_model_lists_over_response_metadata_ids() {
        let payload = serde_json::json!({
            "id": "provider-request-id",
            "model": "metadata-model",
            "data": [
                { "id": "qwen-plus" },
                { "id": "deepseek-chat" },
                { "id": "glm-4.5" }
            ]
        });

        let models = parse_model_ids(&payload, ModelCapability::Text);

        assert_eq!(models, vec!["deepseek-chat", "glm-4.5", "qwen-plus"]);
    }

    #[test]
    fn uses_capability_specific_endpoint_for_connectivity_checks() {
        let text_profile = ModelProfileDraft {
            id: String::new(),
            capability: ModelCapability::Text,
            name: "Text".to_string(),
            provider: "custom".to_string(),
            base_url: "https://api.example.com/".to_string(),
            api_key: String::new(),
            has_api_key: false,
            model: String::new(),
            chat_endpoint: "/v1/chat/completions".to_string(),
            image_endpoint: "/v1/images/generations".to_string(),
            models_endpoint: "/v1/models".to_string(),
            enabled: true,
            is_default: false,
        };
        let image_profile = ModelProfileDraft {
            capability: ModelCapability::Image,
            ..text_profile.clone()
        };

        assert_eq!(
            model_check_url(&text_profile).unwrap(),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            model_check_url(&image_profile).unwrap(),
            "https://api.example.com/v1/images/generations"
        );
    }
}
