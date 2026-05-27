# SamImage 2.0 升级重构设计

日期：2026-05-22

## 1. 定位与目标

SamImage 2.0 定位为一个方便日常使用的 AI 生图工具。默认入口服务高频生图，同时把 ICON、电影分镜、批量生成、多模型对比作为同一创作内核上的高级工作流模板。

2.0 采用完整性重构，不继续在 1.x 的大单体结构上堆功能。当前 1.x 的主要风险包括：

- `src/App.vue` 接近 4000 行，页面、状态、业务逻辑和导出逻辑混杂。
- `src-tauri/src/api.rs` 与 `src-tauri/src/db.rs` 均超过 1000 行，路由、校验、业务编排和 SQL 访问耦合。
- 前端 `types.ts` 与 Rust `models.rs` 已出现字段不一致。
- `db_storyboard.rs` 存在但未在 `lib.rs` 注册，同时 `db.rs` 内也包含分镜 CRUD，说明后端模块边界已经混乱。

2.0 的核心目标：

- 建立新的创作域内核：模型、提示词、任务、资产、项目、导出。
- 默认入口优先满足日常生图。
- Prompts 市场成为全局提示词素材层，服务生图、ICON、分镜和后续扩展。
- 文本模型与图像模型分离，由用户自行配置。
- 去除内置 GLM 和任何默认模型服务。
- 新建 v2 数据库结构，不自动迁移 1.x 数据，只提供手动导入入口。

## 2. 产品模块

### 2.1 日常生图

默认打开应用后进入日常生图创作台。

基础流程：

```text
输入提示词
  -> 选择图像模型
  -> 选择尺寸 / 风格 / 参考图 / 种子
  -> 生成
  -> 结果进入资产库
```

必备能力：

- 文生图。
- 图生图。
- 多参考图。
- 负向提示词。
- 尺寸预设。
- 随机种子。
- 一键复用上次配置。
- 从 Prompts 市场套用提示词。
- 生成后收藏、导出、复制提示词、再次生成。

缺少图像模型时，生成按钮禁用，并提示用户先配置图像模型。

### 2.2 Prompts 提示词市场

Prompts 市场是 2.0 的公共素材基础设施，不是某个页面的附属功能。

首版支持：

- 内置离线快照。
- 用户手动同步 GitHub 最新数据。
- 自动兼容 `glidea/banana-prompt-quicker` 原始 JSON。
- 自动兼容 `EvoLinkAI/awesome-gpt-image-2-prompts` 原始 JSON。
- 导入自定义 JSON 文件。
- 下载 SamImage 标准 JSON 模板。
- 按来源、用途、分类、标签、语言、收藏筛选。
- 一键覆盖当前提示词。
- 插入到当前提示词。
- 复制提示词。
- 收藏与使用次数统计。

市场服务范围：

- 普通生图。
- 图生图。
- ICON 图标。
- 电影分镜。
- 批量生成。
- 后续插件与工作流模板。

### 2.3 模型配置

2.0 不再内置 GLM，也不提供默认文本或图像生成服务。

模型配置拆成：

- 文本模型：用于提示词优化、草案生成、分镜拆解、角色/场景/镜头生成。
- 图像模型：用于生图、图生图、ICON、分镜出图。
- 多模态模型：作为后续扩展能力。

缺少默认文本模型时：

- 禁用提示词优化。
- 禁用一键生成分镜草案。
- 禁用角色/场景/镜头自动生成。
- 显示“请先配置文本模型”。

缺少默认图像模型时：

- 禁用生成图片。
- 禁用 ICON 出图。
- 禁用分镜批量出图。
- 显示“请先配置图像模型”。

Prompts 市场不依赖模型，搜索、筛选、导入和套用仍然可用。

### 2.4 高级工作流模板

高级工作流不再是独立孤岛，而是复用同一套 Prompt、Model、Task、Asset、Export 内核。

首版和后续模板包括：

- ICON 图标。
- 电影分镜。
- 多模型对比。
- 批量生成。
- 后续插件工作流。

## 3. 核心数据模型

2.0 使用新数据库，例如 `samimage_v2.sqlite3`。1.x 数据不自动迁移，只提供手动导入旧数据入口。

### 3.1 模型配置

