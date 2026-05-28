use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;
use tokio::net::TcpListener;

use crate::error::AppError;

pub async fn spawn_health_server() -> Result<String, AppError> {
    let app = Router::new().route("/health", get(health));
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    tauri::async_runtime::spawn(async move {
        if let Err(error) = axum::serve(listener, app).await {
            eprintln!("SamImage health server stopped: {error}");
        }
    });
    Ok(format!("http://{address}"))
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "ok": true,
        "app": "SamImage 3.0",
    }))
}
