# SamImage 2.0

SamImage 2.0 是一款基于 Tauri v2 的本地桌面生图工作台，面向日常高频图片创作、图生图、ICON、批量生成、多模型对比和电影分镜等工作流。2.0 版本重新设计了模型配置、任务队列、资产库、本地图片存储和提示词资产体系，默认不内置任何模型服务，所有文本模型和图像模型都由用户自行配置。

当前版本：`2.0.0`

## 核心能力

- **工作台**：日常生图、图生图、ICON、批量生成、多模型对比、电影分镜等工作流统一入口。
- **模型配置中心**：文本模型与图像模型分离配置，支持模型列表获取、健康检查、API Key 本地保存和按能力选择模型。
- **提示词编辑**：提示词弹框编辑，支持 AI 润色；未配置文本模型时会提示先完成模型配置。
- **任务队列**：生成、重试、取消、刷新和历史任务集中管理，工作台和任务页都能查看详情。
- **资产库**：生成图片落地为本地资产记录，支持预览、下载、复制信息、筛选和批量管理。
- **本地存储**：使用 SQLite WAL 存储任务、模型配置、提示词、项目和资产元数据；图片文件由后端服务写入本地应用数据目录。
- **提示词市场**：支持内置模板、自定义 JSON 导入、模板下载，以及 glidea / EvoLinkAI 来源格式兼容。
- **国内自媒体尺寸预设**：内置微信公众号、微信视频号、抖音、小红书、微博、B 站等常见图片尺寸，并支持自定义尺寸。
- **旧数据导入**：2.0 使用新数据库结构，只提供手动导入旧数据入口，不做 1.x 自动迁移。

## 技术栈

- Tauri v2
- Rust + Tokio + sqlx
- SQLite WAL
- Vue 3 + TypeScript
- Pinia
- Tailwind CSS v4
- Vitest
- animejs

## 目录结构

```text
.
├─ src/                         # Vue 前端
│  ├─ app/                       # 应用壳与导航
│  ├─ assets/                    # 全局样式
│  ├─ features/workspace/        # 工作台主界面
│  ├─ pages/                     # 资产、任务、项目、提示词、设置页面
│  └─ stores/                    # Pinia 状态管理
├─ src-tauri/                    # Tauri / Rust 后端
│  ├─ src/api/                   # IPC 命令
│  ├─ src/db/                    # SQLite 仓储与迁移
│  ├─ src/domain/                # 领域服务
│  └─ tauri.conf.json            # 桌面应用配置
├─ tests/                        # Vitest 契约与交互测试
├─ docs/design/                  # 2.0 设计文档
├─ docs/resources/               # 设计参考和资料
├─ scripts/                      # 构建与发布脚本
└─ release/                      # 本地归档的 exe 产物
```

## 环境要求

- Windows 10/11
- Node.js 20+ 或 22+
- pnpm 11+
- Rust stable
- Tauri v2 所需系统依赖

首次安装依赖：

```powershell
pnpm install
```

如果当前终端找不到 Cargo，请先把 Rust 工具链加入 PATH：

```powershell
$env:PATH = 'C:\Users\Administrator\.cargo\bin;' + $env:PATH
```

## 本地开发

启动前端开发服务器：

```powershell
pnpm dev
```

启动 Tauri 桌面开发环境：

```powershell
pnpm tauri dev
```

常用检查命令：

```powershell
pnpm test
pnpm build
pnpm check
```

`pnpm check` 本质上会执行：

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

## 打包

生成 Tauri 包：

```powershell
pnpm tauri build
```

生成并归档单个 exe：

```powershell
pnpm build:exe
```

产物会复制到：

```text
release/SamImage-2.0.0.exe
```

macOS 和 Linux 需要在对应系统本机执行：

```bash
pnpm build:mac
pnpm build:linux
```

产物会复制到：

