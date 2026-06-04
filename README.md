# SamImage 3.0

> 你的私人图像工厂 — 桌面级 AI 生图工作台，基于 Tauri 2 + Vue 3，所有数据本地存储。

SamImage 3.0 是一个面向创作者的本地 AI 图像工具，覆盖从提示词、模型管理、生图、修复、导出到资产归档的完整工作流。配置和资产都留在本机，隐私优先；只有在调用你配置的模型 API 时才联网。

## 系统截图

### 首页
![首页](docs/screenshots/home.png)

### 工作台
![工作台](docs/screenshots/workspace.png)

### 工具库
![工具库](docs/screenshots/tools.png)

### 资产库
![资产库](docs/screenshots/history.png)

### 操作记录
![操作记录](docs/screenshots/operations.png)

### 设置 - 模型配置
![设置-模型配置](docs/screenshots/settings-models.png)

### 关于帮助
![关于帮助](docs/screenshots/about.png)

> 截图采集：`node scripts/capture-screenshots.cjs`（需要先启动 `npm run dev`）

## 核心特性

### 🎨 工作台
- **6 种生成模式**：文生图 / 图生图 / 封面图 / ICON / 3D 图 / GIF 动图
- **18 个工具**（生成 / 设计 / 修复 / 人像四大分组），工具选择决定提示词种子、控件集、推荐尺寸、参考图规则
- **工具感知渲染**：每个工具自动适配专属参数控件（边缘羽化、证件照规格、像素块、调色板…）和后处理流水线（圆角、圆形裁切、背景填色、像素化、调色板…）
- **协议自适应**：自动适配 OpenAI 通用 / Anthropic / 通义万相 / 芒果 AIGC 等多协议
- **GIF 真合成**：后端返回静态主图，前端按帧率/时长/循环方式用 Ken Burns 缩放或多图淡入合成真动图
- **3D 风格参考**：5 种预设（精细石雕 / 科幻装甲 / 蒸汽朋克 / 白瓷镂刻 / 潮流手办）
- **中文→英文自动翻译** 可关闭（节省 token）

### 📚 工具库
- 按"生成 / 设计 / 修复 / 人像"4 组分类展示
- 21+ 工具条目（3D 风格 / 封面预设 / 9 种 ICON 尺寸）
- 自定义封面预设

### 🖼 资产库（按"批次"分组）
- 每一次生成任务 = 一个"批次"，卡片以"批次"为粒度浏览
- 8 项统计：总生成 / 今日生成 / 已收藏
- 4 种排序：最新 / 最早 / 按模型
- 5 种类型筛选：全部 / 文生图 / 图生图 / 封面 / ICON / 3D / GIF
- **单图级别收藏**（修复"整批连动"bug）
- **"只看收藏"过滤**：开启后只展示被收藏的图，按橙色高亮
- 详情模态框：参数回显 + 滤镜预览 + 调整后导出 + 复用提示词
- 4 种导出格式：SVG / PNG / JPG / WEBP / GIF / ICO

### 🗂 操作记录
- 包含成功 + 失败的全部历史任务
- 失败任务可一键"失败重新生成"，自动回填参数

### ⚙️ 设置
- **模型配置**
  - 支持图像 / 文本 / 语音（TTS）三类模型
  - **自动类型推断**：从 `/v1/models` 拉取时，后端根据关键字（image/tts/text 关键词集）自动标记每个模型类型
  - **类型防护**：选择与当前配置类型不兼容的模型时，"确认选择"按钮自动禁用并显示原因
  - 协议自适配：拉取模型列表后根据类型自动填入对应 API 路径
  - 单独配置主图像 / 主文本 / 主语音模型
  - 检测连接
- **Prompts 市场**
  - 导入 / 同步 / 导出 JSON
  - 支持从开源仓库同步（glidea / EvoLinkAI / freestylefly）
  - 按来源 / 分类 / 关键字筛选
- **生成参数**：默认风格、默认输出目录、自动保存、提示词元数据等
- **系统设置**：默认输出目录、默认导出格式
- **快捷键**：内置 / 工作台 / 资产库快捷键文档

