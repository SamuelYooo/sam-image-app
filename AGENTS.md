# SamImage 2.0 Codex 工作区说明

本目录是 SamImage 2.0 的独立开发工作区：

```text
E:\mywork\sam-image-app\sam-image-app-v2.0
```

除非用户明确要求维护 1.x，后续 SamImage 2.0 的代码、设计、计划、截图、验证记录和会话上下文都应放在本目录内。不要再把 2.0 文档写入 `E:\mywork\sam-image-app\sam-image-app`。

## 项目定位

SamImage 2.0 是一次完整重构，不以兼容 1.x 内部结构为目标。产品主线是日常高频生图工具，并以同一套模型、提示词、任务、资产和导出内核支撑 ICON、批量生成、多模型对比、电影分镜和后续工作流扩展。

核心约束：

- 去除内置 GLM 和任何默认模型服务。
- 文本模型与图像模型分离，均由用户自行配置。
- 未配置文本模型时，提示词润色、草案生成、分镜拆解等文本能力必须提示用户先配置文本模型。
- 未配置图像模型时，生图、ICON 出图、分镜批量出图必须禁用并提示用户先配置图像模型。
- 2.0 使用新数据库结构，只提供手动导入旧数据入口，不做 1.x 自动迁移。
- Prompts 提示词市场是全局素材基础设施，服务生图、ICON、分镜、批量生成和后续扩展。

## 技术栈

- Tauri v2 + Rust
- Vue 3 + TypeScript
- Pinia
- Tailwind CSS v4
- SQLite / WAL
- Vitest

桌面包名固定为：

```text
xyz.samsofts.sam-image-app
```

## 目录约定

- `src/`：前端代码。
- `src-tauri/`：Tauri / Rust 后端。
- `tests/`：前端单元测试。
- `docs/design/`：2.0 设计与架构文档。
- `docs/resources/`：外部设计参考与资源快照。
- `.codex/`：Codex 会话上下文、执行约束和后续交接记录。
- `.omx/`：OMX / superpowers 运行状态。只有在确实运行相关工作流时才更新。
- `gitfork/`：早期拉取的外部模板或参考仓库，默认只作为参考，不作为主工程改动目标。

## 开发命令

在本目录执行：

```powershell
pnpm dev
pnpm test
pnpm build
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml
```

验证策略：

- UI / 状态改动至少跑相关 Vitest。
- TypeScript / Vue 改动完成前跑 `pnpm build` 或 `pnpm type-check`。
- Rust / Tauri 改动至少跑 `pnpm check` 或对应 `cargo check`。
- 涉及数据库、任务、模型适配器、文件系统能力时补充后端测试或最小 smoke 验证。

## 开发原则

- 优先在 2.0 工作区内完成所有改动，避免跨到 1.x。
- 不继续复制 1.x 的单体 `App.vue`、`api.rs`、`db.rs` 结构。
- 前端只保留 UI 临时状态和缓存，业务真相放在后端服务与 SQLite。
- 长耗时模型调用不能持有数据库连接。
- API key、请求头、供应商错误体和本地绝对路径不得泄露到前端或日志。
- UI 改动必须考虑 Tauri 默认最大化窗口和 `1024x720` 级别的小窗口可用性。

## 文档语言

计划、设计、评审、交接和状态总结默认使用简体中文。源码标识符、命令、路径、API 字段和错误日志保持原文。
