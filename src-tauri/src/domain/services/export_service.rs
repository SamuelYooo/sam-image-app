use std::{io::Cursor, path::Path};

use image::{imageops::FilterType, GenericImageView, ImageFormat};
use sqlx::SqlitePool;

use crate::{
    api::assets::Asset,
    db::{asset_repo, storyboard_repo},
    domain::clock,
    error::{AppError, AppResult},
};

struct ZipEntry {
    name: String,
    data: Vec<u8>,
}

const ICON_EXPORT_SIZES: [u32; 6] = [16, 32, 64, 128, 256, 512];
const ICON_ICO_SIZES: [u32; 5] = [16, 32, 64, 128, 256];

fn now_nanos() -> AppResult<u128> {
    clock::now_nanos()
}

fn now_stamp() -> AppResult<String> {
    clock::beijing_timestamp_now()
}

fn push_u16(bytes: &mut Vec<u8>, value: u16) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(bytes: &mut Vec<u8>, value: u32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !crc
}

fn build_zip(entries: &[ZipEntry]) -> AppResult<Vec<u8>> {
    let mut bytes = Vec::new();
    let mut central_directory = Vec::new();

    for entry in entries {
        let name = entry.name.as_bytes();
        let offset = u32::try_from(bytes.len())
            .map_err(|_| AppError::InvalidData("ZIP 文件过大".to_string()))?;
        let crc = crc32(&entry.data);
        let size = u32::try_from(entry.data.len())
            .map_err(|_| AppError::InvalidData("ZIP 条目过大".to_string()))?;
        let name_len = u16::try_from(name.len())
            .map_err(|_| AppError::InvalidData("ZIP 文件名过长".to_string()))?;

        push_u32(&mut bytes, 0x0403_4B50);
        push_u16(&mut bytes, 20);
        push_u16(&mut bytes, 0);
        push_u16(&mut bytes, 0);
        push_u16(&mut bytes, 0);
        push_u16(&mut bytes, 0);
        push_u32(&mut bytes, crc);
        push_u32(&mut bytes, size);
        push_u32(&mut bytes, size);
        push_u16(&mut bytes, name_len);
        push_u16(&mut bytes, 0);
        bytes.extend_from_slice(name);
        bytes.extend_from_slice(&entry.data);

        push_u32(&mut central_directory, 0x0201_4B50);
        push_u16(&mut central_directory, 20);
        push_u16(&mut central_directory, 20);
        push_u16(&mut central_directory, 0);
        push_u16(&mut central_directory, 0);
        push_u16(&mut central_directory, 0);
        push_u16(&mut central_directory, 0);
        push_u32(&mut central_directory, crc);
        push_u32(&mut central_directory, size);
        push_u32(&mut central_directory, size);
        push_u16(&mut central_directory, name_len);
        push_u16(&mut central_directory, 0);
        push_u16(&mut central_directory, 0);
        push_u16(&mut central_directory, 0);
        push_u16(&mut central_directory, 0);
        push_u32(&mut central_directory, 0);
        push_u32(&mut central_directory, offset);
        central_directory.extend_from_slice(name);
    }

    let central_offset = u32::try_from(bytes.len())
        .map_err(|_| AppError::InvalidData("ZIP 文件过大".to_string()))?;
    let central_size = u32::try_from(central_directory.len())
        .map_err(|_| AppError::InvalidData("ZIP 中央目录过大".to_string()))?;
    let entry_count = u16::try_from(entries.len())
        .map_err(|_| AppError::InvalidData("ZIP 条目过多".to_string()))?;

    bytes.extend_from_slice(&central_directory);
    push_u32(&mut bytes, 0x0605_4B50);
    push_u16(&mut bytes, 0);
    push_u16(&mut bytes, 0);
    push_u16(&mut bytes, entry_count);
    push_u16(&mut bytes, entry_count);
    push_u32(&mut bytes, central_size);
    push_u32(&mut bytes, central_offset);
    push_u16(&mut bytes, 0);
    Ok(bytes)
}

fn icon_png_file_name(size: u32) -> String {
    format!("icon-{size}x{size}.png")
}

fn resize_icon_png(source_bytes: &[u8], size: u32) -> AppResult<Vec<u8>> {
    let image = image::load_from_memory(source_bytes)
        .map_err(|error| AppError::InvalidData(format!("ICON 源图无法解析: {error}")))?;
    let (width, height) = image.dimensions();
    let crop_size = width.min(height).max(1);
    let crop_x = (width.saturating_sub(crop_size)) / 2;
    let crop_y = (height.saturating_sub(crop_size)) / 2;
    let cropped = image.crop_imm(crop_x, crop_y, crop_size, crop_size);
    let resized = cropped.resize_exact(size, size, FilterType::Lanczos3);
    let mut buffer = Cursor::new(Vec::new());
    resized
        .write_to(&mut buffer, ImageFormat::Png)
        .map_err(|error| AppError::InvalidData(format!("ICON {size}x{size} 编码失败: {error}")))?;
    Ok(buffer.into_inner())
}

