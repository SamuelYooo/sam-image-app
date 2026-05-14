import { describe, expect, it } from 'vitest';
import { defaultProfile, mergeModelList, profileSummary, validateProfileDraft } from '../utils/profile';

describe('profile helpers', () => {
  it('accepts a complete default profile draft', () => {
    const profile = defaultProfile();
    expect(validateProfileDraft(profile)).toEqual([]);
  });

  it('rejects invalid endpoint and range values', () => {
    const profile = {
      ...defaultProfile(),
      name: '',
      baseUrl: 'api.example.com',
      model: '',
      timeoutSec: 2,
      referenceImageLimit: 30,
    };

    expect(validateProfileDraft(profile)).toEqual([
      '配置名称不能为空',
      '服务地址必须以 http:// 或 https:// 开头',
      '模型名称不能为空',
      '超时时间必须在 10 到 1800 秒之间',
      '参考图数量必须在 1 到 16 之间',
    ]);
  });

  it('summarizes profile identity for compact UI labels', () => {
    const profile = defaultProfile();
    profile.baseUrl = 'https://api.openai.com/';
    expect(profileSummary(profile)).toBe('gpt-image-1 · OpenAI 图像 · api.openai.com');
  });

  it('merges fetched model names without duplicates', () => {
    expect(mergeModelList(['gpt-image-1', ''], ['gpt-image-2', 'gpt-image-1'])).toEqual([
      'gpt-image-1',
      'gpt-image-2',
    ]);
  });
});
