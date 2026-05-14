# SamImage

SamImage 是一款面向 AI 图片生成流程的桌面端应用，基于 Tauri v2 构建。它提供模型配置、模型验证、生图工作台、ICON 工坊、作品集与画廊等核心能力，支持 Windows、macOS 和 Linux 三平台打包。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri v2（Rust + Web） |
| 后端 | Rust + Axum + SQLite（WAL 模式） |
| 前端 | Vue 3 + TypeScript + Tailwind CSS v4 |
| 协议适配 | 5 个独立适配器模块（OpenAI Images / OpenAI Chat / Gemini / Stability / ComfyUI） |

## 目录说明

```
├── src/                      Vue 3 前端源码
│   ├── components/           Vue 组件
│   ├── api/client.ts         HTTP 客户端封装
│   ├── types.ts              TypeScript 类型定义
│   └── utils/                工具函数
├── src-tauri/                Tauri + Rust 后端
│   ├── src/
│   │   ├── main.rs           程序入口
│   │   ├── lib.rs            Tauri 命令与桌面集成
│   │   ├── api.rs            Axum API 路由（RESTful）
│   │   ├── db.rs             SQLite 初始化与数据访问
│   │   ├── models.rs         数据模型定义
│   │   ├── server.rs         Axum HTTP 服务启动
│   │   └── adapters/         协议适配器目录
│   │       ├── openai_images.rs
│   │       ├── openai_chat.rs
│   │       ├── gemini.rs
│   │       ├── stability.rs
│   │       └── comfyui.rs
│   ├── Cargo.toml            Rust 包配置
│   └── tauri.conf.json       Tauri 应用配置
├── package.json              npm 包配置（包名: SamImage）
└── vite.config.ts            Vite 构建配置
```

# 界面效果图

![image-20260514165006127](C:\Users\Administrator\AppData\Roaming\Typora\typora-user-images\image-20260514165006127.png)

![image-20260514165030706](C:\Users\Administrator\AppData\Roaming\Typora\typora-user-images\image-20260514165030706.png)

![image-20260514164925203](C:\Users\Administrator\AppData\Roaming\Typora\typora-user-images\image-20260514164925203.png)

## 本地开发

### 环境要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 工具链（cargo、rustc）
- Windows 用户需安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/?q=build+tools)（勾选 "Desktop development with C++"）

### 安装依赖

```powershell
npm install
```

### 启动开发模式

仅启动前端开发服务器：

```powershell
npm.cmd run dev
```

启动完整桌面应用（含 Rust 后端）：

```powershell
npm.cmd run tauri -- dev
```

## 核心功能

### 生图工作台
- **文生图**：通过自然语言描述生成图片
- **图生图**：基于参考图进行风格迁移或重绘
- **反推提示词**：从图片反推生成提示词
- **图像融合**：将多张参考图融合为一张新图
- **参考图管理**：支持本地上传、复制粘贴、URL 输入，自动识别非图片剪贴板内容

### ICON 工坊 (SamToICON)
- **AI 图标生成**：通过自然语言描述生成 App 图标，支持现代、扁平、3D、线性、毛玻璃等多种风格
- **参考图支持**：支持上传参考图进行图生图风格的 ICON 生成
- **多尺寸导出**：支持 32x32 到 512x512 多种尺寸，一键导出 ICO 格式
- **图标搜索**：集成 Iconfont 和 Iconify 图标库搜索，可直接导入 SVG 作为图标素材
- **背景选项**：支持透明、纯色、保留原图三种背景模式
- **颜色定制**：可自定义图标主色调
- **作品隔离**：ICON 母图以 `type_icon` 类型独立存储，不影响生图画廊

### 模型配置
- **弹窗式配置**：模型配置统一收敛到顶部导航栏弹窗，操作更便捷
- **完整参数**：支持配置名称、协议适配器、服务地址、密钥、接口路径和请求参数
- **模型验证**：支持本地校验与服务连通性验证
- **模型列表获取**：支持从远程服务获取可用模型列表
- **快速切换**：左侧配置列表一键切换活跃模型
- **配置重命名**：支持双击重命名模型配置

### 提示词模板系统
- **内置模板**：涵盖分镜、角色设定、平面排版、信息图等场景
- **模板管理**：支持创建、编辑、删除自定义提示词模板
- **快速应用**：一键将模板应用到生成输入框

### 作品集与画廊
- **作品分类**：作品带有 `type` 字段，区分 `type_default`（生图）和 `type_icon`（ICON 母图）
- **分类展示**：
  - SamTo图 右侧作品集仅展示 `type_default` 图片
  - SamToICON 页面可查看 `type_icon` 原始母图
  - 我的作品集（画廊）展示所有作品，默认作品与 ICON 作品分区显示
