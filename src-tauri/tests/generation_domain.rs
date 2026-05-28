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
