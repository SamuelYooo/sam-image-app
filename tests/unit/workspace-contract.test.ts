import { describe, expect, it } from 'vitest'
import workbenchSource from '../../src/features/workspace/SamImageWorkbench.vue?raw'
import appShellSource from '../../src/app/AppShell.vue?raw'
import appMotionSource from '../../src/utils/appMotion.ts?raw'
import assetsPageSource from '../../src/pages/AssetsPage.vue?raw'
import projectsPageSource from '../../src/pages/ProjectsPage.vue?raw'
import promptsMarketPageSource from '../../src/pages/PromptsMarketPage.vue?raw'
import settingsPageSource from '../../src/pages/SettingsPage.vue?raw'
import tasksPageSource from '../../src/pages/TasksPage.vue?raw'
import defaultCreativeAssetsSource from '../../src/data/defaultCreativeAssets.ts?raw'
import legacyImportTemplateSource from '../../src/data/legacyImportTemplate.ts?raw'
import assetStoreSource from '../../src/stores/assetStore.ts?raw'
import modelStoreSource from '../../src/stores/modelStore.ts?raw'
import promptMarketStoreSource from '../../src/stores/promptMarketStore.ts?raw'
import storyboardStoreSource from '../../src/stores/storyboardStore.ts?raw'
import taskStoreSource from '../../src/stores/taskStore.ts?raw'
import workspaceStoreSource from '../../src/stores/workspaceStore.ts?raw'
import appSource from '../../src/App.vue?raw'
import mainSource from '../../src/main.ts?raw'
import rustLibSource from '../../src-tauri/src/lib.rs?raw'
import modelProfilesApiSource from '../../src-tauri/src/api/model_profiles.rs?raw'
import modelProfileRepoSource from '../../src-tauri/src/db/model_profile_repo.rs?raw'
import viteConfigSource from '../../vite.config.ts?raw'
import packageJsonSource from '../../package.json?raw'

const mainCssSource = process
  .getBuiltinModule('fs')
  .readFileSync(new URL('../../src/assets/main.css', import.meta.url), 'utf-8')
const tauriConfigSource = process
  .getBuiltinModule('fs')
  .readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf-8')
const tauriCargoSource = process
  .getBuiltinModule('fs')
  .readFileSync(new URL('../../src-tauri/Cargo.toml', import.meta.url), 'utf-8')

