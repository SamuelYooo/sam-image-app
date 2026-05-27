use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::{
    api::{assets::Asset, prompt_assets::PromptAsset},
    app_state::AppState,
    db::{asset_repo, prompt_asset_repo},
    domain::clock,
    error::{AppError, AppResult},
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportReport {
    pub assets_imported: i64,
    pub prompts_imported: i64,
    pub skipped: i64,
    pub message: String,
}

fn now_stamp() -> AppResult<String> {
    clock::beijing_timestamp_now()
}

fn get_string<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|item| !item.is_empty())
}

fn get_i64(value: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_i64))
}

fn get_bool(value: &Value, keys: &[&str]) -> bool {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_bool))
        .unwrap_or(false)
}

fn get_string_array(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_array))
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn legacy_id(prefix: &str, value: &Value, index: usize) -> String {
    let raw = get_string(value, &["id", "uuid", "sourceId", "source_id"])
        .map(ToString::to_string)
        .unwrap_or_else(|| index.to_string());
    let normalized = raw
        .chars()
        .map(|item| {
            if item.is_ascii_alphanumeric() || item == '-' || item == '_' {
                item
            } else {
                '-'
            }
        })
        .collect::<String>();
    format!("legacy-{prefix}-{normalized}")
}

fn legacy_arrays<'a>(payload: &'a Value, keys: &[&str]) -> Vec<&'a Value> {
    keys.iter()
        .filter_map(|key| payload.get(*key).and_then(Value::as_array))
        .flat_map(|items| items.iter())
        .collect()
}

