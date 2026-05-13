mod adapters;
mod api;
mod db;
mod models;
mod server;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveImageResult {
    path: Option<String>,
}

#[tauri::command]
async fn save_image_with_dialog(
    file_name: String,
    extension: String,
    bytes: Vec<u8>,
) -> Result<SaveImageResult, String> {
    if bytes.is_empty() {
        return Err("没有可保存的图片数据".to_string());
    }

    let extension = normalize_image_extension(&extension)?;
    let file_name = ensure_image_extension(&file_name, &extension);

    tauri::async_runtime::spawn_blocking(move || {
        let dialog = rfd::FileDialog::new()
            .set_title("保存图片")
            .set_file_name(&file_name)
            .add_filter("图片文件", &[extension.as_str()]);

        let Some(path) = dialog.save_file() else {
            return Ok(SaveImageResult { path: None });
        };

        std::fs::write(&path, bytes).map_err(|err| format!("保存图片失败: {err}"))?;
        Ok(SaveImageResult {
            path: Some(path.to_string_lossy().to_string()),
        })
    })
    .await
    .map_err(|err| format!("打开保存窗口失败: {err}"))?
}

fn normalize_image_extension(extension: &str) -> Result<String, String> {
    match extension.trim().trim_start_matches('.').to_ascii_lowercase().as_str() {
        "png" => Ok("png".to_string()),
        "jpg" | "jpeg" => Ok("jpg".to_string()),
        _ => Err("不支持的图片格式".to_string()),
    }
}

fn ensure_image_extension(file_name: &str, extension: &str) -> String {
    let trimmed = file_name.trim();
    let base = if trimmed.is_empty() { "SamImage" } else { trimmed };
    let lower = base.to_ascii_lowercase();
    if lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        base.to_string()
    } else {
        format!("{base}.{extension}")
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_image_with_dialog])
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = server::start(app_handle).await {
                    eprintln!("SamImage API server failed: {err:?}");
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SamImage");
}

#[cfg(test)]
mod tests {
    use super::{ensure_image_extension, normalize_image_extension};

    #[test]
    fn accepts_supported_image_extensions() {
        assert_eq!(normalize_image_extension(".png").unwrap(), "png");
        assert_eq!(normalize_image_extension("jpeg").unwrap(), "jpg");
    }

    #[test]
    fn keeps_or_adds_image_extension() {
        assert_eq!(ensure_image_extension("image.png", "jpg"), "image.png");
        assert_eq!(ensure_image_extension("image", "jpg"), "image.jpg");
        assert_eq!(ensure_image_extension("", "png"), "SamImage.png");
    }
}