### 📐 ICON 工作流
- 生成 1024×1024 母图（不依赖原图大小）
- 导出时选 1-N 个尺寸，每个尺寸导出为**独立 ICO 文件**：`项目名_16x16.ico`、`项目名_64x64.ico`…
- 全部打包为 1 个 ZIP，文件名可自定义（默认时间戳格式 `icon-YYYYMMDD-HHmmss`）
- 也可单独导出 PNG 母图

### 🛡 隐私与本地优先
- 所有配置、提示词和资产库记录默认保存在本机
- API Key 保存在本地，仅在调用模型 API 时联网
- 不收集任何用户数据

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面运行时 | Tauri 2.x (Rust + WebView) |
| 前端 | Vue 3 + TypeScript + Vite |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| 图标 | lucide-vue-next |
| Canvas 处理 | 原生 Canvas 2D（像素化 / 圆角 / 圆形裁切 / 调色板 / 重采样） |
| 图像协议 | OpenAI / Anthropic / 通义万相 / 芒果 AIGC / 多模态 Chat |
| TTS 协议 | OpenAI Audio Speech (`/v1/audio/speech`) |
| 后端 HTTP | reqwest 0.12 |
| 数据库 | SQLite (sqlx) + 浏览器 localStorage 双层 |
| 测试 | Vitest (单元 / 集成) + Playwright (E2E) |
| 代码规范 | ESLint + TypeScript |
| CI/CD | GitHub Actions (Windows / macOS / Linux 三平台) |

## 快速开始

### 开发环境
- Node.js 20+
- Rust stable toolchain
- Tauri 2 依赖（参考 https://tauri.app/start/prerequisites/）

### 安装与运行
```bash
# 1. 安装依赖
npm install

# 2. 启动 Web 预览（仅前端，不能生成真实图片）
npm run dev
# 访问 http://127.0.0.1:3030

# 3. 启动 Tauri 桌面版（推荐）
npm run tauri:dev
```

### 代码检查
```bash
# 单元测试 + 集成测试 + Rust 测试 + Lint + 类型检查 + 构建
npm run check
```

### 完整发布检查
```bash
# 在 check 基础上再跑 E2E + 桌面版构建
npm run check:release
```

## 支持的生图大模型

SamImage 3.0 通过「协议自适应」层与主流生图大模型对接。在设置 → 模型配置 → 新增模型时，只需把上游 BASE_URL 指向模型提供方（或中转站）并填入模型 ID，App 会按所选协议自动拼接正确的端点路径与请求体格式。

### 协议到端点的映射

| App 内协议 | HTTP 端点 | 请求体关键字段 | 适用模型 |
|---|---|---|---|
| `openai-images`（默认） | `POST {BASE}/v1/images/generations` | `model` / `prompt` / `n` / `size` | GPT-Image-2、DALL-E 3、Grok Imagen、SD via relay、Flux via relay 等所有 OpenAI 兼容模型 |
| `openai-image-edits` | `POST {BASE}/v1/images/edits`（multipart） | `image`（参考图） / `prompt` / `mask` | GPT-Image-2 改图、参考图重绘等场景 |
| `dashscope-wanxiang` | `POST {BASE}/api/v1/services/aigc/multimodal-generation/generation` | `input.messages` / `parameters.size` | 阿里云通义 Wanxiang 文生图 / 文生图2.0 |
| `multimodal-chat` | `POST {BASE}/v1/chat/completions` | `messages[].content`（多模态） | Qwen-VL、GPT-4o、Claude 等支持多模态 Chat 的模型 |
| `mgtv-storyboard` | `POST {BASE}/openapi/v1/storyboard/generateByPromptV2` | `styleId` / `resolution` / `ratio` | 芒果 AIGC 分镜生图 |
| `openai-audio-speech` | `POST {BASE}/v1/audio/speech` | `model` / `input` / `voice` | OpenAI TTS 系列（tts-1、tts-1-hd、gpt-4o-mini-tts） |

> 后端代码：`src-tauri/src/generation.rs` 中每个 `create_*_generation` 函数对应一个协议；`src-tauri/src/commands.rs` 的 `infer_catalog_model_kind` 通过关键字集合自动判定每个模型的种类（图像 / 文本 / 语音）。

### 主流模型配置示例

下面给出在 SamImage 中对接各模型时推荐的协议与参数（具体能否用取决于上游服务商是否提供该接口）。

