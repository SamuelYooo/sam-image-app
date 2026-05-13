import type {
  AdapterInfo,
  ApiErrorBody,
  Artifact,
  GenerationRequest,
  ModelProfile,
  ModelListRequest,
  ModelListResult,
  ModelValidationRequest,
  ModelValidationResult,
} from '../types';

const API_BASE = import.meta.env.VITE_SAMIMAGE_API ?? 'http://127.0.0.1:39871';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }
    throw new Error(body?.error.message ?? `请求失败: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => requestJson<{ ok: boolean; service: string }>('/api/health'),
  adapters: () => requestJson<AdapterInfo[]>('/api/adapters'),
  profiles: () => requestJson<ModelProfile[]>('/api/profiles'),
  saveProfile: (profile: ModelProfile) =>
    requestJson<ModelProfile>('/api/profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    }),
  deleteProfile: (id: string) =>
    requestJson<void>(`/api/profiles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  validateModel: (payload: ModelValidationRequest) =>
    requestJson<ModelValidationResult>('/api/models/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  fetchModels: (payload: ModelListRequest) =>
    requestJson<ModelListResult>('/api/models/list', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  artifacts: () => requestJson<Artifact[]>('/api/generations'),
  generate: (payload: GenerationRequest) =>
    requestJson<Artifact>('/api/generations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteArtifact: (id: string) =>
    requestJson<void>(`/api/generations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};
