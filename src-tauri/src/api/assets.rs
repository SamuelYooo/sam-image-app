use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    app_state::AppState,
    db::asset_repo,
    domain::services::{asset_file_service, export_service},
    error::{AppError, AppResult},
};

fn default_download_extension(asset: &Asset) -> String {
    asset_file_service::infer_asset_extension(asset.uri.as_str())
        .or_else(|| {
            asset
                .thumbnail_uri
                .as_deref()
                .and_then(asset_file_service::infer_asset_extension)
        })
        .unwrap_or_else(|| match asset.kind.as_str() {
            "pdf" => "pdf".to_string(),
            "zip" => "zip".to_string(),
            "json_export" => "json".to_string(),
            _ => "png".to_string(),
        })
}

fn default_download_file_name(asset: &Asset) -> String {
    let extension = default_download_extension(asset);
    format!("samimage-{}-{}.{}", asset.kind, asset.id, extension)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub kind: String,
    pub uri: String,
    pub thumbnail_uri: Option<String>,
    pub prompt_text: Option<String>,
    pub negative_prompt: Option<String>,
    pub model_profile_id: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub seed: Option<i64>,
    pub source_task_id: Option<String>,
    pub project_id: Option<String>,
    pub workflow_id: Option<String>,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub metadata: serde_json::Value,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_uri: Option<String>,
}

fn materialize_asset_preview(app_data_dir: &std::path::Path, mut asset: Asset) -> AppResult<Asset> {
    let uri = asset.thumbnail_uri.as_deref().unwrap_or(asset.uri.as_str());
    asset.preview_uri = asset_file_service::local_preview_path(app_data_dir, uri)?;
    Ok(asset)
}

fn materialize_asset_previews(
    app_data_dir: &std::path::Path,
    assets: Vec<Asset>,
) -> AppResult<Vec<Asset>> {
    assets
        .into_iter()
        .map(|asset| materialize_asset_preview(app_data_dir, asset))
        .collect()
}

#[tauri::command]
pub async fn list_assets(state: State<'_, AppState>) -> AppResult<Vec<Asset>> {
    let assets = asset_repo::list_assets(&state.db).await?;
    materialize_asset_previews(&state.app_data_dir, assets)
}

