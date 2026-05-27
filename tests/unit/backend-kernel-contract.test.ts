import { describe, expect, it } from 'vitest'
import appStateSource from '../../src-tauri/src/app_state.rs?raw'
import assetsApiSource from '../../src-tauri/src/api/assets.rs?raw'
import assetRepoSource from '../../src-tauri/src/db/asset_repo.rs?raw'
import apiModSource from '../../src-tauri/src/api/mod.rs?raw'
import dbSource from '../../src-tauri/src/db/mod.rs?raw'
import migrationSource from '../../src-tauri/src/db/migrations/0001_init.sql?raw'
import errorSource from '../../src-tauri/src/error.rs?raw'
import generationTasksApiSource from '../../src-tauri/src/api/generation_tasks.rs?raw'
import generationServiceSource from '../../src-tauri/src/domain/services/generation_service.rs?raw'
import assetFileServiceSource from '../../src-tauri/src/domain/services/asset_file_service.rs?raw'
import generationTaskRepoSource from '../../src-tauri/src/db/generation_task_repo.rs?raw'
import healthSource from '../../src-tauri/src/api/health.rs?raw'
import legacyImportApiSource from '../../src-tauri/src/api/legacy_import.rs?raw'
import promptAssetsApiSource from '../../src-tauri/src/api/prompt_assets.rs?raw'
import promptAssetRepoSource from '../../src-tauri/src/db/prompt_asset_repo.rs?raw'
import storyboardApiSource from '../../src-tauri/src/api/storyboard.rs?raw'
import storyboardRepoSource from '../../src-tauri/src/db/storyboard_repo.rs?raw'
import exportServiceSource from '../../src-tauri/src/domain/services/export_service.rs?raw'
import storyboardServiceSource from '../../src-tauri/src/domain/services/storyboard_service.rs?raw'
import libSource from '../../src-tauri/src/lib.rs?raw'

