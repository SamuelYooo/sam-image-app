use std::path::{Path, PathBuf};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum GenerationError {
    #[error("{0}")]
    Validation(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GenerationMode {
    #[serde(rename = "txt2img")]
    Txt2Img,
    #[serde(rename = "img2img")]
    Img2Img,
    Cover,
    Icon,
    #[serde(rename = "3d")]
    ThreeD,
    Gif,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationInput {
    pub mode: GenerationMode,
    pub prompt: String,
    pub negative_prompt: String,
    pub model_id: String,
    pub width: u32,
    pub height: u32,
    pub batch_size: u8,
    pub steps: u8,
    pub seed: u64,
    pub style: String,
    pub reference_image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedAsset {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub data_url: String,
    pub local_path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationTask {
    pub id: String,
    pub mode: GenerationMode,
    pub prompt: String,
    pub negative_prompt: String,
    pub model_id: String,
    pub width: u32,
    pub height: u32,
    pub batch_size: u8,
    pub steps: u8,
    pub seed: u64,
    pub style: String,
    pub status: String,
    pub error: Option<String>,
    pub is_favorite: Option<bool>,
    pub assets: Vec<GeneratedAsset>,
    pub created_at: String,
}

pub fn validate_generation_input(input: &GenerationInput) -> Result<(), GenerationError> {
    if input.prompt.trim().is_empty() {
        return Err(GenerationError::Validation("请输入正向提示词".into()));
    }
    if input.model_id.trim().is_empty() {
        return Err(GenerationError::Validation("请选择图像模型".into()));
    }
    if !(128..=4096).contains(&input.width) {
        return Err(GenerationError::Validation(
            "宽度必须在 128 到 4096 之间".into(),
        ));
    }
    if !(128..=4096).contains(&input.height) {
        return Err(GenerationError::Validation(
            "高度必须在 128 到 4096 之间".into(),
        ));
    }
    if !(1..=4).contains(&input.batch_size) {
        return Err(GenerationError::Validation(
            "批量数量必须在 1 到 4 之间".into(),
        ));
    }
    if !(1..=80).contains(&input.steps) {
        return Err(GenerationError::Validation(
            "生成步数必须在 1 到 80 之间".into(),
        ));
    }
    Ok(())
}

pub fn create_local_generation(input: GenerationInput) -> Result<GenerationTask, GenerationError> {
    validate_generation_input(&input)?;
    let id = format!("task-{}", Uuid::new_v4());
    let created_at = Utc::now().to_rfc3339();
    let assets = (0..input.batch_size)
        .map(|index| create_preview_asset(&id, &input, index, &created_at))
        .collect();

    Ok(GenerationTask {
        id,
        mode: input.mode,
        prompt: input.prompt,
        negative_prompt: input.negative_prompt,
        model_id: input.model_id,
        width: input.width,
        height: input.height,
        batch_size: input.batch_size,
        steps: input.steps,
        seed: input.seed,
        style: input.style,
        status: "completed".into(),
        error: None,
        is_favorite: Some(false),
        assets,
        created_at,
    })
}

pub fn export_asset_data_url(
    data_url: &str,
    output_dir: impl AsRef<Path>,
    title: &str,
    format: &str,
) -> Result<PathBuf, GenerationError> {
    let (_, payload) = data_url
        .split_once(',')
        .ok_or_else(|| GenerationError::Validation("导出内容必须是 data URL".into()))?;
    if !data_url.starts_with("data:") {
        return Err(GenerationError::Validation(
            "导出内容必须是 data URL".into(),
        ));
    }

    let bytes = STANDARD
        .decode(payload)
        .map_err(|error| GenerationError::Validation(format!("data URL 解码失败: {error}")))?;
    let output_dir = output_dir.as_ref();
    std::fs::create_dir_all(output_dir)
        .map_err(|error| GenerationError::Validation(format!("创建导出目录失败: {error}")))?;

    let extension = sanitize_extension(format);
    let file_name = format!("{}.{}", sanitize_export_name(title), extension);
    let path = output_dir.join(file_name);
    std::fs::write(&path, bytes)
        .map_err(|error| GenerationError::Validation(format!("写入导出文件失败: {error}")))?;
    Ok(path)
}

pub fn export_asset_metadata_json(
    output_dir: impl AsRef<Path>,
    title: &str,
    metadata_json: &str,
) -> Result<PathBuf, GenerationError> {
    let output_dir = output_dir.as_ref();
    std::fs::create_dir_all(output_dir)
        .map_err(|error| GenerationError::Validation(format!("创建导出目录失败: {error}")))?;

    let file_name = format!("{}.metadata.json", sanitize_export_name(title));
    let path = output_dir.join(file_name);
    std::fs::write(&path, metadata_json)
        .map_err(|error| GenerationError::Validation(format!("写入元数据文件失败: {error}")))?;
    Ok(path)
}

pub fn sanitize_export_name(value: &str) -> String {
    let mut output = String::new();
    let mut last_was_separator = false;

    for ch in value.trim().chars() {
        if ch.is_alphanumeric() || ch == '-' || ch == '_' {
            output.push(ch);
            last_was_separator = false;
        } else if !last_was_separator {
            output.push('_');
            last_was_separator = true;
        }
    }

    let output = output.trim_matches('_');
    if output.is_empty() {
        "samimage-export".into()
    } else {
        output.into()
    }
}

fn sanitize_extension(value: &str) -> String {
    let extension: String = value
        .trim()
        .trim_start_matches('.')
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect();
    if extension.is_empty() {
        "svg".into()
    } else {
        extension.to_ascii_lowercase()
    }
}

fn create_preview_asset(
    task_id: &str,
    input: &GenerationInput,
    index: u8,
    created_at: &str,
) -> GeneratedAsset {
    let label = mode_label(&input.mode);
    let (start, end) = mode_colors(&input.mode);
    let hash = stable_hash(&format!("{}-{}-{}", input.prompt, input.seed, index));
    let min_side = input.width.min(input.height) as f32;
    let title = format!("{} {}", mode_title(&input.mode), index + 1);
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="{start}"/><stop offset="1" stop-color="{end}"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".28"/></filter></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<circle cx="{c1x}" cy="{c1y}" r="{r1}" fill="rgba(255,255,255,.22)"/>
<circle cx="{c2x}" cy="{c2y}" r="{r2}" fill="rgba(255,255,255,.12)"/>
<rect x="{rx}" y="{ry}" width="{rw}" height="{rh}" rx="{rr}" fill="rgba(6,17,31,.42)" stroke="rgba(255,255,255,.32)" filter="url(#shadow)"/>
<text x="50%" y="45%" text-anchor="middle" fill="rgba(237,243,255,.94)" font-family="Segoe UI, Arial, sans-serif" font-size="{big}" font-weight="800">{label}</text>
<text x="50%" y="55%" text-anchor="middle" fill="rgba(237,243,255,.74)" font-family="Cascadia Mono, monospace" font-size="{small}">SAMIMAGE 3.0 · {hash}</text>
<text x="50%" y="64%" text-anchor="middle" fill="rgba(237,243,255,.82)" font-family="Segoe UI, Arial, sans-serif" font-size="{mid}">{prompt}</text>
</svg>"##,
        w = input.width,
        h = input.height,
        start = start,
        end = end,
        c1x = input.width as f32 * 0.24,
        c1y = input.height as f32 * 0.2,
        r1 = min_side * 0.18,
        c2x = input.width as f32 * 0.78,
        c2y = input.height as f32 * 0.72,
        r2 = min_side * 0.22,
        rx = input.width as f32 * 0.12,
        ry = input.height as f32 * 0.14,
        rw = input.width as f32 * 0.76,
        rh = input.height as f32 * 0.72,
        rr = min_side * 0.04,
        big = (min_side * 0.085).max(28.0),
        mid = (min_side * 0.03).max(16.0),
        small = (min_side * 0.026).max(14.0),
        label = escape_xml(label),
        hash = hash.to_uppercase(),
        prompt = escape_xml(&input.prompt.chars().take(36).collect::<String>()),
    );

    GeneratedAsset {
        id: format!("asset-{}", Uuid::new_v4()),
        task_id: task_id.into(),
        title,
        width: input.width,
        height: input.height,
        format: "svg".into(),
        data_url: format!("data:image/svg+xml;base64,{}", STANDARD.encode(svg)),
        local_path: None,
        created_at: created_at.into(),
    }
}

fn mode_label(mode: &GenerationMode) -> &'static str {
    match mode {
        GenerationMode::Txt2Img => "T2I",
        GenerationMode::Img2Img => "I2I",
        GenerationMode::Cover => "COVER",
        GenerationMode::Icon => "ICON",
        GenerationMode::ThreeD => "3D",
        GenerationMode::Gif => "GIF",
    }
}

fn mode_title(mode: &GenerationMode) -> &'static str {
    match mode {
        GenerationMode::Txt2Img => "文生图",
        GenerationMode::Img2Img => "图生图",
        GenerationMode::Cover => "封面图",
        GenerationMode::Icon => "ICON",
        GenerationMode::ThreeD => "3D 图",
        GenerationMode::Gif => "GIF 动图",
    }
}

fn mode_colors(mode: &GenerationMode) -> (&'static str, &'static str) {
    match mode {
        GenerationMode::Txt2Img => ("#1f6bff", "#7c3aed"),
        GenerationMode::Img2Img => ("#10b981", "#38bdf8"),
        GenerationMode::Cover => ("#ff4d8d", "#ffb86b"),
        GenerationMode::Icon => ("#111827", "#60a5fa"),
        GenerationMode::ThreeD => ("#6366f1", "#f97316"),
        GenerationMode::Gif => ("#14b8a6", "#a3e635"),
    }
}

fn stable_hash(input: &str) -> String {
    let mut hash = 5381u32;
    for byte in input.bytes() {
        hash = hash.wrapping_mul(33) ^ u32::from(byte);
    }
    format!("{hash:x}")
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
