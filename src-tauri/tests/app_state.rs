use sam_image_app_v3_lib::state::AppState;

#[tokio::test]
async fn app_state_round_trips_full_frontend_state_payload() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let state = AppState::initialize_for_path(temp_dir.path())
        .await
        .expect("state should initialize");
    let payload = serde_json::json!({
        "models": [
            {
                "id": "remote-image",
                "name": "Remote Image",
                "provider": "openai-compatible",
                "endpoint": "https://api.example.test/v1/images/generations",
                "apiKey": "sk-image",
                "model": "gpt-image-1",
                "kind": "image",
                "isPrimary": true,
                "status": "connected"
            }
        ],
        "prompts": [],
        "tasks": [],
        "coverPresets": [],
        "settings": {
            "defaultOutputDir": "D:\\SamImage\\Exports",
            "defaultExportFormat": "png",
            "defaultImageModelId": "remote-image",
            "defaultGenerationSize": 1024,
            "defaultBatchSize": 1,
            "defaultStyle": "自然",
            "autoSaveHistory": true,
            "includePromptMetadata": true,
            "theme": "dark"
        }
    });

    state
        .save_app_state(&payload)
        .await
        .expect("state should save");
    let restored = state
        .load_app_state()
        .await
        .expect("state should load")
        .expect("state should exist");

    assert_eq!(restored["models"][0]["apiKey"], "sk-image");
    assert_eq!(restored["settings"]["defaultExportFormat"], "png");
}