fn build_icon_variants(source_bytes: &[u8]) -> AppResult<Vec<(u32, Vec<u8>)>> {
    ICON_EXPORT_SIZES
        .iter()
        .copied()
        .map(|size| Ok((size, resize_icon_png(source_bytes, size)?)))
        .collect()
}

fn build_icon_ico_bytes(variants: &[(u32, Vec<u8>)]) -> AppResult<Vec<u8>> {
    let ico_variants: Vec<_> = variants
        .iter()
        .filter(|(size, _)| ICON_ICO_SIZES.contains(size))
        .collect();
    if ico_variants.is_empty() {
        return Ok(Vec::new());
    }

    let entry_count = u16::try_from(ico_variants.len())
        .map_err(|_| AppError::InvalidData("ICON 图标条目过多".to_string()))?;
    let mut bytes = Vec::new();
    push_u16(&mut bytes, 0);
    push_u16(&mut bytes, 1);
    push_u16(&mut bytes, entry_count);

    let header_size = 6usize + ico_variants.len() * 16;
    let mut data_offset = u32::try_from(header_size)
        .map_err(|_| AppError::InvalidData("ICON 图标头过大".to_string()))?;
    let mut payloads = Vec::with_capacity(ico_variants.len());

    for (size, png_bytes) in ico_variants {
        let dimension = if *size >= 256 {
            0
        } else {
            u8::try_from(*size)
                .map_err(|_| AppError::InvalidData("ICON 尺寸超出 ICO 支持范围".to_string()))?
        };
        bytes.push(dimension);
        bytes.push(dimension);
        bytes.push(0);
        bytes.push(0);
        push_u16(&mut bytes, 1);
        push_u16(&mut bytes, 32);
        push_u32(
            &mut bytes,
            u32::try_from(png_bytes.len())
                .map_err(|_| AppError::InvalidData("ICON PNG 数据过大".to_string()))?,
        );
        push_u32(&mut bytes, data_offset);
        data_offset = data_offset
            .checked_add(
                u32::try_from(png_bytes.len())
                    .map_err(|_| AppError::InvalidData("ICON PNG 数据过大".to_string()))?,
            )
            .ok_or_else(|| AppError::InvalidData("ICON ICO 体积过大".to_string()))?;
        payloads.push(png_bytes.clone());
    }

    for payload in payloads {
        bytes.extend_from_slice(&payload);
    }

    Ok(bytes)
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
        return Err(AppError::InvalidData("base64 图片数据长度无效".to_string()));
    }

    let mut output = Vec::with_capacity(cleaned.len() / 4 * 3);
    for chunk in cleaned.chunks(4) {
        let pad = chunk.iter().rev().take_while(|byte| **byte == b'=').count();
        let mut value24 = 0u32;
        for byte in chunk {
            value24 <<= 6;
            if *byte != b'=' {
                let Some(part) = base64_value(*byte) else {
                    return Err(AppError::InvalidData(
                        "base64 图片数据包含非法字符".to_string(),
                    ));
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

fn data_url_bytes(uri: &str) -> AppResult<Option<Vec<u8>>> {
    if !uri.starts_with("data:image/") {
        return Ok(None);
    }
    let Some((metadata, data)) = uri.split_once(',') else {
        return Err(AppError::InvalidData("data URL 图片缺少数据段".to_string()));
    };
    if !metadata.contains(";base64") {
        return Err(AppError::InvalidData(
            "只支持 base64 data URL 图片导出".to_string(),
        ));
    }
    Ok(Some(decode_base64(data)?))
}

fn relative_asset_bytes(app_data_dir: &Path, uri: &str) -> AppResult<Option<Vec<u8>>> {
    if uri.starts_with("http://") || uri.starts_with("https://") || Path::new(uri).is_absolute() {
        return Ok(None);
    }
    let path = app_data_dir.join(uri.replace('/', std::path::MAIN_SEPARATOR_STR));
    if path.exists() {
        return Ok(Some(std::fs::read(path)?));
    }
    Ok(None)
}

fn read_be_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    let high = *bytes.get(offset)?;
    let low = *bytes.get(offset + 1)?;
    Some(u16::from_be_bytes([high, low]))
}

fn read_be_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_be_bytes([
        *bytes.get(offset)?,
        *bytes.get(offset + 1)?,
        *bytes.get(offset + 2)?,
        *bytes.get(offset + 3)?,
    ]))
}

fn parse_jpeg_image(bytes: &[u8]) -> AppResult<Option<PdfImage>> {
    if !bytes.starts_with(&[0xFF, 0xD8]) {
        return Ok(None);
    }

    let mut offset = 2usize;
    while offset + 9 < bytes.len() {
        while bytes.get(offset) == Some(&0xFF) {
            offset += 1;
        }
        let Some(marker) = bytes.get(offset).copied() else {
            break;
        };
        offset += 1;
        if marker == 0xD9 || marker == 0xDA {
            break;
        }
        let Some(segment_len) = read_be_u16(bytes, offset).map(usize::from) else {
            break;
        };
        if segment_len < 2 || offset + segment_len > bytes.len() {
            break;
        }
        if matches!(marker, 0xC0 | 0xC1 | 0xC2) {
            let height = read_be_u16(bytes, offset + 3).unwrap_or(0) as i64;
            let width = read_be_u16(bytes, offset + 5).unwrap_or(0) as i64;
            if width > 0 && height > 0 {
                return Ok(Some(PdfImage {
                    width,
                    height,
                    color_space: "DeviceRGB",
                    filter: "DCTDecode",
                    decode_params: None,
                    data: bytes.to_vec(),
                }));
            }
        }
        offset += segment_len;
    }

    Err(AppError::InvalidData("JPEG 图片尺寸解析失败".to_string()))
}

fn parse_png_image(bytes: &[u8]) -> AppResult<Option<PdfImage>> {
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if !bytes.starts_with(PNG_SIGNATURE) {
        return Ok(None);
    }
    if bytes.get(12..16) != Some(b"IHDR") {
        return Err(AppError::InvalidData("PNG 图片缺少 IHDR".to_string()));
    }

    let width = read_be_u32(bytes, 16)
        .ok_or_else(|| AppError::InvalidData("PNG 宽度解析失败".to_string()))?
        as i64;
    let height = read_be_u32(bytes, 20)
        .ok_or_else(|| AppError::InvalidData("PNG 高度解析失败".to_string()))?
        as i64;
    let bit_depth = *bytes
        .get(24)
        .ok_or_else(|| AppError::InvalidData("PNG 位深解析失败".to_string()))?;
    let color_type = *bytes
        .get(25)
        .ok_or_else(|| AppError::InvalidData("PNG 色彩类型解析失败".to_string()))?;
    let (color_space, colors) = match color_type {
        0 => ("DeviceGray", 1),
        2 => ("DeviceRGB", 3),
        _ => return Ok(None),
    };
    if bit_depth != 8 {
        return Ok(None);
    }

    let mut offset = 8usize;
    let mut idat = Vec::new();
    while offset + 12 <= bytes.len() {
        let Some(length) = read_be_u32(bytes, offset).map(|value| value as usize) else {
            break;
        };
        let chunk_type_start = offset + 4;
        let data_start = offset + 8;
        let data_end = data_start + length;
        let chunk_end = data_end + 4;
        if chunk_end > bytes.len() {
            break;
        }
        let chunk_type = &bytes[chunk_type_start..chunk_type_start + 4];
        if chunk_type == b"IDAT" {
            idat.extend_from_slice(&bytes[data_start..data_end]);
        }
        if chunk_type == b"IEND" {
            break;
        }
        offset = chunk_end;
    }
    if idat.is_empty() {
        return Err(AppError::InvalidData("PNG 图片缺少 IDAT".to_string()));
    }

    Ok(Some(PdfImage {
        width,
        height,
        color_space,
        filter: "FlateDecode",
        decode_params: Some(format!(
            "<< /Predictor 15 /Colors {colors} /BitsPerComponent {bit_depth} /Columns {width} >>"
        )),
        data: idat,
    }))
}

fn pdf_image_from_bytes(bytes: &[u8]) -> AppResult<Option<PdfImage>> {
    if let Some(image) = parse_jpeg_image(bytes)? {
        return Ok(Some(image));
    }
    parse_png_image(bytes)
}

fn pdf_hex_text(value: &str) -> String {
    let mut output = String::from("FEFF");
    for unit in value.encode_utf16() {
        output.push_str(format!("{unit:04X}").as_str());
    }
    output
}

fn pdf_line(text: &str, y: i64, font_size: i64) -> String {
    format!(
        "BT /F1 {font_size} Tf 48 {y} Td <{}> Tj ET\n",
        pdf_hex_text(text)
    )
}

struct PdfImage {
    width: i64,
    height: i64,
    color_space: &'static str,
    filter: &'static str,
    decode_params: Option<String>,
    data: Vec<u8>,
}

struct PdfPage {
    lines: Vec<String>,
    image: Option<PdfImage>,
}

fn split_pdf_text(prefix: &str, value: &str, max_chars: usize) -> Vec<String> {
    let text = format!("{prefix}{value}");
    if text.chars().count() <= max_chars {
        return vec![text];
    }

    let mut lines = Vec::new();
    let mut current = String::new();
    for character in text.chars() {
        current.push(character);
        if current.chars().count() >= max_chars {
            lines.push(current);
            current = String::new();
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

fn build_pdf_object(object_id: usize, data: &[u8]) -> Vec<u8> {
    let mut bytes = format!("{object_id} 0 obj\n").into_bytes();
    bytes.extend_from_slice(data);
    bytes.extend_from_slice(b"\nendobj\n");
    bytes
}

fn build_pdf_document(pages: &[PdfPage]) -> Vec<u8> {
    let page_count = pages.len().max(1);
    let mut objects: Vec<Vec<u8>> = Vec::new();
    let kids = (0..page_count)
        .map(|index| format!("{} 0 R", 3 + index * 2))
        .collect::<Vec<_>>()
        .join(" ");
    let image_start_id = 3 + page_count * 2;

    objects.push(b"<< /Type /Catalog /Pages 2 0 R >>".to_vec());
    objects.push(format!("<< /Type /Pages /Kids [{kids}] /Count {page_count} >>").into_bytes());

    let mut image_object_ids = Vec::new();
    let mut next_image_object_id = image_start_id;
    for page in pages {
        if page.image.is_some() {
            image_object_ids.push(Some(next_image_object_id));
            next_image_object_id += 1;
        } else {
            image_object_ids.push(None);
        }
    }

    for (index, page) in pages.iter().enumerate() {
        let page_object_id = 3 + index * 2;
        let content_object_id = page_object_id + 1;
        let mut content = String::new();
        let mut text_start_y = 744;

        if let (Some(image), Some(image_object_id)) = (&page.image, image_object_ids[index]) {
            let max_width = 260.0;
            let max_height = 190.0;
            let scale = (max_width / image.width as f64).min(max_height / image.height as f64);
            let width = (image.width as f64 * scale).max(1.0);
            let height = (image.height as f64 * scale).max(1.0);
            let y = 500.0 + (max_height - height);
            content.push_str(
                format!("q {width:.2} 0 0 {height:.2} 48 {y:.2} cm /Im{index} Do Q\n").as_str(),
            );
            text_start_y = 468;
            objects.push(
                format!(
                    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im{index} {image_object_id} 0 R >> /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents {content_object_id} 0 R >>"
                )
                .into_bytes(),
            );
        } else {
            objects.push(
                format!(
                    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents {content_object_id} 0 R >>"
                )
                .into_bytes(),
            );
        }

        for (line_index, line) in page.lines.iter().take(24).enumerate() {
            let y = text_start_y - (line_index as i64 * 22);
            let font_size = if index == 0 && line_index == 0 {
                18
            } else {
                11
            };
            content.push_str(pdf_line(line, y, font_size).as_str());
        }
        objects.push(
            format!(
                "<< /Length {} >>\nstream\n{}endstream",
                content.len(),
                content
            )
            .into_bytes(),
        );
    }

    for (index, page) in pages.iter().enumerate() {
        let Some(image) = &page.image else {
            continue;
        };
        let decode_params = image
            .decode_params
            .as_ref()
            .map(|value| format!(" /DecodeParms {value}"))
            .unwrap_or_default();
        let mut object = format!(
            "<< /Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace /{} /BitsPerComponent 8 /Filter /{}{} /Length {} >>\nstream\n",
            image.width,
            image.height,
            image.color_space,
            image.filter,
            decode_params,
            image.data.len()
        )
        .into_bytes();
        object.extend_from_slice(&image.data);
        object.extend_from_slice(b"\nendstream");

        let expected_id = image_object_ids[index].expect("image object id should exist");
        while objects.len() + 1 < expected_id {
            objects.push(b"<<>>".to_vec());
        }
        objects.push(object);
    }

    let mut bytes = b"%PDF-1.4\n".to_vec();
    let mut offsets = vec![0usize];
    for (index, object) in objects.iter().enumerate() {
        offsets.push(bytes.len());
        bytes.extend_from_slice(build_pdf_object(index + 1, object).as_slice());
    }

    let xref_offset = bytes.len();
    bytes.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    bytes.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        bytes.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    bytes.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n",
            objects.len() + 1
        )
        .as_bytes(),
    );
    bytes
}

#[cfg(test)]
fn build_pdf(lines: &[String]) -> Vec<u8> {
    let pages: Vec<Vec<String>> = lines.chunks(32).map(|chunk| chunk.to_vec()).collect();
    let page_specs = if pages.is_empty() {
        vec![PdfPage {
            lines: Vec::new(),
            image: None,
        }]
    } else {
        pages
            .into_iter()
            .map(|lines| PdfPage { lines, image: None })
            .collect()
    };
    build_pdf_document(&page_specs)
}

async fn load_storyboard_frame_image(
    pool: &SqlitePool,
    app_data_dir: &Path,
    asset_id: &str,
) -> AppResult<Option<PdfImage>> {
    let Some(asset) = asset_repo::get_asset(pool, asset_id).await? else {
        return Ok(None);
    };
    let uri = asset.thumbnail_uri.as_deref().unwrap_or(asset.uri.as_str());
    let bytes = match data_url_bytes(uri)? {
        Some(bytes) => Some(bytes),
        None => relative_asset_bytes(app_data_dir, uri)?,
    };
    let Some(bytes) = bytes else {
        return Ok(None);
    };
    pdf_image_from_bytes(&bytes)
}

async fn build_storyboard_pdf(
    pool: &SqlitePool,
    app_data_dir: &Path,
    draft: &crate::api::storyboard::StoryboardDraft,
) -> AppResult<(Vec<u8>, usize)> {
    let mut pages = vec![PdfPage {
        lines: vec![
            format!("SamImage 分镜稿: {}", draft.project.name),
            format!("项目 ID: {}", draft.project.id),
            format!(
                "项目描述: {}",
                draft.project.description.clone().unwrap_or_default()
            ),
            format!(
                "角色数: {} / 场景数: {} / 镜头数: {}",
                draft.characters.len(),
                draft.scenes.len(),
                draft.shots.len()
            ),
            "角色".to_string(),
        ],
        image: None,
    }];
    for character in &draft.characters {
        pages[0].lines.extend(split_pdf_text(
            "- ",
            format!(
                "{} / {} / {}",
                character.name, character.role, character.appearance
            )
            .as_str(),
            58,
        ));
    }
    pages[0].lines.push("场景".to_string());
    for scene in &draft.scenes {
        pages[0].lines.extend(split_pdf_text(
            "- ",
            format!(
                "{}. {} / {} / {}",
                scene.order_index + 1,
                scene.name,
                scene.location,
                scene.summary
            )
            .as_str(),
            58,
        ));
    }

    let mut embedded_frame_count = 0usize;
    for shot in &draft.shots {
        let image = match &shot.asset_id {
            Some(asset_id) => load_storyboard_frame_image(pool, app_data_dir, asset_id).await?,
            None => None,
        };
        if image.is_some() {
            embedded_frame_count += 1;
        }

        let duration = shot
            .duration_sec
            .map(|value| format!("{value}s"))
            .unwrap_or_else(|| "未设置".to_string());
        let transition = shot.transition.clone().unwrap_or_else(|| "无".to_string());
        let mut lines = vec![
            format!("镜头 {}: {}", shot.order_index + 1, shot.title),
            format!(
                "状态: {} / 时长: {} / 转场: {}",
                shot.status, duration, transition
            ),
            format!(
                "景别: {} / 角度: {} / 运动: {}",
                shot.framing, shot.angle, shot.movement
            ),
        ];
        lines.extend(split_pdf_text("描述: ", &shot.description, 62));
        lines.extend(split_pdf_text("提示词: ", &shot.prompt_text, 62));
        if let Some(asset_id) = &shot.asset_id {
            lines.push(format!("资产: {asset_id}"));
        }
        pages.push(PdfPage { lines, image });
    }

    Ok((build_pdf_document(&pages), embedded_frame_count))
}

pub async fn export_storyboard_pdf(
    pool: &SqlitePool,
    app_data_dir: &Path,
    project_id: &str,
) -> AppResult<Asset> {
    let draft = storyboard_repo::load_storyboard_draft(pool, project_id)
        .await?
        .ok_or_else(|| AppError::InvalidData("未找到分镜项目".to_string()))?;
    let (pdf, embedded_frame_count) = build_storyboard_pdf(pool, app_data_dir, &draft).await?;

    let relative_uri = format!("exports/pdf/{}-{}.pdf", draft.project.id, now_nanos()?);
    let output_path = app_data_dir.join(relative_uri.replace('/', std::path::MAIN_SEPARATOR_STR));
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&output_path, pdf)?;

    let asset = Asset {
        id: format!("asset-pdf-{}", now_nanos()?),
        kind: "pdf".to_string(),
        uri: relative_uri,
        thumbnail_uri: None,
        prompt_text: draft.project.description.clone(),
        negative_prompt: None,
        model_profile_id: None,
        width: None,
        height: None,
        seed: None,
        source_task_id: None,
        project_id: Some(draft.project.id.clone()),
        workflow_id: Some("storyboard".to_string()),
        tags: vec![
            "export".to_string(),
            "storyboard".to_string(),
            "pdf".to_string(),
        ],
        favorite: false,
        metadata: serde_json::json!({
            "exportType": "storyboard_pdf",
            "shotCount": draft.shots.len(),
            "embeddedFrameCount": embedded_frame_count,
        }),
        created_at: now_stamp()?,
        preview_uri: None,
    };
    asset_repo::upsert_asset(pool, &asset).await?;
    Ok(asset)
}

pub async fn export_icon_package(
    pool: &SqlitePool,
    app_data_dir: &Path,
    asset_id: &str,
) -> AppResult<Asset> {
    let icon = asset_repo::get_asset(pool, asset_id)
        .await?
        .ok_or_else(|| AppError::InvalidData("未找到 ICON 资产".to_string()))?;
    if icon.kind != "icon" {
        return Err(AppError::InvalidData(
            "只能导出 ICON 资产的图标包".to_string(),
        ));
    }

    let source_bytes = match data_url_bytes(&icon.uri)? {
        Some(bytes) => Some(bytes),
        None => relative_asset_bytes(app_data_dir, &icon.uri)?,
    };
    let mut icon_sizes = Vec::new();
    let mut ico_sizes = Vec::new();
    let mut generated_icon_entries = Vec::new();
    if let Some(bytes) = source_bytes.as_ref() {
        generated_icon_entries.push(ZipEntry {
            name: "icon-source.png".to_string(),
            data: bytes.clone(),
        });

        let variants = build_icon_variants(bytes)?;
        icon_sizes = variants.iter().map(|(size, _)| *size).collect();
        for (size, png_bytes) in variants.iter() {
            generated_icon_entries.push(ZipEntry {
                name: icon_png_file_name(*size),
                data: png_bytes.clone(),
            });
        }

        let ico_bytes = build_icon_ico_bytes(&variants)?;
        if !ico_bytes.is_empty() {
            ico_sizes = variants
                .iter()
                .map(|(size, _)| *size)
                .filter(|size| ICON_ICO_SIZES.contains(size))
                .collect();
            generated_icon_entries.push(ZipEntry {
                name: "samimage-icon.ico".to_string(),
                data: ico_bytes,
            });
        }
    }
    let icon_file_names: Vec<String> = icon_sizes
        .iter()
        .map(|size| icon_png_file_name(*size))
        .collect();

    let mut entries = vec![
        ZipEntry {
            name: "manifest.json".to_string(),
            data: serde_json::to_vec_pretty(&serde_json::json!({
                "app": "SamImage",
                "exportType": "icon_package",
                "sourceAssetId": &icon.id,
                "sourceUri": &icon.uri,
                "width": icon.width,
                "height": icon.height,
                "workflowId": &icon.workflow_id,
                "tags": &icon.tags,
                "metadata": &icon.metadata,
                "iconSizes": &icon_sizes,
                "icoSizes": &ico_sizes,
                "iconFiles": &icon_file_names,
                "icoFile": if ico_sizes.is_empty() { serde_json::Value::Null } else { serde_json::json!("samimage-icon.ico") },
            }))?,
        },
        ZipEntry {
            name: "prompt.txt".to_string(),
            data: icon.prompt_text.clone().unwrap_or_default().into_bytes(),
        },
    ];
    entries.extend(generated_icon_entries);

    let relative_uri = format!("exports/icons/{}-{}.zip", icon.id, now_nanos()?);
    let output_path = app_data_dir.join(relative_uri.replace('/', std::path::MAIN_SEPARATOR_STR));
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&output_path, build_zip(&entries)?)?;

    let asset = Asset {
        id: format!("asset-icon-zip-{}", now_nanos()?),
        kind: "zip".to_string(),
        uri: relative_uri,
        thumbnail_uri: icon.thumbnail_uri.clone(),
        prompt_text: icon.prompt_text.clone(),
        negative_prompt: icon.negative_prompt.clone(),
        model_profile_id: icon.model_profile_id.clone(),
        width: None,
        height: None,
        seed: icon.seed,
        source_task_id: icon.source_task_id.clone(),
        project_id: icon.project_id.clone(),
        workflow_id: Some("icon".to_string()),
        tags: vec!["export".to_string(), "icon".to_string(), "zip".to_string()],
        favorite: false,
        metadata: serde_json::json!({
            "exportType": "icon_package",
            "sourceAssetId": icon.id,
            "entryCount": entries.len(),
            "containsSourceImage": entries.iter().any(|entry| entry.name == "icon-source.png"),
            "iconSizes": icon_sizes,
            "icoSizes": ico_sizes,
            "iconFiles": icon_file_names,
            "icoFile": if entries.iter().any(|entry| entry.name == "samimage-icon.ico") {
                serde_json::Value::String("samimage-icon.ico".to_string())
            } else {
                serde_json::Value::Null
            },
        }),
        created_at: now_stamp()?,
        preview_uri: None,
    };
    asset_repo::upsert_asset(pool, &asset).await?;
    Ok(asset)
}

