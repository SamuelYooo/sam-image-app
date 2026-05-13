export type AdapterKind =
  | 'openai_images'
  | 'openai_chat'
  | 'gemini'
  | 'stability'
  | 'comfyui';

export type WorkMode = 'txt2img' | 'img2img' | 'reverse' | 'blend';

export interface AdapterInfo {
  id: AdapterKind;
  name: string;
  description: string;
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
  supportsReversePrompt: boolean;
}

export interface ModelProfile {
  id: string;
  name: string;
  adapter: AdapterKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  availableModels: string[];
  chatEndpoint: string;
  imageEndpoint: string;
  timeoutSec: number;
  referenceImageLimit: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ModelValidationRequest {
  profile: ModelProfile;
  networkCheck: boolean;
}

export interface ModelValidationResult {
  ok: boolean;
  adapter: AdapterKind;
  message: string;
  latencyMs: number;
}

export interface ModelListRequest {
  profile: ModelProfile;
}

export interface ModelListResult {
  models: string[];
  source: 'remote' | 'preset';
  message: string;
}

export interface GenerationRequest {
  profileId: string;
  mode: WorkMode;
  prompt: string;
  negativePrompt: string;
  size: string;
  seed?: number;
  referenceImages: string[];
}

export interface Artifact {
  id: string;
  profileId: string;
  mode: WorkMode;
  prompt: string;
  imageUrl: string;
  createdAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