```ts
interface ModelProfile {
  id: string
  name: string
  provider: 'openai' | 'gemini' | 'stability' | 'comfyui' | 'custom'
  capability: 'text' | 'image' | 'multimodal'
  baseUrl: string
  apiKeyRef: string
  model: string
  endpoints: {
    chat?: string
    image?: string
    models?: string
  }
  requestDefaults: {
    timeoutSec: number
    temperature?: number
    maxTokens?: number
    imageSize?: string
    referenceImageLimit?: number
  }
  isDefaultText: boolean
  isDefaultImage: boolean
  enabled: boolean
  createdAt: string
  updatedAt: string
}
```

安全要求：

- API 返回配置时不返回明文密钥。
- 数据库保存 `apiKeyRef`，不把密钥当普通业务字段使用。
- 日志不输出密钥、请求头和完整供应商错误体。
- 导出配置默认不包含密钥。

### 3.2 提示词资产

```ts
interface PromptAsset {
  id: string
  title: string
  content: string
  source: 'builtin' | 'glidea' | 'evolink' | 'custom_json' | 'user'
  sourceId?: string
  sourceUrl?: string
  license?: string
  author?: string
  categories: string[]
  tags: string[]
  useCases: Array<'txt2img' | 'img2img' | 'icon' | 'storyboard' | 'reference' | 'workflow'>
  previewImages: string[]
  referenceImages: string[]
  language: 'zh' | 'en' | 'mixed'
  favorite: boolean
  usageCount: number
  importedAt: string
  updatedAt: string
}
```

导入规则：

- `glidea/banana-prompt-quicker` 映射 `title / prompt / author / mode / category / sub_category / preview / reference_image_urls`。
- `EvoLinkAI/awesome-gpt-image-2-prompts` 使用宽松解析，优先读取 `title / name / text / prompt / content / url / tweet_url / images / tags / author`。
- 自定义 JSON 支持标准模板、数组格式和 `{ prompts: [] }` 包装格式。
- 重复数据按 `source + sourceId` 或 `content hash` 去重。

### 3.3 创作资产

```ts
interface Asset {
  id: string
  kind: 'image' | 'icon' | 'storyboard_frame' | 'reference' | 'pdf' | 'zip' | 'json_export'
  uri: string
  thumbnailUri?: string
  promptText?: string
  negativePrompt?: string
  modelProfileId?: string
  width?: number
  height?: number
  seed?: number
  sourceTaskId?: string
  projectId?: string
  workflowId?: string
  tags: string[]
  favorite: boolean
  metadata: Record<string, unknown>
  createdAt: string
}
```

资产文件建议落到应用数据目录：

```text
SamImage/
  assets/
    images/
    icons/
    references/
    exports/
      pdf/
      zip/
      json/
    thumbnails/
```

数据库保存相对路径或安全 URI。列表加载缩略图，详情页再加载原图。

### 3.4 创作项目

```ts
interface Project {
  id: string
  type: 'free_generation' | 'icon_pack' | 'storyboard' | 'batch' | 'workflow'
  name: string
  description?: string
  status: 'draft' | 'active' | 'archived'
  settings: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
```

普通日常生图不强制建项目。分镜、ICON 套图、批量任务可以自动形成项目。

### 3.5 分镜模型

```ts
interface Character {
  id: string
  projectId: string
  name: string
  role: string
  appearance: string
  personality?: string
  referenceAssetIds: string[]
}

interface Scene {
  id: string
  projectId: string
  name: string
  summary: string
  location: string
  timeOfDay?: string
  mood?: string
  orderIndex: number
}

interface Shot {
  id: string
  projectId: string
  sceneId?: string
  orderIndex: number
  title: string
  description: string
  promptText: string
  framing: string
  angle: string
  movement: string
  durationSec?: number
  transition?: string
  assetId?: string
  status: 'draft' | 'ready' | 'generating' | 'done' | 'failed'
}
```

分镜工作流：

```text
输入故事概念
  -> 文本模型生成完整草案
  -> 得到角色 / 场景 / 镜头列表
  -> 用户编辑草案
  -> 编排时间轴
  -> 图像模型批量出图
  -> 失败镜头单独重试
  -> 导出 PDF 分镜稿
```

### 3.6 任务系统