#### 1. OpenAI GPT-Image 系列（DALL-E 3、GPT-Image-1、GPT-Image-2）

- **官方地址**：`https://api.openai.com`
- **协议**：`openai-images`
- **路径**：`v1/images/generations`
- **模型 ID**：`dall-e-3` / `gpt-image-1` / `dall-e-2` / `gpt-image-2`（gpt-image-2 在官方 GA 后可用）
- **请求体**：
  ```json
  {
    "model": "gpt-image-1",
    "prompt": "一只赛博朋克猫咪",
    "n": 4,
    "size": "1024x1024"
  }
  ```
- **响应**：`{ "data": [{ "b64_json": "..." }, ...] }`
- **SamImage 处理**：`src-tauri/src/generation.rs::create_openai_images_generation` 解码 `b64_json` 并打包成 `GeneratedAsset`。
- **Size 限制**：App 内会校验 `input.width` / `input.height` 必须在 16–4096 之间，DALL-E 3 仅支持 1024² / 1024×1792 / 1792×1024 几个固定值。

#### 2. xAI Grok Imagine

- **官方地址**：`https://api.x.ai`
- **协议**：`openai-images`（Grok 的图像端点完全兼容 OpenAI 格式）
- **路径**：`v1/images/generations`
- **模型 ID**：`grok-2-image-1212` / `grok-imagine-0`
- **说明**：与 OpenAI 完全一致，无需特殊配置；App 推断时根据 ID 包含 `grok` 可能落入 `unknown` 类别，但用户可在「获取模型」弹窗中确认类型后强行使用。
- **SamImage 处理**：与 GPT-Image 走同一个 `create_openai_images_generation` 路径。

#### 3. 阿里云通义 Wanxiang（Qwen-Image）

- **官方地址**：`https://dashscope.aliyuncs.com`
- **协议**：`dashscope-wanxiang`（专有协议，需要用 DashScope 的 `multimodal-generation` 端点而非 OpenAI 格式）
- **路径**：`api/v1/services/aigc/multimodal-generation/generation`
- **模型 ID**：`qwen-image-plus` / `qwen-image` / `wanx2.1-t2i-turbo` / `wanx2.1-t2i-plus`
- **请求体**：
  ```json
  {
    "model": "qwen-image-plus",
    "input": { "messages": [{ "role": "user", "content": [{ "text": "提示词" }] }] },
    "parameters": { "n": 4, "size": "1024*1024", "negative_prompt": "低质量" }
  }
  ```
- **注意**：尺寸字段用 `*` 而非 `x`（`1024*1024`），App 在 `create_dashscope_wanxiang_generation` 中已自动转换。
- **响应**：`output.choices[].message.content[].image` 是 dataUrl。

#### 4. Midjourney

- **官方状态**：Midjourney 至今**没有官方公开 API**。Discord 机器人是唯一官方入口。
- **可用中转**：
  - `https://api.goapi.ai/mj/v2`（GoAPI，OpenAI 格式代理）
  - `https://api.useapi.net`（UseAPI）
  - 部分自建 one-api / new-api 代理
- **协议**：`openai-images`（中转站封装后兼容 OpenAI 格式）
- **路径**：`v1/images/generations`（按中转站）
- **模型 ID**（不同中转站可能不同）：
  - GoAPI：`midjourney` / `midjourney-v6` / `midjourney-v6.1` / `niji`
  - 通用：`midjourney`
- **注意**：
  - 中转站通常不返回 `b64_json` 而是返回 `url`，App 的 `resolve_openai_images_payload` 会自动识别 `url` 字段并下载图片到 base64。
  - Midjourney 不支持 `size` 字段（宽高比通过 `--ar` 参数），App 走 `multimodal-chat` 协议或中转站专属协议更合适。

#### 5. Stable Diffusion（Stability AI）

- **官方地址**：`https://api.stability.ai`
- **协议**：`openai-image-edits`（multipart） 或 Stability 私有协议
- **路径**：
  - SD 3.5 / SDXL：`POST /v2beta/stable-image/generate/sd3` 或 `/v2beta/stable-image/generate/core`
  - 图生图：`POST /v2beta/stable-image/edit`
