use crate::adapters::ImageAdapter;
use crate::models::{AdapterInfo, AdapterKind};
use async_trait::async_trait;

pub struct OpenAiChatAdapter;

#[async_trait]
impl ImageAdapter for OpenAiChatAdapter {
    fn info(&self) -> AdapterInfo {
        AdapterInfo {
            id: AdapterKind::OpenaiChat,
            name: "OpenAI 对话图像",
            description: "兼容 /v1/chat/completions 的多模态图像生成或反推接口。",
            supports_text_to_image: true,
            supports_image_to_image: true,
            supports_reverse_prompt: true,
        }
    }
}
