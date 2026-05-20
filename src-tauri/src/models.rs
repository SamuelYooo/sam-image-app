use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AdapterKind {
    OpenaiImages,
    OpenaiChat,
    Gemini,
    Stability,
    Comfyui,
}

impl AdapterKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::OpenaiImages => "openai_images",
            Self::OpenaiChat => "openai_chat",
            Self::Gemini => "gemini",
            Self::Stability => "stability",
            Self::Comfyui => "comfyui",
        }
    }
}

impl TryFrom<&str> for AdapterKind {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "openai_images" => Ok(Self::OpenaiImages),
            "openai_chat" => Ok(Self::OpenaiChat),
            "gemini" => Ok(Self::Gemini),
            "stability" => Ok(Self::Stability),
            "comfyui" => Ok(Self::Comfyui),
            other => Err(format!("unsupported adapter: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterInfo {
    pub id: AdapterKind,
    pub name: &'static str,
    pub description: &'static str,
    pub supports_text_to_image: bool,
    pub supports_image_to_image: bool,
    pub supports_reverse_prompt: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfile {
    pub id: String,
    pub name: String,
    pub adapter: AdapterKind,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub available_models: Vec<String>,
    pub chat_endpoint: String,
    pub image_endpoint: String,
    pub timeout_sec: u64,
    pub reference_image_limit: u8,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelValidationRequest {
    pub profile: ModelProfile,
    pub network_check: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelValidationResult {
    pub ok: bool,
    pub adapter: AdapterKind,
    pub message: String,
    pub latency_ms: u128,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelListRequest {
    pub profile: ModelProfile,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelListResult {
    pub models: Vec<String>,
    pub source: &'static str,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationRequest {
    pub profile_id: String,
    pub mode: WorkMode,
    pub prompt: String,
    pub negative_prompt: String,
    pub size: String,
    pub seed: Option<i64>,
    #[serde(default)]
    pub reference_images: Vec<String>,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default = "default_type")]
    pub type_: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReversePromptResult {
    pub prompt: String,
}

fn default_source() -> String {
    "generate".to_string()
}

fn default_type() -> String {
    "type_default".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub id: String,
    pub profile_id: String,
    pub mode: WorkMode,
    pub prompt: String,
    pub image_url: String,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default = "default_type")]
    pub type_: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub filter_adjustments: Option<FilterAdjustments>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FilterAdjustments {
    #[serde(default)]
    pub brightness: Option<i32>,
    #[serde(default)]
    pub contrast: Option<i32>,
    #[serde(default)]
    pub saturation: Option<i32>,
    #[serde(default)]
    pub temperature: Option<i32>,
    #[serde(default)]
    pub hue: Option<i32>,
    #[serde(default)]
    pub vignette: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactUpdateRequest {
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub filter_adjustments: Option<FilterAdjustments>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplate {
    pub id: String,
    pub title: String,
    pub prompt: String,
    pub category: String,
    pub is_builtin: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub usage_count: u32,
    #[serde(default = "default_prompt_source")]
    pub source: String,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

fn default_prompt_source() -> String {
    "user".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowPreset {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub prompt: String,
    pub negative_prompt: String,
    pub size: String,
    pub mode: WorkMode,
    #[serde(default)]
    pub model_profile_id: Option<String>,
    #[serde(default)]
    pub seed: Option<i64>,
    #[serde(default)]
    pub reference_image_hints: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub is_builtin: bool,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueTask {
    pub id: String,
    pub type_: String,
    pub status: String,
    pub priority: i64,
    pub payload: serde_json::Value,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiModelGenerationRequest {
    pub profile_ids: Vec<String>,
    pub mode: WorkMode,
    pub prompt: String,
    pub negative_prompt: String,
    pub size: String,
    #[serde(default)]
    pub seed: Option<i64>,
    #[serde(default)]
    pub reference_images: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultiModelGenerationResult {
    pub profile_id: String,
    #[serde(default)]
    pub artifact: Option<Artifact>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconfontSearchItem {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub svg_url: Option<String>,
    pub origin_url: String,
    #[serde(default)]
    pub preview_svg: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkMode {
    Txt2img,
    Img2img,
    Reverse,
    Blend,
}

impl WorkMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Txt2img => "txt2img",
            Self::Img2img => "img2img",
            Self::Reverse => "reverse",
            Self::Blend => "blend",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolishRequest {
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolishResult {
    pub polished: String,
}

// ── Storyboard Workshop ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardProject {
    pub id: String,
    pub name: String,
    #[serde(default = "default_aspect_ratio")]
    pub aspect_ratio: String,
    #[serde(default)]
    pub style: String,
    #[serde(default)]
    pub color_palette: String,
    #[serde(default)]
    pub shot_count: i64,
    #[serde(default)]
    pub master_prompt: String,
    #[serde(default = "default_shot_size")]
    pub shot_size: String,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

fn default_aspect_ratio() -> String {
    "16:9".to_string()
}

fn default_shot_size() -> String {
    "1024x576".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct StoryboardCharacter {
    pub id: String,
    pub project_id: String,
    pub name: String,
    #[serde(default)]
    pub appearance: String,
    #[serde(default)]
    pub reference_image: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct StoryboardScene {
    pub id: String,
    pub project_id: String,
    #[serde(default = "default_scene_name")]
    pub name: String,
    #[serde(default)]
    pub scene_index: i64,
    #[serde(default)]
    pub is_active: bool,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[allow(dead_code)]
fn default_scene_name() -> String {
    "场景 1".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryboardShot {
    pub id: String,
    pub project_id: String,
    #[serde(default)]
    pub scene_id: Option<String>,
    #[serde(default)]
    pub shot_index: i64,
    #[serde(default)]
    pub is_master: bool,
    #[serde(default = "default_shot_framing")]
    pub framing: String,
    #[serde(default = "default_shot_angle")]
    pub angle: String,
    #[serde(default = "default_focal_length")]
    pub focal_length: String,
    #[serde(default = "default_shot_movement")]
    pub movement: String,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub environment: String,
    #[serde(default)]
    pub lighting: String,
    #[serde(default)]
    pub mood: String,
    #[serde(default)]
    pub style: String,
    #[serde(default)]
    pub full_prompt: String,
    #[serde(default)]
    pub generated_image_url: Option<String>,
    #[serde(default)]
    pub artifact_id: Option<String>,
    #[serde(default)]
    pub duration: Option<i64>,
    #[serde(default)]
    pub transition: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

fn default_shot_framing() -> String {
    "MS".to_string()
}
fn default_shot_angle() -> String {
    "eye".to_string()
}
fn default_focal_length() -> String {
    "50mm".to_string()
}
fn default_shot_movement() -> String {
    "static".to_string()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateStoryboardShotRequest {
    pub profile_id: String,
    #[serde(default)]
    pub negative_prompt: Option<String>,
    #[serde(default)]
    pub size: Option<String>,
    #[serde(default)]
    pub seed: Option<i64>,
}
