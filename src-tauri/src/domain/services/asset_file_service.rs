use std::{
    path::{Component, Path, PathBuf},
    time::Duration,
};

use reqwest::header::CONTENT_TYPE;

use crate::error::{AppError, AppResult};

pub struct AssetUriBytes {
    pub bytes: Vec<u8>,
    pub suggested_extension: Option<String>,
}

fn base64_value(byte: u8) -> Option<u8> {
    match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

fn decode_base64(value: &str) -> AppResult<Vec<u8>> {
    let cleaned: Vec<u8> = value
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .collect();
    if cleaned.len() % 4 != 0 {
        return Err(AppError::InvalidData("base64 数据长度无效".to_string()));
    }

    let mut output = Vec::with_capacity(cleaned.len() / 4 * 3);
    for chunk in cleaned.chunks(4) {
        let pad = chunk.iter().rev().take_while(|byte| **byte == b'=').count();
        let mut value24 = 0u32;
        for byte in chunk {
            value24 <<= 6;
            if *byte != b'=' {
                let Some(part) = base64_value(*byte) else {
                    return Err(AppError::InvalidData("base64 数据包含非法字符".to_string()));
                };
                value24 |= u32::from(part);
            }
        }
        output.push(((value24 >> 16) & 0xFF) as u8);
        if pad < 2 {
            output.push(((value24 >> 8) & 0xFF) as u8);
        }
        if pad < 1 {
            output.push((value24 & 0xFF) as u8);
        }
    }
    Ok(output)
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = *chunk.get(1).unwrap_or(&0);
        let third = *chunk.get(2).unwrap_or(&0);
        let value = (u32::from(first) << 16) | (u32::from(second) << 8) | u32::from(third);

        output.push(TABLE[((value >> 18) & 0x3F) as usize] as char);
        output.push(TABLE[((value >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[((value >> 6) & 0x3F) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(value & 0x3F) as usize] as char);
        } else {
            output.push('=');
        }
    }
    output
}

pub fn bytes_to_data_url(bytes: &[u8], suggested_extension: Option<&str>) -> String {
    let extension = suggested_extension
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.trim_start_matches('.').to_ascii_lowercase())
        .or_else(|| extension_from_image_bytes(bytes))
        .unwrap_or_else(|| "png".to_string());
    let mime = extension_to_image_mime(&extension);
    format!("data:{mime};base64,{}", encode_base64(bytes))
}

fn parse_data_url(uri: &str) -> AppResult<Option<AssetUriBytes>> {
    if !uri.starts_with("data:") {
        return Ok(None);
    }
    let Some((metadata, data)) = uri.split_once(',') else {
        return Err(AppError::InvalidData("data URL 缺少数据段".to_string()));
    };
    if !metadata.contains(";base64") {
        return Err(AppError::InvalidData(
            "只支持 base64 data URL 资产".to_string(),
        ));
    }

    let mime_type = metadata
        .trim_start_matches("data:")
        .split(';')
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    let suggested_extension = mime_type.as_deref().and_then(mime_to_extension);
    Ok(Some(AssetUriBytes {
        bytes: decode_base64(data)?,
        suggested_extension,
    }))
}

fn mime_to_extension(mime: &str) -> Option<String> {
    match mime.trim().to_ascii_lowercase().as_str() {
        "application/json" => Some("json".to_string()),
        "application/pdf" => Some("pdf".to_string()),
        "application/zip" => Some("zip".to_string()),
        "image/gif" => Some("gif".to_string()),
        "image/jpeg" | "image/jpg" => Some("jpg".to_string()),
        "image/png" => Some("png".to_string()),
        "image/svg+xml" => Some("svg".to_string()),
        "image/webp" => Some("webp".to_string()),
        _ => None,
    }
}

fn extension_to_image_mime(extension: &str) -> &'static str {
    match extension
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase()
        .as_str()
    {
        "gif" => "image/gif",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        _ => "image/png",
    }
}

fn extension_from_uri(uri: &str) -> Option<String> {
    let without_query = uri
        .split('?')
        .next()
        .unwrap_or(uri)
        .split('#')
        .next()
        .unwrap_or(uri);
    let extension = Path::new(without_query)
        .extension()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| value.len() >= 2 && value.len() <= 5)
        .map(|value| value.to_ascii_lowercase())?;
    if extension.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        Some(extension)
    } else {
        None
    }
}

