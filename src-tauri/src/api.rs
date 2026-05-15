use crate::adapters;
use crate::db;
use crate::models::{
    AdapterInfo, Artifact, GenerationRequest, ModelListRequest, ModelListResult, ModelProfile,
    IconfontSearchItem, ModelValidationRequest, ModelValidationResult, PolishRequest, PolishResult,
    PromptTemplate,
};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Json, Router};
use chrono::Utc;
use reqwest::Client;
use rusqlite::Connection;
use serde::Deserialize;
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Clone)]
pub struct ApiState {
    pub db: Arc<Mutex<Connection>>,
}

pub fn router(conn: Connection) -> Router {
    let state = Arc::new(ApiState {
        db: Arc::new(Mutex::new(conn)),
    });

    Router::new()
        .route("/api/health", axum::routing::get(health))
        .route("/api/adapters", axum::routing::get(list_adapters))
        .route(
            "/api/profiles",
            axum::routing::get(list_profiles).post(save_profile),
        )
        .route("/api/profiles/:id", axum::routing::delete(delete_profile))
        .route("/api/models/validate", axum::routing::post(validate_model))
        .route("/api/models/list", axum::routing::post(list_models))
        .route(
            "/api/prompt-templates",
            axum::routing::get(list_prompt_templates).post(save_prompt_template),
        )
        .route(
            "/api/prompt-templates/:id",
            axum::routing::delete(delete_prompt_template),
        )
        .route("/api/iconfont/search", axum::routing::get(search_iconfont))
        .route(
            "/api/generations",
            axum::routing::get(list_artifacts).post(create_generation),
        )
        .route("/api/generations/:id", axum::routing::delete(delete_artifact))
        .route("/api/polish", axum::routing::post(polish_prompt))
        .with_state(state)
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: "BAD_REQUEST",
            message: message.into(),
        }
    }

    fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: "NOT_FOUND",
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "INTERNAL_ERROR",
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Json(json!({
            "error": {
                "code": self.code,
                "message": self.message
            }
        }));
        (self.status, body).into_response()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    ok: bool,
    service: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "samimage-api",
    })
}

async fn list_adapters() -> Json<Vec<AdapterInfo>> {
    Json(adapters::all_infos())
}

async fn list_profiles(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<Vec<ModelProfile>>, ApiError> {
    let conn = lock_db(&state)?;
    db::list_profiles(&conn)
        .map(Json)
        .map_err(|err| ApiError::internal(format!("读取配置失败: {err}")))
}

async fn save_profile(
    State(state): State<Arc<ApiState>>,
    Json(mut profile): Json<ModelProfile>,
) -> Result<Json<ModelProfile>, ApiError> {
    if profile.id.trim().is_empty() {
        profile.id = Uuid::new_v4().to_string();
    }
    adapters::validate_profile_shape(&profile)
        .map_err(|err| ApiError::bad_request(format!("配置校验失败: {err}")))?;

    let conn = lock_db(&state)?;
    db::upsert_profile(&conn, &profile)
        .map(Json)
        .map_err(|err| ApiError::internal(format!("保存配置失败: {err}")))
}

async fn delete_profile(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let conn = lock_db(&state)?;
    db::delete_profile(&conn, &id)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|err| ApiError::not_found(format!("删除配置失败: {err}")))
}

async fn validate_model(
    Json(request): Json<ModelValidationRequest>,
) -> Result<Json<ModelValidationResult>, ApiError> {
    adapters::validate_model(&request.profile, request.network_check)
        .await
        .map(Json)
        .map_err(|err| ApiError::bad_request(err.to_string()))
}

async fn list_models(
    Json(request): Json<ModelListRequest>,
) -> Result<Json<ModelListResult>, ApiError> {
    adapters::list_models(&request.profile)
        .await
        .map(Json)
        .map_err(|err| ApiError::bad_request(err.to_string()))
}

