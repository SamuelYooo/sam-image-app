export const promptMarketTemplate = {
  prompts: [
    {
      id: 'custom-product-shot',
      title: '高质感产品摄影',
      content: '高质感产品摄影，柔和棚拍灯光，干净背景，细腻材质纹理',
      sourceUrl: 'https://example.com/source',
      license: 'CC0',
      author: '你的名字',
      categories: ['产品', '摄影'],
      tags: ['高质感', '商业摄影'],
      useCases: ['txt2img', 'reference'],
      previewImages: [],
      referenceImages: [],
      language: 'zh',
    },
  ],
}

export function createPromptMarketTemplateJson() {
  return `${JSON.stringify(promptMarketTemplate, null, 2)}\n`
}
