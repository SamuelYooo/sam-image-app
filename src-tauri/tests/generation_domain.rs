use sam_image_app_v3_lib::commands::{ModelProfile, test_model_profile};
use sam_image_app_v3_lib::generation::{
    GenerationInput, GenerationMode, RemoteImageModel, create_generation_with_model,
    create_local_generation, validate_generation_input,
};
use std::sync::Arc;
use tokio::sync::Mutex;

fn valid_input() -> GenerationInput {
    GenerationInput {
        mode: GenerationMode::Cover,
        prompt: "小红书 AI 工具合集封面".into(),
        negative_prompt: "低清晰度".into(),
        model_id: "local-preview".into(),
        width: 1080,
        height: 1440,
        batch_size: 2,
        steps: 28,
        seed: 128409,
        style: "赛博".into(),
        reference_image: None,
        mode_options: serde_json::Value::Null,
    }
}

#[tokio::test]
async fn openai_compatible_generation_uses_remote_image_response() {
    let captured_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let captured_auth = Arc::new(Mutex::new(String::new()));
    let payload_state = Arc::clone(&captured_payload);
    let auth_state = Arc::clone(&captured_auth);
    let app = axum::Router::new().route(
        "/v1/images/generations",
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
                        "data": [
                            { "b64_json": "iVBORw0KGgo=" }
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
        "http://{}/v1/images/generations",
        listener.local_addr().expect("addr")
    );
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("mock image server");
    });

    let mut input = valid_input();
    input.model_id = "remote-image".into();
    input.batch_size = 1;
    let model = RemoteImageModel {
        id: "remote-image".into(),
        name: "Remote Image".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: None,
        api_protocol: None,
        api_key: "sk-test".into(),
        api_secret: None,
        model: "gpt-image-1".into(),
    };

    let task = create_generation_with_model(input, Some(model))
        .await
        .expect("remote generation should use API image");

    assert_eq!(task.assets.len(), 1);
    assert_eq!(task.assets[0].format, "png");
    assert_eq!(
        task.assets[0].data_url,
        "data:image/png;base64,iVBORw0KGgo="
    );
    assert_eq!(*captured_auth.lock().await, "Bearer sk-test");
    let payload = captured_payload.lock().await;
    assert_eq!(payload["model"], "gpt-image-1");
    assert_eq!(payload["prompt"], "小红书 AI 工具合集封面");
    assert_eq!(payload["n"], 1);
    assert_eq!(payload["size"], "1080x1440");
    assert!(payload.get("response_format").is_none());
}

