use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::{
    api::model_profiles::{ModelCapability, ModelProfileDraft},
    app_state::AppState,
    db::model_profile_repo,
    domain::model_auth,
    error::{AppError, AppResult},
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolishPromptInput {
    pub prompt: String,
    pub workflow_id: Option<String>,
    pub model_profile: ModelProfileDraft,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolishPromptResponse {
    pub polished_prompt: String,
}

fn normalize_text_profile(mut profile: ModelProfileDraft) -> ModelProfileDraft {
    profile.id = profile.id.trim().to_string();
    profile.name = profile.name.trim().to_string();
    profile.provider = profile.provider.trim().to_string();
    profile.base_url = profile.base_url.trim().to_string();
    profile.api_key = profile.api_key.trim().to_string();
    profile.model = profile.model.trim().to_string();
    profile.chat_endpoint = profile.chat_endpoint.trim().to_string();
    profile.image_endpoint = profile.image_endpoint.trim().to_string();
    profile.models_endpoint = profile.models_endpoint.trim().to_string();
    profile
}

fn join_endpoint_url(base_url: &str, endpoint: &str) -> AppResult<String> {
    let base_url = base_url.trim().trim_end_matches('/');
    let endpoint = endpoint.trim().trim_start_matches('/');
    if base_url.is_empty() || endpoint.is_empty() {
        return Err(AppError::InvalidData(
            "请先配置文本模型的服务地址和对话接口路径".to_string(),
        ));
    }
    Ok(format!("{base_url}/{endpoint}"))
}

fn text_endpoint_url(profile: &ModelProfileDraft) -> AppResult<String> {
    let endpoint = if profile.chat_endpoint.trim().is_empty() {
        "/v1/chat/completions"
    } else {
        profile.chat_endpoint.as_str()
    };
    join_endpoint_url(profile.base_url.as_str(), endpoint)
}

fn collect_text_fragments(value: &Value, fragments: &mut Vec<String>) {
    match value {
        Value::String(text) => {
            let text = text.trim();
            if !text.is_empty() {
                fragments.push(text.to_string());
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_text_fragments(item, fragments);
            }
        }
        Value::Object(record) => {
            for key in ["text", "content", "output_text", "message", "response"] {
                if let Some(value) = record.get(key) {
                    collect_text_fragments(value, fragments);
                }
            }
        }
        _ => {}
    }
}

fn extract_polished_prompt(payload: &Value) -> Option<String> {
    if let Some(choices) = payload.get("choices").and_then(Value::as_array) {
        for choice in choices {
            if let Some(content) = choice
                .get("message")
                .and_then(|message| message.get("content"))
                .or_else(|| choice.get("text"))
            {
                let mut fragments = Vec::new();
                collect_text_fragments(content, &mut fragments);
                let text = fragments.join("\n").trim().to_string();
                if !text.is_empty() {
                    return Some(text);
                }
            }
        }
    }

    for key in ["output_text", "content", "text", "response"] {
        if let Some(value) = payload.get(key) {
            let mut fragments = Vec::new();
            collect_text_fragments(value, &mut fragments);
            let text = fragments.join("\n").trim().to_string();
            if !text.is_empty() {
                return Some(text);
            }
        }
    }

    None
}

fn extract_provider_error_message(payload: &Value) -> Option<String> {
    let value = payload
        .get("error")
        .and_then(|error| error.get("message").or_else(|| error.get("error")))
        .or_else(|| payload.get("message"))
        .or_else(|| payload.get("error_description"))
        .or_else(|| payload.get("detail"))?;

    let mut fragments = Vec::new();
    collect_text_fragments(value, &mut fragments);
    let message = fragments.join("\n").trim().to_string();
    if message.is_empty() {
        None
    } else {
        Some(message)
    }
}

fn compact_text(value: &str, max_chars: usize) -> String {
    let mut compacted = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if compacted.chars().count() > max_chars {
        compacted = compacted.chars().take(max_chars).collect::<String>();
        compacted.push_str("...");
    }
    compacted
}

fn format_text_model_http_error(status_code: u16, body: &str) -> String {
    let provider_message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|payload| extract_provider_error_message(&payload))
        .unwrap_or_else(|| compact_text(body, 240));

    if provider_message.is_empty() {
        format!("文本模型请求失败，HTTP {status_code}")
    } else {
        format!("文本模型请求失败，HTTP {status_code}: {provider_message}")
    }
}

fn prompt_polish_system_prompt() -> &'static str {
    "你是专业的中文提示词润色助手。你的任务是把用户给出的图像生成提示词改写得更清晰、具体、结构化，并保留原意。只输出润色后的提示词，不要解释，不要加前后缀，不要输出 JSON，不要输出 Markdown。"
}

