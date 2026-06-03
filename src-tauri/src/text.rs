use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::api_endpoint::join_api_endpoint;

#[derive(Debug, Error)]
pub enum TextPolishError {
    #[error("{0}")]
    Validation(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPolishInput {
    pub prompt: String,
    pub mode_label: String,
    pub style: String,
    #[serde(default)]
    pub task: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPolishModel {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub endpoint: String,
    pub api_path: Option<String>,
    pub api_protocol: Option<String>,
    pub api_key: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPolishResult {
    pub prompt: String,
    pub model_name: String,
}

pub async fn polish_prompt_with_model(
    input: TextPolishInput,
    model: Option<TextPolishModel>,
) -> Result<TextPolishResult, TextPolishError> {
    if input.prompt.trim().is_empty() {
        return Err(TextPolishError::Validation("请输入需要润色的提示词".into()));
    }

    let Some(model) = model else {
        return Ok(local_text_polish(input, "本地文本润色"));
    };
    if model.provider == "local-preview" {
        return Ok(local_text_polish(input, &model.name));
    }
    let protocol = model.api_protocol.as_deref().unwrap_or("openai-chat");
    if model.provider != "openai-compatible" && protocol != "anthropic-messages" {
        return Err(TextPolishError::Validation("不支持的文本模型提供方".into()));
    }
    if model.endpoint.trim().is_empty() {
        return Err(TextPolishError::Validation(
            "请填写文本模型 API 地址".into(),
        ));
    }
    if model.api_key.trim().is_empty() {
        return Err(TextPolishError::Validation("请填写文本模型 API Key".into()));
    }
    if model.model.trim().is_empty() {
        return Err(TextPolishError::Validation("请填写文本模型 ID".into()));
    }

    if protocol == "anthropic-messages" {
        return polish_prompt_with_anthropic(input, model).await;
    }

    let endpoint = openai_chat_completions_endpoint(&model.endpoint, model.api_path.as_deref())?;

    let translate_to_english = input.task.as_deref() == Some("translate-to-english");
    let (system_prompt, user_prompt) = text_prompt_messages(&input, translate_to_english);

    let response = reqwest::Client::new()
        .post(endpoint)
        .bearer_auth(model.api_key.trim())
        .json(&serde_json::json!({
            "model": model.model.trim(),
            "temperature": 0.4,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": user_prompt
                }
            ]
        }))
        .send()
        .await
        .map_err(|error| TextPolishError::Validation(format!("文本模型请求失败: {error}")))?;
    let status = response.status();
    if !status.is_success() {
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "无法读取错误响应".into());
        return Err(TextPolishError::Validation(format!(
            "文本模型响应失败: HTTP {} {}",
            status.as_u16(),
            message
        )));
    }

    let payload: ChatCompletionResponse = response
        .json()
        .await
        .map_err(|error| TextPolishError::Validation(format!("解析文本模型响应失败: {error}")))?;
    let prompt = payload
        .choices
        .into_iter()
        .find_map(|choice| {
            let content = choice.message.content.trim().to_string();
            (!content.is_empty()).then_some(content)
        })
        .ok_or_else(|| TextPolishError::Validation("文本模型未返回润色内容".into()))?;

    Ok(TextPolishResult {
        prompt,
        model_name: model.name,
    })
}

async fn polish_prompt_with_anthropic(
    input: TextPolishInput,
    model: TextPolishModel,
) -> Result<TextPolishResult, TextPolishError> {
    let endpoint = join_api_endpoint(&model.endpoint, model.api_path.as_deref(), "v1/messages")
        .map_err(|error| TextPolishError::Validation(format!("文本模型{error}")))?;
    let translate_to_english = input.task.as_deref() == Some("translate-to-english");
    let (system_prompt, user_content) = text_prompt_messages(&input, translate_to_english);
    let response = reqwest::Client::new()
        .post(endpoint)
        .header("x-api-key", model.api_key.trim())
        .header("anthropic-version", "2023-06-01")
        .json(&serde_json::json!({
            "model": model.model.trim(),
            "max_tokens": 800,
            "system": system_prompt,
            "messages": [
                { "role": "user", "content": user_content }
            ]
        }))
        .send()
        .await
        .map_err(|error| TextPolishError::Validation(format!("文本模型请求失败: {error}")))?;
    let status = response.status();
    if !status.is_success() {
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "无法读取错误响应".into());
        return Err(TextPolishError::Validation(format!(
            "文本模型响应失败: HTTP {} {}",
            status.as_u16(),
            message
        )));
    }

    let payload: AnthropicMessagesResponse = response
        .json()
        .await
        .map_err(|error| TextPolishError::Validation(format!("解析文本模型响应失败: {error}")))?;
    let prompt = payload
        .content
        .into_iter()
        .find_map(|item| {
            let text = item.text.unwrap_or_default().trim().to_string();
            (!text.is_empty()).then_some(text)
        })
        .ok_or_else(|| TextPolishError::Validation("文本模型未返回润色内容".into()))?;

    Ok(TextPolishResult {
        prompt,
        model_name: model.name,
    })
}

fn openai_chat_completions_endpoint(
    endpoint: &str,
    api_path: Option<&str>,
) -> Result<String, TextPolishError> {
    join_api_endpoint(endpoint, api_path, "v1/chat/completions")
        .map_err(|error| TextPolishError::Validation(format!("文本模型{error}")))
}

fn local_text_polish(input: TextPolishInput, model_name: &str) -> TextPolishResult {
    if input.task.as_deref() == Some("translate-to-english") {
        return TextPolishResult {
            prompt: [
                input.prompt.trim(),
                &format!("{} style", input.style.trim()),
                "clear subject, stable composition, layered lighting, rich material details",
                &format!("optimized for {} image generation", input.mode_label.trim()),
                &format!("translated by {model_name}"),
            ]
            .join(", "),
            model_name: model_name.into(),
        };
    }

    TextPolishResult {
        prompt: [
            input.prompt.trim(),
            &format!("{}风格", input.style.trim()),
            "主体明确，构图稳定，光线层次清晰，材质细节丰富",
            &format!("适合{}输出", input.mode_label.trim()),
            &format!("由 {model_name} 润色"),
        ]
        .join("，"),
        model_name: model_name.into(),
    }
}

fn text_prompt_messages(
    input: &TextPolishInput,
    translate_to_english: bool,
) -> (&'static str, String) {
    if translate_to_english {
        return (
            "You are SamImage's English AI image prompt translator. Output one polished English image-generation prompt only. Do not explain.",
            format!(
                "Mode: {}\nStyle: {}\nOriginal Chinese prompt: {}\nTranslate the Chinese prompt into English, preserve concrete visual details, keep any requested Chinese on-image text exactly as Chinese characters, and make it suitable for image generation. Output only one English prompt.",
                input.mode_label.trim(),
                input.style.trim(),
                input.prompt.trim()
            ),
        );
    }

    (
        "你是 SamImage 的中文 AI 图像提示词编辑器。只输出润色后的单段提示词，不要解释。",
        format!(
            "模式：{}\n风格：{}\n原始提示词：{}\n请补充主体、构图、光线、材质、色彩和用途，使其更适合图像生成。",
            input.mode_label.trim(),
            input.style.trim(),
            input.prompt.trim()
        ),
    )
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChoice {
    message: ChatCompletionMessage,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessagesResponse {
    content: Vec<AnthropicContentBlock>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContentBlock {
    text: Option<String>,
}
