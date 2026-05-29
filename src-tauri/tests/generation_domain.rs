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
        api_key: "sk-test".into(),
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
