import type { ModelProfile } from '../types';
import { mergeModelList } from './profile';

export function applyMainModel(profile: ModelProfile, model: string): ModelProfile {
  const nextModel = model.trim();
  if (!nextModel) return profile;

  return {
    ...profile,
    model: nextModel,
    availableModels: mergeModelList(profile.availableModels, [nextModel]),
  };
}

