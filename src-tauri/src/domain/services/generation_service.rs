use std::path::Path;

use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;
use sqlx::SqlitePool;

use crate::{
    api::{assets::Asset, generation_tasks::GenerationTask, model_profiles::ModelProfileDraft},
    db::{asset_repo, generation_task_repo, model_profile_repo, storyboard_repo},
    domain::{clock, model_auth, services::asset_file_service},
    error::{AppError, AppResult},
};

const IMAGE_MODEL_TIMEOUT_SECS: u64 = 180;

#[derive(Clone, Debug, Eq, PartialEq)]
enum GeneratedImageSource {
    Uri(String),
    Bytes {
        bytes: Vec<u8>,
        suggested_extension: Option<String>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct GeneratedImage {
    source: GeneratedImageSource,
    width: Option<i64>,
    height: Option<i64>,
}

fn now_id(prefix: &str) -> AppResult<String> {
    Ok(format!("{prefix}-{}", clock::now_nanos()?))
}

fn now_stamp() -> AppResult<String> {
    clock::beijing_timestamp_now()
}

fn input_string(input: &Value, key: &str) -> String {
    input
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn input_i64(input: &Value, key: &str, fallback: i64) -> i64 {
    input.get(key).and_then(Value::as_i64).unwrap_or(fallback)
}

fn input_string_array(input: &Value, key: &str) -> Vec<String> {
    input
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .take(4)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn parse_size(size: &str) -> (Option<i64>, Option<i64>) {
    let Some((width, height)) = size.split_once('x') else {
        return (None, None);
    };

    (
        width.trim().parse::<i64>().ok(),
        height.trim().parse::<i64>().ok(),
    )
}

fn image_count_for_workflow(workflow_id: &str, image_count: i64) -> i64 {
    let clamped_count = image_count.clamp(1, 8);
    if workflow_id == "img2img" || workflow_id == "icon" {
        1
    } else {
        clamped_count
    }
}

fn asset_kind_for_workflow(workflow_id: &str) -> &'static str {
    match workflow_id {
        "icon" => "icon",
        "storyboard" => "storyboard_frame",
        _ => "image",
    }
}

fn endpoint_url(profile: &ModelProfileDraft) -> AppResult<String> {
    let base_url = profile.base_url.trim().trim_end_matches('/');
    let endpoint = profile.image_endpoint.trim().trim_start_matches('/');
    if base_url.is_empty() || endpoint.is_empty() {
        return Err(AppError::InvalidData(
            "请先配置图像模型的服务地址和图像接口路径".to_string(),
        ));
    }
    Ok(format!("{base_url}/{endpoint}"))
}

fn parse_generated_images(
    value: &Value,
    width: Option<i64>,
    height: Option<i64>,
) -> Vec<GeneratedImage> {
    let mut uris = Vec::new();
    collect_generated_image_uris(value, None, false, &mut uris);
    uris.into_iter()
        .map(|uri| GeneratedImage {
            source: GeneratedImageSource::Uri(uri),
            width,
            height,
        })
        .collect()
}

fn is_image_collection_key(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "data"
            | "image"
            | "images"
            | "image_url"
            | "image_urls"
            | "output"
            | "outputs"
            | "result"
            | "results"
            | "content"
            | "artifacts"
    )
}

fn is_base64_image_key(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "b64_json" | "base64" | "image_base64" | "image" | "result"
    )
}

fn is_explicit_base64_image_key(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "b64_json" | "base64" | "image_base64"
    )
}

fn is_direct_image_reference(value: &str) -> bool {
    let value = value.trim();
    value.starts_with("http://")
        || value.starts_with("https://")
        || value.starts_with("data:image/")
}

fn looks_like_base64_payload(value: &str) -> bool {
    let cleaned: String = value.chars().filter(|ch| !ch.is_whitespace()).collect();
    !cleaned.is_empty()
        && cleaned.len() % 4 == 0
        && cleaned
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '/' | '='))
}

fn image_uri_from_string(
    value: &str,
    key_hint: Option<&str>,
    allow_bare_base64: bool,
) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    if is_direct_image_reference(value) {
        return Some(value.to_string());
    }
    if key_hint.map(is_explicit_base64_image_key).unwrap_or(false) {
        return Some(format!("data:image/png;base64,{value}"));
    }
    let keyed_base64 = key_hint.map(is_base64_image_key).unwrap_or(false);
    if (keyed_base64 || allow_bare_base64) && looks_like_base64_payload(value) {
        return Some(format!("data:image/png;base64,{value}"));
    }
    None
}

