use crate::adapters::ImageAdapter;
use crate::models::{AdapterInfo, AdapterKind};
use async_trait::async_trait;

pub struct GeminiAdapter;

#[async_trait]
impl ImageAdapter for GeminiAdapter {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            id: AdapterKind::Gemini,
            name: "Gemini",
            description: "面向 Gemini 图像生成和多模态理解的独立适配器。",
            supports_text_to_image: true,
            supports_image_to_image: true,
            supports_reverse_prompt: true,
        }
    }
}
