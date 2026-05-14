use crate::{api, db};
use anyhow::{Context, Result};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

pub const API_ADDR: &str = "127.0.0.1:39871";

pub async fn start(app_handle: tauri::AppHandle) -> Result<()> {
    let conn = db::open_database(&app_handle).context("open SamImage database before API start")?;
    let app = api::router(conn).layer(CorsLayer::permissive());
    let listener = TcpListener::bind(API_ADDR)
        .await
        .with_context(|| format!("bind SamImage API server at {API_ADDR}"))?;
    axum::serve(listener, app)
        .await
        .context("serve SamImage API")
}
