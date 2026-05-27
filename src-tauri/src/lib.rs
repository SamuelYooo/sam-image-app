use tauri::Manager;

mod api;
mod app_state;
mod db;
mod domain;
mod error;

use crate::{
    api::assets::{
        choose_asset_download_path, delete_asset, delete_assets, download_asset_to_path,
        download_asset_with_dialog, export_icon_package, list_assets, toggle_asset_favorite,
    },
    api::generation_tasks::{
        cancel_generation_task, clear_finished_generation_tasks,
        create_batch_image_generation_tasks, create_image_generation_task, list_generation_tasks,
        retry_generation_task, run_image_generation_task,
    },
    api::legacy_import::import_legacy_json,
    api::model_profiles::{
        check_model_endpoint, check_model_health, clear_model_profile, delete_model_profile,
        fetch_model_options, list_model_profiles, save_model_profile, set_default_model_profile,
    },
    api::prompt_assets::{
        import_prompt_assets, increment_prompt_usage, list_prompt_assets, sync_prompt_source,
        toggle_prompt_favorite,
    },
    api::prompt_polish::polish_prompt,
    api::storyboard::{
        create_storyboard_draft, export_storyboard_pdf, list_storyboard_projects,
        load_storyboard_draft, reorder_storyboard_shots, update_storyboard_shot,
    },
    app_state::AppState,
    error::AppResult,
};

#[tauri::command]
async fn health_check(state: tauri::State<'_, AppState>) -> AppResult<api::health::HealthResponse> {
    api::health::health_check(&state).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = tauri::async_runtime::block_on(AppState::initialize(app.handle()))?;
            app.manage(state);

            #[cfg(debug_assertions)] // only include this code on debug builds
            {
                let window = tauri::Manager::get_webview_window(app, "main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_prevent_default::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            list_model_profiles,
            check_model_endpoint,
            check_model_health,
            fetch_model_options,
            save_model_profile,
            clear_model_profile,
            delete_model_profile,
            set_default_model_profile,
            polish_prompt,
            list_prompt_assets,
            import_prompt_assets,
            increment_prompt_usage,
            toggle_prompt_favorite,
            sync_prompt_source,
            create_storyboard_draft,
            list_storyboard_projects,
            load_storyboard_draft,
            update_storyboard_shot,
            reorder_storyboard_shots,
            export_storyboard_pdf,
            create_image_generation_task,
            create_batch_image_generation_tasks,
            list_generation_tasks,
            run_image_generation_task,
            cancel_generation_task,
            retry_generation_task,
            clear_finished_generation_tasks,
            list_assets,
            toggle_asset_favorite,
            delete_asset,
            delete_assets,
            choose_asset_download_path,
            download_asset_to_path,
            download_asset_with_dialog,
            export_icon_package,
            import_legacy_json,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