async fn list_prompt_templates(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<Vec<PromptTemplate>>, ApiError> {
    let conn = lock_db(&state)?;
    db::list_prompt_templates(&conn)
        .map(Json)
        .map_err(|err| ApiError::internal(format!("读取提示词模板失败: {err}")))
}

async fn save_prompt_template(
    State(state): State<Arc<ApiState>>,
    Json(mut template): Json<PromptTemplate>,
) -> Result<Json<PromptTemplate>, ApiError> {
    if template.id.trim().is_empty() {
        template.id = Uuid::new_v4().to_string();
        template.is_builtin = false;
    }
    if template.title.trim().is_empty() {
        return Err(ApiError::bad_request("模板名称不能为空"));
    }
    if template.prompt.trim().is_empty() {
        return Err(ApiError::bad_request("提示词内容不能为空"));
    }
    if template.category.trim().is_empty() {
        template.category = "通用".to_string();
    }
    template.title = template.title.trim().to_string();
    template.prompt = template.prompt.trim().to_string();
    template.category = template.category.trim().to_string();

    let conn = lock_db(&state)?;
    db::upsert_prompt_template(&conn, &template)
        .map(Json)
        .map_err(|err| ApiError::internal(format!("保存提示词模板失败: {err}")))
}

async fn delete_prompt_template(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let conn = lock_db(&state)?;
    db::delete_prompt_template(&conn, &id)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|err| ApiError::internal(format!("删除提示词模板失败: {err}")))
}
#[derive(Debug, Deserialize)]
struct IconfontSearchQuery {
    q: String,
}

#[derive(Debug, Deserialize)]
struct IconfontSuggestResponse {
    code: i32,
    data: IconfontSuggestData,
}

#[derive(Debug, Deserialize)]
struct IconfontSuggestData {
    #[serde(default)]
    icons: Vec<IconfontSuggestIcon>,
}

