use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    app_state::AppState,
    db::prompt_asset_repo,
    error::{AppError, AppResult},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptAsset {
    pub id: String,
    pub title: String,
    pub content: String,
    pub source: String,
    pub source_id: Option<String>,
    pub source_url: Option<String>,
    pub license: Option<String>,
    pub author: Option<String>,
    pub categories: Vec<String>,
    pub tags: Vec<String>,
    pub use_cases: Vec<String>,
    pub preview_images: Vec<String>,
    pub reference_images: Vec<String>,
    pub language: String,
    pub favorite: bool,
    pub usage_count: i64,
    pub imported_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptSourcePayload {
    pub source: String,
    pub url: String,
    pub content: String,
}

fn prompt_source_url(source: &str) -> AppResult<&'static str> {
    match source {
        "glidea" => Ok("https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/prompts.json"),
        "evolink" => Ok("https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/data/ingested_tweets.json"),
        other => Err(AppError::InvalidData(format!("不支持的提示词同步来源: {other}"))),
    }
}

#[tauri::command]
pub async fn list_prompt_assets(state: State<'_, AppState>) -> AppResult<Vec<PromptAsset>> {
    prompt_asset_repo::list_prompt_assets(&state.db).await
}

#[tauri::command]
pub async fn import_prompt_assets(
    state: State<'_, AppState>,
    assets: Vec<PromptAsset>,
) -> AppResult<Vec<PromptAsset>> {
    prompt_asset_repo::import_prompt_assets(&state.db, &assets).await
}

#[tauri::command]
pub async fn increment_prompt_usage(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<PromptAsset>> {
    prompt_asset_repo::increment_prompt_usage(&state.db, &id).await
}

#[tauri::command]
pub async fn toggle_prompt_favorite(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<PromptAsset>> {
    prompt_asset_repo::toggle_prompt_favorite(&state.db, &id).await
}

#[tauri::command]
pub async fn sync_prompt_source(source: String) -> AppResult<PromptSourcePayload> {
    let url = prompt_source_url(&source)?;
    let content = reqwest::Client::new()
        .get(url)
        .header("User-Agent", "SamImage/2.0")
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;

    Ok(PromptSourcePayload {
        source,
        url: url.to_string(),
        content,
    })
}