- **模型 ID**：`sd3.5-large` / `sd3.5-large-turbo` / `sd3.5-medium` / `stable-diffusion-xl-1024-v1-0` / `stable-image-core`
- **SamImage 兼容方案**：
  - 用 OpenAI 格式中转（如 `https://api.stability.ai/v1` 启用 OpenAI 兼容模式）→ 走 `openai-images`
  - 直接对接 Stability 原生 API → 需要扩展 `api_protocol` 联合（当前为 `openai-images` / `openai-image-edits` / `dashscope-wanxiang` / `mgtv-storyboard` / `multimodal-chat`）
- **推荐**：使用 one-api / new-api 中转，统一 OpenAI 格式后用 `openai-images` 协议对接。

#### 6. DALL-E 系列（已并入 OpenAI）

- **DALL-E 3**：见 OpenAI 章节，`model: "dall-e-3"`
- **DALL-E 2**：同上，`model: "dall-e-2"`，支持的尺寸更少（256² / 512² / 1024²）
- **DALL-E 1**：官方已弃用，建议不要使用

### 通过中转站对接任意 OpenAI 兼容模型

国内网络环境推荐使用 OpenAI 兼容中转，例如：

| 中转站 | BASE_URL 示例 | 特点 |
|---|---|---|
| one-api / new-api（自建） | `https://your-relay.example.com` | 自托管，最稳定 |
| freeapi.dgbmc.top | `https://freeapi.dgbmc.top` | 国内访问快 |
| API2D | `https://api.api2d.net` | 支持 GPT-Image-2、Grok、SD、Midjourney 等 |

在 SamImage 设置中：
1. 选择「OpenAI 通用标准」或「OpenAI Images」协议
2. BASE_URL 填入中转站地址
3. 模型 ID 填中转站支持的模型名
4. 点击「获取模型」会自动列出中转站 `/v1/models` 返回的所有模型
5. 每个模型旁边会自动显示推断的种类（图像/文本/语音）
6. 选择与当前「类型」不兼容的模型时，确认按钮会被禁用

### 多模态 Chat 协议生图

部分图像模型（GPT-4o、Claude 3.5 Sonnet、Qwen-VL、Step-1V）走的是 Chat Completions 端点，返回的是 `messages[].content[].image` 而非 `b64_json`。在 SamImage 中选择 `multimodal-chat` 协议：

- **路径**：`v1/chat/completions`
- **请求体**：
  ```json
  {
    "model": "gpt-4o",
    "messages": [{ "role": "user", "content": [
      { "type": "text", "text": "提示词" }
    ]}],
    "n": 1
  }
  ```
- **后端**：`create_multimodal_chat_generation` 从响应中提取 `content[].image` dataUrl。
- **应用**：如果上游模型支持图像生成（如 GPT-4o image preview），结果会直接显示。

### 调试与验证

1. **检测连接**：保存模型后点击「检测连接」按钮，App 会发出真实请求并显示成功 / 失败原因。
2. **获取模型列表**：从上游拉取真实模型清单，App 自动按关键字（`gpt / dalle / image / tts / speech / eleven` 等）推断每个模型的种类。
3. **类型防护**：选择与当前配置的「类型」不兼容的模型时，「确认选择」按钮自动禁用。
4. **降级路径**：如果模型在 `/v1/models` 接口中没返回，App 会显示「接口未返回模型」，可手动填写模型 ID。

### 发布新版本
```bash
# 1. 修改 src-tauri/tauri.conf.json 的 version
# 2. 提交并推送
git add . && git commit -m "chore: bump version"
git push
# 3. 创建 tag
git tag v3.0.1
git push origin v3.0.1
# 4. GitHub Actions 自动构建 3 平台并创建 draft release
```

## 项目结构