const apiSources = import.meta.glob('../../src-tauri/src/api/*.rs', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const promptPolishApiSource = apiSources['../../src-tauri/src/api/prompt_polish.rs'] ?? ''

describe('v2 backend kernel contracts', () => {
  it('initializes a dedicated v2 SQLite database with WAL', () => {
    expect(dbSource).toContain('samimage_v2.sqlite3')
    expect(dbSource).toContain('SqliteJournalMode::Wal')
    expect(dbSource).toContain('foreign_keys(true)')
    expect(dbSource).toContain('sqlx::migrate!')
  })

  it('starts with migration-owned metadata and core tables', () => {
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS app_meta')
    expect(migrationSource).toContain('schema_version')
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS model_profiles')
    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS prompt_assets')
  })

  it('adds a generation task table for image generation workflow state', async () => {
    const generationMigration = await import('../../src-tauri/src/db/migrations/0002_generation_tasks.sql?raw')

    expect(generationMigration.default).toContain('CREATE TABLE IF NOT EXISTS generation_tasks')
    expect(generationTaskRepoSource).toContain("'image_generation'")
    expect(generationMigration.default).toContain('schema_version')
  })

  it('adds a creative asset table for generated outputs', async () => {
    const assetMigration = await import('../../src-tauri/src/db/migrations/0003_assets.sql?raw')

    expect(assetMigration.default).toContain('CREATE TABLE IF NOT EXISTS assets')
    expect(assetMigration.default).toContain("'storyboard_frame'")
    expect(assetMigration.default).toContain('source_task_id')
    expect(assetRepoSource).toContain('pub async fn list_assets')
    expect(assetRepoSource).toContain('pub async fn get_asset')
    expect(assetRepoSource).toContain('pub async fn upsert_asset')
    expect(assetRepoSource).toContain('pub async fn toggle_asset_favorite')
    expect(assetRepoSource).toContain('pub async fn delete_asset')
    expect(assetRepoSource).toContain('pub async fn delete_assets')
    expect(assetRepoSource).toContain('pool.begin()')
    expect(assetsApiSource).toContain('fn list_assets')
    expect(assetsApiSource).toContain('fn toggle_asset_favorite')
    expect(assetsApiSource).toContain('fn delete_asset')
    expect(assetsApiSource).toContain('fn delete_assets')
    expect(assetsApiSource).toContain('fn export_icon_package')
    expect(assetsApiSource).toContain('fn download_asset_to_path')
    expect(assetsApiSource).toContain('fn download_asset_with_dialog')
    expect(assetsApiSource).toContain('default_download_file_name')
    expect(assetsApiSource).toContain('materialize_asset_preview')
    expect(assetsApiSource).toContain('preview_uri')
    expect(exportServiceSource).toContain('export_icon_package')
    expect(exportServiceSource).toContain('build_zip')
    expect(exportServiceSource).toContain('icon-source.png')
    expect(exportServiceSource).toContain('ICON_EXPORT_SIZES')
    expect(exportServiceSource).toContain('icon-16x16.png')
    expect(exportServiceSource).toContain('icon-32x32.png')
    expect(exportServiceSource).toContain('icon-64x64.png')
    expect(exportServiceSource).toContain('icon-128x128.png')
    expect(exportServiceSource).toContain('icon-256x256.png')
    expect(exportServiceSource).toContain('icon-512x512.png')
    expect(exportServiceSource).toContain('samimage-icon.ico')
    expect(libSource).toContain('list_assets')
    expect(libSource).toContain('toggle_asset_favorite')
    expect(libSource).toContain('delete_asset')
    expect(libSource).toContain('delete_assets')
    expect(libSource).toContain('export_icon_package')
    expect(libSource).toContain('download_asset_to_path')
    expect(libSource).toContain('download_asset_with_dialog')
  })

  it('adds storyboard project tables and a default draft service', async () => {
    const storyboardMigration = await import('../../src-tauri/src/db/migrations/0004_storyboard.sql?raw')

    expect(storyboardMigration.default).toContain('CREATE TABLE IF NOT EXISTS projects')
    expect(storyboardMigration.default).toContain('CREATE TABLE IF NOT EXISTS storyboard_characters')
    expect(storyboardMigration.default).toContain('CREATE TABLE IF NOT EXISTS storyboard_scenes')
    expect(storyboardMigration.default).toContain('CREATE TABLE IF NOT EXISTS storyboard_shots')
    expect(storyboardApiSource).toContain('StoryboardDraftInput')
    expect(storyboardApiSource).toContain('fn create_storyboard_draft')
    expect(storyboardApiSource).toContain('fn list_storyboard_projects')
    expect(storyboardApiSource).toContain('fn load_storyboard_draft')
    expect(storyboardApiSource).toContain('UpdateStoryboardShotInput')
    expect(storyboardApiSource).toContain('fn update_storyboard_shot')
    expect(storyboardApiSource).toContain('fn reorder_storyboard_shots')
    expect(storyboardApiSource).toContain('fn export_storyboard_pdf')
    expect(storyboardRepoSource).toContain('save_storyboard_draft')
    expect(storyboardRepoSource).toContain('list_storyboard_projects')
    expect(storyboardRepoSource).toContain('load_storyboard_draft')
    expect(storyboardRepoSource).toContain('update_storyboard_shot')
    expect(storyboardRepoSource).toContain('reorder_storyboard_shots')
    expect(storyboardRepoSource).toContain('mark_storyboard_shot_done')
    expect(storyboardRepoSource).toContain('mark_storyboard_shot_status')
    expect(storyboardServiceSource).toContain('create_default_storyboard_draft')
    expect(storyboardServiceSource).toContain('samimage-default-draft')
    expect(exportServiceSource).toContain('export_storyboard_pdf')
    expect(exportServiceSource).toContain('%PDF-1.4')
    expect(exportServiceSource).toContain('embeddedFrameCount')
    expect(exportServiceSource).toContain('/Subtype /Image')
    expect(exportServiceSource).toContain('load_storyboard_frame_image')
    expect(exportServiceSource).toContain('asset_repo::upsert_asset')
    expect(libSource).toContain('create_storyboard_draft')
    expect(libSource).toContain('list_storyboard_projects')
    expect(libSource).toContain('load_storyboard_draft')
    expect(libSource).toContain('update_storyboard_shot')
    expect(libSource).toContain('reorder_storyboard_shots')
    expect(libSource).toContain('export_storyboard_pdf')
  })

  it('uses shared app state and a typed error boundary', () => {
    expect(appStateSource).toContain('pub struct AppState')
    expect(appStateSource).toContain('pub db: SqlitePool')
    expect(errorSource).toContain('pub enum AppError')
    expect(errorSource).toContain('impl Serialize for AppError')
  })

  it('registers a v2 health command backed by database state', () => {
    expect(healthSource).toContain('pub struct HealthResponse')
    expect(healthSource).toContain('app_data_dir')
    expect(healthSource).toContain('SELECT value FROM app_meta')
    expect(libSource).toContain('health_check')
    expect(libSource).toContain('app.manage(state)')
  })

  it('persists prompt market assets through SQLite repositories', () => {
    expect(promptAssetsApiSource).toContain('fn list_prompt_assets')
    expect(promptAssetsApiSource).toContain('fn import_prompt_assets')
    expect(promptAssetsApiSource).toContain('fn increment_prompt_usage')
    expect(promptAssetsApiSource).toContain('fn sync_prompt_source')
    expect(promptAssetsApiSource).toContain('banana-prompt-quicker')
    expect(promptAssetsApiSource).toContain('ingested_tweets.json')
    expect(promptAssetRepoSource).toContain('INSERT INTO prompt_assets')
    expect(promptAssetRepoSource).toContain('UPDATE prompt_assets')
    expect(libSource).toContain('list_prompt_assets')
  })

  it('provides a manual legacy JSON import entry for 1.x data', () => {
    expect(legacyImportApiSource).toContain('LegacyImportReport')
    expect(legacyImportApiSource).toContain('fn import_legacy_json')
    expect(legacyImportApiSource).toContain('collect_legacy_assets')
    expect(legacyImportApiSource).toContain('collect_legacy_prompts')
    expect(legacyImportApiSource).toContain('promptTemplates')
    expect(legacyImportApiSource).toContain('galleryArtifacts')
    expect(legacyImportApiSource).toContain('asset_repo::upsert_asset')
    expect(legacyImportApiSource).toContain('prompt_asset_repo::import_prompt_assets')
    expect(libSource).toContain('import_legacy_json')
  })

  it('creates image generation tasks through a SQLite repository', () => {
    expect(generationTasksApiSource).toContain('fn create_image_generation_task')
    expect(generationTasksApiSource).toContain('CreateBatchImageGenerationTasksInput')
    expect(generationTasksApiSource).toContain('fn create_batch_image_generation_tasks')
    expect(generationTasksApiSource).toContain('fn list_generation_tasks')
    expect(generationTasksApiSource).toContain('fn run_image_generation_task')
    expect(generationTasksApiSource).toContain('fn cancel_generation_task')
    expect(generationTasksApiSource).toContain('fn retry_generation_task')
    expect(generationTasksApiSource).toContain('fn clear_finished_generation_tasks')
    expect(generationTaskRepoSource).toContain('INSERT INTO generation_tasks')
    expect(generationTaskRepoSource).toContain("'image_generation'")
    expect(generationTaskRepoSource).toContain('pub async fn create_batch_image_generation_tasks')
    expect(generationTaskRepoSource).toContain('group_id')
    expect(generationTaskRepoSource).toContain('project_id')
    expect(generationTaskRepoSource).toContain('shotId')
    expect(generationTaskRepoSource).toContain('compareGroupId')
    expect(generationTaskRepoSource).toContain('input.models.get(index)')
    expect(generationTaskRepoSource).toContain('referenceImages')
    expect(generationTaskRepoSource).toContain('pub async fn cancel_generation_task')
    expect(generationTaskRepoSource).toContain('pub async fn retry_generation_task')
    expect(generationTaskRepoSource).toContain('pub async fn clear_finished_generation_tasks')
    expect(generationTaskRepoSource).toContain("'cancelled'")
    expect(generationTaskRepoSource).toContain('retry_of')
    expect(generationServiceSource).toContain('call_image_model')
    expect(generationServiceSource).toContain('reference_images')
    expect(generationServiceSource).toContain('resolve_reference_images_for_model')
    expect(generationServiceSource).toContain('IMAGE_MODEL_TIMEOUT_SECS')
    expect(generationServiceSource).toContain('referenceImageCount')
    expect(generationServiceSource).toContain('compareGroupId')
    expect(generationServiceSource).toContain('asset_repo::upsert_asset')
    expect(generationServiceSource).toContain('GeneratedImageSource')
    expect(generationServiceSource).toContain('parse_image_model_response')
    expect(generationServiceSource).toContain('response.bytes()')
    expect(generationServiceSource).toContain('asset_file_service::bytes_to_data_url')
    expect(generationServiceSource).toContain('uri.clone()')
    expect(generationServiceSource).toContain('thumbnail_uri: None')
    expect(generationServiceSource).toContain('asset_source_kind')
    expect(generationServiceSource).toContain('sourceKind')
    expect(generationServiceSource).not.toContain('localize_generated_image')
    expect(generationServiceSource).not.toContain('localize_image_bytes')
    expect(generationServiceSource).not.toContain('assets/images/generated')
    expect(generationServiceSource).not.toContain('assets/thumbnails/generated')
    expect(assetFileServiceSource).toContain('pub fn bytes_to_data_url')
    expect(assetFileServiceSource).toContain('read_asset_uri_data_url')
    expect(assetFileServiceSource).toContain('copy_asset_to_path')
    expect(generationTasksApiSource).toContain('state.app_data_dir')
    expect(generationServiceSource).toContain('asset_kind_for_workflow')
    expect(generationServiceSource).toContain('"storyboard_frame"')
    expect(generationServiceSource).toContain('mark_storyboard_shot_done')
    expect(generationServiceSource).toContain('mark_storyboard_shot_status')
    expect(generationServiceSource).toContain('AUTHORIZATION')
    expect(generationServiceSource).toContain('只能执行排队中的 image_generation 任务')
    expect(libSource).toContain('create_image_generation_task')
    expect(libSource).toContain('create_batch_image_generation_tasks')
    expect(libSource).toContain('run_image_generation_task')
    expect(libSource).toContain('cancel_generation_task')
    expect(libSource).toContain('retry_generation_task')
    expect(libSource).toContain('clear_finished_generation_tasks')
  })

  it('provides an OpenAI-compatible text-model command for prompt polishing', () => {
    expect(apiModSource).toContain('pub mod prompt_polish')
    expect(promptPolishApiSource).toContain('pub struct PolishPromptInput')
    expect(promptPolishApiSource).toContain('pub struct PolishPromptResponse')
    expect(promptPolishApiSource).toContain('fn polish_prompt')
    expect(promptPolishApiSource).toContain('ModelCapability::Text')
    expect(promptPolishApiSource).toContain('model_profile_repo::get_api_key_ref')
    expect(promptPolishApiSource).toContain('chat/completions')
    expect(promptPolishApiSource).toContain('messages')
    expect(promptPolishApiSource).toContain('只输出润色后的提示词')
    expect(promptPolishApiSource).toContain('choices')
    expect(promptPolishApiSource).toContain('output_text')
    expect(libSource).toContain('polish_prompt')
  })
})
