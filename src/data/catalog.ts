import type { CoverPreset, GenerationMode, ModelProfile, PromptItem } from '@/types/domain'
import { stableId } from '@/domain/ids'

export const modeLabels: Record<GenerationMode, string> = {
  txt2img: '文生图',
  img2img: '图生图',
  cover: '封面图',
  icon: 'ICON',
  '3d': '3D 图',
  gif: 'GIF 动图',
}

export const modeDescriptions: Record<GenerationMode, string> = {
  txt2img: '输入提示词，AI 生成图像',
  img2img: '上传图片，风格转换与重绘',
  cover: '自媒体封面一键生成',
  icon: 'App 图标、3D 图标、品牌标识',
  '3d': '生成带深度感的产品与概念图',
  gif: '生成或转换短循环动图',
}

export const modeAliases: Record<string, GenerationMode> = {
  text2img: 'txt2img',
  poster: 'cover',
  xhs: 'cover',
  xiaohongshu: 'cover',
  favicon: 'icon',
  avatar: 'icon',
  idphoto: 'img2img',
  removebg: 'img2img',
  pattern: 'txt2img',
  pixel: 'gif',
  '8bit': 'gif',
}

export const toolGroups: Array<{
  id: string
  name: string
  tone: string
  tools: Array<{ title: string; desc: string; mode: GenerationMode; icon: string }>
}> = [
  {
    id: 'generate',
    name: '生成类',
    tone: 'matcha',
    tools: [
      { title: '文生图', desc: '输入提示词，描述你想要的内容，AI 生成对应图像', mode: 'txt2img', icon: 'Plus' },
      { title: '图生图', desc: '上传图片，输入目标风格描述，生成新的变体图像', mode: 'img2img', icon: 'Image' },
      { title: '3D 图生成', desc: '生成带深度感和三维质感的图像作品', mode: '3d', icon: 'Box' },
      { title: '8bit 像素图', desc: '将图片转换为复古像素艺术风格', mode: 'gif', icon: 'Grid2X2' },
      { title: 'GIF 动图', desc: '生成或转换短循环动图，支持场景变化', mode: 'gif', icon: 'Repeat' },
      { title: '图案生成', desc: '生成可平铺的图案纹理，适用于壁纸与贴图', mode: 'txt2img', icon: 'Sparkles' },
    ],
  },
  {
    id: 'design',
    name: '设计类',
    tone: 'ube',
    tools: [
      { title: 'ICON 图标', desc: '输入图标描述，生成 App / 网站 / 桌面图标', mode: 'icon', icon: 'Badge' },
      { title: '社交头像', desc: '生成适合各平台的社交媒体头像', mode: 'img2img', icon: 'UserRound' },
      { title: '自媒体封面', desc: '小红书 / 公众号 / B站 / 抖音平台封面', mode: 'cover', icon: 'PanelsTopLeft' },
      { title: 'AI 证件照', desc: '上传自拍，生成标准证件照规格', mode: 'img2img', icon: 'IdCard' },
    ],
  },
  {
    id: 'repair',
    name: '修复类',
    tone: 'accent',
    tools: [
      { title: '去背景', desc: '精准分离主体与背景，输出透明 PNG', mode: 'img2img', icon: 'Eraser' },
      { title: '去文字', desc: '自动识别并去除图片中的文字，无痕修复背景', mode: 'img2img', icon: 'MessageSquareX' },
      { title: '去阴影', desc: '移除人像或物体上的投影，还原本色', mode: 'img2img', icon: 'ShieldCheck' },
      { title: '图片增强', desc: '去模糊、锐化、透视矫正，提升图像画质', mode: 'img2img', icon: 'Activity' },
      { title: '老照片修复', desc: '修复划痕、褪色、破损，还老旧照片以新颜', mode: 'img2img', icon: 'History' },
    ],
  },
  {
    id: 'portrait',
    name: '人像类',
    tone: 'lemon',
    tools: [
      { title: '人像卡通化', desc: '将真人照片转为卡通 / 插画风格', mode: 'img2img', icon: 'Smile' },
      { title: '风格转换', desc: '印象派、赛博朋克、水彩、素描等艺术风格', mode: 'img2img', icon: 'Aperture' },
      { title: '背景替换', desc: '智能去除背景并替换为指定场景背景', mode: 'img2img', icon: 'Layers' },
    ],
  },
]

export const stylePresets = ['自然', '摄影', '插画', '国潮', '赛博', '极简', '3D', '像素']

export const aspectPresets = [
  { id: 'square', name: '1:1', width: 1024, height: 1024 },
  { id: 'portrait', name: '2:3', width: 1024, height: 1536 },
  { id: 'landscape', name: '3:2', width: 1536, height: 1024 },
  { id: 'xhs', name: '小红书', width: 1080, height: 1440 },
  { id: 'bilibili', name: 'B站', width: 2560, height: 1440 },
  { id: 'douyin', name: '抖音', width: 1080, height: 1920 },
]

export const defaultCoverPresets: CoverPreset[] = [
  { id: 'xiaohongshu', name: '小红书封面', width: 1080, height: 1440, enabled: true, custom: false },
  { id: 'wechat', name: '公众号封面', width: 900, height: 383, enabled: true, custom: false },
  { id: 'bilibili', name: 'B站封面', width: 2560, height: 1440, enabled: true, custom: false },
  { id: 'douyin', name: '抖音/视频号', width: 1080, height: 1920, enabled: true, custom: false },
]

export const defaultModels: ModelProfile[] = [
  {
    id: 'local-preview',
    name: 'Local Preview',
    provider: 'local-preview',
    endpoint: '',
    apiKey: '',
    model: 'samimage-local-preview',
    kind: 'image',
    isPrimary: true,
    status: 'connected',
  },
  {
    id: 'text-polish',
    name: 'Text Polish',
    provider: 'openai-compatible',
    endpoint: '',
    apiKey: '',
    model: '',
    kind: 'text',
    isPrimary: false,
    status: 'untested',
  },
]

const now = new Date().toISOString()
const builtinPrompts = [
  ['封面', '小红书知识封面', '一张小红书知识分享封面，醒目的中文标题，暖色科技风格，主体清晰。'],
  ['图生图', '漫画滤镜', '保留原图人物姿态与轮廓，转换为干净的日漫线稿风格。'],
  ['ICON', '本地工具图标', '一个本地 AI 图像工具 App Icon，中心是抽象相机与星光。'],
  ['3D', '3D 产品渲染', '高质量 3D 产品渲染，柔和棚拍光，暗色科技背景，真实材质。'],
  ['GIF', '循环动图', '一个 4 秒无缝循环动图，图像卡片从草图逐渐变成高清成品。'],
  ['文生图', 'Tech 工作室场景', '冷峻的桌面创作工作室界面，深空色背景，电光蓝色按钮。'],
] as const

export const defaultPrompts: PromptItem[] = builtinPrompts.map(([category, title, prompt], index) => ({
  id: stableId('prompt', `${title}-${prompt}`),
  title,
  prompt,
  source: 'builtin',
  sourceId: `builtin-${index}`,
  category,
  subCategory: '',
  author: 'SamImage',
  tags: [category],
  preview: '',
  refImages: [],
  createdAt: now,
}))
