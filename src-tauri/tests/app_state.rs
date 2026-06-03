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

#[tokio::test]
async fn app_state_deletes_one_asset_from_generation_task() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let state = AppState::initialize_for_path(temp_dir.path())
        .await
        .expect("state should initialize");
    let task: sam_image_app_v3_lib::generation::GenerationTask =
        serde_json::from_value(serde_json::json!({
            "id": "task-delete-asset",
            "mode": "txt2img",
            "prompt": "删除单张资源",
            "negativePrompt": "",
            "modelId": "remote-image",
            "width": 1024,
            "height": 1024,
            "batchSize": 2,
            "steps": 24,
            "seed": 42,
            "style": "自然",
            "modeOptions": {},
            "status": "completed",
            "error": null,
            "isFavorite": false,
            "assets": [
                {
                    "id": "asset-delete-a",
                    "taskId": "task-delete-asset",
                    "title": "资源 A",
                    "width": 1024,
                    "height": 1024,
                    "format": "png",
                    "dataUrl": "data:image/png;base64,a",
                    "localPath": null,
                    "createdAt": "2026-05-31T00:00:00.000Z"
                },
                {
                    "id": "asset-delete-b",
                    "taskId": "task-delete-asset",
                    "title": "资源 B",
                    "width": 1024,
                    "height": 1024,
                    "format": "png",
                    "dataUrl": "data:image/png;base64,b",
                    "localPath": null,
                    "createdAt": "2026-05-31T00:00:01.000Z"
                }
            ],
            "createdAt": "2026-05-31T00:00:00.000Z"
        }))
        .expect("task json should deserialize");

    state.insert_task(&task).await.expect("task should save");
    state
        .delete_asset("task-delete-asset", "asset-delete-a")
        .await
        .expect("asset should delete");

    let tasks = state.list_tasks(10).await.expect("tasks should load");
    assert_eq!(tasks[0].assets.len(), 1);
    assert_eq!(tasks[0].assets[0].id, "asset-delete-b");

    state
        .delete_asset("task-delete-asset", "asset-delete-b")
        .await
        .expect("last asset should delete the task row");
    assert!(
        state
            .list_tasks(10)
            .await
            .expect("tasks should load")
            .is_empty()
    );
}