#[tokio::test]
async fn gif_mode_openai_generation_preserves_provider_image_for_frontend_compose() {
    // 行为变更：GIF 模式不再把模型返回的静态 PNG 强行覆盖为 1x1 占位。
    // 后端透传真实图片，由前端用 src/domain/gif.ts 合成真动图。
    let app = axum::Router::new().route(
        "/v1/images/generations",
        axum::routing::post(|| async {
            axum::Json(serde_json::json!({
                "data": [
                    { "b64_json": "iVBORw0KGgo=" }
                ]
            }))
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!(
        "http://{}/v1/images/generations",
        listener.local_addr().expect("addr")
    );
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("mock image server");
    });

    let mut input = valid_input();
    input.mode = GenerationMode::Gif;
    input.model_id = "remote-image".into();
    input.batch_size = 1;
    let model = RemoteImageModel {
        id: "remote-image".into(),
        name: "Remote Image".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: None,
        api_protocol: Some("openai-images".into()),
        api_key: "sk-test".into(),
        api_secret: None,
        model: "gpt-image-2".into(),
    };

    let task = create_generation_with_model(input, Some(model))
        .await
        .expect("gif generation should pass through static provider output");

    assert_eq!(task.assets.len(), 1);
    // provider 返回的 PNG 被透传，由前端合成真动图
    assert_eq!(task.assets[0].format, "png");
    assert!(task.assets[0].data_url.starts_with("data:image/png"));
}

#[tokio::test]
async fn openai_compatible_generation_polls_task_result_without_forced_async_query() {
    let post_called = Arc::new(Mutex::new(false));
    let get_called = Arc::new(Mutex::new(false));
    let post_state = Arc::clone(&post_called);
    let get_state = Arc::clone(&get_called);
    let app = axum::Router::new()
        .route(
            "/v1/images/generations",
            axum::routing::post(
                move |uri: axum::http::Uri, axum::Json(payload): axum::Json<serde_json::Value>| {
                    let post_state = Arc::clone(&post_state);
                    async move {
                        *post_state.lock().await = true;
                        assert!(uri.query().is_none());
                        assert_eq!(payload["prompt"], "小红书 AI 工具合集封面");
                        axum::Json(serde_json::json!({
                            "id": "task-async-1",
                            "status": "queued"
                        }))
                    }
                },
            ),
        )
        .route(
            "/v1/images/generations/task-async-1",
            axum::routing::get(move || {
                let get_state = Arc::clone(&get_state);
                async move {
                    *get_state.lock().await = true;
                    axum::Json(serde_json::json!({
                        "status": "completed",
                        "data": [
                            { "b64_json": "iVBORw0KGgo=" }
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
        axum::serve(listener, app).await.expect("mock image server");
    });

    let mut input = valid_input();
    input.model_id = "remote-image".into();
    input.batch_size = 1;
    let model = RemoteImageModel {
        id: "remote-image".into(),
        name: "Remote Image".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: None,
        api_protocol: Some("openai-images".into()),
        api_key: "sk-test".into(),
        api_secret: None,
        model: "gpt-image-2".into(),
    };

    let task = create_generation_with_model(input, Some(model))
        .await
        .expect("async image generation should poll task result");

    assert_eq!(task.assets.len(), 1);
    assert!(
        task.assets[0]
            .data_url
            .starts_with("data:image/png;base64,")
    );
    assert!(*post_called.lock().await);
    assert!(*get_called.lock().await);
}

#[tokio::test]
async fn openai_compatible_generation_accepts_base_url_with_path_prefix() {
    let captured_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let payload_state = Arc::clone(&captured_payload);
    let app = axum::Router::new().route(
        "/relay/v1/images/generations",
        axum::routing::post(move |axum::Json(payload): axum::Json<serde_json::Value>| {
            let payload_state = Arc::clone(&payload_state);
            async move {
                *payload_state.lock().await = payload;
                axum::Json(serde_json::json!({
                    "data": [
                        { "b64_json": "iVBORw0KGgo=" }
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
        axum::serve(listener, app).await.expect("mock image server");
    });

    let mut input = valid_input();
    input.model_id = "remote-image".into();
    input.batch_size = 1;
    let model = RemoteImageModel {
        id: "remote-image".into(),
        name: "Remote Image".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: None,
        api_protocol: None,
        api_key: "sk-test".into(),
        api_secret: None,
        model: "gpt-image-1".into(),
    };

    let task = create_generation_with_model(input, Some(model))
        .await
        .expect("base URL should be expanded to the images generation endpoint");

    assert_eq!(task.assets.len(), 1);
    assert_eq!(captured_payload.lock().await["model"], "gpt-image-1");
}

#[tokio::test]
async fn dashscope_wanxiang_generation_uses_multimodal_generation_protocol() {
    let captured_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let payload_state = Arc::clone(&captured_payload);
    let app = axum::Router::new().route(
        "/api/v1/services/aigc/multimodal-generation/generation",
        axum::routing::post(move |axum::Json(payload): axum::Json<serde_json::Value>| {
            let payload_state = Arc::clone(&payload_state);
            async move {
                *payload_state.lock().await = payload;
                axum::Json(serde_json::json!({
                    "output": {
                        "choices": [
                            {
                                "message": {
                                    "content": [
                                        { "image": "data:image/png;base64,iVBORw0KGgo=" }
                                    ]
                                }
                            }
                        ]
                    }
                }))
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!("http://{}", listener.local_addr().expect("addr"));
    tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("mock dashscope server");
    });

    let mut input = valid_input();
    input.model_id = "wanxiang-image".into();
    input.batch_size = 1;
    let model = RemoteImageModel {
        id: "wanxiang-image".into(),
        name: "Wanxiang".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: Some("api/v1/services/aigc/multimodal-generation/generation".into()),
        api_protocol: Some("dashscope-wanxiang".into()),
        api_key: "sk-test".into(),
        api_secret: None,
        model: "wanx2.1-t2i-turbo".into(),
    };

    let task = create_generation_with_model(input, Some(model))
        .await
        .expect("dashscope wanxiang protocol should return an image task");

    assert_eq!(task.assets.len(), 1);
    assert_eq!(
        task.assets[0].data_url,
        "data:image/png;base64,iVBORw0KGgo="
    );
    let payload = captured_payload.lock().await;
    assert_eq!(payload["model"], "wanx2.1-t2i-turbo");
    assert_eq!(
        payload["input"]["messages"][0]["content"][0]["text"],
        "小红书 AI 工具合集封面"
    );
    assert_eq!(payload["parameters"]["size"], "1080*1440");
}

#[tokio::test]
async fn multimodal_chat_generation_extracts_image_from_chat_response() {
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
                        {
                            "message": {
                                "content": [
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": "data:image/png;base64,iVBORw0KGgo="
                                        }
                                    }
                                ]
                            }
                        }
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
        axum::serve(listener, app).await.expect("mock chat server");
    });

    let mut input = valid_input();
    input.model_id = "chat-image".into();
    input.batch_size = 1;
    input.reference_image = Some("data:image/png;base64,AAAA".into());
    let model = RemoteImageModel {
        id: "chat-image".into(),
        name: "Chat Image".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: Some("v1/chat/completions".into()),
        api_protocol: Some("multimodal-chat".into()),
        api_key: "sk-test".into(),
        api_secret: None,
        model: "vision-image-model".into(),
    };

    let task = create_generation_with_model(input, Some(model))
        .await
        .expect("multimodal chat should return image assets");

    assert_eq!(task.assets.len(), 1);
    assert_eq!(
        task.assets[0].data_url,
        "data:image/png;base64,iVBORw0KGgo="
    );
    let payload = captured_payload.lock().await;
    assert_eq!(payload["model"], "vision-image-model");
    assert_eq!(payload["messages"][0]["role"], "user");
    assert!(payload["messages"][0]["content"].is_array());
}

#[tokio::test]
async fn openai_image_edits_generation_sends_reference_image_as_multipart() {
    let captured_content_type = Arc::new(Mutex::new(String::new()));
    let content_type_state = Arc::clone(&captured_content_type);
    let app = axum::Router::new().route(
        "/v1/images/edits",
        axum::routing::post(move |headers: axum::http::HeaderMap| {
            let content_type_state = Arc::clone(&content_type_state);
            async move {
                *content_type_state.lock().await = headers
                    .get(axum::http::header::CONTENT_TYPE)
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or_default()
                    .to_string();
                axum::Json(serde_json::json!({
                    "data": [
                        { "b64_json": "iVBORw0KGgo=" }
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
        axum::serve(listener, app).await.expect("mock edits server");
    });

    let mut input = valid_input();
    input.model_id = "image-edits".into();
    input.batch_size = 1;
    input.reference_image =
        Some("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ".into());
    let model = RemoteImageModel {
        id: "image-edits".into(),
        name: "Image Edits".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: Some("v1/images/edits".into()),
        api_protocol: Some("openai-image-edits".into()),
        api_key: "sk-test".into(),
        api_secret: None,
        model: "edit-image-model".into(),
    };

    let task = create_generation_with_model(input, Some(model))
        .await
        .expect("image edits protocol should return image assets");

    assert_eq!(task.assets.len(), 1);
    assert!(
        captured_content_type
            .lock()
            .await
            .starts_with("multipart/form-data")
    );
}

#[tokio::test]
async fn remote_generation_error_mentions_protocol_and_endpoint() {
    let mut input = valid_input();
    input.model_id = "remote-image".into();
    input.batch_size = 1;
    let model = RemoteImageModel {
        id: "remote-image".into(),
        name: "Remote Image".into(),
        provider: "openai-compatible".into(),
        endpoint: "http://127.0.0.1:9".into(),
        api_path: Some("v1/images/generations".into()),
        api_protocol: Some("openai-images".into()),
        api_key: "sk-test".into(),
        api_secret: None,
        model: "gpt-image-2".into(),
    };

    let error = create_generation_with_model(input, Some(model))
        .await
        .expect_err("connection failure should include diagnostics");
    let message = error.to_string();

    assert!(message.contains("openai-images"));
    assert!(message.contains("POST http://127.0.0.1:9/v1/images/generations"));
}

#[tokio::test]
async fn mgtv_storyboard_generation_signs_and_polls_asset_info() {
    let captured_generate_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let captured_info_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let captured_access_key = Arc::new(Mutex::new(String::new()));
    let captured_signature = Arc::new(Mutex::new(String::new()));
    let mgtv_asset_url = Arc::new(Mutex::new(String::new()));
    let generate_payload_state = Arc::clone(&captured_generate_payload);
    let info_payload_state = Arc::clone(&captured_info_payload);
    let access_key_state = Arc::clone(&captured_access_key);
    let signature_state = Arc::clone(&captured_signature);
    let asset_url_state = Arc::clone(&mgtv_asset_url);
    let app = axum::Router::new()
        .route(
            "/openapi/v1/storyboard/generateByPromptV2",
            axum::routing::post(
                move |headers: axum::http::HeaderMap,
                      axum::Json(payload): axum::Json<serde_json::Value>| {
                    let generate_payload_state = Arc::clone(&generate_payload_state);
                    let access_key_state = Arc::clone(&access_key_state);
                    let signature_state = Arc::clone(&signature_state);
                    async move {
                        *generate_payload_state.lock().await = payload;
                        *access_key_state.lock().await = headers
                            .get("X-Access-Key")
                            .and_then(|value| value.to_str().ok())
                            .unwrap_or_default()
                            .to_string();
                        *signature_state.lock().await = headers
                            .get("X-Signature")
                            .and_then(|value| value.to_str().ok())
                            .unwrap_or_default()
                            .to_string();
                        axum::Json(serde_json::json!({
                            "code": 0,
                            "data": {
                                "recordIds": ["record-1"]
                            }
                        }))
                    }
                },
            ),
        )
        .route(
            "/openapi/v1/storyboard/getAssetInfo",
            axum::routing::post(move |axum::Json(payload): axum::Json<serde_json::Value>| {
                let info_payload_state = Arc::clone(&info_payload_state);
                let asset_url_state = Arc::clone(&asset_url_state);
                async move {
                    *info_payload_state.lock().await = payload;
                    let asset_url = asset_url_state.lock().await.clone();
                    axum::Json(serde_json::json!({
                        "code": 0,
                        "data": [
                            {
                                "modelLogo": "https://aigc-assets.mgtv.com/aigc/model-logo/wan.svg",
                                "images": [
                                    { "imgUrl": asset_url }
                                ]
                            }
                        ]
                    }))
                }
            }),
        )
        .route(
            "/asset-without-extension",
            axum::routing::get(|| async {
                (
                    [(axum::http::header::CONTENT_TYPE, "image/jpeg")],
                    vec![0xff, 0xd8, 0xff, 0xdb],
                )
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!("http://{}", listener.local_addr().expect("addr"));
    *mgtv_asset_url.lock().await = format!("{endpoint}/asset-without-extension");
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("mock mgtv server");
    });

    let mut input = valid_input();
    input.model_id = "mgtv-storyboard".into();
    input.batch_size = 1;
    input.width = 1024;
    input.height = 1024;
    input.mode_options = serde_json::json!({
        "resolution": "1K",
        "ratio": "1:1"
    });
    let model = RemoteImageModel {
        id: "mgtv-storyboard".into(),
        name: "MGTV Storyboard".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: Some("openapi/v1/storyboard/generateByPromptV2".into()),
        api_protocol: Some("mgtv-storyboard".into()),
        api_key: "access-test".into(),
        api_secret: Some("secret-test".into()),
        model: "35".into(),
    };

    let task = create_generation_with_model(input, Some(model))
        .await
        .expect("mgtv storyboard protocol should return image assets");

    assert_eq!(task.assets.len(), 1);
    assert_eq!(task.assets[0].format, "jpg");
    assert!(
        task.assets[0]
            .data_url
            .starts_with("data:image/jpeg;base64,")
    );
    assert_eq!(*captured_access_key.lock().await, "access-test");
    assert!(!captured_signature.lock().await.is_empty());
    let generate_payload = captured_generate_payload.lock().await;
    assert_eq!(generate_payload["styleId"], 35);
    assert_eq!(generate_payload["resolution"], "1K");
    assert_eq!(generate_payload["ratio"], "1:1");
    assert_eq!(generate_payload["nums"], 1);
    assert_eq!(
        generate_payload["prompt"]["prompt"],
        "小红书 AI 工具合集封面"
    );
    assert!(generate_payload["prompt"]["args"].is_array());
    assert!(generate_payload["imgUrls"].is_array());
    let info_payload = captured_info_payload.lock().await;
    assert_eq!(info_payload["recordIds"][0], "record-1");
}

#[tokio::test]
async fn image_model_connection_test_uses_post_generation_endpoint() {
    let captured_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let payload_state = Arc::clone(&captured_payload);
    let app = axum::Router::new().route(
        "/v1/images/generations",
        axum::routing::get(|| async {
            (
                axum::http::StatusCode::NOT_FOUND,
                axum::response::Html(
                    "<html><body><center><h1>404 Not Found</h1></center></body></html>",
                ),
            )
        })
        .post(move |axum::Json(payload): axum::Json<serde_json::Value>| {
            let payload_state = Arc::clone(&payload_state);
            async move {
                *payload_state.lock().await = payload;
                axum::Json(serde_json::json!({
                    "data": [
                        { "b64_json": "iVBORw0KGgo=" }
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
        axum::serve(listener, app).await.expect("mock image server");
    });

    let result = test_model_profile(ModelProfile {
        id: "remote-image".into(),
        name: "Remote Image".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: Some("v1/images/generations".into()),
        api_protocol: Some("openai-images".into()),
        api_key: "sk-test".into(),
        api_secret: None,
        model: "gpt-image-1".into(),
        kind: "image".into(),
        is_primary: true,
        status: "untested".into(),
        last_checked_at: None,
    })
    .await
    .expect("image model test should return a result");

    assert!(result.ok);
    assert_eq!(result.message, "图像模型连接检测成功，图像端点可达");
    let payload = captured_payload.lock().await;
    assert_eq!(payload["model"], "gpt-image-1");
    assert_eq!(payload["prompt"], "连接检测");
    assert_eq!(payload["n"], 1);
    assert_eq!(payload["size"], "1024x1024");
}

#[tokio::test]
async fn image_model_connection_test_prefers_models_catalog_without_generation_probe() {
    let generation_called = Arc::new(Mutex::new(false));
    let generation_state = Arc::clone(&generation_called);
    let app = axum::Router::new()
        .route(
            "/v1/models",
            axum::routing::get(|| async {
                axum::Json(serde_json::json!({
                    "object": "list",
                    "data": [
                        { "id": "gpt-image-1", "object": "model" }
                    ]
                }))
            }),
        )
        .route(
            "/v1/images/generations",
            axum::routing::post(move || {
                let generation_state = Arc::clone(&generation_state);
                async move {
                    *generation_state.lock().await = true;
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR
                }
            }),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!("http://{}", listener.local_addr().expect("addr"));
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("mock image server");
    });

    let result = test_model_profile(ModelProfile {
        id: "remote-image".into(),
        name: "Remote Image".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: Some("v1/images/generations".into()),
        api_protocol: Some("openai-images".into()),
        api_key: "sk-test".into(),
        api_secret: None,
        model: "gpt-image-1".into(),
        kind: "image".into(),
        is_primary: true,
        status: "untested".into(),
        last_checked_at: None,
    })
    .await
    .expect("image model test should return a result");

    assert!(result.ok);
    assert_eq!(result.message, "图像模型连接检测成功，模型列表已包含该模型");
    assert!(!*generation_called.lock().await);
}

#[tokio::test]
async fn image_model_connection_test_accepts_parameter_rejection_as_reachable() {
    let app = axum::Router::new().route(
        "/v1/images/generations",
        axum::routing::post(|| async {
            (
                axum::http::StatusCode::UNPROCESSABLE_ENTITY,
                "unsupported image size for this model",
            )
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!("http://{}", listener.local_addr().expect("addr"));
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("mock image server");
    });

    let result = test_model_profile(ModelProfile {
        id: "remote-image".into(),
        name: "Remote Image".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: Some("v1/images/generations".into()),
        api_protocol: Some("openai-images".into()),
        api_key: "sk-test".into(),
        api_secret: None,
        model: "provider-image-model".into(),
        kind: "image".into(),
        is_primary: true,
        status: "untested".into(),
        last_checked_at: None,
    })
    .await
    .expect("image model test should return a result");

    assert!(result.ok);
    assert!(result.message.contains("图像模型端点可达"));
    assert!(result.message.contains("HTTP 422"));
}

#[tokio::test]
async fn mgtv_storyboard_connection_test_uses_signed_asset_info_probe() {
    let captured_access_key = Arc::new(Mutex::new(String::new()));
    let captured_payload = Arc::new(Mutex::new(serde_json::Value::Null));
    let access_key_state = Arc::clone(&captured_access_key);
    let payload_state = Arc::clone(&captured_payload);
    let app = axum::Router::new()
        .route(
            "/v1/models",
            axum::routing::get(|| async { axum::http::StatusCode::NOT_FOUND }),
        )
        .route(
            "/openapi/v1/storyboard/getAssetInfo",
            axum::routing::post(
                move |headers: axum::http::HeaderMap,
                      axum::Json(payload): axum::Json<serde_json::Value>| {
                    let access_key_state = Arc::clone(&access_key_state);
                    let payload_state = Arc::clone(&payload_state);
                    async move {
                        *access_key_state.lock().await = headers
                            .get("X-Access-Key")
                            .and_then(|value| value.to_str().ok())
                            .unwrap_or_default()
                            .to_string();
                        *payload_state.lock().await = payload;
                        (
                            axum::http::StatusCode::UNPROCESSABLE_ENTITY,
                            "recordIds required",
                        )
                    }
                },
            ),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("mock listener");
    let endpoint = format!("http://{}", listener.local_addr().expect("addr"));
    tokio::spawn(async move {
        axum::serve(listener, app).await.expect("mock mgtv server");
    });

    let result = test_model_profile(ModelProfile {
        id: "mgtv-storyboard".into(),
        name: "MGTV Storyboard".into(),
        provider: "openai-compatible".into(),
        endpoint,
        api_path: Some("openapi/v1/storyboard/generateByPromptV2".into()),
        api_protocol: Some("mgtv-storyboard".into()),
        api_key: "access-test".into(),
        api_secret: Some("secret-test".into()),
        model: "35".into(),
        kind: "image".into(),
        is_primary: true,
        status: "untested".into(),
        last_checked_at: None,
    })
    .await
    .expect("mgtv connection test should return a result");

    assert!(result.ok);
    assert_eq!(*captured_access_key.lock().await, "access-test");
    assert_eq!(
        captured_payload.lock().await["recordIds"]
            .as_array()
            .unwrap()
            .len(),
        0
    );
}

#[test]
fn rejects_blank_prompt_before_generating() {
    let mut input = valid_input();
    input.prompt = "   ".into();

    let error = validate_generation_input(&input).expect_err("blank prompt must fail");

    assert!(error.to_string().contains("请输入正向提示词"));
}

#[test]
fn local_generation_creates_svg_assets() {
    let task = create_local_generation(valid_input()).expect("local preview should generate");

    assert_eq!(task.status, "completed");
    assert_eq!(task.assets.len(), 2);
    assert_eq!(task.assets[0].width, 1080);
    assert!(task.assets[0].data_url.starts_with("data:image/svg+xml"));
}

#[test]
fn local_generation_creates_gif_assets_for_gif_mode() {
    let mut input = valid_input();
    input.mode = GenerationMode::Gif;
    input.width = 512;
    input.height = 512;
    input.batch_size = 1;
    input.prompt = "循环动图导出回归测试".into();

    let task = create_local_generation(input).expect("gif preview should generate");

    assert_eq!(task.assets.len(), 1);
    assert_eq!(task.assets[0].format, "gif");
    assert!(task.assets[0].data_url.starts_with("data:image/gif"));
}

#[test]
fn local_generation_keeps_mode_specific_options() {
    let mut input = valid_input();
    input.mode = GenerationMode::Img2Img;
    input.reference_image = Some("data:image/png;base64,AAAA".into());
    input.mode_options = serde_json::json!({
        "imageStrength": 68,
        "resizeMode": "crop-resize"
    });

    let task = create_local_generation(input).expect("mode options should be preserved");

    assert_eq!(task.mode_options["imageStrength"], 68);
    assert_eq!(task.mode_options["resizeMode"], "crop-resize");
}

#[test]
fn icon_generation_allows_small_square_sizes() {
    let mut input = valid_input();
    input.mode = GenerationMode::Icon;
    input.width = 16;
    input.height = 16;
    input.batch_size = 1;
    input.prompt = "favicon 导出测试".into();

    validate_generation_input(&input).expect("icon mode should allow 16px sizes");
    let task = create_local_generation(input).expect("icon preview should generate");

    assert_eq!(task.assets.len(), 1);
    assert_eq!(task.assets[0].width, 16);
    assert_eq!(task.assets[0].height, 16);
}
