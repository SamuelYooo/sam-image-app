import { acceptHMRUpdate, defineStore } from 'pinia'

const defaultPromptText = '清晨街角的现代咖啡馆，雾面玻璃，暖色室内灯光，写实摄影'

export interface ReferenceImageInput {
  id: string
  name: string
  uri: string
  previewUri?: string
  size: number
}

export function mergePromptText(current: string, incoming: string) {
  const nextPrompt = incoming.trim()
  if (!nextPrompt) {
    return current
  }
  const currentPrompt = current.trim()
  return currentPrompt ? `${currentPrompt}\n${nextPrompt}` : nextPrompt
}

export function addReferenceImages(current: ReferenceImageInput[], incoming: ReferenceImageInput[], limit = 4) {
  const existingUris = new Set(current.map((image) => image.uri))
  const next = [...current]
  for (const image of incoming) {
    if (next.length >= limit) {
      break
    }
    if (!image.uri.trim() || existingUris.has(image.uri)) {
      continue
    }
    existingUris.add(image.uri)
    next.push(image)
  }
  return next
}

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    promptText: defaultPromptText,
    referenceImages: [] as ReferenceImageInput[],
  }),

  actions: {
    replacePromptText(prompt: string) {
      this.promptText = prompt
    },

    insertPromptText(prompt: string) {
      this.promptText = mergePromptText(this.promptText, prompt)
    },

    addReferenceImages(images: ReferenceImageInput[]) {
      this.referenceImages = addReferenceImages(this.referenceImages, images)
    },

    removeReferenceImage(id: string) {
      this.referenceImages = this.referenceImages.filter((image) => image.id !== id)
    },

    clearReferenceImages() {
      this.referenceImages = []
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useWorkspaceStore, import.meta.hot))
}
