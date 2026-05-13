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
    pub reference_images: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub id: String,
    pub profile_id: String,
    pub mode: WorkMode,
    pub prompt: String,
    pub image_url: String,
    pub created_at: String,
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