```ts
interface GenerationTask {
  id: string
  groupId?: string
  projectId?: string
  type:
    | 'text_draft'
    | 'prompt_polish'
    | 'image_generation'
    | 'icon_generation'
    | 'storyboard_draft'
    | 'storyboard_image_batch'
    | 'multi_model_compare'
    | 'prompt_import'
    | 'prompt_sync'
    | 'export_pdf'
    | 'export_zip'
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  priority: number
  input: Record<string, unknown>
  output: Record<string, unknown>
  error?: string
  progressCurrent: number
  progressTotal: number
  retryOf?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}
```

所有生成、导入、同步、导出都走任务系统。日常生图是单任务，批量生成和分镜出图是任务组。

首版任务系统支持：

- 任务状态。
- 任务组进度。
- 取消。
- 失败重试。
- 重启后查看历史任务。

暂停/继续、复杂优先级调度放到 2.1。

## 4. 后端架构

2.0 后端按领域服务重建，不继续扩展 `api.rs` 和 `db.rs` 大文件。

推荐结构：

```text
src-tauri/src/
  app_state.rs
  error.rs
  api/
    model_profiles.rs
    prompt_assets.rs
    assets.rs
    projects.rs
    generation_tasks.rs
    storyboard.rs
    exports.rs
  domain/
    services/
      prompt_import_service.rs
      draft_service.rs
      generation_service.rs
      task_service.rs
      storyboard_service.rs
      export_service.rs
  db/
    migrations/
    repositories/
      model_profile_repo.rs
      prompt_asset_repo.rs
      asset_repo.rs
      project_repo.rs
      task_repo.rs
      storyboard_repo.rs
      export_repo.rs
  adapters/
    text/
    image/
    prompt_sources/
    exporters/
```

分层职责：

- API 层：路由、请求响应、输入校验。
- Service 层：业务编排。
- Repository 层：SQLite 访问。
- Adapter 层：模型供应商、Prompt 来源、导出器。

建议使用 `sqlx::SqlitePool`、WAL 和 migration 文件管理表结构。长耗时模型调用期间不能持有数据库连接。

关键 API：

```text
GET    /api/v2/model-profiles
POST   /api/v2/model-profiles
PATCH  /api/v2/model-profiles/:id
DELETE /api/v2/model-profiles/:id
POST   /api/v2/model-profiles/:id/validate

GET    /api/v2/prompt-assets
POST   /api/v2/prompt-assets/import
POST   /api/v2/prompt-assets/sync
GET    /api/v2/prompt-assets/template.json

GET    /api/v2/assets
GET    /api/v2/assets/:id
PATCH  /api/v2/assets/:id
DELETE /api/v2/assets/:id

POST   /api/v2/generate/image
POST   /api/v2/generate/icon
POST   /api/v2/generate/text-draft

POST   /api/v2/projects
GET    /api/v2/projects
GET    /api/v2/projects/:id

POST   /api/v2/storyboard/draft
PATCH  /api/v2/storyboard/shots/:id
POST   /api/v2/storyboard/projects/:id/generate-images
POST   /api/v2/storyboard/projects/:id/export-pdf

GET    /api/v2/tasks
GET    /api/v2/tasks/:id
POST   /api/v2/tasks/:id/retry
POST   /api/v2/tasks/:id/cancel
```

Tauri command 只保留桌面原生能力：

- 选择文件 / 文件夹。
- 保存图片、ZIP、PDF。
- 读取本地导入 JSON。
- 打开外部链接。
- 后续接系统密钥存储。

## 5. 前端架构

2.0 前端不再由单个 `App.vue` 承担全部状态。

推荐结构：

```text
src/
  app/
    router.ts
    AppShell.vue
  pages/
    WorkspacePage.vue
    AssetsPage.vue
    PromptsMarketPage.vue
    ProjectsPage.vue
    SettingsPage.vue
  features/
    generation/
    icon/
    storyboard/
    prompts/
    models/
    assets/
    tasks/
    exports/
  components/
    ui/
    layout/
    workspace/
  composables/
    useModelProfiles.ts
    usePromptAssets.ts
    useGenerationTasks.ts
    useAssets.ts
  api/
    v2Client.ts
    contracts.ts
  stores/
    workspaceStore.ts
    taskStore.ts
    modelStore.ts
    promptStore.ts
```

