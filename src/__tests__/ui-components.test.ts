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
});
