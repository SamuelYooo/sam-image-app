use sam_image_app_v3_lib::commands::{ModelProfile, test_model_profile};
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
            task: None,
        },
        Some(TextPolishModel {
            id: "remote-text".into(),
            name: "Remote Text".into(),
            provider: "openai-compatible".into(),
            endpoint,
            api_path: None,
            api_protocol: None,
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
async fn openai_compatible_text_translate_outputs_english_prompt() {
    let captured_payload = std::sync::Arc::new(tokio::sync::Mutex::new(serde_json::Value::Null));
    let payload_state = std::sync::Arc::clone(&captured_payload);
    let app = axum::Router::new().route(
        "/v1/chat/completions",
        axum::routing::post(move |axum::Json(payload): axum::Json<serde_json::Value>| {
            let payload_state = std::sync::Arc::clone(&payload_state);
            async move {
                *payload_state.lock().await = payload;
                axum::Json(serde_json::json!({
                    "choices": [
                        { "message": { "content": "A premium product poster, clean composition, soft studio lighting." } }
                    ]
                }))
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!("http://{}", listener.local_addr().expect("addr"));
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("mock text server");
    });

    let result = polish_prompt_with_model(
        TextPolishInput {
            prompt: "高端产品海报，干净构图，柔和棚拍光".into(),
            mode_label: "文生图".into(),
            style: "自然".into(),
            task: Some("translate-to-english".into()),
        },
        Some(TextPolishModel {
            id: "remote-text".into(),
            name: "Remote Text".into(),
            provider: "openai-compatible".into(),
            endpoint,
            api_path: Some("v1/chat/completions".into()),
            api_protocol: Some("openai-chat".into()),
            api_key: "sk-test".into(),
            model: "gpt-4o-mini".into(),
        }),
    )
    .await
    .expect("text model should translate prompt");

    assert_eq!(
        result.prompt,
        "A premium product poster, clean composition, soft studio lighting."
    );
    let payload = captured_payload.lock().await;
    assert!(
        payload["messages"][0]["content"]
            .as_str()
            .unwrap()
            .contains("English AI image prompt translator")
    );
    assert!(
        payload["messages"][1]["content"]
            .as_str()
            .unwrap()
            .contains("Translate the Chinese prompt into English")
    );
}

#[tokio::test]
async fn text_model_connection_test_uses_the_same_chat_flow_as_polish() {
    let captured_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let payload_state = Arc::clone(&captured_payload);
    let app = axum::Router::new().route(
        "/v1/chat/completions",
        axum::routing::post(move |axum::Json(payload): axum::Json<serde_json::Value>| {
            let payload_state = Arc::clone(&payload_state);
            async move {
                *payload_state.lock().await = payload;
                axum::Json(serde_json::json!({
                    "choices": [
                        { "message": { "content": "连接检测成功提示词" } }
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
        axum::serve(listener, app).await.expect("mock text server");
    });

    let result = test_model_profile(ModelProfile {
        id: "remote-text".into(),
        name: "Remote Text".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: None,
        api_protocol: None,
        api_key: "sk-text".into(),
        api_secret: None,
        model: "gpt-4o-mini".into(),
        kind: "text".into(),
        is_primary: true,
        status: "untested".into(),
        last_checked_at: None,
    })
    .await
    .expect("text model test should return a result");

    assert!(result.ok);
    assert_eq!(result.message, "文本模型连接检测成功，可用于提示词润色");
    let payload = captured_payload.lock().await;
    assert_eq!(payload["model"], "gpt-4o-mini");
    assert_eq!(payload["temperature"], 0.4);
    assert!(
        payload["messages"][0]["content"]
            .as_str()
            .unwrap()
            .contains("SamImage")
    );
    assert!(
        payload["messages"][1]["content"]
            .as_str()
            .unwrap()
            .contains("连接检测")
    );
}

#[tokio::test]
async fn text_model_connection_test_normalizes_models_endpoint_to_chat_completions() {
    let captured_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let payload_state = Arc::clone(&captured_payload);
    let app = axum::Router::new()
        .route(
            "/v1/models",
            axum::routing::post(|| async {
                (
                    axum::http::StatusCode::NOT_FOUND,
                    axum::response::Html(
                        "<html><body><center><h1>404 Not Found</h1></center></body></html>",
                    ),
                )
            }),
        )
        .route(
            "/v1/chat/completions",
            axum::routing::post(move |axum::Json(payload): axum::Json<serde_json::Value>| {
                let payload_state = Arc::clone(&payload_state);
                async move {
                    *payload_state.lock().await = payload;
                    axum::Json(serde_json::json!({
                        "choices": [
                            { "message": { "content": "连接检测成功提示词" } }
                        ]
                    }))
                }
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!("http://{}/v1/models", listener.local_addr().expect("addr"));
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("mock text server");
    });

    let result = test_model_profile(ModelProfile {
        id: "remote-text".into(),
        name: "Remote Text".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: None,
        api_protocol: None,
        api_key: "sk-text".into(),
        api_secret: None,
        model: "gpt-4o-mini".into(),
        kind: "text".into(),
        is_primary: true,
        status: "untested".into(),
        last_checked_at: None,
    })
    .await
    .expect("text model test should return a result");

    assert!(result.ok, "{}", result.message);
    let payload = captured_payload.lock().await;
    assert_eq!(payload["model"], "gpt-4o-mini");
}

#[tokio::test]
async fn text_polish_accepts_base_url_with_path_prefix() {
    let captured_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let payload_state = Arc::clone(&captured_payload);
    let app = axum::Router::new().route(
        "/relay/v1/chat/completions",
        axum::routing::post(move |axum::Json(payload): axum::Json<serde_json::Value>| {
            let payload_state = Arc::clone(&payload_state);
            async move {
                *payload_state.lock().await = payload;
                axum::Json(serde_json::json!({
                    "choices": [
                        { "message": { "content": "BASE_URL 自动拼接成功" } }
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
        axum::serve(listener, app).await.expect("mock text server");
    });

    let result = polish_prompt_with_model(
        TextPolishInput {
            prompt: "产品海报".into(),
            mode_label: "文生图".into(),
            style: "自然".into(),
            task: None,
        },
        Some(TextPolishModel {
            id: "remote-text".into(),
            name: "Remote Text".into(),
            provider: "openai-compatible".into(),
            endpoint,
            api_path: None,
            api_protocol: None,
            api_key: "sk-text".into(),
            model: "gpt-4o-mini".into(),
        }),
    )
    .await
    .expect("base URL should be expanded to chat completions");

    assert_eq!(result.prompt, "BASE_URL 自动拼接成功");
    assert_eq!(captured_payload.lock().await["model"], "gpt-4o-mini");
}

#[tokio::test]
async fn anthropic_text_polish_uses_messages_protocol() {
    let captured_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let captured_key = Arc::new(Mutex::new(String::new()));
    let payload_state = Arc::clone(&captured_payload);
    let key_state = Arc::clone(&captured_key);
    let app = axum::Router::new().route(
        "/v1/messages",
        axum::routing::post(
            move |headers: axum::http::HeaderMap,
                  axum::Json(payload): axum::Json<serde_json::Value>| {
                let payload_state = Arc::clone(&payload_state);
                let key_state = Arc::clone(&key_state);
                async move {
                    *payload_state.lock().await = payload;
                    *key_state.lock().await = headers
                        .get("x-api-key")
                        .and_then(|value| value.to_str().ok())
                        .unwrap_or_default()
                        .to_string();
                    axum::Json(serde_json::json!({
                        "content": [
                            { "type": "text", "text": "Anthropic 润色结果" }
                        ]
                    }))
                }
            },
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!("http://{}", listener.local_addr().expect("addr"));
    tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("mock anthropic server");
    });

    let result = polish_prompt_with_model(
        TextPolishInput {
            prompt: "产品海报".into(),
            mode_label: "文生图".into(),
            style: "自然".into(),
            task: None,
        },
        Some(TextPolishModel {
            id: "anthropic-text".into(),
            name: "Anthropic Text".into(),
            provider: "openai-compatible".into(),
            endpoint,
            api_path: Some("v1/messages".into()),
            api_protocol: Some("anthropic-messages".into()),
            api_key: "sk-ant".into(),
            model: "claude-3-5-sonnet-latest".into(),
        }),
    )
    .await
    .expect("anthropic protocol should polish prompt");

    assert_eq!(result.prompt, "Anthropic 润色结果");
    assert_eq!(*captured_key.lock().await, "sk-ant");
    let payload = captured_payload.lock().await;
    assert_eq!(payload["model"], "claude-3-5-sonnet-latest");
    assert_eq!(payload["max_tokens"], 800);
    assert_eq!(payload["messages"][0]["role"], "user");
}

#[tokio::test]
async fn local_text_polish_is_available_without_api_configuration() {
    let result = polish_prompt_with_model(
        TextPolishInput {
            prompt: "产品海报".into(),
            mode_label: "文生图".into(),
            style: "自然".into(),
            task: None,
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
            task: None,
        },
        Some(TextPolishModel {
            id: "remote-text".into(),
            name: "Remote Text".into(),
            provider: "openai-compatible".into(),
            endpoint: "".into(),
            api_path: None,
            api_protocol: None,
            api_key: "sk-text".into(),
            model: "gpt-4o-mini".into(),
        }),
    )
    .await
    .expect_err("missing endpoint should not silently fall back to local polish");

    assert_eq!(error.to_string(), "请填写文本模型 API 地址");
}