fn push_unique_image_uri(uris: &mut Vec<String>, uri: String) {
    if !uris.iter().any(|item| item == &uri) {
        uris.push(uri);
    }
}

fn collect_generated_image_uris(
    value: &Value,
    key_hint: Option<&str>,
    allow_bare_base64: bool,
    uris: &mut Vec<String>,
) {
    match value {
        Value::String(item) => {
            if let Some(uri) = image_uri_from_string(item, key_hint, allow_bare_base64) {
                push_unique_image_uri(uris, uri);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_generated_image_uris(item, None, allow_bare_base64, uris);
            }
        }
        Value::Object(record) => {
            for (key, item) in record {
                collect_generated_image_uris(
                    item,
                    Some(key),
                    allow_bare_base64 || is_image_collection_key(key),
                    uris,
                );
            }
        }
        _ => {}
    }
}

fn image_extension_from_format(format: image::ImageFormat) -> Option<String> {
    match format {
        image::ImageFormat::Jpeg => Some("jpg".to_string()),
        image::ImageFormat::Png => Some("png".to_string()),
        image::ImageFormat::WebP => Some("webp".to_string()),
        image::ImageFormat::Gif => Some("gif".to_string()),
        _ => None,
    }
}

fn image_extension_from_content_type(content_type: Option<&str>) -> Option<String> {
    let mime = content_type?
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    match mime.as_str() {
        "image/jpeg" | "image/jpg" => Some("jpg".to_string()),
        "image/png" => Some("png".to_string()),
        "image/webp" => Some("webp".to_string()),
        "image/gif" => Some("gif".to_string()),
        _ => None,
    }
}

fn is_image_content_type(content_type: Option<&str>) -> bool {
    content_type
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .map(|value| value.to_ascii_lowercase().starts_with("image/"))
        .unwrap_or(false)
}

fn bytes_image_extension(bytes: &[u8]) -> Option<String> {
    image::guess_format(bytes)
        .ok()
        .and_then(image_extension_from_format)
}

fn image_from_bytes(
    bytes: &[u8],
    suggested_extension: Option<String>,
    width: Option<i64>,
    height: Option<i64>,
) -> GeneratedImage {
    GeneratedImage {
        source: GeneratedImageSource::Bytes {
            bytes: bytes.to_vec(),
            suggested_extension,
        },
        width,
        height,
    }
}

fn parse_image_model_response(
    content_type: Option<&str>,
    bytes: &[u8],
    width: Option<i64>,
    height: Option<i64>,
) -> AppResult<Vec<GeneratedImage>> {
    if is_image_content_type(content_type) {
        return Ok(vec![image_from_bytes(
            bytes,
            image_extension_from_content_type(content_type)
                .or_else(|| bytes_image_extension(bytes)),
            width,
            height,
        )]);
    }

    let payload: Value = match serde_json::from_slice(bytes) {
        Ok(payload) => payload,
        Err(error) => {
            if let Some(extension) = bytes_image_extension(bytes) {
                return Ok(vec![image_from_bytes(
                    bytes,
                    Some(extension),
                    width,
                    height,
                )]);
            }
            return Err(error.into());
        }
    };
    let images = parse_generated_images(&payload, width, height);
    if images.is_empty() {
        return Err(AppError::InvalidData(
            "图像模型响应中没有可识别的图片 URL、base64 数据或图片二进制".to_string(),
        ));
    }
    Ok(images)
}

fn collect_error_fragments(value: &Value, fragments: &mut Vec<String>) {
    match value {
        Value::String(text) => {
            let text = text.trim();
            if !text.is_empty() {
                fragments.push(text.to_string());
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_error_fragments(item, fragments);
            }
        }
        Value::Object(record) => {
            for key in ["message", "error", "error_description", "detail", "reason"] {
                if let Some(value) = record.get(key) {
                    collect_error_fragments(value, fragments);
                }
            }
        }
        _ => {}
    }
}

fn compact_text(value: &str, max_chars: usize) -> String {
    let mut compacted = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if compacted.chars().count() > max_chars {
        compacted = compacted.chars().take(max_chars).collect::<String>();
        compacted.push_str("...");
    }
    compacted
}

fn provider_error_message(bytes: &[u8]) -> String {
    let body = String::from_utf8_lossy(bytes);
    serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|payload| {
            let mut fragments = Vec::new();
            collect_error_fragments(&payload, &mut fragments);
            let message = fragments.join("\n").trim().to_string();
            (!message.is_empty()).then_some(message)
        })
        .unwrap_or_else(|| compact_text(&body, 240))
}