pub fn infer_asset_extension(uri: &str) -> Option<String> {
    let trimmed = uri.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some((metadata, _)) = trimmed.split_once(',') {
        if metadata.starts_with("data:") {
            let mime = metadata
                .trim_start_matches("data:")
                .split(';')
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())?;
            return mime_to_extension(mime);
        }
    }

    extension_from_uri(trimmed)
}

pub fn asset_source_kind(uri: &str) -> &'static str {
    let trimmed = uri.trim();
    if trimmed.starts_with("data:") {
        "data_url"
    } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        "remote_url"
    } else if trimmed.is_empty() {
        "empty"
    } else {
        "local_path"
    }
}

fn extension_from_image_bytes(bytes: &[u8]) -> Option<String> {
    match image::guess_format(bytes).ok()? {
        image::ImageFormat::Jpeg => Some("jpg".to_string()),
        image::ImageFormat::Png => Some("png".to_string()),
        image::ImageFormat::WebP => Some("webp".to_string()),
        image::ImageFormat::Gif => Some("gif".to_string()),
        _ => None,
    }
}

fn relative_uri_path(uri: &str) -> AppResult<Option<PathBuf>> {
    let cleaned = uri
        .trim()
        .split('?')
        .next()
        .unwrap_or(uri)
        .split('#')
        .next()
        .unwrap_or(uri)
        .replace('\\', "/");
    if cleaned.is_empty()
        || cleaned.starts_with("http://")
        || cleaned.starts_with("https://")
        || cleaned.starts_with("data:")
    {
        return Ok(None);
    }

    let raw_path = Path::new(&cleaned);
    if raw_path.is_absolute() {
        return Ok(Some(raw_path.to_path_buf()));
    }

    let mut safe = PathBuf::new();
    for component in raw_path.components() {
        match component {
            Component::Normal(part) => safe.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err(AppError::InvalidData("资产路径无效".to_string()));
            }
        }
    }
    if safe.as_os_str().is_empty() {
        return Ok(None);
    }
    Ok(Some(safe))
}

pub fn resolve_local_asset_path(app_data_dir: &Path, uri: &str) -> AppResult<Option<PathBuf>> {
    let Some(path) = relative_uri_path(uri)? else {
        return Ok(None);
    };
    if path.is_absolute() {
        return Ok(Some(path));
    }
    Ok(Some(app_data_dir.join(path)))
}

pub fn local_preview_path(app_data_dir: &Path, uri: &str) -> AppResult<Option<String>> {
    let Some(path) = resolve_local_asset_path(app_data_dir, uri)? else {
        return Ok(None);
    };
    if path.exists() {
        return Ok(Some(path.to_string_lossy().to_string()));
    }
    Ok(None)
}

pub async fn read_asset_uri_bytes(
    client: &reqwest::Client,
    app_data_dir: &Path,
    uri: &str,
) -> AppResult<AssetUriBytes> {
    let uri = uri.trim();
    if uri.is_empty() {
        return Err(AppError::InvalidData("资产 URI 为空".to_string()));
    }

    if let Some(data) = parse_data_url(uri)? {
        return Ok(data);
    }

    if uri.starts_with("http://") || uri.starts_with("https://") {
        let response = client
            .get(uri)
            .timeout(Duration::from_secs(60))
            .send()
            .await?;
        let status = response.status();
        if !status.is_success() {
            return Err(AppError::InvalidData(format!(
                "远程资产下载失败，HTTP {}",
                status.as_u16()
            )));
        }
        let mime_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);
        let suggested_extension = mime_type
            .as_deref()
            .and_then(mime_to_extension)
            .or_else(|| extension_from_uri(uri));
        let bytes = response.bytes().await?.to_vec();
        if bytes.is_empty() {
            return Err(AppError::InvalidData("没有可保存的图片数据".to_string()));
        }
        return Ok(AssetUriBytes {
            bytes,
            suggested_extension,
        });
    }

    let path = resolve_local_asset_path(app_data_dir, uri)?
        .ok_or_else(|| AppError::InvalidData("资产路径无效".to_string()))?;
    Ok(AssetUriBytes {
        bytes: std::fs::read(&path)?,
        suggested_extension: extension_from_uri(uri),
    })
}

