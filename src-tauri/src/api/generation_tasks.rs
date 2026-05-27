use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    app_state::AppState, db::generation_task_repo, domain::services::generation_service,
    error::AppResult,
};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateImageGenerationTaskInput {
    pub workflow_id: String,
    pub prompt_text: String,
    #[serde(default)]
    pub reference_images: Vec<String>,
    pub negative_prompt: String,
    pub image_size: String,
    pub quality: String,
    pub image_count: i64,
    pub seed: String,
    pub model: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBatchImageGenerationTasksInput {
    pub workflow_id: String,
    pub project_id: Option<String>,
    pub prompts: Vec<String>,
    #[serde(default)]
    pub shot_ids: Vec<String>,
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default)]
    pub reference_images: Vec<String>,
    pub negative_prompt: String,
    pub image_size: String,
    pub quality: String,
    pub image_count: i64,
    pub seed: String,
    pub model: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationTask {
    pub id: String,
    pub group_id: Option<String>,
    pub project_id: Option<String>,
    pub task_type: String,
    pub status: String,
    pub priority: i64,
    pub input: serde_json::Value,
    pub output: serde_json::Value,
    pub error: Option<String>,
    pub progress_current: i64,
    pub progress_total: i64,
    pub retry_of: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[tauri::command]
pub async fn create_image_generation_task(
    state: State<'_, AppState>,
    input: CreateImageGenerationTaskInput,
) -> AppResult<Vec<GenerationTask>> {
    generation_task_repo::create_image_generation_task(&state.db, input).await
}

#[tauri::command]
pub async fn create_batch_image_generation_tasks(
    state: State<'_, AppState>,
    input: CreateBatchImageGenerationTasksInput,
) -> AppResult<Vec<GenerationTask>> {
    generation_task_repo::create_batch_image_generation_tasks(&state.db, input).await
}

#[tauri::command]
pub async fn list_generation_tasks(state: State<'_, AppState>) -> AppResult<Vec<GenerationTask>> {
    generation_task_repo::list_generation_tasks(&state.db).await
}

#[tauri::command]
pub async fn run_image_generation_task(
    state: State<'_, AppState>,
    task_id: String,
) -> AppResult<Vec<GenerationTask>> {
    generation_service::run_image_generation_task(&state.db, &state.app_data_dir, &task_id).await
}

#[tauri::command]
pub async fn cancel_generation_task(
    state: State<'_, AppState>,
    task_id: String,
) -> AppResult<Vec<GenerationTask>> {
    generation_task_repo::cancel_generation_task(&state.db, &task_id).await
}

#[tauri::command]
pub async fn retry_generation_task(
    state: State<'_, AppState>,
    task_id: String,
) -> AppResult<Vec<GenerationTask>> {
    generation_task_repo::retry_generation_task(&state.db, &task_id).await
}

#[tauri::command]
pub async fn clear_finished_generation_tasks(
    state: State<'_, AppState>,
) -> AppResult<Vec<GenerationTask>> {
    generation_task_repo::clear_finished_generation_tasks(&state.db).await
}