fn image_model_http_error(status_code: u16, bytes: &[u8]) -> AppError {
    let provider_message = provider_error_message(bytes);
    if provider_message.is_empty() {
        AppError::InvalidData(format!("图像模型请求失败，HTTP {status_code}"))
    } else {
        AppError::InvalidData(format!(
            "图像模型请求失败，HTTP {status_code}: {provider_message}"
        ))
    }
}

fn parse_image_model_http_response(
    status_code: u16,
    content_type: Option<&str>,
    bytes: &[u8],
    width: Option<i64>,
    height: Option<i64>,
) -> AppResult<Vec<GeneratedImage>> {
    if (200..300).contains(&status_code) {
        return parse_image_model_response(content_type, bytes, width, height);
    }

    match parse_image_model_response(content_type, bytes, width, height) {
        Ok(images) => Ok(images),
        Err(_) => Err(image_model_http_error(status_code, bytes)),
    }
}

fn build_image_request_body(
    profile: &ModelProfileDraft,
    task: &GenerationTask,
    reference_images: &[String],
) -> (Value, Option<i64>, Option<i64>) {
    let prompt = input_string(&task.input, "promptText");
    let negative_prompt = input_string(&task.input, "negativePrompt");
    let image_size = input_string(&task.input, "imageSize");
    let quality = input_string(&task.input, "quality");
    let workflow_id = input_string(&task.input, "workflowId");
    let image_count =
        image_count_for_workflow(&workflow_id, input_i64(&task.input, "imageCount", 1));
    let seed = input_string(&task.input, "seed");
    let model = input_string(&task.input, "model");
    let (width, height) = parse_size(&image_size);
    let mut body = serde_json::json!({
        "model": if model.is_empty() { profile.model.as_str() } else { model.as_str() },
        "prompt": prompt,
        "n": image_count,
        "size": image_size,
        "quality": quality,
    });

    if !negative_prompt.is_empty() {
        body["negative_prompt"] = serde_json::json!(negative_prompt);
    }
    if !seed.is_empty() {
        body["seed"] = serde_json::json!(seed);
    }
    if !reference_images.is_empty() {
        let references = serde_json::json!(reference_images);
        body["reference_images"] = references.clone();
        body["images"] = references.clone();
        body["image"] = references[0].clone();
        body["input_image"] = references[0].clone();
    }

    (body, width, height)
}

async fn resolve_reference_images_for_model(
    client: &reqwest::Client,
    app_data_dir: &Path,
    task: &GenerationTask,
) -> AppResult<Vec<String>> {
    let reference_images = input_string_array(&task.input, "referenceImages");
    let mut resolved = Vec::with_capacity(reference_images.len());
    for reference in reference_images {
        resolved.push(
            asset_file_service::read_asset_uri_data_url(client, app_data_dir, &reference).await?,
        );
    }
    Ok(resolved)
}

async fn call_image_model(
    profile: &ModelProfileDraft,
    app_data_dir: &Path,
    task: &GenerationTask,
) -> AppResult<Vec<GeneratedImage>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(IMAGE_MODEL_TIMEOUT_SECS))
        .build()?;
    let reference_images = resolve_reference_images_for_model(&client, app_data_dir, task).await?;
    let (body, width, height) = build_image_request_body(profile, task, &reference_images);

    let request = client
        .post(endpoint_url(profile)?)
        .header(CONTENT_TYPE, "application/json")
        .body(body.to_string());

    let request = match model_auth::first_api_key(&profile.api_key) {
        Some(api_key) => request.header(AUTHORIZATION, format!("Bearer {api_key}")),
        None => request,
    };

    let response = request.send().await?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string);
    let body = response.bytes().await?;
    parse_image_model_http_response(
        status.as_u16(),
        content_type.as_deref(),
        &body,
        width,
        height,
    )
}

