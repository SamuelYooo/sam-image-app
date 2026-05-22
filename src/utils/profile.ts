import type { AdapterKind, ModelProfile } from '../types';

export const defaultProfile = (): ModelProfile => ({
  id: crypto.randomUUID(),
  name: '默认图像模型',
  adapter: 'openai_images',
  baseUrl: 'https://api.openai.com',
  apiKey: '',
  model: '',
  availableModels: [],
  chatEndpoint: '/v1/chat/completions',
  imageEndpoint: '/v1/images/generations',
  timeoutSec: 300,
  referenceImageLimit: 4,
});

export function profileSummary(profile: ModelProfile): string {
  const host = profile.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `${profile.model || '未设置模型'} · ${adapterLabel(profile.adapter)} · ${host || '未设置地址'}`;
}

export function adapterLabel(adapter: AdapterKind): string {
  const labels: Record<AdapterKind, string> = {
    openai_images: 'OpenAI 图像',
    openai_chat: 'OpenAI 对话图像',
    gemini: 'Gemini',
    stability: 'Stability',
    comfyui: 'ComfyUI',
  };
  return labels[adapter];
}

export function mergeModelList(current: string[], incoming: string[]): string[] {
  const values = [...current, ...incoming]
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function validateProfileConnectionDraft(profile: ModelProfile): string[] {
  const errors: string[] = [];
  if (!profile.name.trim()) errors.push('配置名称不能为空');
  if (!profile.baseUrl.trim()) errors.push('服务地址不能为空');
  if (profile.baseUrl && !/^https?:\/\//.test(profile.baseUrl)) {
    errors.push('服务地址必须以 http:// 或 https:// 开头');
  }
  if (profile.timeoutSec < 10 || profile.timeoutSec > 1800) {
    errors.push('超时时间必须在 10 到 1800 秒之间');
  }
  if (profile.referenceImageLimit < 1 || profile.referenceImageLimit > 16) {
    errors.push('参考图数量必须在 1 到 16 之间');
  }
  return errors;
}

export function validateProfileDraft(profile: ModelProfile): string[] {
  const errors = validateProfileConnectionDraft(profile);
  if (!profile.model.trim()) errors.push('模型名称不能为空');
  return errors;
}
