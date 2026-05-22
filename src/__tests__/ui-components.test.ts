import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

function readSource(path: string) {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('ui component contracts', () => {
  it('defines button variants and sizes used by the app', () => {
    const source = readSource('components/ui/UiButton.vue');
    const styles = readSource('styles.css');

    expect(source).toContain("type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger' | 'ghost'");
    expect(source).toContain("type ButtonSize = 'sm' | 'md' | 'lg'");
    expect(source).toContain('`ui-button--${props.variant}`');
    expect(source).toContain('`ui-button--${props.size}`');
    expect(source).not.toContain("'ui-button--primary',");
    expect(source).not.toContain("'ui-button--secondary',");
    expect(source).not.toContain("'ui-button--danger',");
    expect(styles).toContain('.ui-button--primary');
    expect(styles).toContain('.ui-button--secondary');
    expect(styles).toContain('.ui-button--danger');
    expect(styles).toContain('.ui-button--subtle');
    expect(styles).toContain('.ui-button--ghost');
    expect(styles).toContain('.ui-button--sm');
    expect(styles).toContain('.ui-button--md');
    expect(styles).toContain('.ui-button--lg');
  });

  it('defines icon button variants and sizes used by icon-only actions', () => {
    const source = readSource('components/ui/UiIconButton.vue');
    const styles = readSource('styles.css');

    expect(source).toContain("type IconButtonVariant = 'default' | 'primary' | 'danger' | 'ghost'");
    expect(source).toContain("type IconButtonSize = 'sm' | 'md' | 'lg'");
    expect(source).toContain('`ui-icon-button--${props.variant}`');
    expect(source).toContain('`ui-icon-button--${props.size}`');
    expect(source).not.toContain("'ui-icon-button--default',");
    expect(source).not.toContain("'ui-icon-button--primary',");
    expect(source).not.toContain("'ui-icon-button--danger',");
    expect(styles).toContain('.ui-icon-button--danger');
    expect(styles).toContain('.ui-icon-button--default');
    expect(styles).toContain('.ui-icon-button--primary');
    expect(styles).toContain('.ui-icon-button--ghost');
    expect(styles).toContain('.ui-icon-button--sm');
    expect(styles).toContain('.ui-icon-button--md');
    expect(styles).toContain('.ui-icon-button--lg');
  });

  it('defines field input and textarea modes', () => {
    const source = readSource('components/ui/UiField.vue');

    expect(source).toContain("type FieldAs = 'input' | 'textarea'");
    expect(source).toContain('ui-field');
    expect(source).toContain('ui-field--textarea');
  });

  it('supports grouped select options for media size presets', () => {
    const selectSource = readSource('components/ui/UiSelect.vue');
    const appSource = readSource('App.vue');

    expect(selectSource).toContain('interface SelectOptionGroup');
    expect(selectSource).toContain('<optgroup');
    expect(selectSource).toContain('isSelectOptionGroup');
    expect(appSource).toContain('const sizePresetOptions = computed(() => [');
    expect(appSource).toContain("label: '微信 / 公众号'");
    expect(appSource).toContain("label: '小红书'");
    expect(appSource).toContain("label: '抖音'");
    expect(appSource).not.toContain('imageSizePresetGroups.flatMap');
  });

  it('uses shared controls for gallery history template iconfont and model config actions', () => {
    const source = readSource('App.vue');

    expect(source).toContain('galleryProfileFilterOptions');
    expect(source).toContain('galleryModeFilterOptions');
    expect(source).toContain('historyProfileFilterOptions');
    expect(source).toContain('historyModeFilterOptions');
    expect(source).toContain('historySourceFilterOptions');
    expect(source).toContain('exportFormatOptions');
    expect(source).toContain('adapterSelectOptions');
    expect(source).toContain('<UiSelect v-model="galleryProfileFilter" :options="galleryProfileFilterOptions" layout="fluid"');
    expect(source).toContain('<UiSelect v-model="historyProfileFilter" :options="historyProfileFilterOptions" layout="fit"');
    expect(source).toContain('<UiSelect v-model="exportFormat" :options="exportFormatOptions" layout="fluid"');
    expect(source).toContain('<UiSelect v-model="draft.adapter" :options="adapterSelectOptions" layout="fluid"');
    expect(source).toContain('<UiButton class="gallery-download-btn"');
    expect(source).toContain('<UiIconButton');
  });

  it('uses a real remote model-list flow in the model config panel', () => {
    const source = readSource('App.vue');

    expect(source).toContain('validateProfileConnectionDraft');
    expect(source).toContain('const connectionErrors = computed(() => validateProfileConnectionDraft(draft));');
    expect(source).not.toContain('对话接口路径');
    expect(source).toContain('图像接口路径');
    expect(source).toContain('@click="removeProfile"');
    expect(source).toContain('删除配置');
    expect(source).toContain(':disabled="isValidating || connectionErrors.length > 0" @click="validateModel"');
    expect(source).toContain('const models = draft.availableModels;');
    expect(source).toContain('draft.availableModels = [...result.models];');
    expect(source).not.toContain('mergeModelList(draft.availableModels, result.models)');
    expect(source).not.toContain("source: 'preset'");
  });

  it('does not keep obsolete select overflow inline styles in App', () => {
    const source = readSource('App.vue');

    expect(source).not.toContain('style="overflow:visible;"');
  });

  it('keeps SamTo image bottom workspace in stable two-column layout', () => {
    const source = readSource('App.vue');

    expect(source).toContain('top-[260px] z-20 grid min-h-0 grid-cols-[minmax(0,1fr)_360px]');
    expect(source).not.toContain('grid h-[54vh] grid-cols-[minmax(0,1fr)_360px]');
    expect(source).toContain('row-span-2 min-h-0 overflow-auto rounded-2xl p-4');
    expect(source).toContain('grid grid-cols-[minmax(0,1fr)_80px]');
    expect(source).toContain('v-if="isStoryboardMode" class="mt-3 flex items-center gap-3"');
  });

  it('keeps the prompt template picker above the SamTo reference panel', () => {
    const source = readSource('App.vue');
    const promptLayerStart = source.indexOf('<div class="absolute right-6 top-5 z-40">');
    const workspaceStart = source.indexOf('<div class="samimage-workspace absolute bottom-5 left-5 right-5 top-[260px] z-20');

    expect(promptLayerStart).toBeGreaterThan(-1);
    expect(workspaceStart).toBeGreaterThan(promptLayerStart);
    expect(source).toContain('.prompt-template-popover');
    expect(source).toContain('z-index: 50;');
  });

  it('uses Notion-inspired warm neutral tokens and low-radius controls', () => {
    const styles = readSource('styles.css');
    const appSource = readSource('App.vue');

    expect(styles).toContain('--notion-blue: #0075de');
    expect(styles).toContain('--warm-white: #f6f5f4');
    expect(styles).toContain('--notion-shadow-card');
    expect(styles).toContain('border-radius: 4px;');
    expect(styles).toContain('font-family:');
    expect(styles).toContain('NotionInter');
    expect(styles).toContain('background: var(--warm-white);');
    expect(styles).toContain('border: var(--notion-border);');
    expect(appSource).toContain('samimage-generate-page');
    expect(appSource).toContain('samimage-stage');
  });

  it('adds a rendered-layout guard so the generate workspace stays below flow cards', () => {
    const source = readSource('App.vue');

    expect(source).toContain('.samimage-workspace');
    expect(source).toContain('top: 300px;');
    expect(source).not.toContain('top: 236px;');
  });

  it('keeps SamTo batch controls inside the left scroll column', () => {
    const source = readSource('App.vue');
    const leftColumnStart = source.indexOf('<div class="thin-scrollbar grid min-h-0 gap-4 overflow-auto pr-1">');
    const referenceColumnStart = source.indexOf('<section class="glass-panel thin-scrollbar row-span-2');
    const leftColumnSource = source.slice(leftColumnStart, referenceColumnStart);

    expect(leftColumnStart).toBeGreaterThan(-1);
    expect(referenceColumnStart).toBeGreaterThan(leftColumnStart);
    expect(leftColumnSource).toContain('<section v-if="isBatchOpen"');
  });

  it('completes gallery filtering and visual filter controls', () => {
    const source = readSource('App.vue');

    expect(source).toContain('gallerySearchQuery');
    expect(source).toContain('galleryTypeFilterOptions');
    expect(source).toContain('galleryTypeFilter');
    expect(source).toContain('galleryVisualFilters');
    expect(source).toContain('selectedGalleryFilterPreset');
    expect(source).toContain('galleryPreviewFilterStyle');
    expect(source).toContain('galleryFilteredArtifacts');
    expect(source).toContain('视觉滤镜');
    expect(source).toContain('清空筛选');
    expect(source).toContain(':style="galleryPreviewFilterStyle"');
  });

  it('applies gallery visual filters during export and uses unified layer delete buttons', () => {
    const source = readSource('App.vue');

    expect(source).toContain('canvasFilterForGalleryFilters(galleryVisualFilters.value)');
    expect(source).toContain('ctx.filter = canvasFilterForGalleryFilters(galleryVisualFilters.value)');
    expect(source).toContain('hasActiveGalleryFilters(galleryVisualFilters.value)');
    expect(source).toContain('layer-delete-btn');
    expect(source).toContain('@click.stop="removeOverlay(overlay.id)"');
  });

  it('downloads originals through Rust and renders exports from local image bytes', () => {
    const appSource = readSource('App.vue');
    const libSource = readSource('../src-tauri/src/lib.rs');

    expect(appSource).toContain('downloadOriginalArtifact');
    expect(appSource).toContain('canSaveSelectedArtifactSourceDirectly');
    expect(appSource).toContain('hasActiveGalleryExportEdits');
    expect(appSource).toContain("invoke<ImageDataUrlResult>('load_image_data_url'");
    expect(appSource).toContain("invoke<{ path: string | null }>('save_image_data_url_with_dialog'");
    expect(appSource).toContain("invoke<{ path: string | null }>('save_image_url_with_dialog'");
    expect(appSource).toContain('@click="downloadOriginalArtifact"');
    expect(appSource).toContain('return { src: result.dataUrl }');
    expect(appSource).toContain('blobToDataUrl');
    expect(libSource).toContain('async fn load_image_data_url');
    expect(libSource).toContain('async fn save_image_data_url_with_dialog');
    expect(libSource).toContain('async fn save_image_url_with_dialog');
    expect(libSource).toContain('decode_image_data_url');
    expect(libSource).toContain('pick_save_image_path');
    expect(libSource).toContain('download_image_bytes');
  });
});
