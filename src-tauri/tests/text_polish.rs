use sam_image_app_v3_lib::text::{TextPolishInput, TextPolishModel, polish_prompt_with_model};
use std::sync::Arc;
use tokio::sync::Mutex;

#[tokio::test]
async fn openai_compatible_text_polish_uses_chat_completion_response() {
    let captured_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let captured_auth = Arc::new(Mutex::new(String::new()));
    let payload_state = Arc::clone(&captured_payload);
    let auth_state = Arc::clone(&captured_auth);
    let app = axum::Router::new().route(
        "/v1/chat/completions",
        axum::routing::post(
            move |headers: axum::http::HeaderMap,
                  axum::Json(payload): axum::Json<serde_json::Value>| {
                let payload_state = Arc::clone(&payload_state);
                let auth_state = Arc::clone(&auth_state);
                async move {
                    *payload_state.lock().await = payload;
                    *auth_state.lock().await = headers
                        .get(axum::http::header::AUTHORIZATION)
                        .and_then(|value| value.to_str().ok())
                        .unwrap_or_default()
                        .to_string();
                    axum::Json(serde_json::json!({
                        "choices": [
                            { "message": { "content": "精修后的封面图提示词，主体明确，层次清晰。" } }
                        ]
                    }))
                }
            },
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!(
        "http://{}/v1/chat/completions",
        listener.local_addr().expect("addr")
    );
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("mock text server");
    });

    let result = polish_prompt_with_model(
        TextPolishInput {
            prompt: "小红书 AI 工具合集封面".into(),
            mode_label: "封面图".into(),
            style: "赛博".into(),
        },
        Some(TextPolishModel {
            id: "remote-text".into(),
            name: "Remote Text".into(),
            provider: "openai-compatible".into(),
            endpoint,
            api_key: "sk-text".into(),
            model: "gpt-4o-mini".into(),
        }),
    )
    .await
    .expect("remote text polish should use chat response");

    assert_eq!(result.prompt, "精修后的封面图提示词，主体明确，层次清晰。");
    assert_eq!(result.model_name, "Remote Text");
    assert_eq!(*captured_auth.lock().await, "Bearer sk-text");
    let payload = captured_payload.lock().await;
    assert_eq!(payload["model"], "gpt-4o-mini");
    assert_eq!(payload["temperature"], 0.4);
    assert!(
        payload["messages"][1]["content"]
            .as_str()
            .unwrap()
            .contains("小红书 AI 工具合集封面")
    );
}

#[tokio::test]
async fn local_text_polish_is_available_without_api_configuration() {
    let result = polish_prompt_with_model(
        TextPolishInput {
            prompt: "产品海报".into(),
            mode_label: "文生图".into(),
            style: "自然".into(),
        },
        None,
    )
    .await
    .expect("local text polish should work");

    assert!(result.prompt.contains("产品海报"));
    assert!(result.prompt.contains("适合文生图输出"));
    assert_eq!(result.model_name, "本地文本润色");
}

#[tokio::test]
async fn openai_compatible_text_polish_requires_configured_endpoint() {
    let error = polish_prompt_with_model(
        TextPolishInput {
            prompt: "产品海报".into(),
            mode_label: "文生图".into(),
            style: "自然".into(),
        },
        Some(TextPolishModel {
            id: "remote-text".into(),
            name: "Remote Text".into(),
            provider: "openai-compatible".into(),
            endpoint: "".into(),
            api_key: "sk-text".into(),
            model: "gpt-4o-mini".into(),
        }),
    )
    .await
    .expect_err("missing endpoint should not silently fall back to local polish");

    assert_eq!(error.to_string(), "请填写文本模型 API 地址");
}