默认首页是 `WorkspacePage`。

信息架构：

```text
顶部栏：
  当前图像模型 / 当前文本模型 / Prompts 市场 / 任务状态 / 设置

左侧：
  工作流模板
  - 日常生图
  - 图生图
  - ICON 图标
  - 电影分镜
  - 多模型对比
  - 批量生成

中间：
  当前工作流输入区
  - 提示词
  - 负向提示词
  - 参考图
  - 尺寸
  - 参数
  - 生成按钮

右侧：
  Prompt 推荐 / 市场搜索结果 / 当前任务队列 / 最近生成

结果区：
  当前生成结果网格
```

状态原则：

- 数据真相在 SQLite。
- 任务真相在后端任务系统。
- 前端只保留 UI 临时状态和缓存。
- 批量循环不写在页面里。
- 复杂业务逻辑放到后端 service。

## 6. 工作流设计

### 6.1 ICON 工作流

流程：

```text
选择 ICON 工作流
  -> 输入应用 / 品牌 / 对象描述
  -> 选择风格
  -> 选择背景
  -> 选择图像模型
  -> 生成母图
  -> 导出多尺寸 PNG / ICO / ZIP
```

ICON 作为结构化生图模板实现。生成母图进入 `Asset(kind='icon')`，导出走 `export_zip` 或 `icon_pack` 任务。

### 6.2 多模型对比

多模型对比是日常生图增强模式。

```text
输入同一个提示词
  -> 选择多个图像模型
  -> 创建 multi_model_compare 父任务
  -> 创建多个 image_generation 子任务
  -> 结果并排展示
```

每个结果都是资产，并记录 `metadata.compareGroupId`。

### 6.3 批量生成

```text
输入多行提示词
  -> 选择图像模型
  -> 创建任务组
  -> 逐条生成
  -> 结果进入资产库
```

支持失败项重试、成功项批量导出、从 Prompts 市场批量加入提示词。

## 7. 资产库与导出

资产库替代 1.x 作品集。它统一管理图片、ICON、分镜帧、参考图、PDF、ZIP 和 JSON 导出。

资产库功能：

- 搜索提示词。
- 按类型筛选。
- 按模型筛选。
- 按工作流筛选。
- 按项目筛选。
- 收藏筛选。
- 标签筛选。
- 时间筛选。
- 多选。
- 批量导出。
- 批量删除。
- 批量打标签。

详情面板显示：

- 原图预览。
- 提示词。
- 负向提示词。
- 模型。
- 尺寸。
- 种子。
- 工作流来源。
- 关联项目。
- 任务状态。
- 文件路径。
- 导出、复制提示词、再次生成、作为参考图、加入项目。

导出统一走任务系统：

- 单图导出。
- 批量图片 ZIP。
- ICON 包。
- 分镜 PDF。
- 分镜 ZIP。
- Prompt JSON。
- Project JSON。

文件安全边界：

- 后端校验路径。
- 只操作应用资产目录或用户明确选择的路径。
- 不向前端暴露任意绝对路径。
- Tauri command 负责文件选择、保存和打开文件夹。

## 8. 分阶段实施路线

### Phase 0：冻结方向与设计文档

验收：

- 2.0 定位明确。
- 数据模型定稿。
- API 草案定稿。
- 前端信息架构定稿。
- Prompts 市场导入规范定稿。

### Phase 1：v2 内核骨架

目标：

- 新建 `samimage_v2.sqlite3`。
- 建立 migration 体系。
- 拆分后端目录。
- 建立统一错误结构。
- 建立 `/api/v2/health`。

验收：

- v2 数据库可初始化。
- v2 API 可启动。
- 旧 1.x 功能不被破坏。
- `cargo test` 通过。

### Phase 2：模型配置与 Prompts 市场

目标：

- 完成文本模型 / 图像模型配置。
- 移除内置 GLM。
- 完成 Prompts 市场基础页面。
- 内置离线快照。
- 支持 glidea / EvoLinkAI 原始 JSON 导入。
- 支持自定义 JSON 导入和模板下载。

验收：