fn classify_asset_kind(record: &Value) -> String {
    let marker = [
        get_string(record, &["kind"]),
        get_string(record, &["type"]),
        get_string(record, &["source"]),
        get_string(record, &["mode"]),
        get_string(record, &["workflowId", "workflow_id"]),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ")
    .to_ascii_lowercase();

    if marker.contains("icon") {
        "icon".to_string()
    } else if marker.contains("storyboard") || marker.contains("shot") {
        "storyboard_frame".to_string()
    } else {
        "image".to_string()
    }
}

fn record_looks_like_asset(record: &Value) -> bool {
    get_string(
        record,
        &[
            "uri",
            "imageUrl",
            "image_url",
            "generatedImageUrl",
            "generated_image_url",
            "url",
            "path",
        ],
    )
    .is_some()
        || get_string(
            record,
            &["kind", "type", "mode", "workflowId", "workflow_id"],
        )
        .is_some()
}

fn record_looks_like_prompt(record: &Value) -> bool {
    get_string(record, &["content", "prompt", "promptText", "text"]).is_some()
}

fn parse_legacy_asset(record: &Value, index: usize, imported_at: &str) -> Option<Asset> {
    let uri = get_string(
        record,
        &[
            "uri",
            "imageUrl",
            "image_url",
            "generatedImageUrl",
            "generated_image_url",
            "url",
            "path",
        ],
    )?;
    let prompt = get_string(
        record,
        &[
            "promptText",
            "prompt",
            "fullPrompt",
            "full_prompt",
            "masterPrompt",
        ],
    )
    .map(ToString::to_string);
    let workflow = get_string(record, &["workflowId", "workflow_id", "mode"])
        .map(ToString::to_string)
        .or_else(|| Some(classify_asset_kind(record)));

    Some(Asset {
        id: legacy_id("asset", record, index),
        kind: classify_asset_kind(record),
        uri: uri.to_string(),
        thumbnail_uri: get_string(record, &["thumbnailUri", "thumbnail_uri", "thumb"])
            .map(ToString::to_string),
        prompt_text: prompt,
        negative_prompt: get_string(record, &["negativePrompt", "negative_prompt"])
            .map(ToString::to_string),
        model_profile_id: get_string(
            record,
            &[
                "modelProfileId",
                "model_profile_id",
                "profileId",
                "profile_id",
                "model",
            ],
        )
        .map(ToString::to_string),
        width: get_i64(record, &["width"]),
        height: get_i64(record, &["height"]),
        seed: get_i64(record, &["seed"]),
        source_task_id: get_string(
            record,
            &["sourceTaskId", "source_task_id", "taskId", "task_id"],
        )
        .map(ToString::to_string),
        project_id: get_string(record, &["projectId", "project_id"]).map(ToString::to_string),
        workflow_id: workflow,
        tags: {
            let mut tags = get_string_array(record, &["tags"]);
            tags.push("legacy-import".to_string());
            tags
        },
        favorite: get_bool(record, &["favorite", "isFavorite"]),
        metadata: serde_json::json!({
            "legacyImport": true,
            "legacyType": get_string(record, &["type"]),
            "legacySource": get_string(record, &["source"]),
        }),
        created_at: get_string(record, &["createdAt", "created_at"])
            .unwrap_or(imported_at)
            .to_string(),
        preview_uri: None,
    })
}

fn parse_legacy_prompt(record: &Value, index: usize, imported_at: &str) -> Option<PromptAsset> {
    let content = get_string(record, &["content", "prompt", "promptText", "text"])?;
    let title = get_string(record, &["title", "name"])
        .map(ToString::to_string)
        .unwrap_or_else(|| content.chars().take(24).collect());
    let category = get_string(record, &["category", "mode"])
        .map(ToString::to_string)
        .unwrap_or_else(|| "legacy".to_string());

    Some(PromptAsset {
        id: legacy_id("prompt", record, index),
        title,
        content: content.to_string(),
        source: "legacy_1x".to_string(),
        source_id: get_string(record, &["id", "sourceId", "source_id"]).map(ToString::to_string),
        source_url: get_string(record, &["sourceUrl", "source_url", "url"])
            .map(ToString::to_string),
        license: None,
        author: get_string(record, &["author"]).map(ToString::to_string),
        categories: vec![category],
        tags: get_string_array(record, &["tags"]),
        use_cases: get_string_array(record, &["useCases", "use_cases"])
            .into_iter()
            .chain(std::iter::once("workflow".to_string()))
            .collect(),
        preview_images: get_string_array(record, &["previewImages", "preview_images"]),
        reference_images: get_string_array(record, &["referenceImages", "reference_images"]),
        language: "mixed".to_string(),
        favorite: get_bool(record, &["favorite", "isFavorite"]),
        usage_count: get_i64(record, &["usageCount", "usage_count"]).unwrap_or(0),
        imported_at: imported_at.to_string(),
        updated_at: get_string(record, &["updatedAt", "updated_at"])
            .unwrap_or(imported_at)
            .to_string(),
    })
}

fn collect_legacy_assets(payload: &Value, imported_at: &str) -> Vec<Asset> {
    let records = if let Some(items) = payload.as_array() {
        items.iter().collect::<Vec<_>>()
    } else {
        legacy_arrays(
            payload,
            &[
                "assets",
                "artifacts",
                "galleryArtifacts",
                "historyArtifacts",
                "images",
            ],
        )
    };

    records
        .iter()
        .enumerate()
        .filter_map(|(index, record)| {
            if record_looks_like_asset(record) {
                parse_legacy_asset(record, index, imported_at)
            } else {
                None
            }
        })
        .collect()
}

fn collect_legacy_prompts(payload: &Value, imported_at: &str) -> Vec<PromptAsset> {
    let records = if let Some(items) = payload.as_array() {
        items.iter().collect::<Vec<_>>()
    } else {
        legacy_arrays(
            payload,
            &[
                "prompts",
                "promptTemplates",
                "prompt_templates",
                "templates",
            ],
        )
    };

    records
        .iter()
        .enumerate()
        .filter_map(|(index, record)| {
            if record_looks_like_prompt(record) {
                parse_legacy_prompt(record, index, imported_at)
            } else {
                None
            }
        })
        .collect()
}

#[tauri::command]
pub async fn import_legacy_json(
    state: State<'_, AppState>,
    payload: Value,
) -> AppResult<LegacyImportReport> {
    let imported_at = now_stamp()?;
    let assets = collect_legacy_assets(&payload, &imported_at);
    let prompts = collect_legacy_prompts(&payload, &imported_at);
    if assets.is_empty() && prompts.is_empty() {
        return Err(AppError::InvalidData(
            "没有识别到可导入的旧版资产或提示词".to_string(),
        ));
    }

    for asset in &assets {
        asset_repo::upsert_asset(&state.db, asset).await?;
    }
    if !prompts.is_empty() {
        prompt_asset_repo::import_prompt_assets(&state.db, &prompts).await?;
    }

    Ok(LegacyImportReport {
        assets_imported: assets.len() as i64,
        prompts_imported: prompts.len() as i64,
        skipped: 0,
        message: format!("已导入 {} 条资产、{} 条提示词", assets.len(), prompts.len()),
    })
}

#[cfg(test)]
mod tests {
    use crate::db::init_sqlite;

    use super::*;

    #[test]
    fn parses_legacy_artifacts_and_prompt_templates() {
        let payload = serde_json::json!({
            "artifacts": [{
                "id": "old-image-1",
                "type": "type_icon",
                "prompt": "blue weather app icon",
                "imageUrl": "data:image/png;base64,aGVsbG8=",
                "profile_id": "default",
                "favorite": true,
                "tags": ["icon"]
            }],
            "promptTemplates": [{
                "id": "template-1",
                "title": "产品摄影",
                "prompt": "cinematic product photography",
                "category": "产品",
                "usage_count": 3
            }]
        });

        let assets = collect_legacy_assets(&payload, "unix:1");
        let prompts = collect_legacy_prompts(&payload, "unix:1");

        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].kind, "icon");
        assert_eq!(assets[0].id, "legacy-asset-old-image-1");
        assert_eq!(prompts.len(), 1);
        assert_eq!(prompts[0].source, "legacy_1x");
        assert_eq!(prompts[0].usage_count, 3);
    }

    #[test]
    fn parses_array_payloads_as_assets_or_prompts() {
        let payload = serde_json::json!([
            {
                "id": "old-gallery-1",
                "prompt": "misty city",
                "imageUrl": "https://example.com/a.png"
            },
            {
                "id": "old-template-1",
                "title": "街景",
                "prompt": "cinematic street scene"
            }
        ]);

        let assets = collect_legacy_assets(&payload, "unix:1");
        let prompts = collect_legacy_prompts(&payload, "unix:1");

        assert_eq!(assets.len(), 1);
        assert_eq!(prompts.len(), 2);
        assert_eq!(prompts[0].title, "misty city");
        assert_eq!(prompts[1].title, "街景");
    }

    #[tokio::test]
    async fn imports_legacy_json_into_sqlite() {
        let dir = std::env::temp_dir().join("samimage-v2-legacy-import-test");
        let _ = std::fs::remove_dir_all(&dir);
        let pool = init_sqlite(&dir).await.expect("database should initialize");
        let payload = serde_json::json!({
            "assets": [{
                "id": "old-asset",
                "promptText": "foggy cafe",
                "uri": "https://example.com/a.png",
                "mode": "txt2img"
            }]
        });
        let imported_at = "unix:1";
        let assets = collect_legacy_assets(&payload, imported_at);

        for asset in &assets {
            asset_repo::upsert_asset(&pool, asset)
                .await
                .expect("asset should upsert");
        }
        let listed = asset_repo::list_assets(&pool)
            .await
            .expect("assets should list");

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].prompt_text.as_deref(), Some("foggy cafe"));
        assert_eq!(listed[0].tags, vec!["legacy-import"]);

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
