use tauri::Manager;

pub mod api_endpoint;
pub mod commands;
pub mod error;
pub mod generation;
pub mod server;
pub mod state;
pub mod text;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = tauri::async_runtime::block_on(async {
                state::AppState::initialize(&handle).await
            })
            .map_err(|error| Box::new(error) as Box<dyn std::error::Error>)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_generation_task,
            commands::clear_generation_tasks,
            commands::delete_generation_asset,
            commands::export_generated_asset,
            commands::export_icon_bundle,
            commands::load_app_state,
            commands::list_generation_tasks,
            commands::list_model_catalog,
            commands::polish_prompt,
            commands::save_app_state,
            commands::test_model_profile,
            commands::save_app_settings,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run SamImage 3.0");
}
