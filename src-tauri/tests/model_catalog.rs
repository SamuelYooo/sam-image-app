use sam_image_app_v3_lib::commands::{ModelProfile, list_model_catalog};
use std::sync::Arc;
use tokio::sync::Mutex;

#[tokio::test]
async fn model_catalog_fetches_openai_compatible_models_endpoint() {
    let captured_path = Arc::new(Mutex::new(String::new()));
    let path_state = Arc::clone(&captured_path);
    let app = axum::Router::new().route(
        "/v1/models",
        axum::routing::get(move |headers: axum::http::HeaderMap| {
            let path_state = Arc::clone(&path_state);
            async move {
                *path_state.lock().await = headers
                    .get(axum::http::header::AUTHORIZATION)
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or_default()
                    .to_string();
                axum::Json(serde_json::json!({
                    "object": "list",
                    "data": [
                        { "id": "gpt-4o-mini", "object": "model" },
                        { "id": "gpt-image-2", "object": "model" }
                    ]
                }))
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!(
        "http://{}/v1/chat/completions",
        listener.local_addr().expect("addr")
    );
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("mock model server");
    });

    let models = list_model_catalog(ModelProfile {
        id: "remote-text".into(),
        name: "Remote Text".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: None,
        api_protocol: None,
        api_key: "sk-text".into(),
        api_secret: None,
        model: String::new(),
        kind: "text".into(),
        is_primary: false,
        status: "untested".into(),
        last_checked_at: None,
    })
    .await
    .expect("model catalog should be fetched");

    assert_eq!(*captured_path.lock().await, "Bearer sk-text");
    assert!(
        models
            .iter()
            .any(|model| model.id == "gpt-4o-mini" && model.kind == "text")
    );
    assert!(
        models
            .iter()
            .any(|model| model.id == "gpt-image-2" && model.kind == "image")
    );
}

#[tokio::test]
async fn model_catalog_accepts_base_url_with_path_prefix() {
    let captured_auth = Arc::new(Mutex::new(String::new()));
    let auth_state = Arc::clone(&captured_auth);
    let app = axum::Router::new().route(
        "/relay/v1/models",
        axum::routing::get(move |headers: axum::http::HeaderMap| {
            let auth_state = Arc::clone(&auth_state);
            async move {
                *auth_state.lock().await = headers
                    .get(axum::http::header::AUTHORIZATION)
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or_default()
                    .to_string();
                axum::Json(serde_json::json!({
                    "object": "list",
                    "data": [
                        { "id": "gpt-image-2", "object": "model" }
                    ]
                }))
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!("http://{}/relay", listener.local_addr().expect("addr"));
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("mock model server");
    });

    let models = list_model_catalog(ModelProfile {
        id: "remote-image".into(),
        name: "Remote Image".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: None,
        api_protocol: None,
        api_key: "sk-text".into(),
        api_secret: None,
        model: String::new(),
        kind: "image".into(),
        is_primary: false,
        status: "untested".into(),
        last_checked_at: None,
    })
    .await
    .expect("base URL should be expanded to the models endpoint");

    assert_eq!(*captured_auth.lock().await, "Bearer sk-text");
    assert_eq!(models[0].id, "gpt-image-2");
}