pub async fn read_asset_uri_data_url(
    client: &reqwest::Client,
    app_data_dir: &Path,
    uri: &str,
) -> AppResult<String> {
    let uri = uri.trim();
    if uri.starts_with("data:image/") {
        return Ok(uri.to_string());
    }

    let data = read_asset_uri_bytes(client, app_data_dir, uri).await?;
    let extension = data
        .suggested_extension
        .as_deref()
        .map(ToString::to_string)
        .or_else(|| extension_from_image_bytes(&data.bytes))
        .unwrap_or_else(|| "png".to_string());
    let mime = extension_to_image_mime(&extension);
    Ok(format!("data:{mime};base64,{}", encode_base64(&data.bytes)))
}

pub async fn copy_asset_to_path(
    client: &reqwest::Client,
    app_data_dir: &Path,
    uri: &str,
    destination_path: &str,
) -> AppResult<String> {
    let destination = PathBuf::from(destination_path.trim());
    if destination.as_os_str().is_empty() {
        return Err(AppError::InvalidData("请选择保存路径".to_string()));
    }
    if destination.is_dir() {
        return Err(AppError::InvalidData("保存路径不能是文件夹".to_string()));
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let data = read_asset_uri_bytes(client, app_data_dir, uri).await?;
    std::fs::write(&destination, data.bytes)?;
    Ok(destination.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_asset_bytes(app_data_dir: &Path, relative_uri: &str, bytes: &[u8]) {
        let output_path =
            app_data_dir.join(relative_uri.replace('/', std::path::MAIN_SEPARATOR_STR));
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).expect("asset parent should create");
        }
        std::fs::write(output_path, bytes).expect("asset should write");
    }

    #[test]
    fn rejects_parent_segments_in_relative_asset_paths() {
        let dir = std::env::temp_dir();
        let error = resolve_local_asset_path(&dir, "../outside.png").expect_err("path should fail");
        assert!(error.to_string().contains("资产路径无效"));
    }

    #[test]
    fn infers_extension_and_source_kind_from_common_asset_uris() {
        assert_eq!(
            infer_asset_extension("data:image/webp;base64,abcd"),
            Some("webp".to_string())
        );
        assert_eq!(
            infer_asset_extension("https://example.com/render.PNG?token=hidden"),
            Some("png".to_string())
        );
        assert_eq!(
            infer_asset_extension("assets/images/generated/asset-1.jpg"),
            Some("jpg".to_string())
        );

        assert_eq!(asset_source_kind("data:image/png;base64,abcd"), "data_url");
        assert_eq!(asset_source_kind("https://example.com/a.png"), "remote_url");
        assert_eq!(
            asset_source_kind("assets/images/generated/asset-1.png"),
            "local_path"
        );
    }

    #[tokio::test]
    async fn converts_local_asset_uri_to_data_url_for_model_reference() {
        let dir = std::env::temp_dir().join("samimage-v2-reference-data-url-test");
        let _ = std::fs::remove_dir_all(&dir);
        let relative_uri = "assets/references/ref.png";
        write_asset_bytes(&dir, relative_uri, b"hello");

        let data_url = read_asset_uri_data_url(&reqwest::Client::new(), &dir, relative_uri)
            .await
            .expect("reference should become data URL");

        assert_eq!(data_url, "data:image/png;base64,aGVsbG8=");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn copies_local_asset_uri_to_selected_download_path() {
        let dir = std::env::temp_dir().join("samimage-v2-local-download-test");
        let _ = std::fs::remove_dir_all(&dir);
        let relative_uri = "assets/images/generated/asset-local.png";
        write_asset_bytes(&dir, relative_uri, b"local-image-bytes");
        let destination = dir.join("downloads").join("copy.png");

        let saved_path = copy_asset_to_path(
            &reqwest::Client::new(),
            &dir,
            relative_uri,
            &destination.to_string_lossy(),
        )
        .await
        .expect("local asset should copy to selected path");

        assert_eq!(saved_path, destination.to_string_lossy().to_string());
        assert_eq!(
            std::fs::read(&destination).expect("downloaded copy should exist"),
            b"local-image-bytes"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
