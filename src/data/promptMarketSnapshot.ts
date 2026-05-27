import { parsePromptAssets, type PromptAsset } from '../utils/promptMarket'

const snapshotImportedAt = '2026-05-22T00:00:00.000Z'

const builtinPrompts = [
  {
    id: 'builtin-cinematic-product',
    title: '电影感产品图',
    content: '电影感产品摄影，受控棚拍灯光，清晰材质细节，高级商业构图',
    categories: ['产品', '摄影'],
    tags: ['产品', '摄影', '高质感'],
    useCases: ['txt2img', 'reference'],
    author: 'SamImage',
  },
  {
    id: 'builtin-icon-master',
    title: '应用 ICON 母图',
    content: '圆角方形应用图标，清晰剪影，精致材质，居中符号，干净背景',
    categories: ['ICON'],
    tags: ['图标', '应用商店', '母图'],
    useCases: ['icon', 'txt2img'],
    author: 'SamImage',
  },
]

const glideaSnapshot = [
  {
    id: 'glidea-character-consistency',
    title: '角色一致性设定',
    prompt: '角色一致性设定图，正面与四分之三视角，同一套服装，相同面部特征',
    author: 'glidea/banana-prompt-quicker',
    mode: 'reference',
    category: '角色',
    sub_category: '一致性',
    reference_image_urls: [],
  },
]

const evolinkSnapshot = [
  {
    id: 'evolink-editorial-poster',
    name: '社媒海报构图',
    text: '编辑感海报版式，主体醒目，留白干净，现代营销视觉',
    author: 'EvoLinkAI/awesome-gpt-image-2-prompts',
    tags: ['海报', '构图'],
    url: 'https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts',
    images: [],
  },
]

export const promptMarketSnapshot: PromptAsset[] = [
  ...parsePromptAssets(builtinPrompts, { source: 'builtin', now: snapshotImportedAt }),
  ...parsePromptAssets(glideaSnapshot, { source: 'glidea', now: snapshotImportedAt }),
  ...parsePromptAssets(evolinkSnapshot, { source: 'evolink', now: snapshotImportedAt }),
]