async fn persist_assets(
    pool: &SqlitePool,
    task: &GenerationTask,
    images: &[GeneratedImage],
) -> AppResult<Vec<String>> {
    let prompt_text = Some(input_string(&task.input, "promptText"));
    let negative_prompt = Some(input_string(&task.input, "negativePrompt"));
    let model_profile_id = Some(input_string(&task.input, "model"));
    let workflow_id = Some(input_string(&task.input, "workflowId"));
    let shot_id = input_string(&task.input, "shotId");
    let compare_group_id = input_string(&task.input, "compareGroupId");
    let reference_images = input_string_array(&task.input, "referenceImages");
    let asset_kind = asset_kind_for_workflow(workflow_id.as_deref().unwrap_or_default());
    let seed = input_string(&task.input, "seed").parse::<i64>().ok();
    let mut asset_ids = Vec::with_capacity(images.len());

    for (index, image) in images.iter().enumerate() {
        let id = now_id("asset")?;
        let source_kind = match &image.source {
            GeneratedImageSource::Uri(uri) => asset_file_service::asset_source_kind(uri),
            GeneratedImageSource::Bytes { .. } => "binary",
        };
        let uri = match &image.source {
            GeneratedImageSource::Uri(uri) => uri.clone(),
            GeneratedImageSource::Bytes {
                bytes,
                suggested_extension,
            } => asset_file_service::bytes_to_data_url(bytes, suggested_extension.as_deref()),
        };
        let metadata = serde_json::json!({
            "taskType": task.task_type,
            "imageIndex": index,
            "sourceKind": source_kind,
            "shotId": shot_id,
            "compareGroupId": compare_group_id,
            "referenceImageCount": reference_images.len(),
        });
        let asset = Asset {
            id: id.clone(),
            kind: asset_kind.to_string(),
            uri,
            thumbnail_uri: None,
            prompt_text: prompt_text.clone(),
            negative_prompt: negative_prompt.clone(),
            model_profile_id: model_profile_id.clone(),
            width: image.width,
            height: image.height,
            seed,
            source_task_id: Some(task.id.clone()),
            project_id: task.project_id.clone(),
            workflow_id: workflow_id.clone(),
            tags: vec![
                "generated".to_string(),
                workflow_id.clone().unwrap_or_default(),
            ],
            favorite: false,
            metadata,
            created_at: now_stamp()?,
            preview_uri: None,
        };
        asset_repo::upsert_asset(pool, &asset).await?;
        asset_ids.push(id);
    }

    Ok(asset_ids)
}