#[derive(Debug, Deserialize)]
struct IconfontSuggestIcon {
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    font_class: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IconifySearchResponse {
    #[serde(default)]
    icons: Vec<String>,
}

async fn search_iconfont(
    axum::extract::Query(query): axum::extract::Query<IconfontSearchQuery>,
) -> Result<Json<Vec<IconfontSearchItem>>, ApiError> {
    let keyword = query.q.trim();
    if keyword.is_empty() {
        return Ok(Json(Vec::new()));
    }

    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36")
        .build()
        .map_err(|err| ApiError::internal(format!("初始化图标搜索客户端失败: {err}")))?;

    let suggest = client
        .get("https://www.iconfont.cn/api/common/suggest.json")
        .query(&[("q", keyword), ("type", "icon")])
        .send()
        .await
        .map_err(|err| ApiError::internal(format!("请求 iconfont 建议失败: {err}")))?;

    let payload: IconfontSuggestResponse = suggest
        .json()
        .await
        .map_err(|err| ApiError::internal(format!("解析 iconfont 建议失败: {err}")))?;

    if payload.code != 200 {
        return Err(ApiError::bad_request("iconfont 搜索暂不可用"));
    }

    let mut items: Vec<IconfontSearchItem> = payload
        .data
        .icons
        .into_iter()
        .filter_map(|icon| {
            let name = icon.name.or(icon.font_class)?;
            let id = icon.id.map(|value| value.to_string()).unwrap_or_else(|| name.clone());
            Some(IconfontSearchItem {
                id,
                name,
                author: Some("iconfont".to_string()),
                svg_url: None,
                origin_url: format!(
                    "https://www.iconfont.cn/search/index?searchType=icon&q={}",
                    urlencoding::encode(keyword)
                ),
                preview_svg: None,
                source: "iconfont".to_string(),
            })
        })
        .take(24)
        .collect();

    let iconify = client
        .get("https://api.iconify.design/search")
        .query(&[("query", keyword), ("limit", "16")])
        .send()
        .await
        .map_err(|err| ApiError::internal(format!("请求 Iconify 搜索失败: {err}")))?;

    let iconify_payload: IconifySearchResponse = iconify
        .json()
        .await
        .map_err(|err| ApiError::internal(format!("解析 Iconify 搜索失败: {err}")))?;

    items.extend(iconify_payload.icons.into_iter().take(16).map(|icon| {
        let svg_url = icon
            .split_once(':')
            .map(|(set, name)| format!("https://api.iconify.design/{set}/{name}.svg"));
        IconfontSearchItem {
            id: format!("iconify-{icon}"),
            name: icon.clone(),
            author: Some("Iconify".to_string()),
            svg_url,
            origin_url: format!(
                "https://icon-sets.iconify.design/search/?query={}",
                urlencoding::encode(keyword)
            ),
            preview_svg: None,
            source: "iconify".to_string(),
        }
    }));

    if items.is_empty() {
        items.push(IconfontSearchItem {
            id: format!("manual-{keyword}"),
            name: keyword.to_string(),
            author: Some("iconfont".to_string()),
            svg_url: None,
            origin_url: format!(
                "https://www.iconfont.cn/search/index?searchType=icon&q={}",
                urlencoding::encode(keyword)
            ),
            preview_svg: None,
            source: "manual".to_string(),
        });
    }

    Ok(Json(items))
}
async fn create_generation(
    State(state): State<Arc<ApiState>>,
    Json(request): Json<GenerationRequest>,
) -> Result<Json<Artifact>, ApiError> {
    if request.prompt.trim().is_empty() {
        return Err(ApiError::bad_request("提示词不能为空"));
    }

    let profile = {
        let conn = lock_db(&state)?;
        db::get_profile(&conn, &request.profile_id)
            .map_err(|err| ApiError::not_found(format!("配置不存在: {err}")))?
    };

    let image_url = adapters::generate(&profile, &request)
        .await
        .map_err(|err| ApiError::bad_request(format!("生成失败: {err}")))?;

    let artifact = Artifact {
        id: Uuid::new_v4().to_string(),
        profile_id: request.profile_id,
        mode: request.mode,
        prompt: request.prompt,
        image_url,
        source: request.source,
        type_: request.type_,
        created_at: Utc::now().to_rfc3339(),
    };

    let conn = lock_db(&state)?;
    db::insert_artifact(&conn, &artifact)
        .map(Json)
        .map_err(|err| ApiError::internal(format!("保存作品失败: {err}")))
}

async fn list_artifacts(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<Vec<Artifact>>, ApiError> {
    let conn = lock_db(&state)?;
    db::list_artifacts(&conn)
        .map(Json)
        .map_err(|err| ApiError::internal(format!("读取作品失败: {err}")))
}

async fn delete_artifact(
    State(state): State<Arc<ApiState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let conn = lock_db(&state)?;
    db::delete_artifact(&conn, &id)
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|err| ApiError::internal(format!("删除作品失败: {err}")))
}

const GLM_API_URL: &str = "https://open.bigmodel.cn/api/paas/v4";
const GLM_MODEL: &str = "glm-4.5-flash";

fn glm_api_key() -> String {
    let encrypted: [u8; 49] = [99,5,92,127,15,7,81,81,30,0,86,83,0,76,53,4,1,68,86,65,17,36,16,102,3,14,43,90,86,95,92,29,28,3,65,76,119,7,50,45,25,22,44,110,50,116,101,5,95];
    let passphrase = b"SamImage-2024-Secret!@#";
    encrypted
        .iter()
        .enumerate()
        .map(|(i, &b)| (b ^ passphrase[i % passphrase.len()]) as char)
        .collect()
}

async fn polish_prompt(
    Json(request): Json<PolishRequest>,
) -> Result<Json<PolishResult>, ApiError> {
    let text = request.text.trim().to_string();
    if text.is_empty() {
        return Err(ApiError::bad_request("提示词不能为空"));
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|err| ApiError::internal(format!("初始化客户端失败: {err}")))?;

    let system_prompt = r#"你是一位专业的 AI 图像提示词工程师，负责把用户输入的简短想法润色成可直接用于 AI 生图的中文提示词。

你的方法论基于「五层拆解法」，但最终只输出一段完整中文提示词，不输出标题、解释、Markdown、列表或英文。

【核心原则】
1. 画面先行：先明确主题、场景、主体、动作与整体画面。
2. 五层拆解：整体基调 → 质感材质 → 笔触细节 → 构图规则 → 文字系统（仅在需要文字时）。
3. 正向为主：重点描述想要的画面，不大量堆砌负面词。
4. 抽象词具象化：把「高级」「好看」「治愈」「科技感」等抽象词转化为可见的光线、材质、色彩、布局、镜头语言。
5. 参照物锚定：当用户提到某种风格时，补充合理的视觉参照、材质和色彩特征。

【润色时必须覆盖】
- 画面介绍：主体是什么、在哪里、正在发生什么。
- 整体基调：具体风格与情绪氛围。
- 质感材质：介质、工艺、肌理、表面反光或颗粒感。
- 笔触细节：线条、色彩分布、明暗关系。
- 构图规则：景别、镜头角度、视觉重心、画面比例倾向、空间层次。
- 画质描述：高清、细节丰富、干净背景、专业摄影/插画/渲染质量等。
- 文字系统：仅当用户明确需要信息图、海报、卡片、logo、标题文字时，才描述字体、层级与排版；否则不要主动加入文字。

【风格预设知识库】
- 童趣涂鸦：蜡笔/彩色铅笔在粗糙画纸上的手绘感，粗拙歪扭轮廓线，高饱和基础色，儿童绘本氛围。
- 极简现代：哑光纸面或干净平面渲染，大量留白，几何构图，1-2 种主题色，严格对齐。
- 复古胶片：胶片颗粒、轻微暗角、漏光、暖色调、低饱和、生活化抓拍感，Kodak Gold 200 氛围。
- 日系插画：柔和粉彩色、透明水彩或干净数字扁平插画、细线条、舒适留白、治愈氛围。
- 赛博朋克：深黑/深蓝底色，霓虹品红、电光蓝、酸性绿，金属与雨水反射，强透视、高信息密度。
- 学术信息图：白色或浅灰底，统一线性图标，清晰网格系统，箭头/连线引导，标题与正文层级明确。

【输出要求】
- 只输出润色后的中文生图提示词，一段即可。
- 保持用户原意，不要添加与需求冲突的主体或用途。
- 如果用户输入很短，要主动补全合理细节。
- 输出应完整，不要截断，不要用省略号。
- 不要输出英文提示词，不要输出 Midjourney/DALL-E/Stable Diffusion 分栏。
"#;

    let body = json!({
        "model": GLM_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [{"type": "text", "text": format!("请基于 image-prompt-generator 的五层拆解法，润色以下生图提示词，并只返回一段完整中文提示词：\n\n{text}")}]}
        ],
        "temperature": 0.65,
        "max_tokens": 1800,
        "stream": false
    });

    let response = client
        .post(format!("{GLM_API_URL}/chat/completions"))
        .header("Authorization", format!("Bearer {}", glm_api_key()))
        .json(&body)
        .send()
        .await
        .map_err(|err| ApiError::bad_request(format!("请求智谱API失败: {err}")))?;

    let status = response.status();
    if !status.is_success() {
        let text_body = response.text().await.unwrap_or_default();
        return Err(ApiError::bad_request(format!(
            "智谱API返回错误 ({}): {}",
            status,
            text_body.chars().take(200).collect::<String>()
        )));
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|err| ApiError::internal(format!("解析智谱API响应失败: {err}")))?;

    let polished = extract_content(&payload);

    if polished.is_empty() {
        return Err(ApiError::bad_request(format!(
            "智谱API返回了空的润色结果: {}",
            payload.to_string().chars().take(500).collect::<String>()
        )));
    }

    Ok(Json(PolishResult { polished }))
}

fn extract_content(payload: &Value) -> String {
    let choice = &payload["choices"][0]["message"];
    match &choice["content"] {
        Value::String(s) => s.trim().to_string(),
        Value::Array(arr) => {
            let mut parts = Vec::new();
            for part in arr {
                if let Some(t) = part.get("text").and_then(Value::as_str) {
                    let trimmed = t.trim();
                    if !trimmed.is_empty() {
                        parts.push(trimmed.to_string());
                    }
                } else if let Some(t) = part.get("content").and_then(Value::as_str) {
                    let trimmed = t.trim();
                    if !trimmed.is_empty() {
                        parts.push(trimmed.to_string());
                    }
                }
            }
            parts.join("")
        }
        Value::Object(map) => map
            .get("text")
            .and_then(Value::as_str)
            .map(|s| s.trim().to_string())
            .unwrap_or_default(),
        _ => String::new(),
    }
}

fn lock_db(state: &ApiState) -> Result<std::sync::MutexGuard<'_, Connection>, ApiError> {
    state
        .db
        .lock()
        .map_err(|_| ApiError::internal("数据库连接已被异常锁定"))
}
