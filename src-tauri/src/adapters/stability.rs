use crate::adapters::ImageAdapter;
use crate::models::{AdapterInfo, AdapterKind};
use async_trait::async_trait;

pub struct StabilityAdapter;

#[async_trait]
impl ImageAdapter for StabilityAdapter {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            id: AdapterKind::Stability,
            name: "Stability 图像",
            description: "面向 Stability AI 文生图、图生图和风格化生成的独立适配器。",
            supports_text_to_image: true,
            supports_image_to_image: true,
            supports_reverse_prompt: false,
        }
    }
}