- **图片处理**：支持裁剪、压缩、PNG/JPG 格式下载
- **图层叠加**：支持在图片上添加文字、SVG、图片三种类型的叠加图层
  - 文字图层：支持字体、大小、颜色、背景设置
  - SVG 图层：支持图标库搜索导入，可调整色调
  - 图片图层：支持贴纸、徽章、水印三种形状
- **图层操作**：支持拖拽定位、旋转、缩放、透明度调整、混合模式、图层排序
- **批量对齐**：支持多图层左对齐、居中、右对齐、水平/垂直分布

### 批量生成
- **多行提示词**：支持一次性输入多行提示词，逐条顺序生成
- **进度追踪**：实时显示每条提示词的生成状态（待处理/生成中/完成/失败）
- **结果统计**：批量任务完成后显示成功/失败数量

### 操作日志与历史记录
- **操作日志**：记录所有生成、批量任务、ICON 生成、模型检测、配置变更等操作
- **大模型请求记录**：按配置、生成模式、来源筛选已入库的生成结果
- **快速预览**：历史记录中可直接查看作品缩略图和生成参数
- **一键跳转**：从历史记录快速进入画廊查看作品详情

### 模型配置弹窗
- **统一入口**：模型配置统一收敛到顶部导航栏的弹窗，避免与历史页面功能重复
- **快速切换**：左侧配置列表支持一键切换活跃模型
- **新建配置**：弹窗内可直接新建模型配置，无需跳转独立页面
- **完整编辑**：支持修改服务地址、密钥、适配器、主模型、接口路径等全部参数
- **模型检测**：弹窗内直接验证模型连通性
- **模型列表获取**：支持从远程服务拉取可用模型列表并设为主模型

## 构建与打包

### 1. 仅生成桌面可执行文件

```powershell
npm.cmd run build:exe
```

生成后的可执行文件：

```text
src-tauri\target\release\SamImage.exe
```

### 2. 生成 MSI 安装包

```powershell
npm.cmd run build:msi
```

生成后的安装包：

```text
src-tauri\target\release\bundle\msi\SamuelXYZ_1.1.0_x64_en-US.msi
```

说明：项目内置 WiX 3.14 自动检测逻辑，按以下顺序查找：
1. 环境变量 `SAMIMAGE_WIX_DIR`
2. 固定目录 `D:\DevFiles\wix314-binaries`

如果 WiX 不在默认目录，先设置环境变量再打包：

```powershell
$env:SAMIMAGE_WIX_DIR="D:\your-path\wix314-binaries"
npm.cmd run build:msi
```

### 3. 生成 NSIS 安装包

```powershell
npm.cmd run build:nsis
```

### 4. 一键构建所有平台格式

```powershell
# 当前平台所有格式
npm.cmd run build:all

# 指定平台
npm.cmd run build:all:win    # Windows
npm.cmd run build:all:mac    # macOS
npm.cmd run build:all:linux  # Linux
```

### 支持的目标格式

| 平台 | 格式 |
|------|------|
| Windows | MSI、NSIS（.exe 安装包）、便携版 EXE |
| macOS | DMG（Intel x64 / Apple Silicon aarch64） |
| Linux | AppImage、DEB、RPM |

## 验证命令

```powershell
# 前端单元测试
npm.cmd run test

# 前端构建检查
npm.cmd run build

# Rust 代码检查
cargo check --manifest-path src-tauri/Cargo.toml
```

## 常见问题

### PowerShell 提示无法执行 npm.ps1

这是 PowerShell 执行策略导致的，直接使用 `npm.cmd` 即可：

```powershell
npm.cmd run build:msi
```

### `cargo metadata` 或 `link.exe` 找不到

- **缺少 cargo**：安装 Rust，确认 `cargo -V` 可执行
- **缺少 link.exe**：安装 Visual Studio Build Tools，勾选 "Desktop development with C++"

## 数据模型

### 作品类型（Artifact Type）

| 类型值 | 说明 | 展示位置 |
|--------|------|----------|
| `type_default` | 生图作品（SamTo图） | 生图页右侧作品集、画廊默认作品区 |
| `type_icon` | ICON 母图（SamToICON） | ICON 页参考图选取、画廊 ICON 作品区 |

作品类型在生成时自动标记，持久化存储到 SQLite，支持按类型筛选和展示。

## 版本历史

详见 [CHANGELOG.md](./CHANGELOG.md)

## 开源协议

MIT License
