import { describe, expect, it } from 'vitest';
import { applyMainModel } from '../utils/model-selection';
import { defaultProfile } from '../utils/profile';

describe('model selection', () => {
  it('updates the main model and keeps it in the available model list', () => {
    const profile = defaultProfile();
    const updated = applyMainModel(profile, 'ZhipuAI/GLM-5.1');

    expect(updated.model).toBe('ZhipuAI/GLM-5.1');
    expect(updated.availableModels).toContain('ZhipuAI/GLM-5.1');
  });

  it('ignores blank model names', () => {
    const profile = defaultProfile();
    expect(applyMainModel(profile, '   ')).toBe(profile);
  });
});
