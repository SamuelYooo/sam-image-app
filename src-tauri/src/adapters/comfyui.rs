use crate::adapters::ImageAdapter;
use crate::models::{AdapterInfo, AdapterKind};
use async_trait::async_trait;

pub struct ComfyUiAdapter;

#[async_trait]
impl ImageAdapter for ComfyUiAdapter {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            id: AdapterKind::Comfyui,
            name: "ComfyUI",
            description: "面向本地 ComfyUI 工作流的独立适配器。",
            supports_text_to_image: true,
            supports_image_to_image: true,
            supports_reverse_prompt: false,
        }
    }
}
