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

    expect(source).toContain("type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger' | 'ghost'");
    expect(source).toContain("type ButtonSize = 'sm' | 'md' | 'lg'");
    expect(source).toContain('ui-button--primary');
    expect(source).toContain('ui-button--secondary');
    expect(source).toContain('ui-button--danger');
    expect(source).toContain('ui-button--subtle');
    expect(source).toContain('ui-button--ghost');
    expect(source).toContain('ui-button--sm');
    expect(source).toContain('ui-button--md');
    expect(source).toContain('ui-button--lg');
  });

  it('defines icon button variants and sizes used by icon-only actions', () => {
    const source = readSource('components/ui/UiIconButton.vue');

    expect(source).toContain("type IconButtonVariant = 'default' | 'primary' | 'danger' | 'ghost'");
    expect(source).toContain("type IconButtonSize = 'sm' | 'md' | 'lg'");
    expect(source).toContain('ui-icon-button--danger');
    expect(source).toContain('ui-icon-button--default');
    expect(source).toContain('ui-icon-button--primary');
    expect(source).toContain('ui-icon-button--ghost');
    expect(source).toContain('ui-icon-button--sm');
    expect(source).toContain('ui-icon-button--md');
    expect(source).toContain('ui-icon-button--lg');
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

  it('does not keep obsolete select overflow inline styles in App', () => {
    const source = readSource('App.vue');

    expect(source).not.toContain('style="overflow:visible;"');
  });

  it('keeps SamTo image bottom workspace in stable two-column layout', () => {
    const source = readSource('App.vue');

    expect(source).toContain('grid h-[54vh] grid-cols-[minmax(0,1fr)_360px]');
    expect(source).toContain('row-span-2 min-h-0 overflow-auto rounded-2xl p-4');
    expect(source).toContain('grid grid-cols-[minmax(0,1fr)_80px]');
    expect(source).toContain('v-if="isStoryboardMode" class="mt-3 flex items-center gap-3"');
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
});