#[cfg(test)]
mod tests {
    use crate::{
        api::storyboard::StoryboardDraftInput,
        db::{init_sqlite, storyboard_repo},
        domain::services::storyboard_service::create_default_storyboard_draft,
    };

    use super::*;

    fn fake_jpeg_bytes(width: u16, height: u16) -> Vec<u8> {
        let mut bytes = vec![
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x02, 0xFF, 0xC0, 0x00, 0x11, 0x08,
        ];
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&[
            0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xFF, 0xD9,
        ]);
        bytes
    }

    #[test]
    fn builds_basic_pdf_bytes() {
        let pdf = build_pdf(&["SamImage".to_string(), "Storyboard".to_string()]);

        assert!(pdf.starts_with(b"%PDF-1.4"));
        assert!(pdf.ends_with(b"%%EOF\n"));
    }

    #[test]
    fn builds_uncompressed_zip_bytes() {
        let zip = build_zip(&[ZipEntry {
            name: "manifest.json".to_string(),
            data: br#"{"ok":true}"#.to_vec(),
        }])
        .expect("zip should build");

        assert!(zip.starts_with(b"PK\x03\x04"));
        assert!(zip
            .windows("manifest.json".len())
            .any(|item| item == b"manifest.json"));
        assert!(zip.windows(4).any(|item| item == b"PK\x05\x06"));
    }

    #[tokio::test]
    async fn exports_storyboard_pdf_asset() {
        let dir = std::env::temp_dir().join("samimage-v2-storyboard-export-test");
        let _ = std::fs::remove_dir_all(&dir);
        let pool = init_sqlite(&dir).await.expect("database should initialize");
        let draft = create_default_storyboard_draft(
            &pool,
            StoryboardDraftInput {
                concept: "雨夜城市追逐".to_string(),
                project_name: "雨夜追逐".to_string(),
                style_hint: "neo noir".to_string(),
                shot_count: 3,
            },
        )
        .await
        .expect("draft should be created");

        let asset = export_storyboard_pdf(&pool, &dir, &draft.project.id)
            .await
            .expect("pdf should export");

        assert_eq!(asset.kind, "pdf");
        assert_eq!(asset.project_id.as_deref(), Some(draft.project.id.as_str()));
        assert_eq!(asset.metadata["embeddedFrameCount"], 0);
        assert!(dir.join(&asset.uri).exists());

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn exports_storyboard_pdf_with_embedded_frame_image() {
        let dir = std::env::temp_dir().join("samimage-v2-storyboard-export-image-test");
        let _ = std::fs::remove_dir_all(&dir);
        let pool = init_sqlite(&dir).await.expect("database should initialize");
        let draft = create_default_storyboard_draft(
            &pool,
            StoryboardDraftInput {
                concept: "雨夜城市追逐".to_string(),
                project_name: "雨夜追逐".to_string(),
                style_hint: "neo noir".to_string(),
                shot_count: 1,
            },
        )
        .await
        .expect("draft should be created");

        let relative_image = "assets/images/storyboard-frame-test.jpg";
        let image_path = dir.join(relative_image.replace('/', std::path::MAIN_SEPARATOR_STR));
        std::fs::create_dir_all(image_path.parent().expect("image parent should exist"))
            .expect("image directory should be created");
        std::fs::write(&image_path, fake_jpeg_bytes(320, 180)).expect("image should be written");

        let frame_asset = Asset {
            id: "asset-storyboard-frame-test".to_string(),
            kind: "storyboard_frame".to_string(),
            uri: relative_image.to_string(),
            thumbnail_uri: None,
            prompt_text: Some("雨夜城市追逐分镜".to_string()),
            negative_prompt: None,
            model_profile_id: Some("image-test".to_string()),
            width: Some(320),
            height: Some(180),
            seed: None,
            source_task_id: Some("task-storyboard-frame-test".to_string()),
            project_id: Some(draft.project.id.clone()),
            workflow_id: Some("storyboard".to_string()),
            tags: vec!["storyboard".to_string()],
            favorite: false,
            metadata: serde_json::json!({ "shotId": draft.shots[0].id }),
            created_at: "2026-05-22T00:00:00.000Z".to_string(),
            preview_uri: None,
        };
        asset_repo::upsert_asset(&pool, &frame_asset)
            .await
            .expect("frame asset should upsert");
        storyboard_repo::mark_storyboard_shot_done(&pool, &draft.shots[0].id, &frame_asset.id)
            .await
            .expect("shot should link frame asset");

        let exported = export_storyboard_pdf(&pool, &dir, &draft.project.id)
            .await
            .expect("pdf should export");
        let pdf = std::fs::read(dir.join(&exported.uri)).expect("pdf should exist");

        assert_eq!(exported.metadata["embeddedFrameCount"], 1);
        assert!(pdf
            .windows("/Subtype /Image".len())
            .any(|item| item == b"/Subtype /Image"));
        assert!(pdf
            .windows("DCTDecode".len())
            .any(|item| item == b"DCTDecode"));

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn exports_icon_package_asset() {
        let dir = std::env::temp_dir().join("samimage-v2-icon-export-test");
        let _ = std::fs::remove_dir_all(&dir);
        let pool = init_sqlite(&dir).await.expect("database should initialize");
        let mut icon_png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            8,
            8,
            image::Rgba([255, 255, 255, 255]),
        ))
        .write_to(&mut icon_png, image::ImageFormat::Png)
        .expect("test png should encode");
        let icon_png = icon_png.into_inner();
        let icon_data_url =
            crate::domain::services::asset_file_service::bytes_to_data_url(&icon_png, Some("png"));
        let icon = Asset {
            id: "icon-source-test".to_string(),
            kind: "icon".to_string(),
            uri: icon_data_url,
            thumbnail_uri: None,
            prompt_text: Some("minimal app icon".to_string()),
            negative_prompt: None,
            model_profile_id: Some("image-test".to_string()),
            width: Some(1024),
            height: Some(1024),
            seed: None,
            source_task_id: None,
            project_id: None,
            workflow_id: Some("icon".to_string()),
            tags: vec!["generated".to_string(), "icon".to_string()],
            favorite: false,
            metadata: serde_json::json!({ "style": "app" }),
            created_at: "2026-05-22T00:00:00.000Z".to_string(),
            preview_uri: None,
        };
        asset_repo::upsert_asset(&pool, &icon)
            .await
            .expect("icon should upsert");

        let exported = export_icon_package(&pool, &dir, "icon-source-test")
            .await
            .expect("icon package should export");
        let zip = std::fs::read(dir.join(&exported.uri)).expect("zip should exist");

        assert_eq!(exported.kind, "zip");
        assert_eq!(exported.workflow_id.as_deref(), Some("icon"));
        assert_eq!(exported.metadata["exportType"], "icon_package");
        assert_eq!(exported.metadata["containsSourceImage"], true);
        assert_eq!(exported.metadata["iconSizes"][0], 16);
        assert_eq!(exported.metadata["iconSizes"][3], 128);
        assert_eq!(exported.metadata["icoFile"], "samimage-icon.ico");
        assert!(zip.starts_with(b"PK\x03\x04"));
        assert!(zip
            .windows("icon-source.png".len())
            .any(|item| item == b"icon-source.png"));
        assert!(zip
            .windows("icon-16x16.png".len())
            .any(|item| item == b"icon-16x16.png"));
        assert!(zip
            .windows("icon-32x32.png".len())
            .any(|item| item == b"icon-32x32.png"));
        assert!(zip
            .windows("icon-64x64.png".len())
            .any(|item| item == b"icon-64x64.png"));
        assert!(zip
            .windows("icon-128x128.png".len())
            .any(|item| item == b"icon-128x128.png"));
        assert!(zip
            .windows("icon-256x256.png".len())
            .any(|item| item == b"icon-256x256.png"));
        assert!(zip
            .windows("icon-512x512.png".len())
            .any(|item| item == b"icon-512x512.png"));
        assert!(zip
            .windows("samimage-icon.ico".len())
            .any(|item| item == b"samimage-icon.ico"));

        pool.close().await;
        drop(pool);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
