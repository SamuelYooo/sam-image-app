# CLAUDE.md

This file provides guidance to MiMo Code (claude.ai/code) when working with code in this repository.

## Project Overview

SamImage 3.0 is a Tauri 2 desktop application for AI-powered image generation and processing. It supports 6 generation protocols (OpenAI Images, OpenAI Image Edits, Dashscope Wanxiang, Multimodal Chat, MGTV Storyboard, OpenAI Audio Speech) with 18+ built-in creative tools.

**Primary language:** The UI and documentation are in Chinese (Simplified).

## Commands

### Development
```bash
npm run dev          # Vite dev server (frontend only) on 127.0.0.1:3030
npm run tauri:dev    # Full Tauri desktop dev mode (frontend + Rust backend)
```

### Build
```bash
npm run build        # Type-check + Vite build (frontend only)
npm run build:tauri  # Full Tauri desktop build with packaging
npm run build:win    # Windows NSIS + MSI installers
```

### Testing
```bash
npm run test         # Frontend unit tests (Vitest, pattern: src/**/*.test.ts)
npm run test:rust    # Rust integration tests (cargo test)
npm run test:e2e     # E2E tests (Playwright, Chromium 1440x900)
npm run check        # Full CI: lint + test + test:rust + build
npm run check:release # Full CI + E2E + build:app
```

Run a single frontend test file:
```bash
npx vitest run src/domain/__tests__/tools.test.ts
```

### Lint
```bash
npm run lint         # ESLint with zero warnings allowed
```

## Architecture

### Frontend (Vue 3 + TypeScript)

- **Entry:** `src/main.ts` -> `App.vue` -> `AppShell.vue` (layout) + `<RouterView>`
- **Routes:** 7 pages in `src/pages/` -- Home, Workspace, Tools, History (asset library), OperationHistory, Settings, About
- **State:** Single large Pinia store at `src/stores/app.ts` manages models, tasks, settings, prompts, and UI state
- **Domain logic:** Pure TS functions in `src/domain/` -- canvas ops, post-processing pipeline, tool effects, GIF synthesis, ZIP packing, icon export
- **Data catalog:** `src/data/catalog.ts` (52KB) defines all 18+ tools with modes, prompt seeds, recommended sizes, controls, and post-processing rules
- **Types:** All domain interfaces in `src/types/domain.ts`
- **Tauri bridge:** `src/services/tauri.ts` provides `invokeOptional()` with browser fallbacks for web preview mode
- **Styling:** TailwindCSS 4 (`@tailwindcss/vite` plugin) + CSS custom properties in `src/styles/`

### Backend (Tauri 2 / Rust)

- **Entry:** `src-tauri/src/main.rs` -> `lib.rs` (Tauri builder, plugin setup, SQLite init, command registration)
- **IPC commands:** 12 commands in `src-tauri/src/commands.rs` -- task CRUD, asset export, state persistence, prompt polish, model testing
- **Generation dispatch:** `src-tauri/src/generation.rs` (56KB) implements protocol routing for all 6 generation backends
- **Data layer:** SQLite via sqlx (WAL mode) at `{app_data_dir}/samimage-v3.sqlite3` -- tables: `generation_tasks`, `app_settings`
- **Secondary storage:** Browser localStorage (`samimage.v3.state`) for models, prompts, tasks, cover presets, settings
- **Error handling:** `src-tauri/src/error.rs` -- `AppError` enum with thiserror + tagged serde serialization

### Key Patterns

- The frontend uses `<script setup>` with Composition API exclusively
- `src/services/tauri.ts` allows the app to run in browser-only mode (web preview) without Tauri -- all Tauri IPC calls go through `invokeOptional()` which gracefully falls back
- The generation pipeline uses a protocol-based dispatch: the frontend sends a `GenerationInput`, and the Rust backend routes to the correct protocol handler based on the model profile's protocol field
- Windows-specific: `scripts/tauri-cli.cjs` handles port 3030 conflict resolution and orphan process cleanup; `scripts/predev-check.cjs` validates the dev environment

## Tech Stack

- **Frontend:** Vue 3.5, TypeScript 5.7 (strict), Vite 6, Pinia 2.3, Vue Router 4.5, TailwindCSS 4
- **Backend:** Tauri 2.x (Rust edition 2024, requires >= 1.85), reqwest, sqlx, axum, tokio
- **Testing:** Vitest 2.1 + happy-dom (frontend), cargo test (Rust), Playwright 1.60 (E2E)
- **Package manager:** npm 11 (pinned)
- **Icons:** lucide-vue-next
