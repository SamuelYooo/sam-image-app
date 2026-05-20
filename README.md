# SamImage

SamImage 是一款面向 AI 图片生成流程的桌面端创作工作台，基于 Tauri v2 构建。它把模型配置、生图、ICON 生成、电影分镜、作品集管理、滤镜导出和多平台打包整合到一个桌面应用中，适合个人创作者、自媒体运营和需要本地管理 AI 图片资产的团队使用。

当前版本：**1.4.0**。

## 1.4.0 更新重点

1.4.0 的目标是把 SamImage 从「单次生成工具」升级为「高效图片创作工作台」。本次更新重点围绕创作入口、作品管理、滤镜导出和分镜能力展开。

### 生图工作台升级

- 重新整理 SamTo图 页面布局，底部生成参数区改为稳定的双栏工作区。
- 生图参数区新增更清晰的输入结构：提示词、负向提示词、尺寸预设、随机种子和电影分镜入口分区展示。
- 尺寸预设按自媒体平台分组，支持常用尺寸、微信 / 公众号、小红书、抖音、B站、微博和自定义尺寸。
- 批量生成面板保持在左侧滚动列内，避免底部按钮和分镜控件被画布裁切。
- 下拉框组件支持原生 `optgroup` 分组展示，同时兼容普通下拉选项。

### 作品集与滤镜系统

- 我的作品集支持关键词搜索、作品类型筛选、生成模式筛选和模型配置筛选。
- 作品类型覆盖 `type_default`、`type_icon` 和 `type_movie`，便于区分 SamTo图、ICON 和分镜作品。
- 新增视觉滤镜面板，支持滤镜预设和亮度、对比度、饱和度、色相调节。
- 作品预览实时应用滤镜效果。
- 导出 PNG / JPG 时通过 Canvas 合成滤镜效果，避免只预览不导出。
- 图层属性区统一删除按钮样式，默认低调显示，hover 时展示危险操作状态。

### 电影分镜能力

- 取消独立电影工坊页面方向，改为在 SamTo图 生图界面内保留电影分镜入口。
- 前端提供电影分镜开关和镜头数输入，支持后续在生图工作流中继续扩展批量分镜生成。
- 后端已提供 Storyboard 项目、场景、镜头的数据结构、SQLite 存储和 REST API。
- 分镜生成结果使用 `type_movie` 标记入库，可进入作品集继续筛选、预览和精修。
- Tauri 侧提供 `save_images_as_zip` 命令，为后续分镜打包下载能力预留基础。

### UI 与设计系统

- 全局视觉风格调整为 Kraken 风格的浅色设计系统。
- 抽象基础 UI 组件：按钮、图标按钮、输入框和下拉框。
- 统一按钮、表单控件、卡片、滚动条和焦点状态。
- 修复多个布局遮挡问题，包括生图底部按钮、电影分镜控件和下拉框显示问题。

### 后端与数据模型

- 后端基于 Rust + Axum + SQLite（WAL 模式）继续扩展。
- 新增或完善 Storyboard 相关数据模型、数据库表和 API 路由。
- 保持嵌入式 Axum 服务模式，前端通过本地 `127.0.0.1` API 调用后端能力。
- 保留多协议适配器架构，统一 OpenAI Images、OpenAI Chat、Gemini、Stability 和 ComfyUI 的图片生成接口。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2（Rust + WebView） |
| 后端 | Rust + Axum + SQLite（WAL 模式） |
| 前端 | Vue 3 + TypeScript + Tailwind CSS v4 |
| 协议适配 | OpenAI Images / OpenAI Chat / Gemini / Stability / ComfyUI |
| 测试 | Vitest、Rust `cargo check` / `cargo test` |

## 目录说明

