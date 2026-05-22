import { describe, expect, it } from 'vitest';
import {
  defaultProfile,
  mergeModelList,
  profileSummary,
  validateProfileConnectionDraft,
  validateProfileDraft,
} from '../utils/profile';

describe('profile helpers', () => {
  it('starts new profiles without preset image models', () => {
    const profile = defaultProfile();

    expect(profile.model).toBe('');
    expect(profile.availableModels).toEqual([]);
    expect(validateProfileConnectionDraft(profile)).toEqual([]);
    expect(validateProfileDraft(profile)).toEqual(['模型名称不能为空']);
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
      '超时时间必须在 10 到 1800 秒之间',
      '参考图数量必须在 1 到 16 之间',
      '模型名称不能为空',
    ]);
  });

  it('summarizes profile identity for compact UI labels', () => {
    const profile = defaultProfile();
    profile.baseUrl = 'https://api.openai.com/';
    profile.model = 'remote-image-pro';
    expect(profileSummary(profile)).toBe('remote-image-pro · OpenAI 图像 · api.openai.com');
  });

  it('merges fetched model names without duplicates', () => {
    expect(mergeModelList(['remote-image-a', ''], ['remote-image-b', 'remote-image-a'])).toEqual([
      'remote-image-a',
      'remote-image-b',
    ]);
  });
});