```
.
├── src/
│   ├── pages/                  # 路由页面
│   │   ├── HomePage.vue
│   │   ├── WorkspacePage.vue   # 工作台
│   │   ├── ToolsPage.vue       # 工具库
│   │   ├── HistoryPage.vue     # 资产库
│   │   ├── OperationHistoryPage.vue
│   │   ├── SettingsPage.vue
│   │   └── AboutPage.vue
│   ├── components/             # 共享组件
│   ├── stores/app.ts           # Pinia store（模型 / 任务 / 设置 / 提示词）
│   ├── domain/                 # 业务逻辑
│   │   ├── canvas.ts           # Canvas 工具
│   │   ├── postprocess.ts      # 后处理流水线
│   │   ├── tools.ts            # 工具效果解析（路由表）
│   │   ├── language.ts         # 中英文检测
│   │   ├── promptImport.ts     # 提示词导入 / 同步
│   │   ├── generation.ts       # 资产生成领域
│   │   └── zip.ts              # ZIP 打包
│   ├── data/catalog.ts         # 工具 / 模型 / 预设配置
│   ├── router.ts
│   ├── components/AppShell.vue
│   └── main.ts
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands.rs         # Tauri 命令（生图 / 提示词润色 / 模型列表 / 资产导出）
│   │   ├── generation.rs       # 图像生成协议分发
│   │   ├── text.rs             # 文本润色 + 翻译
│   │   ├── api_endpoint.rs     # BASE_URL + 路径拼接
│   │   ├── state.rs            # SQLite 持久化
│   │   └── error.rs
│   ├── tests/                  # 集成测试
│   └── tauri.conf.json
├── tests/e2e/smoke.spec.ts     # Playwright E2E
├── scripts/
│   ├── cargo-cli.cjs
│   ├── tauri-cli.cjs
│   └── capture-screenshots.cjs # 系统截图采集
├── .github/workflows/
│   ├── ci.yml                 # push/PR 跑 lint + test + build
│   └── release.yml            # tag push 跑多平台构建并发布
└── docs/
    ├── 技术文档.md
    └── screenshots/
        ├── home.png
        ├── workspace.png
        ├── tools.png
        ├── history.png
        ├── operations.png
        ├── settings-models.png
        └── about.png
```

## 工具库 / 工作台联动

工具库中的 18 个工具是工作台行为的事实来源。`src/data/catalog.ts` 的 `ToolEntry` 定义：

- `mode`：决定工作台默认加载哪种生成模式
- `promptSeed`：选中工具时填入正向提示词
- `negativeSeed`：填入反向提示词
- `recommendedSize`：选中工具时设置工作台尺寸
- `extraControls`：在右侧"工具参数"块动态渲染（range / select / chips 三种类型）
- `promptFragment`：非默认值的控件会被拼入英文生成提示词
- `referenceRequired`：是否要求上传参考图
- `tips`：在底部"使用提示"块展示

`src/domain/tools.ts` 的 `CONTROL_EFFECT_BY_KEY` 路由表决定每个控件 key 的作用分类：
- `prompt`：拼入英文提示词
- `postprocess`：调用 Canvas 后处理算子（圆角 / 圆形裁切 / 背景填色 / 像素化 / 调色板 / 重采样）
- `dimension`：覆盖输出尺寸（如证件照规格）
- `note`：仅显示诚实提示（"效果取决于模型"等）

## 数据持久化

| 数据 | 存储 |
|---|---|
| 模型 / 提示词 / 任务 / 封面预设 / 设置 | 浏览器 localStorage（key: `samimage.v3.state`） |
| 任务（含 dataUrl） | Tauri 后端 SQLite (`samimage-v3.sqlite3`) |
| 生成的图片（带 localPath） | 设置中的默认输出目录 |

## 测试

| 范围 | 命令 | 数量 |
|---|---|---|
| 前端单元 / 集成 | `npm run test` | 300+ 测试 / 1350 文件 |
| Rust 单元 / 集成 | `npm run test:rust` | 143+ 测试 / 24 suites |
| E2E（Playwright） | `npm run test:e2e` | smoke.spec.ts |

## 许可与隐私

- 项目不收集任何用户数据
- API Key 保存在本地（localStorage + SQLite）
- 配置、提示词和资产库记录不会上传到任何服务器
- 仅在生成图像时才会向你配置的模型 API 发送请求

## 致谢

- Tauri 团队
- 所有开源协议提供者（OpenAI、Anthropic、阿里云通义万相、芒果 AIGC）
- [glidea/banana-prompt-quicker](https://github.com/glidea/banana-prompt-quicker)、[EvoLinkAI/awesome-gpt-image-2-API-and-Prompts](https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts)、[freestylefly/awesome-gpt-image-2](https://github.com/freestylefly/awesome-gpt-image-2) — 提示词市场同步源
