use sam_image_app_v3_lib::generation::{
    GenerationInput, GenerationMode, create_local_generation, validate_generation_input,
};

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
