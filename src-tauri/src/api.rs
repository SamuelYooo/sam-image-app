use crate::adapters;
use crate::db;
use crate::models::{
    AdapterInfo, Artifact, GenerationRequest, ModelListRequest, ModelListResult, ModelProfile,
    ModelValidationRequest, ModelValidationResult,
};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Json, Router};
use chrono::Utc;
use rusqlite::Connection;
use serde::Serialize;
use serde_json::json;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone)]
pub struct ApiState {
    pub db: Arc<Mutex<Connection>>,
}

pub fn router(conn: Connection) -> Router {
    let state = Arc::new(ApiState {
        db: Arc::new(Mutex::new(conn)),
    });

    Router::new()
        .route("/api/health", axum::routing::get(health))
        .route("/api/adapters", axum::routing::get(list_adapters))
        .route(
            "/api/profiles",
            axum::routing::get(list_profiles).post(save_profile),
        )
        .route("/api/profiles/:id", axum::routing::delete(delete_profile))
        .route("/api/models/validate", axum::routing::post(validate_model))
        .route("/api/models/list", axum::routing::post(list_models))
        .route(
            "/api/generations",
            axum::routing::get(list_artifacts).post(create_generation),
        )
        .route("/api/generations/:id", axum::routing::delete(delete_artifact))
        .with_state(state)
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: "BAD_REQUEST",
            message: message.into(),
        }
    }

    fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: "NOT_FOUND",
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "INTERNAL_ERROR",
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(json!({
            "error": {
                "code": self.code,
                "message": self.message
            }
        }));
        (self.status, body).into_response()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    service: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "samimage-api",
    })
}

async fn list_adapters() -> Json<Vec<AdapterInfo>> {
    Json(adapters::all_infos())
}

async fn list_profiles(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<Vec<ModelProfile>>, ApiError> {
    let conn = lock_db(&state)?;
    db::list_profiles(&conn)
        .map(Json)
        .map_err(|err| ApiError::internal(format!("读取配置失败: {err}")))
}

async fn save_profile(
    State(state): State<Arc<ApiState>>,
    Json(mut profile): Json<ModelProfile>,
) -> Result<Json<ModelProfile>, ApiError> {
    if profile.id.trim().is_empty() {
        profile.id = Uuid::new_v4().to_string();
    }
    adapters::validate_profile_shape(&profile)
        .map_err(|err| ApiError::bad_request(format!("配置校验失败: {err}")))?;

    let conn = lock_db(&state)?;
    db::upsert_profile(&conn, &profile)
        .map(Json)
        .map_err(|err| ApiError::internal(format!("保存配置失败: {err}")))
}

async fn delete_profile(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let conn = lock_db(&state)?;
    db::delete_profile(&conn, &id)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|err| ApiError::not_found(format!("删除配置失败: {err}")))
}

async fn validate_model(
    Json(request): Json<ModelValidationRequest>,
) -> Result<Json<ModelValidationResult>, ApiError> {
    adapters::validate_model(&request.profile, request.network_check)
        .await
        .map(Json)
        .map_err(|err| ApiError::bad_request(err.to_string()))
}

async fn list_models(
    Json(request): Json<ModelListRequest>,
) -> Result<Json<ModelListResult>, ApiError> {
    adapters::list_models(&request.profile)
        .await
        .map(Json)
        .map_err(|err| ApiError::bad_request(err.to_string()))
}

async fn create_generation(
    State(state): State<Arc<ApiState>>,
    Json(request): Json<GenerationRequest>,
) -> Result<Json<Artifact>, ApiError> {
    if request.prompt.trim().is_empty() {
        return Err(ApiError::bad_request("提示词不能为空"));
    }

    let profile = {
        let conn = lock_db(&state)?;
        db::get_profile(&conn, &request.profile_id)
            .map_err(|err| ApiError::not_found(format!("配置不存在: {err}")))?
    };

    let image_url = adapters::generate(&profile, &request)
        .await
        .map_err(|err| ApiError::bad_request(format!("生成失败: {err}")))?;

    let artifact = Artifact {
        id: Uuid::new_v4().to_string(),
        profile_id: request.profile_id,
        mode: request.mode,
        prompt: request.prompt,
        image_url,
        created_at: Utc::now().to_rfc3339(),
    };

    let conn = lock_db(&state)?;
    db::insert_artifact(&conn, &artifact)
        .map(Json)
        .map_err(|err| ApiError::internal(format!("保存作品失败: {err}")))
}

async fn list_artifacts(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<Vec<Artifact>>, ApiError> {
    let conn = lock_db(&state)?;
    db::list_artifacts(&conn)
        .map(Json)
        .map_err(|err| ApiError::internal(format!("读取作品失败: {err}")))
}

async fn delete_artifact(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let conn = lock_db(&state)?;
    db::delete_artifact(&conn, &id)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|err| ApiError::internal(format!("删除作品失败: {err}")))
}

fn lock_db(state: &ApiState) -> Result<std::sync::MutexGuard<'_, Connection>, ApiError> {
    state
        .db
        .lock()
        .map_err(|_| ApiError::internal("数据库连接已被异常锁定"))
}