```text
release/SamImage-2.0.0-mac.dmg
release/SamImage-2.0.0-linux.AppImage
release/SamImage-2.0.0-linux.deb
release/SamImage-2.0.0-linux.rpm
```

如果在受限沙箱中遇到 `@tailwindcss/oxide`、`@swc/core` 原生依赖加载失败，或 Cargo 写入 `target` 被拒绝，请在本机普通 PowerShell 终端中执行打包命令。

## 模型配置

SamImage 2.0 不内置模型服务。首次使用前需要进入“设置”页面配置：

- **文本模型**：用于提示词润色、文案生成、分镜草案等文本能力。
- **图像模型**：用于文生图、图生图、ICON、批量生成和分镜出图。

配置项包括：

- API 类型
- Base URL
- API Key
- 模型名称
- 模型列表路径
- 健康检查状态

模型健康检查默认超时时间为 15 秒。检查通过显示绿色标记，失败显示红色标记和错误信息。

## 图片生成与本地存储

图片生成流程由后端统一处理：

1. 前端创建生成任务。
2. Rust 服务调用用户配置的图像模型。
3. 后端解析模型返回的 URL、base64 或二进制图片数据。
4. 图片写入本地应用数据目录。
5. SQLite 保存资产元数据和任务输出关系。
6. 前端通过本地 asset 协议异步预览图片。

这样可以避免长期依赖外部临时图片 URL，降低隐私和数据丢失风险。

## 工作流说明

### 日常生图

适合普通文生图。支持提示词、负向提示词、尺寸、质量、张数和种子。

### 图生图

上传参考图后自动进入图生图流程。参考图会参与任务输入，任务完成后输出到资产库。

### ICON 生成

针对图标场景预设常见尺寸，例如 `16x16`、`32x32`、`64x64`、`128x128` 等，方便生成应用图标、头像和素材图标。

### 批量生成

用于同一提示词或一组提示词的批量任务，所有任务都会进入统一任务队列。

### 多模型对比

同一提示词可选择多个图像模型进行对比生成，用于评估不同模型效果。

### 电影分镜

支持分镜草案、镜头列表、时间线和批量出图。切换到其他工作流时会清理当前工作流草稿，避免旧任务输入污染新任务。

## 资产库

资产库提供：

- 最近生成作品查看
- 图片预览
- 详情弹框
- 下载到用户选择的本地路径
- 按工作流、项目、模型、关键词筛选
- 批量选择和批量操作

下载逻辑优先使用本地已保存文件，避免重新下载外部 URL。

## 任务队列

任务队列统一承载：

- 生图任务
- 图生图任务
- ICON 任务
- 批量生成任务
- 分镜出图任务
- 导入、同步、导出等后台任务

任务详情弹框会展示提示词、负向提示词、参考图、输出资产、错误信息、进度和时间。失败任务支持重试，重试时会关闭当前详情层，避免页面出现多层折叠或互相遮挡。

## 数据与安全

- API Key 不写入前端日志。
- 模型请求由后端统一处理。
- 图片文件写入本地应用数据目录。
- SQLite 使用 WAL 模式。
- 前端不直接拼接敏感文件路径。
- Tauri Capability 和 CSP 按最小权限配置。

## 验证状态

最近一次完整检查包括：

```powershell
npx.cmd --no-install vitest run
npm.cmd run build
C:\Users\Administrator\.cargo\bin\cargo.exe check --manifest-path src-tauri\Cargo.toml
```

其中 Vitest 覆盖工作台、任务队列、资产详情、模型配置、生成服务、提示词市场、分镜基础流程等契约。

## 发布流程

1. 统一版本号：

```powershell
pnpm bump 2.0.0
```

2. 执行验证：

```powershell
pnpm test
pnpm build
pnpm check
```

3. 打包：

```powershell
pnpm build:exe
```

4. 创建发布分支并推送：

```powershell
git checkout -b 2.0.0
git push -u origin 2.0.0
```

## 许可证

见 [LICENSE](./LICENSE)。