#[tauri::command]
pub async fn toggle_asset_favorite(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<Asset>> {
    let assets = asset_repo::toggle_asset_favorite(&state.db, &id).await?;
    materialize_asset_previews(&state.app_data_dir, assets)
}

#[tauri::command]
pub async fn delete_asset(state: State<'_, AppState>, id: String) -> AppResult<Vec<Asset>> {
    let assets = asset_repo::delete_asset(&state.db, &id).await?;
    materialize_asset_previews(&state.app_data_dir, assets)
}

#[tauri::command]
pub async fn delete_assets(state: State<'_, AppState>, ids: Vec<String>) -> AppResult<Vec<Asset>> {
    let assets = asset_repo::delete_assets(&state.db, &ids).await?;
    materialize_asset_previews(&state.app_data_dir, assets)
}

#[tauri::command]
pub async fn export_icon_package(state: State<'_, AppState>, asset_id: String) -> AppResult<Asset> {
    let asset =
        export_service::export_icon_package(&state.db, &state.app_data_dir, &asset_id).await?;
    materialize_asset_preview(&state.app_data_dir, asset)
}

#[tauri::command]
pub async fn choose_asset_download_path(default_file_name: String) -> AppResult<Option<String>> {
    let default_file_name = default_file_name.trim();
    if default_file_name.is_empty() {
        return Err(AppError::InvalidData("下载文件名不能为空".to_string()));
    }
    let path = rfd::FileDialog::new()
        .set_title("保存资产")
        .set_file_name(default_file_name)
        .save_file();
    Ok(path.map(|item| item.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn download_asset_with_dialog(
    state: State<'_, AppState>,
    asset_id: String,
) -> AppResult<Option<String>> {
    let asset = asset_repo::get_asset(&state.db, &asset_id)
        .await?
        .ok_or_else(|| AppError::InvalidData("未找到资产记录".to_string()))?;
    let default_file_name = default_download_file_name(&asset);
    let extension = default_download_extension(&asset);
    let Some(path) = rfd::FileDialog::new()
        .set_title("保存资产")
        .set_file_name(&default_file_name)
        .add_filter("文件", &[extension.as_str()])
        .save_file()
    else {
        return Ok(None);
    };

    let client = reqwest::Client::new();
    let saved_path = asset_file_service::copy_asset_to_path(
        &client,
        &state.app_data_dir,
        &asset.uri,
        &path.to_string_lossy(),
    )
    .await?;
    Ok(Some(saved_path))
}

#[tauri::command]
pub async fn download_asset_to_path(
    state: State<'_, AppState>,
    asset_id: String,
    destination_path: String,
) -> AppResult<String> {
    let asset = asset_repo::get_asset(&state.db, &asset_id)
        .await?
        .ok_or_else(|| AppError::InvalidData("未找到资产记录".to_string()))?;
    let client = reqwest::Client::new();
    asset_file_service::copy_asset_to_path(
        &client,
        &state.app_data_dir,
        &asset.uri,
        &destination_path,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_asset(uri: &str, kind: &str) -> Asset {
        Asset {
            id: "asset-test".to_string(),
            kind: kind.to_string(),
            uri: uri.to_string(),
            thumbnail_uri: None,
            prompt_text: None,
            negative_prompt: None,
            model_profile_id: None,
            width: None,
            height: None,
            seed: None,
            source_task_id: None,
            project_id: None,
            workflow_id: None,
            tags: Vec::new(),
            favorite: false,
            metadata: serde_json::json!({}),
            created_at: "2026-05-25 11:00:00".to_string(),
            preview_uri: None,
        }
    }

    #[test]
    fn builds_local_asset_download_names_from_original_uri() {
        let asset = test_asset("assets/images/generated/asset-test.webp", "image");

        assert_eq!(
            default_download_file_name(&asset),
            "samimage-image-asset-test.webp"
        );
    }

    #[test]
    fn prefers_thumbnail_extension_when_downloading() {
        let mut asset = test_asset("assets/images/generated/asset-test", "image");
        asset.thumbnail_uri = Some("assets/thumbnails/generated/asset-test.webp".to_string());

        assert_eq!(default_download_extension(&asset), "webp");
        assert_eq!(
            default_download_file_name(&asset),
            "samimage-image-asset-test.webp"
        );
    }

    #[test]
    fn falls_back_to_kind_extension_for_download_names() {
        let asset = test_asset("assets/exports/storyboard", "pdf");

        assert_eq!(
            default_download_file_name(&asset),
            "samimage-pdf-asset-test.pdf"
        );
    }

    #[test]
    fn materializes_preview_uri_from_thumbnail_when_available() {
        let dir = std::env::temp_dir().join("samimage-v2-asset-preview-test");
        let _ = std::fs::remove_dir_all(&dir);

        let thumbnail_uri = "assets/thumbnails/generated/asset-test.png";
        let thumbnail_path = dir.join(thumbnail_uri.replace('/', std::path::MAIN_SEPARATOR_STR));
        std::fs::create_dir_all(
            thumbnail_path
                .parent()
                .expect("thumbnail path should have parent"),
        )
        .expect("thumbnail parent should create");
        std::fs::write(&thumbnail_path, b"preview").expect("thumbnail should write");

        let mut asset = test_asset("assets/images/generated/asset-test.png", "image");
        asset.thumbnail_uri = Some(thumbnail_uri.to_string());

        let materialized =
            materialize_asset_preview(&dir, asset).expect("preview should materialize");

        assert_eq!(
            materialized.preview_uri,
            Some(thumbnail_path.to_string_lossy().to_string())
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