```text
├── src/                      Vue 3 前端源码
│   ├── api/client.ts         本地 Axum API 客户端
│   ├── components/           Vue 组件与基础 UI 组件
│   ├── types.ts              TypeScript 类型定义
│   └── utils/                画廊、模型、参考图、分镜等工具函数
├── src-tauri/                Tauri + Rust 后端
│   ├── src/
│   │   ├── lib.rs            Tauri 命令与桌面集成
│   │   ├── server.rs         嵌入式 Axum HTTP 服务启动
│   │   ├── api.rs            REST API 路由与处理器
│   │   ├── db.rs             SQLite 初始化、迁移和数据访问
│   │   ├── db_storyboard.rs  分镜数据访问辅助模块
│   │   ├── models.rs         Rust 数据模型定义
│   │   └── adapters/         图片生成协议适配器
│   ├── Cargo.toml            Rust 包配置
│   └── tauri.conf.json       Tauri 应用配置
├── docs/                     设计文档、版本计划和说明文档
├── package.json              npm 包配置
└── vite.config.ts            Vite 构建配置
```

## 核心功能

### SamTo图 生图工作台

- **文生图：** 通过自然语言提示词生成图片。
- **图生图：** 基于参考图进行风格迁移、重绘或融合。
- **反推提示词：** 从图片反推可复用的生成提示词。
- **图像融合：** 将多张参考图融合为一张新图。
- **负向提示词：** 支持独立输入和一键还原默认负向提示词。
- **自媒体尺寸预设：** 按平台分类选择尺寸，减少手动输入成本。
- **批量生成：** 多行提示词按顺序生成，并显示每条任务状态。
- **电影分镜入口：** 在生图界面内保留分镜开关和镜头数输入，为分镜批量创作提供入口。

### SamToICON ICON 工坊

- **AI 图标生成：** 通过自然语言描述生成 App 图标。
- **风格选项：** 支持现代、扁平矢量、3D 质感、线性极简和毛玻璃等风格。
- **参考图支持：** 支持上传参考图进行 ICON 生成。
- **多尺寸导出：** 支持 32 × 32 到 512 × 512 多尺寸 ICO 导出。
- **图标搜索：** 集成 Iconfont 和 Iconify 搜索，可导入 SVG 作为素材。
- **作品隔离：** ICON 母图使用 `type_icon` 存储，不影响 SamTo图 作品流。

### 我的作品集

- **多维筛选：** 支持按关键词、作品类型、生成模式和模型配置筛选。
- **作品类型：** 支持 `type_default`、`type_icon` 和 `type_movie`。
- **实时预览：** 主画布展示选中作品，支持左右切换。
- **视觉滤镜：** 支持预设滤镜和亮度、对比度、饱和度、色相调节。
- **导出合成：** 导出时应用裁剪、滤镜和图层效果。
- **图层编辑：** 支持文字、SVG、图片图层，提供拖拽、缩放、旋转、透明度、混合模式、复制、锁定和删除。
- **批量对齐：** 支持多图层左对齐、居中、右对齐、水平分布和垂直分布。

### 模型配置

- **统一入口：** 模型配置收敛到顶部导航栏弹窗。
- **多适配器支持：** 支持 OpenAI Images、OpenAI Chat、Gemini、Stability 和 ComfyUI。
- **模型验证：** 支持连通性验证和模型能力检查。
- **模型列表获取：** 支持从远程服务拉取可用模型列表。
- **快速切换：** 可在顶部快速切换当前活跃模型配置。

### 提示词模板

- **内置模板：** 覆盖分镜、角色设定、平面排版和信息图等场景。
- **模板管理：** 支持创建、编辑、删除自定义模板。
- **快速应用：** 一键将模板应用到生图提示词输入框。
- **安全提示：** 可追加「中文文字后期添加」提示，减少模型直接生成乱码中文。

### 历史记录与操作日志

- **操作日志：** 记录生成、批量生成、ICON 生成、模型检测、保存和删除等操作。
- **请求历史：** 支持按模型配置、生成模式和来源筛选已入库结果。
- **快速跳转：** 可从历史记录直接进入作品集查看详情。

