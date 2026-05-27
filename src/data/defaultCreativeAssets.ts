import type { CreativeAsset } from '../stores/assetStore'

function svgDataUri(title: string, subtitle: string, accent: string) {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#f4f3f0"/>
  <rect x="70" y="70" width="1060" height="660" rx="28" fill="#fffdf9" stroke="#d8d3c8" stroke-width="2"/>
  <rect x="116" y="118" width="968" height="430" rx="22" fill="${accent}" opacity="0.16"/>
  <path d="M116 548 L420 330 L612 468 L748 372 L1084 548 Z" fill="${accent}" opacity="0.38"/>
  <circle cx="878" cy="214" r="76" fill="${accent}" opacity="0.42"/>
  <text x="116" y="625" fill="#20201d" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="42" font-weight="700">${title}</text>
  <text x="116" y="678" fill="#716f68" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="24">${subtitle}</text>
</svg>`.trim()
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function createDefaultCreativeAssets(): CreativeAsset[] {
  return [
    {
      id: 'samimage-default-daily',
      kind: 'image',
      uri: svgDataUri('日常生图草稿', '默认提示词构图示例', '#26735d'),
      promptText: '清晨街角的现代咖啡馆，雾面玻璃，暖色室内灯光，写实摄影',
      negativePrompt: '低清晰度，畸变文字，过曝，水印',
      modelProfileId: '示例素材',
      width: 1200,
      height: 800,
      workflowId: 'daily',
      tags: ['示例', '日常生图'],
      favorite: false,
      metadata: { source: 'samimage_default_preview' },
      createdAt: '2026-05-22T00:00:00.000Z',
    },
    {
      id: 'samimage-default-icon',
      kind: 'icon',
      uri: svgDataUri('ICON 母图', 'ICON 工作流默认示例', '#2f6f9f'),
      promptText: '圆角方形图标，蓝色天空，白色云朵，清晰立体，高级应用商店风格',
      modelProfileId: '示例素材',
      width: 1200,
      height: 800,
      workflowId: 'icon',
      tags: ['示例', 'ICON'],
      favorite: false,
      metadata: { source: 'samimage_default_preview' },
      createdAt: '2026-05-22T00:01:00.000Z',
    },
    {
      id: 'samimage-default-storyboard',
      kind: 'storyboard_frame',
      uri: svgDataUri('分镜帧示例', '时间线规划默认示例', '#a66321'),
      promptText: '霓虹城市雨夜，主角穿过狭窄巷道，低机位追踪镜头',
      modelProfileId: '示例素材',
      width: 1200,
      height: 800,
      workflowId: 'storyboard',
      tags: ['示例', '分镜'],
      favorite: false,
      metadata: { source: 'samimage_default_preview' },
      createdAt: '2026-05-22T00:02:00.000Z',
    },
  ]
}