pub async fn run_image_generation_task(
    pool: &SqlitePool,
    app_data_dir: &Path,
    task_id: &str,
) -> AppResult<Vec<GenerationTask>> {
    let task = generation_task_repo::get_generation_task(pool, task_id).await?;
    if task.task_type != "image_generation" {
        return Err(AppError::InvalidData(
            "只能执行 image_generation 任务".to_string(),
        ));
    }
    if task.status != "pending" {
        return Err(AppError::InvalidData(
            "只能执行排队中的 image_generation 任务".to_string(),
        ));
    }

    let Some(profile) = model_profile_repo::get_default_image_profile(pool).await? else {
        generation_task_repo::mark_task_failed(pool, task_id, "请先配置图像模型").await?;
        return generation_task_repo::list_generation_tasks(pool).await;
    };

    let shot_id = input_string(&task.input, "shotId");
    if !shot_id.is_empty() {
        storyboard_repo::mark_storyboard_shot_status(pool, &shot_id, "generating").await?;
    }

    generation_task_repo::mark_task_running(pool, task_id).await?;
    match call_image_model(&profile, app_data_dir, &task).await {
        Ok(images) => {
            let asset_ids = persist_assets(pool, &task, &images).await?;
            if !shot_id.is_empty() {
                if let Some(first_asset_id) = asset_ids.first() {
                    storyboard_repo::mark_storyboard_shot_done(pool, &shot_id, first_asset_id)
                        .await?;
                }
            }
            generation_task_repo::mark_task_succeeded(
                pool,
                task_id,
                serde_json::json!({ "assetIds": asset_ids }),
                images.len() as i64,
            )
            .await?;
        }
        Err(error) => {
            if !shot_id.is_empty() {
                storyboard_repo::mark_storyboard_shot_status(pool, &shot_id, "failed").await?;
            }
            generation_task_repo::mark_task_failed(pool, task_id, &error.to_string()).await?;
        }
    }

    generation_task_repo::list_generation_tasks(pool).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::model_profiles::ModelCapability;

    fn test_image_profile() -> ModelProfileDraft {
        ModelProfileDraft {
            id: "model-test".to_string(),
            capability: ModelCapability::Image,
            name: "Image".to_string(),
            provider: "custom".to_string(),
            base_url: "https://api.example.com".to_string(),
            api_key: String::new(),
            has_api_key: false,
            model: "fallback-image".to_string(),
            chat_endpoint: "/v1/chat/completions".to_string(),
            image_endpoint: "/v1/images/generations".to_string(),
            models_endpoint: "/v1/models".to_string(),
            enabled: true,
            is_default: true,
        }
    }

    fn test_generation_task(input: Value) -> GenerationTask {
        GenerationTask {
            id: "task-test".to_string(),
            group_id: None,
            project_id: None,
            task_type: "image_generation".to_string(),
            status: "pending".to_string(),
            priority: 0,
            input,
            output: serde_json::json!({}),
            error: None,
            progress_current: 0,
            progress_total: 1,
            retry_of: None,
            created_at: "2026-05-23T00:00:00.000Z".to_string(),
            started_at: None,
            finished_at: None,
        }
    }

    #[test]
    fn parses_openai_compatible_image_outputs() {
        let payload = serde_json::json!({
            "data": [
                { "url": "https://example.com/a.png" },
                { "b64_json": "abc123" }
            ]
        });

        let images = parse_generated_images(&payload, Some(1024), Some(1024));

        assert_eq!(images.len(), 2);
        assert_eq!(
            images[0].source,
            GeneratedImageSource::Uri("https://example.com/a.png".to_string())
        );
        assert_eq!(
            images[1].source,
            GeneratedImageSource::Uri("data:image/png;base64,abc123".to_string())
        );
        assert_eq!(images[0].width, Some(1024));
    }

    #[test]
    fn parses_nested_provider_image_outputs() {
        let payload = serde_json::json!({
            "output": [
                {
                    "type": "image_generation_call",
                    "result": "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo="
                },
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": "https://example.com/nested.webp"
                            }
                        }
                    ]
                }
            ],
            "result": {
                "images": [
                    "https://example.com/string-in-array.png"
                ]
            }
        });

        let images = parse_generated_images(&payload, Some(768), Some(1024));

        assert_eq!(images.len(), 3);
        assert_eq!(
            images[0].source,
            GeneratedImageSource::Uri(
                "data:image/png;base64,YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=".to_string()
            )
        );
        assert_eq!(
            images[1].source,
            GeneratedImageSource::Uri("https://example.com/nested.webp".to_string())
        );
        assert_eq!(
            images[2].source,
            GeneratedImageSource::Uri("https://example.com/string-in-array.png".to_string())
        );
        assert_eq!(images[0].height, Some(1024));
    }

    #[test]
    fn maps_workflow_to_asset_kind() {
        assert_eq!(asset_kind_for_workflow("icon"), "icon");
        assert_eq!(asset_kind_for_workflow("storyboard"), "storyboard_frame");
        assert_eq!(asset_kind_for_workflow("batch"), "image");
        assert_eq!(asset_kind_for_workflow("daily"), "image");
    }

    #[test]
    fn builds_image_request_body_with_negative_seed_and_references() {
        let task = test_generation_task(serde_json::json!({
            "promptText": "product render",
            "negativePrompt": "watermark",
            "imageSize": "1024x1536",
            "quality": "high",
            "imageCount": 12,
            "seed": "42",
            "model": "image-a",
            "referenceImages": [
                "data:image/png;base64,ref1",
                "data:image/png;base64,ref2",
            ]
        }));

        let reference_images = input_string_array(&task.input, "referenceImages");
        let (body, width, height) =
            build_image_request_body(&test_image_profile(), &task, &reference_images);

        assert_eq!(body["model"], "image-a");
        assert_eq!(body["prompt"], "product render");
        assert_eq!(body["negative_prompt"], "watermark");
        assert_eq!(body["seed"], "42");
        assert_eq!(body["n"], 8);
        assert_eq!(body["reference_images"][0], "data:image/png;base64,ref1");
        assert_eq!(body["images"][1], "data:image/png;base64,ref2");
        assert_eq!(body["image"], "data:image/png;base64,ref1");
        assert_eq!(body["input_image"], "data:image/png;base64,ref1");
        assert_eq!(width, Some(1024));
        assert_eq!(height, Some(1536));
    }

    #[test]
    fn builds_img2img_request_with_single_output() {
        let task = test_generation_task(serde_json::json!({
            "workflowId": "img2img",
            "promptText": "use the reference image and change the lighting",
            "imageSize": "1024x1024",
            "quality": "high",
            "imageCount": 2,
            "referenceImages": [
                "data:image/png;base64,ref1",
            ]
        }));

        let reference_images = input_string_array(&task.input, "referenceImages");
        let (body, _, _) =
            build_image_request_body(&test_image_profile(), &task, &reference_images);

        assert_eq!(body["n"], 1);
    }

    #[tokio::test]
    async fn resolves_local_reference_assets_before_model_request() {
        let dir = std::env::temp_dir().join("samimage-v2-generation-reference-test");
        let _ = std::fs::remove_dir_all(&dir);
        let relative_uri = "assets/references/ref.png";
        let output_path = dir.join(relative_uri.replace('/', std::path::MAIN_SEPARATOR_STR));
        std::fs::create_dir_all(output_path.parent().expect("path should have parent"))
            .expect("reference parent should create");
        std::fs::write(&output_path, b"hello").expect("reference should write");

        let task = test_generation_task(serde_json::json!({
            "referenceImages": [relative_uri]
        }));
        let references = resolve_reference_images_for_model(&reqwest::Client::new(), &dir, &task)
            .await
            .expect("local reference should resolve");

        assert_eq!(references, vec!["data:image/png;base64,aGVsbG8="]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn persists_generated_images_as_direct_asset_urls() {
        let dir = std::env::temp_dir().join(format!(
            "samimage-v2-generation-persist-test-{}",
            now_id("case").expect("case id should be available")
        ));
        let pool = crate::db::init_sqlite(&dir)
            .await
            .expect("database should initialize");
        let mut cursor = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(1, 1)
            .write_to(&mut cursor, image::ImageFormat::Png)
            .expect("test PNG should encode");
        let png = cursor.into_inner();
        let task = test_generation_task(serde_json::json!({
            "workflowId": "daily",
            "promptText": "local safety render",
            "negativePrompt": "watermark",
            "imageSize": "512x512",
            "model": "image-a"
        }));
        let images = vec![
            GeneratedImage {
                source: GeneratedImageSource::Bytes {
                    bytes: png,
                    suggested_extension: Some("png".to_string()),
                },
                width: Some(512),
                height: Some(512),
            },
            GeneratedImage {
                source: GeneratedImageSource::Uri("https://example.com/generated.png".to_string()),
                width: Some(1024),
                height: Some(1024),
            },
        ];

        let asset_ids = persist_assets(&pool, &task, &images)
            .await
            .expect("generated image should persist");
        let assets = asset_repo::list_assets(&pool)
            .await
            .expect("assets should list");

        assert_eq!(asset_ids.len(), 2);
        assert_eq!(assets.len(), 2);
        assert!(assets
            .iter()
            .any(|asset| asset.uri.starts_with("data:image/png;base64,")));
        assert!(assets
            .iter()
            .any(|asset| asset.uri == "https://example.com/generated.png"));
        assert!(assets.iter().all(|asset| asset.thumbnail_uri.is_none()));

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_direct_image_binary_response_without_requiring_online_url() {
        let mut cursor = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(1, 1)
            .write_to(&mut cursor, image::ImageFormat::Png)
            .expect("test PNG should encode");
        let png = cursor.into_inner();

        let images = parse_image_model_response(Some("image/png"), &png, Some(512), Some(512))
            .expect("binary image response should parse");

        assert_eq!(images.len(), 1);
        assert_eq!(images[0].width, Some(512));
        assert_eq!(images[0].height, Some(512));
        assert_eq!(
            images[0].source,
            GeneratedImageSource::Bytes {
                bytes: png,
                suggested_extension: Some("png".to_string()),
            }
        );
    }

    #[test]
    fn parses_non_success_image_response_when_body_contains_generated_asset() {
        let body = serde_json::json!({
            "error": { "message": "upstream timeout after generation" },
            "output": [
                {
                    "type": "image_generation_call",
                    "result": "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo="
                }
            ]
        })
        .to_string();

        let images = parse_image_model_http_response(
            504,
            Some("application/json"),
            body.as_bytes(),
            Some(1024),
            Some(1024),
        )
        .expect("non-success body should still parse if it contains a generated image");

        assert_eq!(images.len(), 1);
        assert_eq!(
            images[0].source,
            GeneratedImageSource::Uri(
                "data:image/png;base64,YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=".to_string()
            )
        );
    }

    #[test]
    fn reports_provider_error_body_when_non_success_image_response_has_no_asset() {
        let error = parse_image_model_http_response(
            504,
            Some("application/json"),
            br#"{"error":{"message":"Gateway timeout after 60s"}}"#,
            Some(1024),
            Some(1024),
        )
        .expect_err("non-success body without generated image should report provider error");

        let message = error.to_string();
        assert!(message.contains("HTTP 504"));
        assert!(message.contains("Gateway timeout after 60s"));
    }
}