## 数据模型

### 作品类型（Artifact Type）

| 类型值 | 说明 | 展示位置 |
|--------|------|----------|
| `type_default` | SamTo图 生图作品 | 生图页右侧作品集、我的作品集 |
| `type_icon` | SamToICON 母图 | ICON 页、我的作品集 ICON 分区 |
| `type_movie` | 电影分镜作品 | 我的作品集、分镜筛选结果 |

作品类型在生成或分镜入库时自动标记，并持久化存储到 SQLite。

### 分镜数据

1.4.0 后端提供以下分镜数据结构：

- `storyboard_projects`：分镜项目设置，例如画幅、风格、色彩、主提示词和镜头尺寸。
- `storyboard_scenes`：项目内场景。
- `storyboard_shots`：具体镜头，包含构图、角度、焦距、运动、主体、环境、光线、氛围、风格和完整提示词。

## 本地开发

### 环境要求

- Node.js 18+
- Rust 工具链（`cargo`、`rustc`）
- Windows 用户需安装 Visual Studio Build Tools，并勾选「Desktop development with C++」

### 安装依赖

```powershell
npm install
```

### 启动前端开发服务器

```powershell
npm.cmd run dev
```

默认地址：`http://127.0.0.1:2001`。

### 启动完整桌面应用

```powershell
npm.cmd run tauri -- dev
```

如果提示端口 `2001` 被占用，请先关闭旧的 Vite / Tauri 进程后再启动。

## 验证命令

```powershell
# 前端单元测试
npm.cmd run test

# 前端类型检查与生产构建
npm.cmd run build

# Rust 类型检查
cargo check --manifest-path src-tauri/Cargo.toml
```

当前 1.4.0 前端回归测试覆盖 UI 组件、画廊工具、模型选择、自媒体尺寸分组、作品集滤镜和布局约束等内容。

## 构建与打包

### 生成桌面可执行文件

```powershell
npm.cmd run build:exe
```

生成后的可执行文件：

```text
src-tauri\target\release\SamImage.exe
```

### 生成 MSI 安装包

```powershell
npm.cmd run build:msi
```

项目内置 WiX 3.14 自动检测逻辑，查找顺序如下：

1. 环境变量 `SAMIMAGE_WIX_DIR`
2. 固定目录 `D:\DevFiles\wix314-binaries`

如果 WiX 不在默认目录，请先设置环境变量：

```powershell
$env:SAMIMAGE_WIX_DIR="D:\your-path\wix314-binaries"
npm.cmd run build:msi
```

### 生成 NSIS 安装包

```powershell
npm.cmd run build:nsis
```

### 一键构建多平台格式

```powershell
# 当前平台所有格式
npm.cmd run build:all

# 指定平台
npm.cmd run build:all:win
npm.cmd run build:all:mac
npm.cmd run build:all:linux
```

### 支持的目标格式

| 平台 | 格式 |
|------|------|
| Windows | MSI、NSIS、便携版 EXE |
| macOS | DMG（Intel x64 / Apple Silicon aarch64） |
| Linux | AppImage、DEB、RPM |

## 常见问题

### PowerShell 提示无法执行 npm.ps1

这是 PowerShell 执行策略导致的。请直接使用 `npm.cmd`：

```powershell
npm.cmd run build
```

### 端口 2001 被占用

开发模式固定使用 `127.0.0.1:2001`。如果启动失败，请关闭旧的 `node.exe`、`vite` 或 `SamImage.exe` 进程后重试。

### `cargo metadata` 或 `link.exe` 找不到

- 缺少 `cargo`：安装 Rust，并确认 `cargo -V` 可执行。
- 缺少 `link.exe`：安装 Visual Studio Build Tools，并勾选「Desktop development with C++」。

## 版本历史

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 开源协议

MIT License
