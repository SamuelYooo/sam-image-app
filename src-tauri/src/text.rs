use serde::{Deserialize, Serialize};
use thiserror::Error;

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPolishModel {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub endpoint: String,
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
    if model.provider != "openai-compatible" {
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

    let response = reqwest::Client::new()
        .post(model.endpoint.trim())
        .bearer_auth(model.api_key.trim())
        .json(&serde_json::json!({
            "model": model.model.trim(),
            "temperature": 0.4,
            "messages": [
                {
                    "role": "system",
                    "content": "你是 SamImage 的中文 AI 图像提示词编辑器。只输出润色后的单段提示词，不要解释。"
                },
                {
                    "role": "user",
                    "content": format!(
                        "模式：{}\n风格：{}\n原始提示词：{}\n请补充主体、构图、光线、材质、色彩和用途，使其更适合图像生成。",
                        input.mode_label.trim(),
                        input.style.trim(),
                        input.prompt.trim()
                    )
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

fn local_text_polish(input: TextPolishInput, model_name: &str) -> TextPolishResult {
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