describe('workspace design contracts', () => {
  it('uses the 2.0 workbench instead of the template welcome page', () => {
    expect(appSource).toContain('AppShell')
    expect(appShellSource).toContain('SamImageWorkbench')
    expect(appShellSource).toContain('AssetsPage')
    expect(appShellSource).toContain('TasksPage')
    expect(appShellSource).toContain('ProjectsPage')
    expect(appShellSource).toContain('PromptsMarketPage')
    expect(appShellSource).toContain('SettingsPage')
    expect(appSource).not.toContain('Welcome to Tauri 2 + Vue')
    expect(appSource).not.toContain('GreetComponent')
  })

  it('installs global animejs motion for button press and page transitions', () => {
    expect(appShellSource).toContain('installAppMotion')
    expect(appShellSource).toContain('animatePageEnter')
    expect(appShellSource).toContain('animatePageLeave')
    expect(appShellSource).toContain('<Transition appear mode="out-in" :css="false"')
    expect(appShellSource).toContain('class="sam-page-motion"')
    expect(appMotionSource).toContain("from 'animejs'")
    expect(appMotionSource).toContain('stagger')
    expect(appMotionSource).toContain('PRESSABLE_SELECTOR')
    expect(appMotionSource).not.toContain('[role="button"]')
    expect(appMotionSource).toContain('sam-motion-pressing')
    expect(appMotionSource).toContain('sam-touch-ripple')
    expect(appMotionSource).toContain('prefers-reduced-motion: reduce')
    expect(mainCssSource).toContain('.sam-page-motion')
    expect(mainCssSource).toContain('.sam-motion-target')
    expect(mainCssSource).toContain('.sam-motion-pressing')
    expect(mainCssSource).toContain('.sam-touch-ripple')
    expect(mainCssSource).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('keeps the app shell constrained so narrow task queues are not clipped sideways', () => {
    expect(mainCssSource).toMatch(/\.sam-app-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/)
    expect(mainCssSource).toMatch(/\.sam-page-motion\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/)
    expect(mainCssSource).toMatch(/\.sam-app-nav\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/)
    expect(mainCssSource).toMatch(/\.sam-app-nav-tabs\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/)
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*480px\)\s*\{[\s\S]*\.sam-app-nav-tabs\s*\{[^}]*width:\s*100%;[^}]*overflow-x:\s*hidden;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*480px\)\s*\{[\s\S]*\.sam-app-nav-tabs button\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;[^}]*font-size:\s*11px;[^}]*\}/
    )
  })

  it('keeps Vue developer tooling opt-in so it does not cover the application UI', () => {
    expect(mainSource).not.toContain("import { devtools } from '@vue/devtools'")
    expect(mainSource).toContain("VITE_ENABLE_VUE_DEVTOOLS === 'true'")
    expect(viteConfigSource).toContain('ENABLE_VUE_DEVTOOLS')
    expect(viteConfigSource).toContain('...devtoolPlugins')
    expect(packageJsonSource).toContain('"dev": "pnpm vite:dev"')
    expect(packageJsonSource).toContain('"dev:with-devtools"')
  })

  it('provides a dedicated asset library page', () => {
    expect(appShellSource).toContain('资产库')
    expect(appShellSource).toContain('#assets')
    expect(appShellSource).toContain('setActivePage')
    expect(assetsPageSource).toContain('useAssetStore')
    expect(assetsPageSource).toContain('filteredCreativeAssets')
    expect(assetsPageSource).toContain('assetSearchQuery')
    expect(assetsPageSource).toContain('资产详情')
    expect(assetsPageSource).toContain('selectedAssetIds')
    expect(assetsPageSource).toContain('全选当前筛选')
    expect(assetsPageSource).toContain('copySelectedPrompts')
    expect(assetsPageSource).toContain('reuseAssetPrompt')
    expect(assetsPageSource).toContain('useAssetAsReference')
    expect(assetsPageSource).toContain('作为参考图')
    expect(assetsPageSource).toContain('再次生成')
    expect(assetsPageSource).toContain('downloadAsset')
    expect(assetsPageSource).toContain('下载原图')
    expect(assetsPageSource).toContain('useWorkspaceStore')
    expect(assetsPageSource).toContain('deleteSelectedAssets')
    expect(assetsPageSource).toContain('toggleAssetFavorite')
    expect(assetsPageSource).toContain('deleteAsset')
    expect(assetsPageSource).toContain('exportIconPackage')
    expect(assetsPageSource).toContain("daily: '日常生图'")
    expect(assetsPageSource).toContain('getWorkflowLabel(workflow)')
    expect(assetsPageSource).toContain('getWorkflowLabel(selectedAsset.workflowId)')
    expect(assetsPageSource).toContain('导出 ICON 包')
  })

  it('keeps asset selection out of the preview image content', () => {
    expect(assetsPageSource).toMatch(
      /<button class="sam-asset-card-preview"[\s\S]*?<\/button>\s*<div class="sam-asset-card-body">\s*<div class="sam-result-heading">\s*<label class="sam-asset-select"/
    )
    expect(mainCssSource).not.toMatch(/\.sam-asset-select\s*\{[^}]*position:\s*absolute;[^}]*\}/)
    expect(mainCssSource).toMatch(
      /\.sam-asset-card \.sam-result-heading\s*\{[^}]*grid-template-columns:\s*28px minmax\(0,\s*1fr\) 28px;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /\.sam-asset-card \.sam-result-heading strong\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;[^}]*\}/
    )
  })

  it('provides a dedicated task queue page', () => {
    expect(appShellSource).toContain('#tasks')
    expect(appShellSource).toContain('任务')
    expect(tasksPageSource).toContain('useTaskStore')
    expect(tasksPageSource).toContain('任务队列')
    expect(tasksPageSource).toContain('filteredGenerationTasks')
    expect(tasksPageSource).toContain('taskStatusCounts')
    expect(tasksPageSource).toContain('runSelectedPendingTasks')
    expect(tasksPageSource).toContain('cancelSelectedTasks')
    expect(tasksPageSource).toContain('clearFinishedTasks')
    expect(tasksPageSource).toContain('复制提示词')
    expect(taskStoreSource).toContain('filterGenerationTasks')
    expect(taskStoreSource).toContain('selectedTaskIds')
    expect(taskStoreSource).toContain('clearFinishedGenerationTasks')
    expect(taskStoreSource).toContain("invoke<GenerationTask[]>('clear_finished_generation_tasks'")
  })

  it('provides a dedicated prompts market page', () => {
    expect(appShellSource).toContain('#prompts')
    expect(appShellSource).toContain('提示词')
    expect(promptsMarketPageSource).toContain('usePromptMarketStore')
    expect(promptsMarketPageSource).toContain('promptUseCaseOptions')
    expect(promptsMarketPageSource).toContain('getPromptUseCaseLabel(useCase)')
    expect(promptsMarketPageSource).toContain('getPromptTagLabel(tag)')
    expect(promptsMarketPageSource).toContain('getPromptDisplayTags(item)')
    expect(promptsMarketPageSource).toContain("reference: '参考'")
    expect(promptsMarketPageSource).toContain('导入 JSON')
    expect(promptsMarketPageSource).toContain('下载模板')
    expect(promptsMarketPageSource).toContain('syncPromptSource')
    expect(promptsMarketPageSource).toContain('copyPrompt')
    expect(promptsMarketPageSource).toContain('useWorkspaceStore')
    expect(promptsMarketPageSource).toContain('insertWorkspacePrompt')
    expect(promptsMarketPageSource).toContain('replaceWorkspacePrompt')
    expect(promptsMarketPageSource).toContain('插入到工作台')
    expect(promptsMarketPageSource).toContain('覆盖工作台')
    expect(workbenchSource).toContain('useWorkspaceStore')
    expect(workspaceStoreSource).toContain('replacePromptText')
    expect(workspaceStoreSource).toContain('insertPromptText')
    expect(workspaceStoreSource).toContain('referenceImages')
    expect(workspaceStoreSource).toContain('addReferenceImages')
  })

  it('provides a dedicated projects page for storyboard drafts', () => {
    expect(appShellSource).toContain('#projects')
    expect(appShellSource).toContain('项目')
    expect(projectsPageSource).toContain('useStoryboardStore')
    expect(projectsPageSource).toContain('分镜项目管理')
    expect(projectsPageSource).toContain('loadStoryboardProjects')
    expect(projectsPageSource).toContain('openStoryboardProject')
    expect(projectsPageSource).toContain('exportStoryboardPdf')
    expect(storyboardStoreSource).toContain("invoke<StoryboardProject[]>('list_storyboard_projects'")
    expect(storyboardStoreSource).toContain("invoke<StoryboardDraft | null>('load_storyboard_draft'")
  })

  it('provides a dedicated settings page for mandatory model configuration', () => {
    expect(appShellSource).toContain('#settings')
    expect(appShellSource).toContain('设置')
    expect(settingsPageSource).toContain('useModelStore')
    expect(settingsPageSource).toContain('模型配置中心')
    expect(settingsPageSource).toContain('未配置图像模型')
    expect(settingsPageSource).toContain('文本模型配置')
    expect(settingsPageSource).toContain('图像模型配置')
    expect(settingsPageSource).toContain('检测并获取模型')
    expect(settingsPageSource).toContain('真实模型列表')
    expect(settingsPageSource).toContain('sam-channel-editor')
    expect(settingsPageSource).toContain('sam-channel-model-list')
    expect(settingsPageSource).toContain('sam-channel-model-actions')
    expect(settingsPageSource).toContain('settingsModelOptionSearch')
    expect(settingsPageSource).toContain('filteredSettingsModelOptions')
    expect(settingsPageSource).toContain('selectDetectedModel')
    expect(settingsPageSource).toContain('清空已选')
    expect(settingsPageSource).toContain('删除配置')
    expect(settingsPageSource).toContain('保存配置')
    expect(settingsPageSource).toContain('旧数据导入')
    expect(settingsPageSource).toContain('导入旧数据')
    expect(settingsPageSource).toContain('createLegacyImportTemplateJson')
    expect(settingsPageSource).toContain("invoke<LegacyImportReport>('import_legacy_json'")
    expect(legacyImportTemplateSource).toContain('promptTemplates')
    expect(legacyImportTemplateSource).toContain('type_icon')
    expect(modelStoreSource).toContain('editModelProfile')
    expect(modelStoreSource).toContain('closeModelConfig')
  })

  it('lays out model settings as a two-column configuration workspace', () => {
    expect(mainCssSource).toContain('.sam-settings-page')
    expect(mainCssSource).toContain('grid-template-columns: minmax(260px, 340px) minmax(0, 1fr)')
    expect(mainCssSource).toContain('.sam-settings-hero')
    expect(mainCssSource).toContain('.sam-settings-status-grid')
    expect(mainCssSource).toContain('.sam-settings-panel.settings-channel')
    expect(mainCssSource).toContain('.sam-settings-panel.legacy-import')
    expect(mainCssSource).toContain('@media (max-width: 1100px)')
    expect(mainCssSource).toMatch(/\.sam-settings-hero > button\s*\{[^}]*min-height:\s*34px;[^}]*\}/)
    expect(mainCssSource).toMatch(
      /\.sam-channel-model-list\.settings \.sam-channel-model-actions\s*\{[^}]*grid-template-columns:\s*minmax\(180px,\s*1fr\) repeat\(4,\s*max-content\);[^}]*\}/
    )
  })

  it('keeps the image studio workbench structure visible', () => {
    expect(workbenchSource).toContain('sam-sidebar')
    expect(workbenchSource).toContain('历史记录')
    expect(workbenchSource).toContain('sam-composer')
    expect(workbenchSource).toContain('提示词市场')
    expect(workbenchSource).toContain('任务队列')
  })

  it('keeps the workbench task queue visible in compact layouts', () => {
    expect(mainCssSource).toContain('@media (max-width: 1360px)')
    expect(mainCssSource).toContain('grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);')
    expect(mainCssSource).toContain('grid-template-columns: minmax(0, 1fr) minmax(250px, 300px);')
    expect(mainCssSource).toContain('grid-column: 2;\n    grid-row: 1;')
    expect(mainCssSource).toContain('.sam-prompt-panel {\n    display: none;')
    expect(mainCssSource).toContain('grid-template-rows: minmax(0, 1fr) minmax(180px, 30vh);')
    expect(mainCssSource).not.toContain('.sam-inspector {\n    display: none;\n  }\n}')
  })

  it('keeps echoed workflow icons color-matched with the workflow navigation', () => {
    expect(workbenchSource).toContain('color: string')
    expect(workbenchSource).toContain('createWorkflowColorStyle')
    expect(workbenchSource).toContain(':style="createWorkflowColorStyle(workflow.color)"')
    expect(workbenchSource).toContain(':style="createWorkflowColorStyle(activeWorkflowMeta.color)"')
    expect(workbenchSource).toContain('sam-composer-workflow-icon')
    expect(workbenchSource).toContain(':class="[\'sam-composer-workflow-icon\', activeWorkflowMeta.icon]"')
    expect(workbenchSource).toContain("'--sam-workflow-color'")
    expect(workbenchSource).toContain('sam-model-pill-label')
    expect(mainCssSource).toMatch(/\.sam-model-pill\s*\{[^}]*max-width:\s*clamp\(144px,\s*24vw,\s*260px\);[^}]*overflow:\s*hidden;[^}]*white-space:\s*nowrap;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-model-pill-label\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*\}/)
  })

  it('opens recent drafts into the active workspace', () => {
    expect(workbenchSource).toContain("workflowId: 'daily'")
    expect(workbenchSource).toContain("workflowId: 'icon'")
    expect(workbenchSource).toContain("workflowId: 'storyboard'")
    expect(workbenchSource).toContain('activeConversation')
    expect(workbenchSource).toContain('activeConversationAssets')
    expect(workbenchSource).toContain('openConversationDraft(conversation)')
    expect(workbenchSource).toContain('workspaceStore.replacePromptText(conversation.prompt)')
    expect(workbenchSource).toContain('setActiveWorkflow(conversation.workflowId)')
    expect(workbenchSource).toContain('normalizeDraftText(asset.promptText) === prompt')
  })

  it('clears storyboard draft state when leaving the storyboard workflow', () => {
    expect(storyboardStoreSource).toContain('clearCurrentDraft()')
    expect(storyboardStoreSource).toContain('this.currentDraft = null')
    expect(workbenchSource).toContain('function clearStoryboardWorkspaceState()')
    expect(workbenchSource).toContain('storyboardStore.clearCurrentDraft()')
    expect(workbenchSource).toContain('selectedStoryboardShotIds.value = []')
    expect(workbenchSource).toContain('function setActiveWorkflow(workflowId: WorkflowId)')
    expect(workbenchSource).toContain("activeWorkflow.value === 'storyboard' && workflowId !== 'storyboard'")
    expect(workbenchSource).toContain('@click="setActiveWorkflow(workflow.id)"')
    expect(workbenchSource).toContain('v-if="activeWorkflow === \'storyboard\' && currentDraft"')
  })

  it('groups recent drafts and assets behind workspace tabs', () => {
    expect(workbenchSource).toContain("type RecentPanelTab = 'drafts' | 'assets'")
    expect(workbenchSource).toContain("const activeRecentPanelTab = ref<RecentPanelTab>('drafts')")
    expect(workbenchSource).toContain('sam-recent-tabs')
    expect(workbenchSource).toContain("activeRecentPanelTab === 'drafts'")
    expect(workbenchSource).toContain("activeRecentPanelTab === 'assets'")
    expect(workbenchSource).toContain('class="sam-history-item compact"')
    expect(workbenchSource).toContain('sam-history-title-row')
    expect(workbenchSource).toContain('sam-history-prompt-preview')
    expect(workbenchSource).toContain('最近草稿')
    expect(workbenchSource).toContain('最近资产')
    expect(workbenchSource).not.toContain('sam-new-session')
    expect(workbenchSource).not.toContain('新建创作')
  })

  it('uses the right inspector for a taller task queue instead of duplicate recent assets', () => {
    expect(workbenchSource).toContain('class="sam-panel sam-task-panel"')
    expect(workbenchSource).toContain('generationTasks.value.slice(0, 8)')
    expect(workbenchSource).not.toContain(
      '<span>最近资产</span>\n            <button type="button" @click="assetStore.loadAssets">刷新</button>'
    )
    expect(workbenchSource).not.toContain('class="sam-asset-list"')
  })

  it('opens task queue details from one stable card target without nested collapsible layers', () => {
    expect(workbenchSource).toContain('const selectedTaskId = ref<string | null>(null)')
    expect(workbenchSource).toMatch(/const selectedTask = computed\([\s\S]*generationTasks\.value\.find\(task => task\.id === selectedTaskId\.value\)[\s\S]*\)/)
    expect(workbenchSource).toContain('const selectedTaskAssets = computed')
    expect(workbenchSource).toContain('function closeWorkspaceModals')
    expect(workbenchSource).toContain('function isTaskCardControlTarget(event: Event)')
    expect(workbenchSource).toContain('function openTaskDetailFromCard(event: MouseEvent, task: GenerationTask)')
    expect(workbenchSource).toContain('function openTaskDetail(task: GenerationTask)')
    expect(workbenchSource).toContain("closeWorkspaceModals('taskDetail')")
    expect(workbenchSource).toContain("closeWorkspaceModals('assetDetail')")
    expect(workbenchSource).toContain("closeWorkspaceModals('modelConfig')")
    expect(workbenchSource).toContain('function closeTaskDetail()')
    expect(workbenchSource).toMatch(/function closeTaskDetail\(\) \{\s+closeWorkspaceModals\(\)\s+\}/)
    expect(workbenchSource).toMatch(/function closeAssetDetail\(\) \{\s+closeWorkspaceModals\(\)\s+\}/)
    expect(workbenchSource).toContain("task.priority == null ? '普通' : String(task.priority)")
    expect(workbenchSource).toMatch(/async function retryTask\(task: GenerationTask\)[\s\S]*if \(selectedTaskId\.value === task\.id\)[\s\S]*closeTaskDetail\(\)/)
    expect(workbenchSource).toMatch(
      /<article\s+v-for="task in visibleGenerationTasks"[\s\S]*?@click="openTaskDetailFromCard\(\$event, task\)"/
    )
    expect(workbenchSource).not.toContain('role="button"\n              tabindex="0"')
    expect(workbenchSource).toContain("event.target.closest('button, input, label, select, textarea, a')")
    expect(workbenchSource).toContain('@click.stop="openTaskDetail(task)"')
    expect(workbenchSource).toContain('class="sam-task-summary"')
    expect(workbenchSource).toContain('class="sam-task-output-badges"')
    expect(workbenchSource).not.toMatch(/class="sam-task-output-list"[\s\S]*?<button/)
    expect(workbenchSource).not.toContain('return task.error ? `${base} · ${task.error}` : base')
    expect(workbenchSource).toContain("return '生成失败，错误详情已放在下方'")
    expect(workbenchSource).not.toContain("return task.error || '生成失败，等待重试'")
    expect(workbenchSource).toContain('sam-task-detail-modal')
    expect(workbenchSource).toContain('<Teleport to="body">')
    expect(workbenchSource).toContain('v-else-if="selectedTask"')
    expect(workbenchSource).toContain('v-else-if="selectedAsset"')
    expect(workbenchSource).toContain('v-else-if="isModelConfigOpen"')
    expect(workbenchSource).toContain('class="sam-modal-backdrop sam-task-detail-backdrop"')
    expect(workbenchSource).toContain('@click.self="closeTaskDetail"')
    expect(workbenchSource).toContain('@click.stop')
    expect(mainCssSource).toMatch(/\.sam-modal-backdrop\s*\{[\s\S]*z-index:\s*1200;[\s\S]*overflow:\s*auto;[\s\S]*\}/)
    expect(mainCssSource).toMatch(/\.sam-task-detail-backdrop\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*\}/)
    expect(mainCssSource).toMatch(
      /\.sam-model-modal\.sam-task-detail-modal\s*\{[\s\S]*display:\s*grid;[\s\S]*height:\s*min\(820px,\s*calc\(100vh - 48px\)\);[\s\S]*overflow:\s*hidden;[\s\S]*\}/
    )
    expect(mainCssSource).toMatch(/\.sam-task-detail-body\s*\{[\s\S]*overflow:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*\}/)
    expect(mainCssSource).toMatch(/\.sam-task-detail-modal \.sam-model-modal-header p\s*\{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*-webkit-line-clamp:\s*2;[\s\S]*\}/)
    expect(mainCssSource).toMatch(/\.sam-task-detail-section\.error \.sam-task-detail-text\s*\{[\s\S]*overflow:\s*auto;[\s\S]*\}/)
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-model-modal\.sam-task-detail-modal\s*\{[\s\S]*height:\s*calc\(100dvh - 20px\);[\s\S]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-task-detail-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(124px,\s*1fr\)\);[\s\S]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-task-detail-grid dt\s*\{[\s\S]*font-size:\s*10px;[\s\S]*\}/
    )
    expect(mainCssSource).toMatch(/\.sam-task-item\s*\{[^}]*cursor:\s*pointer;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-task-summary\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-task-prompt\s*\{[^}]*-webkit-line-clamp:\s*1;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-task-error\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-task-output-badges\s*\{[^}]*overflow:\s*hidden;[^}]*flex-wrap:\s*nowrap;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-task-row\s*\{[^}]*cursor:\s*pointer;[^}]*\}/)
    expect(workbenchSource).toContain('任务详情')
    expect(workbenchSource).toContain('参考图')
    expect(workbenchSource).toContain('输出资产')
  })

  it('keeps modal footers visible and model actions responsive in small windows', () => {
    expect(mainCssSource).toMatch(
      /\.sam-model-modal\.asset-detail\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;[^}]*overflow:\s*hidden;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /\.sam-asset-detail-body\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;[^}]*\}/
    )
    expect(assetsPageSource).toContain('class="sam-modal-backdrop" role="presentation" @click.self="closeAssetDetail"')
    expect(assetsPageSource).toContain('aria-label="资产详情" @click.stop')
    expect(assetsPageSource).toContain('sam-model-modal-footer sam-asset-detail-footer')
    expect(workbenchSource).toContain('class="sam-channel-editor-body"')
    expect(mainCssSource).toMatch(
      /\.sam-model-modal\.sam-channel-editor\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;[^}]*height:\s*min\(900px,\s*calc\(100vh - 48px\)\);[^}]*overflow:\s*hidden;[^}]*\}/
    )
    expect(mainCssSource).toMatch(/\.sam-channel-editor-body\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-channel-footer\s*\{[^}]*position:\s*static;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-channel-model-list\s*\{[^}]*min-width:\s*0;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-prompt-editor-modal\s*\{[^}]*align-self:\s*center;[^}]*height:\s*fit-content;[^}]*max-height:/)
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*1100px\)\s*\{[\s\S]*\.sam-channel-model-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*min-width:\s*0;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*1100px\)\s*\{[\s\S]*\.sam-channel-model-actions input\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-channel-model-list\.settings \.sam-channel-model-actions\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-channel-model-list\.settings \.sam-channel-model-actions input\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /\.sam-secondary-action,\s*\n\.sam-primary-action\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*line-height:\s*1;[^}]*white-space:\s*nowrap;[^}]*\}/
    )
    expect(workbenchSource).toContain('sam-asset-detail-footer')
    expect(assetsPageSource).toContain('sam-asset-detail-footer')
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-asset-detail-footer\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-asset-detail-footer \.sam-primary-action\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*\}/
    )
  })

  it('keeps compact pages readable under long labels and small desktop widths', () => {
    expect(mainCssSource).toMatch(/\.sam-model-pill-label\s*\{[^}]*display:\s*block;[^}]*white-space:\s*nowrap;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-project-card strong\s*\{[^}]*-webkit-line-clamp:\s*2;[^}]*\}/)
    expect(mainCssSource).toMatch(/\.sam-task-row-output span\.error\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;[^}]*\}/)
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-assets-toolbar,\s*\.sam-prompts-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(184px,\s*1\.2fr\) repeat\(2,\s*minmax\(116px,\s*0\.8fr\)\) minmax\(76px,\s*auto\);[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-assets-hero,\s*\.sam-prompts-hero,\s*\.sam-projects-hero\s*\{[^}]*align-items:\s*center;[^}]*flex-direction:\s*row;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-prompts-syncbar,\s*\.sam-assets-bulkbar\s*\{[^}]*align-items:\s*center;[^}]*flex-direction:\s*row;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-asset-card-preview\s*\{[^}]*aspect-ratio:\s*16 \/ 8;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-assets-hero,\s*\.sam-prompts-hero,\s*\.sam-settings-hero,\s*\.sam-projects-hero,\s*\.sam-tasks-hero\s*\{[^}]*min-height:\s*0;[^}]*padding:\s*16px;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-settings-hero > button\s*\{[^}]*height:\s*34px;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-settings-hero\s*\{[^}]*min-height:\s*max-content;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*860px\)\s*\{[\s\S]*\.sam-settings-page\s*\{[^}]*display:\s*block;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*560px\)\s*\{[\s\S]*\.sam-assets-hero,\s*\.sam-prompts-hero,\s*\.sam-projects-hero,\s*\.sam-tasks-hero,\s*\.sam-prompts-syncbar,\s*\.sam-assets-bulkbar\s*\{[^}]*align-items:\s*flex-start;[^}]*flex-direction:\s*column;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*640px\)\s*\{[\s\S]*\.sam-workbench\s*\{[^}]*display:\s*block;[^}]*height:\s*auto;[^}]*overflow:\s*visible;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*640px\)\s*\{[\s\S]*\.sam-shell\s*\{[^}]*height:\s*auto;[^}]*grid-template-rows:\s*auto auto;[^}]*align-content:\s*start;[^}]*overflow:\s*visible;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*640px\)\s*\{[\s\S]*\.sam-stage,\s*\.sam-inspector\s*\{[^}]*height:\s*auto;[^}]*overflow:\s*visible;[^}]*\}/
    )
    expect(mainCssSource).toMatch(
      /@media \(max-width:\s*640px\)\s*\{[\s\S]*\.sam-task-list\s*\{[^}]*max-height:\s*none;[^}]*overflow:\s*visible;[^}]*\}/
    )
  })

  it('treats ICON generation as a fixed mother image with preset export sizes', () => {
    expect(workbenchSource).toContain('ICON_GENERATION_SIZE')
    expect(workbenchSource).toContain('ICON_EXPORT_SIZE_OPTIONS')
    expect(workbenchSource).toContain('[16, 32, 64, 128, 256, 512]')
    expect(workbenchSource).toContain('生成 ICON 母图')
    expect(workbenchSource).toContain('母图尺寸')
    expect(workbenchSource).toContain('导出规格')
    expect(workbenchSource).toContain('activeWorkflow === \'img2img\' || activeWorkflow === \'icon\'')
    expect(taskStoreSource).toContain("workflowId === 'img2img' || workflowId === 'icon'")
  })

  it('shows completed assets for the active workflow in the workbench stage', () => {
    expect(workbenchSource).toContain('currentCompletedAssets')
    expect(workbenchSource).toContain('class="sam-current-works"')
    expect(workbenchSource).toContain('当前已完成作品')
    expect(workbenchSource).toContain('resolveAssetPreviewSrc(asset)')
    expect(workbenchSource).toContain('canRenderAssetPreview(asset)')
    expect(workbenchSource).toContain('@click="openAssetDetail(asset)"')
  })

  it('downloads assets through a save-path picker and renders local previews', () => {
    expect(assetStoreSource).toContain('previewUri?: string')
    expect(assetStoreSource).toContain('thumbnailUri?: string')
    expect(assetStoreSource).toContain('resolveAssetPreviewSrc')
    expect(assetStoreSource).toContain('resolveReferenceImagePreviewSrc')
    expect(assetStoreSource).toContain('asset.thumbnailUri?.trim() || asset.uri.trim()')
    expect(assetStoreSource).toContain('downloadAssetWithDialog')
    expect(assetStoreSource).toContain("invoke<string | null>('download_asset_with_dialog'")
    expect(workbenchSource).toContain('async function downloadAsset(asset: CreativeAsset)')
    expect(workbenchSource).toContain('downloadAssetWithDialog(asset.id)')
    expect(assetsPageSource).toContain('async function downloadAsset(asset: CreativeAsset)')
    expect(assetsPageSource).toContain('downloadAssetWithDialog(asset.id)')
    expect(workbenchSource).not.toContain("asset.uri.startsWith('http') || asset.uri.startsWith('data:')")
    expect(assetsPageSource).not.toContain("asset.uri.startsWith('http') || asset.uri.startsWith('data:')")
    expect(workbenchSource).toContain('resolveReferenceImagePreviewSrc(image)')
  })

  it('enables Tauri asset protocol for local preview rendering', () => {
    expect(tauriConfigSource).toContain('"assetProtocol"')
    expect(tauriConfigSource).toContain('"enable": true')
    expect(tauriConfigSource).toContain('"scope": ["$APPDATA/**"]')
    expect(tauriCargoSource).toContain('protocol-asset')
  })

  it('lazy loads asset thumbnails and decodes local previews asynchronously', () => {
    expect(workbenchSource).toContain('loading="lazy"')
    expect(workbenchSource).toContain('decoding="async"')
    expect(workbenchSource).toContain('class="sam-current-works"')
    expect(workbenchSource).toContain('sam-compare-result-preview')
    expect(workbenchSource).toContain('sam-reference-preview-list')
    expect(assetsPageSource).toContain('loading="lazy"')
    expect(assetsPageSource).toContain('decoding="async"')
    expect(assetsPageSource).toContain('sam-asset-card-preview')
    expect(assetsPageSource).toContain('sam-asset-detail-preview')
  })

  it('offers Chinese self-media image size presets and custom sizes in the workbench', () => {
    expect(workbenchSource).toContain('SELF_MEDIA_IMAGE_SIZE_OPTIONS')
    expect(workbenchSource).toContain('STANDARD_IMAGE_SIZE_OPTIONS')
    expect(workbenchSource).toContain('CUSTOM_IMAGE_SIZE_VALUE')
    expect(workbenchSource).toContain('selectedImageSizePreset')
    expect(workbenchSource).toContain('customImageWidth')
    expect(workbenchSource).toContain('customImageHeight')
    expect(workbenchSource).toContain('国内自媒体')
    expect(workbenchSource).toContain('自定义尺寸')
    expect(workbenchSource).toContain('normalizeCustomImageSize')
  })

  it('keeps custom size width and height inputs readable in the composer controls', () => {
    expect(workbenchSource).toContain('sam-custom-size-field')
    expect(workbenchSource).toContain('sam-custom-size-input')
  })

  it('keeps the negative prompt title horizontal in the composer footer', () => {
    expect(workbenchSource).toContain('class="sam-negative-field"')
    expect(mainCssSource).toMatch(/\.sam-negative-field span\s*\{[\s\S]*white-space:\s*nowrap;[\s\S]*\}/)
    expect(mainCssSource).toMatch(/\.sam-negative-field span\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*\}/)
  })

  it('uses Chinese labels for visible workbench quality, seed, transition, and style text', () => {
    expect(workbenchSource).toContain('qualityLabel')
    expect(workbenchSource).toContain('质量 {{ qualityLabel }}')
    expect(workbenchSource).toContain('高质量')
    expect(workbenchSource).toContain('标准')
    expect(workbenchSource).toContain('草稿')
    expect(workbenchSource).toContain('<span>种子</span>')
    expect(workbenchSource).toContain('<option value="cut">硬切</option>')
    expect(workbenchSource).toContain('<option value="fade in">淡入</option>')
    expect(workbenchSource).toContain('<option value="dissolve">叠化</option>')
    expect(workbenchSource).toContain('<option value="match cut">匹配剪辑</option>')
    expect(workbenchSource).toContain('电影感分镜，角色一致，镜头语言清晰')
    expect(workbenchSource).not.toContain('Quality {{ quality }}')
    expect(workbenchSource).not.toContain('>High</option>')
    expect(workbenchSource).not.toContain('>Medium</option>')
    expect(workbenchSource).not.toContain('>Low</option>')
    expect(workbenchSource).not.toContain('cinematic, noir, product style...')
  })

  it('edits and polishes the main prompt through a centered modal', () => {
    expect(workbenchSource).toContain("import { invoke } from '@tauri-apps/api/core'")
    expect(workbenchSource).toContain('interface PolishPromptResponse')
    expect(workbenchSource).toContain('const isPromptEditorOpen = ref(false)')
    expect(workbenchSource).toContain("const promptEditorText = ref('')")
    expect(workbenchSource).toContain("const originalPromptText = ref('')")
    expect(workbenchSource).toContain('function openPromptEditor()')
    expect(workbenchSource).toContain('function closePromptEditor()')
    expect(workbenchSource).toContain('function confirmPromptEditor()')
    expect(workbenchSource).toContain('async function polishPromptWithAi()')
    expect(workbenchSource).toContain("invoke<PolishPromptResponse>('polish_prompt'")
    expect(workbenchSource).toContain('workspaceStore.replacePromptText(promptEditorText.value)')
    expect(workbenchSource).toContain('class="sam-prompt-preview-button"')
    expect(workbenchSource).toContain('@click="openPromptEditor"')
    expect(workbenchSource).toContain('class="sam-prompt-editor-modal"')
    expect(workbenchSource).toContain('v-model="promptEditorText"')
    expect(workbenchSource).toContain('AI 润色')
    expect(workbenchSource).toContain('原提示词')
    expect(workbenchSource).toContain('确认')
    expect(workbenchSource).toContain('关闭')
    expect(workbenchSource).not.toContain('v-model="promptText"\n              :placeholder="promptFieldPlaceholder"')
  })

  it('requires user configured image models before generation', () => {
    expect(modelStoreSource).toContain('未配置图像模型')
    expect(workbenchSource).toContain('请先配置图像模型')
    expect(workbenchSource).toContain(':disabled="!hasImageModel || isLoadingTasks"')
  })

  it('separates text and image model configuration in the workspace', () => {
    expect(modelStoreSource).toContain("export type ModelCapability = 'text' | 'image'")
    expect(workbenchSource).toContain('useModelStore')
    expect(workbenchSource).toContain('storeToRefs')
    expect(workbenchSource).toContain('文本模型配置')
    expect(workbenchSource).toContain('图像模型配置')
    expect(workbenchSource).toContain('打开图像模型配置')
    expect(workbenchSource).toContain('接口基础地址')
    expect(workbenchSource).toContain('API 密钥')
    expect(workbenchSource).not.toContain('<span>Base URL</span>')
    expect(workbenchSource).not.toContain('<span>API Key</span>')
    expect(workbenchSource).toContain('hasApiKey')
    expect(workbenchSource).toContain('检测并获取模型')
    expect(workbenchSource).toContain('真实模型列表')
    expect(workbenchSource).toContain('sam-channel-editor')
    expect(workbenchSource).toContain('sam-channel-model-list')
    expect(workbenchSource).toContain('modelOptionSearch')
    expect(workbenchSource).toContain('filteredModelOptions')
    expect(workbenchSource).toContain('selectDetectedModel')
    expect(workbenchSource).toContain('清空已选')
    expect(workbenchSource).toContain('model-options-list')
    expect(workbenchSource).toContain(':list="`model-options-list-${activeModelCapability}`"')
    expect(workbenchSource).toContain('继续配置新模型')
    expect(workbenchSource).toContain('接口连通')
    expect(workbenchSource).toContain('设为当前主模型')
    expect(workbenchSource).toContain('watchModelEndpointInputs')
    expect(workbenchSource).toContain('saveModelProfile')
    expect(workbenchSource).toContain('clearModelProfile')
  })

  it('keeps visible sample and recent asset workflow labels localized', () => {
    expect(workbenchSource).toContain('getAssetWorkflowLabel(asset)')
    expect(workbenchSource).not.toContain("{{ asset.workflowId || '工作台' }}")
    expect(workbenchSource).toContain('高级应用商店风格')
    expect(defaultCreativeAssetsSource).toContain('高级应用商店风格')
    expect(legacyImportTemplateSource).toContain('应用商店风格')
    expect(legacyImportTemplateSource).toContain('电影感产品摄影，高级布光，干净背景')
    expect(workbenchSource).not.toContain('App Store')
    expect(defaultCreativeAssetsSource).not.toContain('App Store')
  })

  it('backs model configuration with Tauri commands', () => {
    expect(modelStoreSource).toContain("invoke<ModelProfileDraft[]>('list_model_profiles')")
    expect(modelStoreSource).toContain("invoke<ModelOptionsResponse>('fetch_model_options'")
    expect(modelStoreSource).toContain("invoke<ModelHealthCheckResponse>('check_model_health'")
    expect(modelStoreSource).toContain('modelHealthResults')
    expect(modelStoreSource).toContain('checkModelHealth')
    expect(modelStoreSource).toContain("invoke<ModelEndpointCheckResponse>('check_model_endpoint'")
    expect(modelStoreSource).toContain('checkModelEndpointConnectivity')
    expect(modelStoreSource).toContain('endpointCheckMessages')
    expect(modelStoreSource).toContain("invoke<ModelProfileDraft[]>('save_model_profile'")
    expect(modelStoreSource).toContain("invoke<ModelProfileDraft[]>('delete_model_profile'")
    expect(modelStoreSource).toContain("invoke<ModelProfileDraft[]>('set_default_model_profile'")
    expect(modelStoreSource).toContain('modelProfileList')
    expect(modelProfilesApiSource).toContain('fn list_model_profiles')
    expect(modelProfilesApiSource).toContain('fn fetch_model_options')
    expect(modelProfilesApiSource).toContain('fn check_model_health')
    expect(modelProfilesApiSource).toContain('ModelHealthCheckResult')
    expect(modelProfilesApiSource).toContain('MODEL_HEALTH_CHECK_TIMEOUT_SECS: u64 = 15')
    expect(modelProfilesApiSource).toContain('Duration::from_secs(MODEL_HEALTH_CHECK_TIMEOUT_SECS)')
    expect(modelStoreSource).toContain('MODEL_HEALTH_CHECK_TIMEOUT_MS = 15_000')
    expect(modelStoreSource).toContain('AbortSignal.timeout(MODEL_HEALTH_CHECK_TIMEOUT_MS)')
    expect(modelProfilesApiSource).toContain('fn check_model_endpoint')
    expect(modelProfilesApiSource).toContain('parse_model_ids')
    expect(modelProfilesApiSource).toContain('fn save_model_profile')
    expect(modelProfilesApiSource).toContain('fn delete_model_profile')
    expect(modelProfilesApiSource).toContain('fn set_default_model_profile')
    expect(rustLibSource).toContain('list_model_profiles')
    expect(rustLibSource).toContain('fetch_model_options')
    expect(rustLibSource).toContain('check_model_health')
    expect(modelProfileRepoSource).toContain('INSERT INTO model_profiles')
    expect(modelProfileRepoSource).toContain('DELETE FROM model_profiles')
  })

  it('shows per-model health checks in model configuration lists', () => {
    expect(workbenchSource).toContain('健康检查')
    expect(workbenchSource).toContain('checkModelHealth')
    expect(workbenchSource).toContain('isCheckingModelHealth')
    expect(workbenchSource).toContain('modelHealthResults')
    expect(workbenchSource).toContain('sam-channel-health-dot')
    expect(workbenchSource).toContain('sam-health-check-button')
    expect(workbenchSource).toContain('sam-action-spinner')
    expect(workbenchSource).toContain('class="sam-generate-button"')
    expect(workbenchSource).toContain('generating: isLoadingTasks')
    expect(workbenchSource).toContain('i-mdi-check-circle')
    expect(workbenchSource).toContain('i-mdi-close-circle')
    expect(settingsPageSource).toContain('健康检查')
    expect(settingsPageSource).toContain('checkModelHealth')
    expect(settingsPageSource).toContain('sam-channel-health-dot')
    expect(settingsPageSource).toContain('sam-health-check-button')
    expect(settingsPageSource).toContain('sam-action-spinner')
    expect(mainCssSource).toContain('@keyframes sam-spin')
    expect(mainCssSource).toContain('.sam-health-check-button.checking')
    expect(mainCssSource).toContain('.sam-generate-button.generating')
  })

  it('limits model API types to the supported provider set', () => {
    const providerLabels = ['OpenAI 兼容', 'OpenAI 官方', 'Claude 接口', 'Gemini 接口', 'Azure OpenAI']

    expect(modelStoreSource).toContain('MODEL_PROVIDER_OPTIONS')
    for (const label of providerLabels) {
      expect(modelStoreSource).toContain(label)
    }
    expect(settingsPageSource).toContain('MODEL_PROVIDER_OPTIONS')
    expect(workbenchSource).toContain('MODEL_PROVIDER_OPTIONS')
    expect(settingsPageSource).not.toContain('自定义兼容')
    expect(settingsPageSource).not.toContain('智谱 GLM')
    expect(settingsPageSource).not.toContain('Stability')
    expect(settingsPageSource).not.toContain('ComfyUI')
    expect(workbenchSource).not.toContain('自定义兼容')
    expect(workbenchSource).not.toContain('智谱 GLM')
    expect(workbenchSource).not.toContain('Stability')
    expect(workbenchSource).not.toContain('ComfyUI')
    expect(modelStoreSource).not.toContain("label: 'OpenAI-compatible'")
  })

  it('uses the prompt market store instead of local prompt fixtures', () => {
    expect(workbenchSource).toContain('usePromptMarketStore')
    expect(workbenchSource).toContain('filteredPromptAssets')
    expect(workbenchSource).toContain('promptSourceOptions')
    expect(workbenchSource).toContain('promptUseCaseOptions')
    expect(workbenchSource).toContain('promptSearchQuery')
    expect(workbenchSource).not.toContain('const promptMarketItems')
    expect(promptMarketStoreSource).toContain('promptMarketSnapshot')
    expect(promptMarketStoreSource).toContain('useCaseFilter')
    expect(promptMarketStoreSource).toContain('searchQuery')
    expect(promptMarketStoreSource).toContain('setUseCaseFilter')
    expect(promptMarketStoreSource).toContain('hasTauriRuntime')
    expect(promptMarketStoreSource).toContain('importPromptJson')
    expect(promptMarketStoreSource).toContain('importPromptJsonText')
    expect(promptMarketStoreSource).toContain("invoke<PromptAsset[]>('list_prompt_assets')")
    expect(workbenchSource).toContain('loadPromptAssets')
    expect(workbenchSource).toContain('导入 JSON')
    expect(workbenchSource).toContain('下载模板')
    expect(workbenchSource).toContain('同步 glidea')
    expect(workbenchSource).toContain('同步 EvoLinkAI')
    expect(workbenchSource).toContain('accept="application/json,.json"')
  })

  it('creates backend generation tasks from the workspace composer', () => {
    expect(workbenchSource).toContain('useTaskStore')
    expect(workbenchSource).toContain('useAssetStore')
    expect(workbenchSource).toContain('visibleCreativeAssets')
    expect(workbenchSource).toContain('getAssetTitle')
    expect(workbenchSource).toContain('最近资产')
    expect(workbenchSource).toContain('toggleAssetFavorite')
    expect(workbenchSource).toContain('reuseAssetPrompt')
    expect(workbenchSource).toContain('downloadAsset')
    expect(workbenchSource).toContain('copyAssetPrompt')
    expect(workbenchSource).toContain('deleteAsset')
    expect(workbenchSource).toContain('exportIconPackage')
    expect(workbenchSource).toContain('selectedAsset')
    expect(workbenchSource).toContain('资产详情')
    expect(workbenchSource).toContain('createImageGenerationTask')
    expect(workbenchSource).toContain('createBatchImageGenerationTasks')
    expect(workbenchSource).toContain('referenceImages')
    expect(workbenchSource).toContain('referenceImageUris')
    expect(workbenchSource).toContain('effectiveImageCount')
    expect(workbenchSource).toContain("normalizeGenerationImageCount(activeWorkflow.value, imageCount.value)")
    expect(workbenchSource).toContain(":disabled=\"activeWorkflow === 'img2img' || activeWorkflow === 'icon'\"")
    expect(workbenchSource).toContain('importReferenceImages')
    expect(workbenchSource).toContain('handlePromptPaste')
    expect(workbenchSource).toContain('@paste="handlePromptPaste"')
    expect(workbenchSource).toContain('上传参考图')
    expect(workbenchSource).toContain('accept="image/*"')
    expect(workbenchSource).toContain('compareModelCandidates')
    expect(workbenchSource).toContain('modelsForComparison')
    expect(workbenchSource).toContain('toggleCompareModel')
    expect(workbenchSource).toContain('sam-compare-models')
    expect(workbenchSource).toContain('多模型对比')
    expect(workbenchSource).toContain('管理模型')
    expect(mainCssSource).toMatch(/\.sam-compare-models header > div\s*\{[^}]*min-width:\s*0;[^}]*\}/)
    expect(mainCssSource).toMatch(
      /\.sam-compare-models header button,\s*\n\.sam-compare-model-list button\s*\{[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;[\s\S]*\}/
    )
    expect(mainCssSource).toMatch(/\.sam-compare-models header button\s*\{[^}]*min-width:\s*max-content;[^}]*\}/)
    expect(workbenchSource).toContain('batchPromptLines')
    expect(workbenchSource).toContain('每行一条提示词')
    expect(workbenchSource).toContain('useStoryboardStore')
    expect(workbenchSource).toContain('createStoryboardDraft')
    expect(workbenchSource).toContain('一键生成分镜草案')
    expect(workbenchSource).toContain('useStoryboardShotPrompt')
    expect(workbenchSource).toContain('generateStoryboardImages')
    expect(workbenchSource).toContain('批量出图')
    expect(workbenchSource).toContain('storyboardTotalDuration')
    expect(workbenchSource).toContain('selectedStoryboardShotIds')
    expect(workbenchSource).toContain('storyboardTimelineShots')
    expect(workbenchSource).toContain('storyboardShotsForGeneration')
    expect(workbenchSource).toContain('toggleStoryboardShotSelection')
    expect(workbenchSource).toContain('toggleAllStoryboardShots')
    expect(workbenchSource).toContain('moveStoryboardShot')
    expect(workbenchSource).toContain('saveStoryboardShotTiming')
    expect(workbenchSource).toContain('镜头提示词')
    expect(workbenchSource).toContain('批量出图已选')
    expect(workbenchSource).toContain('projectId: currentDraft.value.project.id')
    expect(workbenchSource).toContain('shotIds: storyboardShotsForGeneration.value.map')
    expect(workbenchSource).toContain('exportStoryboardPdf')
    expect(workbenchSource).toContain('导出 PDF')
    expect(storyboardStoreSource).toContain("invoke<StoryboardDraft>('create_storyboard_draft'")
    expect(storyboardStoreSource).toContain("invoke<StoryboardDraft>('update_storyboard_shot'")
    expect(storyboardStoreSource).toContain("invoke<StoryboardDraft>('reorder_storyboard_shots'")
    expect(storyboardStoreSource).toContain("invoke<CreativeAsset>('export_storyboard_pdf'")
    expect(workbenchSource).toContain('assetStore.loadAssets')
    expect(workbenchSource).toContain('generationTasks')
    expect(workbenchSource).toContain('creativeAssets')
    expect(workbenchSource).toContain('visibleGenerationTasks')
    expect(workbenchSource).toContain('getTaskStatusLabel')
    expect(workbenchSource).toContain('getTaskOutputAssetIds')
    expect(workbenchSource).toContain('getTaskLinkedAssets')
    expect(workbenchSource).toContain('getTaskPreviewAsset')
    expect(workbenchSource).toContain('getTaskResultSummary')
    expect(workbenchSource).toContain('sam-task-output-badges')
    expect(workbenchSource).toContain('sam-task-error')
    expect(workbenchSource).toContain('hasPendingGenerationTasks')
    expect(workbenchSource).toContain('canRunTask')
    expect(workbenchSource).toContain('runPendingTasks')
    expect(workbenchSource).toContain('继续队列')
    expect(workbenchSource).toContain('canCancelTask')
    expect(workbenchSource).toContain('retryTask')
    expect(workbenchSource).toContain('sam-task-list')
    expect(taskStoreSource).toContain("invoke<GenerationTask[]>('create_image_generation_task'")
    expect(taskStoreSource).toContain("invoke<GenerationTask[]>('create_batch_image_generation_tasks'")
    expect(taskStoreSource).toContain('models?: string[]')
    expect(taskStoreSource).toContain("invoke<GenerationTask[]>('run_image_generation_task'")
    expect(taskStoreSource).toContain('runGenerationTask')
    expect(taskStoreSource).toContain('runPendingGenerationTasks')
    expect(taskStoreSource).toContain("invoke<GenerationTask[]>('list_generation_tasks')")
    expect(taskStoreSource).toContain("invoke<GenerationTask[]>('cancel_generation_task'")
    expect(taskStoreSource).toContain("invoke<GenerationTask[]>('retry_generation_task'")
    expect(taskStoreSource).toContain("invoke<GenerationTask[]>('clear_finished_generation_tasks'")
    expect(assetStoreSource).toContain("invoke<CreativeAsset[]>('list_assets')")
    expect(assetStoreSource).toContain("invoke<CreativeAsset[]>('toggle_asset_favorite'")
    expect(assetStoreSource).toContain("invoke<CreativeAsset[]>('delete_asset'")
    expect(assetStoreSource).toContain("invoke<CreativeAsset[]>('delete_assets'")
    expect(assetStoreSource).toContain("invoke<CreativeAsset>('export_icon_package'")
    expect(assetStoreSource).toContain('createAssetDownloadName')
    expect(assetStoreSource).toContain('canDownloadAsset')
    expect(assetStoreSource).toContain('createDefaultCreativeAssets')
    expect(defaultCreativeAssetsSource).toContain('samimage_default_preview')
    expect(defaultCreativeAssetsSource).toContain('日常生图草稿')
    expect(defaultCreativeAssetsSource).toContain('ICON 母图')
    expect(defaultCreativeAssetsSource).toContain('分镜帧示例')
    expect(mainCssSource).toMatch(/\.sam-asset-actions button,[\s\S]*min-width:\s*52px;[\s\S]*white-space:\s*nowrap;[\s\S]*\}/)
  })
})