fn build_polish_prompt_body(input: &PolishPromptInput) -> Value {
    let workflow_label = input
        .workflow_id
        .as_deref()
        .map(|workflow_id| match workflow_id {
            "daily" => "日常生图",
            "img2img" => "图生图",
            "icon" => "ICON 图标",
            "storyboard" => "电影分镜",
            "batch" => "批量生成",
            "compare" => "多模型对比",
            _ => "工作流",
        })
        .unwrap_or("工作流");

    let prompt = input.prompt.trim();
    json!({
        "model": input.model_profile.model.as_str(),
        "messages": [
            {
                "role": "system",
                "content": prompt_polish_system_prompt(),
            },
            {
                "role": "user",
                "content": format!(
                    "工作流：{workflow_label}\n原提示词：{prompt}\n\n请在不改变核心意图的前提下，润色成更适合图像生成的高质量提示词。"
                ),
            },
        ]
    })
}

#[tauri::command]
pub async fn polish_prompt(
    state: State<'_, AppState>,
    input: PolishPromptInput,
) -> AppResult<PolishPromptResponse> {
    let mut input = input;
    input.prompt = input.prompt.trim().to_string();
    if input.prompt.is_empty() {
        return Err(AppError::InvalidData("请输入要润色的提示词".to_string()));
    }

    let mut profile = normalize_text_profile(input.model_profile.clone());
    if profile.capability != ModelCapability::Text {
        return Err(AppError::InvalidData(
            "只能使用文本模型进行提示词润色".to_string(),
        ));
    }
    if profile.base_url.is_empty() {
        return Err(AppError::InvalidData(
            "请先配置文本模型的服务地址".to_string(),
        ));
    }
    if profile.model.is_empty() {
        return Err(AppError::InvalidData("请先配置文本模型名称".to_string()));
    }

    if profile.api_key.is_empty() && profile.has_api_key {
        profile.api_key =
            model_profile_repo::get_api_key_ref(&state.db, &profile.id, profile.capability)
                .await?
                .unwrap_or_default();
    }

    input.model_profile = profile.clone();
    let request = reqwest::Client::new()
        .post(text_endpoint_url(&profile)?)
        .header(CONTENT_TYPE, "application/json")
        .body(build_polish_prompt_body(&input).to_string());
    let request = match model_auth::first_api_key(&profile.api_key) {
        Some(api_key) => request.header(AUTHORIZATION, format!("Bearer {api_key}")),
        None => request,
    };

    let response = request.send().await?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::InvalidData(format_text_model_http_error(
            status.as_u16(),
            &body,
        )));
    }

    let body = response.text().await?;
    let payload: Value = serde_json::from_str(&body)?;
    let polished_prompt = extract_polished_prompt(&payload)
        .ok_or_else(|| AppError::InvalidData("文本模型响应中没有可识别的润色结果".to_string()))?;

    Ok(PolishPromptResponse { polished_prompt })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_profile() -> ModelProfileDraft {
        ModelProfileDraft {
            id: "text-profile".to_string(),
            capability: ModelCapability::Text,
            name: "文本模型".to_string(),
            provider: "custom".to_string(),
            base_url: "https://example.com".to_string(),
            api_key: String::new(),
            has_api_key: false,
            model: "gpt-4o-mini".to_string(),
            chat_endpoint: "/v1/chat/completions".to_string(),
            image_endpoint: String::new(),
            models_endpoint: "/v1/models".to_string(),
            enabled: true,
            is_default: false,
        }
    }

    #[test]
    fn extracts_polished_prompt_from_common_response_shapes() {
        let payload = json!({
            "choices": [
                {
                    "message": {
                        "content": "  优化后的提示词  "
                    }
                }
            ]
        });

        assert_eq!(
            extract_polished_prompt(&payload),
            Some("优化后的提示词".to_string())
        );
    }

    #[test]
    fn builds_openai_compatible_prompt_body() {
        let input = PolishPromptInput {
            prompt: "雨夜城市街道".to_string(),
            workflow_id: Some("storyboard".to_string()),
            model_profile: test_profile(),
        };

        let body = build_polish_prompt_body(&input);
        assert_eq!(body["model"], "gpt-4o-mini");
        assert!(body["messages"].is_array());
        assert!(body.to_string().contains("只输出润色后的提示词"));
    }

    #[test]
    fn keeps_polish_request_body_free_of_optional_sampling_parameters() {
        let input = PolishPromptInput {
            prompt: "雨夜城市街道".to_string(),
            workflow_id: Some("daily".to_string()),
            model_profile: test_profile(),
        };

        let body = build_polish_prompt_body(&input);
        assert!(body.get("temperature").is_none());
        assert!(body.get("top_p").is_none());
    }

    #[test]
    fn includes_provider_error_body_when_text_model_rejects_request() {
        let message = format_text_model_http_error(
            400,
            r#"{"error":{"message":"Unsupported parameter: temperature"}}"#,
        );

        assert!(message.contains("HTTP 400"));
        assert!(message.contains("Unsupported parameter: temperature"));
    }
}
