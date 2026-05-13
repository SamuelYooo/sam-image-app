# SamImage 应用

SamImage 是一个面向 AI 图片生成流程的桌面应用骨架。它参考静态管线画布页面，提供模型配置、模型验证、生图工作台、作品集与画廊等核心能力。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Tauri v2（Rust + Web） |
| 后端 | Rust + Axum + SQLite（WAL 模式） |
| 前端 | Vue 3 + TypeScript + Tailwind CSS v4 |
| 协议适配 | 5 个独立适配器模块，互不影响 |

## 目录说明

- `src/`：Vue 前端应用，默认界面语言为中文。
- `src-tauri/`：Tauri 和 Rust 后端代码。
- `src-tauri/src/adapters/`：协议适配器目录，当前包含 `openai_images`、`openai_chat`、`gemini`、`stability`、`comfyui`。
- `src-tauri/src/db.rs`：SQLite 初始化和数据访问，启动时开启 WAL 模式。
- `src-tauri/src/api.rs`：Axum API 路由，包括配置项、模型验证、模型列表、生图记录和画廊接口。
- `scripts/run-tauri.ps1`：Tauri 包装脚本，会优先接入本地 `WiX 3.14` 目录。

## 本地开发

安装前端依赖：

```powershell
npm install
```

启动前端开发服务：

```powershell
npm.cmd run dev
```

运行桌面应用前，需要先安装 Rust 工具链，并确保 `cargo`、`rustc` 可用。然后执行：

```powershell
npm.cmd run tauri -- dev
```

## 当前功能

- 独立模型配置页：支持配置名称、协议适配器、服务地址、密钥、接口路径和请求参数。
- 模型验证：支持本地校验与服务连通性验证。
- 模型列表：支持从自定义服务地址获取多个模型，并设置主模型。
- 生图工作台：主界面只展示生图相关内容，支持文生图、图生图、反推、融合等模式。
- 真实生成：OpenAI 兼容图片适配器会调用配置的图片接口，不再返回固定占位图。
- 参考图管理：支持本地上传、复制粘贴图片、URL 输入，并识别非图片剪贴板内容。
- 作品集与画廊：支持筛选、预览、裁剪、压缩、PNG/JPG 下载和删除。
- 帮助面板：包含作者介绍、开源地址和联系方式。

## 构建与打包

### 1. 仅生成桌面 EXE

这个命令不会进入安装包流程，只会生成可直接运行的桌面程序：

```powershell
npm.cmd run build:exe
```

生成后的可执行文件：

```text
src-tauri\target\release\samimage-app.exe
```

### 2. 使用本地 WiX 生成 MSI

项目已内置 `scripts/run-tauri.ps1`，会按下面顺序寻找本地 WiX：

1. 环境变量 `SAMIMAGE_WIX_DIR`
2. 固定目录 `D:\DevFiles\wix314-binaries`

检测到后，脚本会自动同步到 Tauri 本地工具缓存目录：

```text
src-tauri\target\.tauri\WixTools314
```

如果你当前机器的 WiX 就在这个目录，直接执行：

```powershell
npm.cmd run build:msi
```

如果你的 WiX 不在默认目录，先设置环境变量再打包：

```powershell
$env:SAMIMAGE_WIX_DIR="D:\your-path\wix314-binaries"
npm.cmd run build:msi
```

生成后的安装包通常位于：

```text
src-tauri\target\release\bundle\msi\
```

说明：`build:msi` 会先走 Tauri 默认的 MSI 流程；如果当前系统的 ICE 校验环境有问题，会自动回退到本地 `light.exe -sval` 完成打包。

### 3. 生成 NSIS 安装包

如果你想生成安装版 `.exe`，可以执行：

```powershell
npm.cmd run build:nsis
```

说明：NSIS 首次构建时如果本机没有缓存，Tauri 仍可能联网下载对应工具。

## 验证命令

```powershell
npm.cmd run test
npm.cmd run build
cargo check --manifest-path src-tauri/Cargo.toml
```

## 常见问题

### PowerShell 提示无法执行 npm.ps1

这是 PowerShell 执行策略导致的，直接使用 `npm.cmd` 即可，例如：

```powershell
npm.cmd run build:msi
```

### `cargo metadata` 或 `link.exe` 找不到

- 缺少 `cargo`：安装 Rust，并确认 `cargo -V` 可执行。
- 缺少 `link.exe`：安装 Visual Studio Build Tools，并勾选 `Desktop development with C++`。
