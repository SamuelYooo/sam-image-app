use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    api::assets::Asset,
    app_state::AppState,
    db::storyboard_repo,
    domain::services::{export_service, storyboard_service},
    error::AppResult,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardDraftInput {
    pub concept: String,
    pub project_name: String,
    pub style_hint: String,
    pub shot_count: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardProject {
    pub id: String,
    pub project_type: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub settings: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardCharacter {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub role: String,
    pub appearance: String,
    pub personality: Option<String>,
    pub reference_asset_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardScene {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub summary: String,
    pub location: String,
    pub time_of_day: Option<String>,
    pub mood: Option<String>,
    pub order_index: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardShot {
    pub id: String,
    pub project_id: String,
    pub scene_id: Option<String>,
    pub order_index: i64,
    pub title: String,
    pub description: String,
    pub prompt_text: String,
    pub framing: String,
    pub angle: String,
    pub movement: String,
    pub duration_sec: Option<i64>,
    pub transition: Option<String>,
    pub asset_id: Option<String>,
    pub status: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardDraft {
    pub project: StoryboardProject,
    pub characters: Vec<StoryboardCharacter>,
    pub scenes: Vec<StoryboardScene>,
    pub shots: Vec<StoryboardShot>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStoryboardShotInput {
    pub id: String,
    pub title: String,
    pub description: String,
    pub prompt_text: String,
    pub framing: String,
    pub angle: String,
    pub movement: String,
    pub duration_sec: Option<i64>,
    pub transition: Option<String>,
    pub status: String,
}

#[tauri::command]
pub async fn create_storyboard_draft(
    state: State<'_, AppState>,
    input: StoryboardDraftInput,
) -> AppResult<StoryboardDraft> {
    storyboard_service::create_default_storyboard_draft(&state.db, input).await
}

#[tauri::command]
pub async fn list_storyboard_projects(
    state: State<'_, AppState>,
) -> AppResult<Vec<StoryboardProject>> {
    storyboard_repo::list_storyboard_projects(&state.db).await
}

#[tauri::command]
pub async fn load_storyboard_draft(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Option<StoryboardDraft>> {
    storyboard_repo::load_storyboard_draft(&state.db, &project_id).await
}

#[tauri::command]
pub async fn update_storyboard_shot(
    state: State<'_, AppState>,
    input: UpdateStoryboardShotInput,
) -> AppResult<StoryboardDraft> {
    storyboard_repo::update_storyboard_shot(&state.db, &input).await
}

#[tauri::command]
pub async fn reorder_storyboard_shots(
    state: State<'_, AppState>,
    project_id: String,
    shot_ids: Vec<String>,
) -> AppResult<StoryboardDraft> {
    storyboard_repo::reorder_storyboard_shots(&state.db, &project_id, &shot_ids).await
}

#[tauri::command]
pub async fn export_storyboard_pdf(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Asset> {
    export_service::export_storyboard_pdf(&state.db, &state.app_data_dir, &project_id).await
}
