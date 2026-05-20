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
  source?: ArtifactSource;
  type?: ArtifactType;
}

export type ArtifactSource = 'generate' | 'icon';
export type ArtifactType = 'type_default' | 'type_icon' | 'type_movie';

export interface Artifact {
  id: string;
  profileId: string;
  mode: WorkMode;
  prompt: string;
  imageUrl: string;
  source: ArtifactSource;
  type: ArtifactType;
  createdAt: string;
}

export interface PromptTemplate {
  id: string;
  title: string;
  prompt: string;
  category: string;
  isBuiltin: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface IconfontSearchItem {
  id: string;
  name: string;
  author?: string;
  svgUrl?: string;
  originUrl: string;
  previewSvg?: string;
  source: 'iconify' | 'iconfont' | 'manual';
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PolishRequest {
  text: string;
}

export interface PolishResult {
  polished: string;
}
