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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveImagesResult {
    dir: Option<String>,
    paths: Vec<String>,
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

#[tauri::command]
async fn save_images_to_directory(
    files: Vec<(String, Vec<u8>)>,
) -> Result<SaveImagesResult, String> {
    if files.is_empty() {
        return Err("没有可保存的图片数据".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let dialog = rfd::FileDialog::new().set_title("选择图标导出文件夹");
        let Some(dir) = dialog.pick_folder() else {
            return Ok(SaveImagesResult {
                dir: None,
                paths: Vec::new(),
            });
        };

        let mut paths = Vec::with_capacity(files.len());
        for (file_name, bytes) in files {
            if bytes.is_empty() {
                return Err(format!("{file_name} 没有可保存的图片数据"));
            }
            let is_ico = file_name.to_ascii_lowercase().ends_with(".ico");
            let file_name = if is_ico {
                ensure_image_extension(&file_name, "ico")
            } else {
                ensure_image_extension(&file_name, "png")
            };
            let final_bytes = if is_ico {
                wrap_png_as_ico(&bytes).map_err(|err| format!("转换 ICO 格式失败: {err}"))?
            } else {
                bytes
            };
            let path = dir.join(&file_name);
            std::fs::write(&path, &final_bytes).map_err(|err| format!("保存图标失败: {err}"))?;
            paths.push(path.to_string_lossy().to_string());
        }

        Ok(SaveImagesResult {
            dir: Some(dir.to_string_lossy().to_string()),
            paths,
        })
    })
    .await
    .map_err(|err| format!("打开文件夹选择窗口失败: {err}"))?
}

fn wrap_png_as_ico(png_data: &[u8]) -> Result<Vec<u8>, String> {
    let width = read_png_dimension(png_data, 0).unwrap_or(32);
    let height = read_png_dimension(png_data, 4).unwrap_or(32);

    let png_size = png_data.len() as u32;
    let data_offset: u32 = 6 + 16; // header + 1 directory entry

    let mut ico = Vec::with_capacity(data_offset as usize + png_size as usize);

    // ICO header
    ico.extend_from_slice(&[0, 0]); // reserved
    ico.extend_from_slice(&[1, 0]); // type = icon
    ico.extend_from_slice(&[1, 0]); // count = 1

    // Directory entry
    let width_byte = if width >= 256 { 0 } else { width as u8 };
    let height_byte = if height >= 256 { 0 } else { height as u8 };
    ico.push(width_byte);
    ico.push(height_byte);
    ico.push(0); // color count
    ico.push(0); // reserved
    ico.extend_from_slice(&[1, 0]); // color planes
    ico.extend_from_slice(&[32, 0]); // bits per pixel
    ico.extend_from_slice(&png_size.to_le_bytes());
    ico.extend_from_slice(&data_offset.to_le_bytes());

    // PNG data
    ico.extend_from_slice(png_data);

    Ok(ico)
}

fn read_png_dimension(data: &[u8], offset: usize) -> Option<u32> {
    // PNG format: 8-byte signature, then IHDR chunk (4-byte length + 4-byte "IHDR" + 4-byte width + 4-byte height)
    let pos = 8 + 4 + 4 + offset; // 16 for width, 20 for height
    if pos + 4 > data.len() {
        return None;
    }
    Some(u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]))
}

fn normalize_image_extension(extension: &str) -> Result<String, String> {
    match extension.trim().trim_start_matches('.').to_ascii_lowercase().as_str() {
        "png" => Ok("png".to_string()),
        "jpg" | "jpeg" => Ok("jpg".to_string()),
        "ico" => Ok("ico".to_string()),
        _ => Err("不支持的图片格式".to_string()),
    }
}

fn ensure_image_extension(file_name: &str, extension: &str) -> String {
    let trimmed = file_name.trim();
    let base = if trimmed.is_empty() { "SamImage" } else { trimmed };
    let lower = base.to_ascii_lowercase();
    if lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".ico") {
        base.to_string()
    } else {
        format!("{base}.{extension}")
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_image_with_dialog,
            save_images_to_directory
        ])
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
    use super::{ensure_image_extension, normalize_image_extension, wrap_png_as_ico};

    #[test]
    fn accepts_supported_image_extensions() {
        assert_eq!(normalize_image_extension(".png").unwrap(), "png");
        assert_eq!(normalize_image_extension("jpeg").unwrap(), "jpg");
        assert_eq!(normalize_image_extension("ico").unwrap(), "ico");
    }

    #[test]
    fn keeps_or_adds_image_extension() {
        assert_eq!(ensure_image_extension("image.png", "jpg"), "image.png");
        assert_eq!(ensure_image_extension("image", "jpg"), "image.jpg");
        assert_eq!(ensure_image_extension("", "png"), "SamImage.png");
        assert_eq!(ensure_image_extension("icon.ico", "png"), "icon.ico");
    }

    #[test]
    fn wraps_png_as_ico_format() {
        // Minimal valid PNG (1x1 red pixel)
        let png: Vec<u8> = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
            0x00, 0x00, 0x00, 0x0D, // IHDR length
            0x49, 0x48, 0x44, 0x52, // "IHDR"
            0x00, 0x00, 0x00, 0x01, // width = 1
            0x00, 0x00, 0x00, 0x01, // height = 1
            0x08, 0x02, // bit depth 8, color type 2 (RGB)
            0x00, 0x00, 0x00, // compression, filter, interlace
            0x90, 0x77, 0x53, 0xDE, // CRC
            // IEND
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
            0xAE, 0x42, 0x60, 0x82,
        ];
        let ico = wrap_png_as_ico(&png).unwrap();
        assert_eq!(&ico[0..2], &[0, 0]); // reserved
        assert_eq!(&ico[2..4], &[1, 0]); // type = icon
        assert_eq!(&ico[4..6], &[1, 0]); // count = 1
        assert_eq!(ico[6], 1); // width = 1
        assert_eq!(ico[7], 1); // height = 1
        assert_eq!(&ico[14..18], &((png.len() as u32).to_le_bytes())); // data size
    }
}