- 未配置文本模型时草案/润色功能禁用。
- 未配置图像模型时生成按钮禁用。
- Prompts 可按来源、用途、分类筛选。
- Prompt 可一键套用到生图输入框。

### Phase 3：日常生图 MVP

目标：

- 完成 2.0 默认创作台。
- 支持文生图。
- 支持参考图基础能力。
- 支持尺寸、负向提示词、种子。
- 生成结果进入 `assets`。
- 支持收藏、复制提示词、导出原图。

验收：

- 用户配置图像模型后可完成一次生图。
- 资产记录包含提示词、模型、尺寸、任务来源。
- 资产库能看到结果。
- 无图像模型时不能误触发生成。

### Phase 4：任务系统与资产库强化

目标：

- 所有生成走 `generation_tasks`。
- 支持任务状态、失败、重试、取消。
- 支持任务组。
- 资产库支持筛选、搜索、多选、导出。
- 支持缩略图生成。

验收：

- 单图生成是任务。
- 批量生成是任务组。
- 失败任务可重试。
- 重启后可看到历史任务和资产。

### Phase 5：ICON、批量、多模型对比

目标：

- ICON 作为工作流模板接入。
- 多尺寸 ICON 导出。
- 批量提示词生成。
- 多模型对比。
- 全部复用任务系统和资产库。

验收：

- ICON 母图进入资产库。
- ICON 可导出 PNG / ICO / ZIP。
- 多模型对比结果并排展示。
- 批量生成失败项可单独重试。

### Phase 6：电影分镜工作流

目标：

- 输入故事概念。
- 文本模型生成角色 / 场景 / 镜头完整草案。
- 用户编辑镜头。
- 时间轴排序。
- 批量出图。
- 导出 PDF 分镜稿。

验收：

- 可生成结构化分镜草案。
- 可编辑和排序镜头。
- 批量出图写入 `storyboard_frame` 资产。
- 失败镜头可重试。
- PDF 包含项目、角色、场景、镜头图和说明。

### Phase 7：收口与发布

目标：

- 统一 UI 细节。
- 完成安全审查。
- 补齐测试。
- 写 1.x 手动导入入口。
- 准备 2.0 发布说明。

验证命令：

```powershell
npm.cmd run test
npm.cmd run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## 9. 风险与取舍

### 9.1 必须避免

- 继续扩展 1.x 单体 `App.vue`。
- 继续扩展 1.x 单体 `api.rs` / `db.rs`。
- 在客户端内置 GLM 或任何默认模型密钥。
- 自动迁移 1.x 全量数据导致 v2 被旧结构拖住。
- 过早实现插件脚本执行。
- 过早实现高级视频级时间轴。
- 过早实现复杂图层编辑器。
- 过早实现全自动角色一致性训练。

### 9.2 首版延期项

- 任务暂停 / 继续。
- 高级队列优先级 UI。
- 插件运行时沙箱。
- 复杂图层编辑。
- 角色一致性训练。
- 视频导出。

### 9.3 首版必须守住

- 日常生图闭环。
- 文本 / 图像模型分离。
- Prompts 市场。
- 统一任务系统。
- 统一资产库。
- 安全边界。
- 可扩展工作流模板。

## 10. 测试策略

后端测试：

- repository 层 CRUD。
- service 层业务编排。
- Prompt 导入归一化。
- 模型配置校验。
- 任务状态转换。
- API handler 基础路径。

前端测试：

- Prompts 市场筛选与套用。
- 模型配置校验。
- 任务状态展示。
- 资产库筛选。
- 生图按钮禁用条件。

E2E 测试：

- 配置图像模型 -> 套用 Prompt -> 生成 -> 资产库查看。
- 导入自定义 JSON -> 搜索 -> 套用。
- 批量生成 -> 失败重试。
- 分镜草案 -> 批量出图 -> PDF 导出。

## 11. 结论

SamImage 2.0 的重构重点不是简单增加功能，而是重建可长期扩展的创作内核。

推荐执行顺序：

1. v2 数据模型和 API 边界。
2. 文本 / 图像模型配置。
3. Prompts 市场。
4. 日常生图闭环。
5. 任务系统和资产库。
6. ICON、批量、多模型对比。
7. 电影分镜工作流。

这个顺序能先保证日常生图工具可用，再把高级工作流建立在稳定内核上。
