export function createLegacyImportTemplateJson() {
  return JSON.stringify(
    {
      assets: [
        {
          id: 'legacy-image-001',
          type: 'type_default',
          prompt: '清晨街角的现代咖啡馆，雾面玻璃，暖色室内灯光',
          negativePrompt: '低清晰度，水印',
          imageUrl: 'https://example.com/image.png',
          profileId: 'legacy-profile',
          mode: 'txt2img',
          width: 1024,
          height: 1024,
          seed: 12345,
          tags: ['旧版导入', '日常生图'],
          favorite: false,
          createdAt: '2026-05-22T00:00:00.000Z',
        },
        {
          id: 'legacy-icon-001',
          type: 'type_icon',
          prompt: '蓝色天气应用图标，圆角方形，应用商店风格',
          imageUrl: 'data:image/png;base64,...',
          mode: 'icon',
          tags: ['旧版导入', 'ICON'],
        },
      ],
      promptTemplates: [
        {
          id: 'legacy-template-001',
          title: '产品摄影',
          prompt: '电影感产品摄影，高级布光，干净背景',
          category: '产品',
          tags: ['摄影', '产品'],
          favorite: true,
          usageCount: 3,
        },
      ],
    },
    null,
    2,
  )
}
