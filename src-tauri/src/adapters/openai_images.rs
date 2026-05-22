use crate::adapters::ImageAdapter;
use crate::models::{AdapterInfo, AdapterKind};
use async_trait::async_trait;

pub struct OpenAiImagesAdapter;

#[async_trait]
impl ImageAdapter for OpenAiImagesAdapter {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            id: AdapterKind::OpenaiImages,
            name: "OpenAI 图像",
            description: "兼容 /v1/images/generations 与 /v1/images/edits 的图像模型。",
            supports_text_to_image: true,
            supports_image_to_image: true,
            supports_reverse_prompt: false,
        }
    }
}
