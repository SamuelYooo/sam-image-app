import type { CoverPreset, ExportFormat, GenerationMode, ModelProfile, PromptItem } from '@/types/domain'
import { stableId } from '@/domain/ids'

export interface ToolEntry {
  id: string
  title: string
  desc: string
  mode: GenerationMode
  icon: string
  promptSeed: string
  style?: string
  preset?: string
}

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
  tools: ToolEntry[]
}> = [
  {
    id: 'generate',
    name: '生成类',
    tone: 'matcha',
    tools: [
      {
        id: 'text-to-image',
        title: '文生图',
        desc: '输入提示词，描述你想要的内容，AI 生成对应图像',
        mode: 'txt2img',
        icon: 'Plus',
        promptSeed: '一张高质量 AI 生成图像，主体明确，构图干净，光影自然，适合正式项目交付。',
        style: '摄影',
      },
      {
        id: 'image-to-image',
        title: '图生图',
        desc: '上传图片，输入目标风格描述，生成新的变体图像',
        mode: 'img2img',
        icon: 'Image',
        promptSeed: '保留参考图主体结构与核心轮廓，重绘为更精致的商业视觉作品，细节清晰，质感统一。',
        style: '自然',
      },
      {
        id: 'three-d-image',
        title: '3D 图生成',
        desc: '生成带深度感和三维质感的图像作品',
        mode: '3d',
        icon: 'Box',
        promptSeed: '高质量 3D 产品概念图，柔和棚拍光，真实材质，干净背景，主体居中，具备空间深度。',
        style: '3D',
      },
      {
        id: 'eight-bit-pixel',
        title: '8bit 像素图',
        desc: '将图片转换为复古像素艺术风格',
        mode: 'gif',
        icon: 'Grid2X2',
        promptSeed: '复古 8bit 像素艺术画面，低分辨率像素块质感，有限色板，怀旧游戏视觉，主体清楚。',
        style: '像素',
      },
      {
        id: 'gif-animation',
        title: 'GIF 动图',
        desc: '生成或转换短循环动图，支持场景变化',
        mode: 'gif',
        icon: 'Repeat',
        promptSeed: '一个 4 秒无缝循环 GIF 动图，主体动作平滑，场景变化自然，开头和结尾能够顺畅衔接。',
        style: '插画',
      },
      {
        id: 'pattern-generator',
        title: '图案生成',
        desc: '生成可平铺的图案纹理，适用于壁纸与贴图',
        mode: 'txt2img',
        icon: 'Sparkles',
        promptSeed: '可无缝平铺的装饰图案纹理，元素重复自然，边缘连续，适合壁纸、贴图和包装背景。',
        style: '插画',
      },
    ],
  },
  {
    id: 'design',
    name: '设计类',
    tone: 'ube',
    tools: [
      {
        id: 'app-icon',
        title: 'ICON 图标',
        desc: '输入图标描述，生成 App / 网站 / 桌面图标',
        mode: 'icon',
        icon: 'Badge',
        promptSeed: '一个本地 AI 图像工具 App Icon，中心是抽象相机与星光，圆角方形构图，玻璃质感，识别度高。',
        style: '3D',
      },
      {
        id: 'social-avatar',
        title: '社交头像',
        desc: '生成适合各平台的社交媒体头像',
        mode: 'img2img',
        icon: 'UserRound',
        promptSeed: '适合社交媒体使用的头像，人物面部清晰，背景简洁，色彩友好，构图适配圆形裁切。',
        style: '插画',
      },
      {
        id: 'media-cover',
        title: '自媒体封面',
        desc: '小红书 / 公众号 / B站 / 抖音平台封面',
        mode: 'cover',
        icon: 'PanelsTopLeft',
        promptSeed: '自媒体内容封面，醒目中文标题区域，主体突出，信息层级清晰，适合小红书和视频平台点击。',
        style: '国潮',
        preset: 'xiaohongshu',
      },
      {
        id: 'id-photo',
        title: 'AI 证件照',
        desc: '上传自拍，生成标准证件照规格',
        mode: 'img2img',
        icon: 'IdCard',
        promptSeed: '标准证件照效果，白色或浅色背景，正面人像，面部清晰，自然肤色，服装整洁。',
        style: '摄影',
      },
    ],
  },
  {
    id: 'repair',
    name: '修复类',
    tone: 'accent',
    tools: [
      {
        id: 'remove-background',
        title: '去背景',
        desc: '精准分离主体与背景，输出透明 PNG',
        mode: 'img2img',
        icon: 'Eraser',
        promptSeed: '精准分离主体并移除背景，保留主体边缘细节，输出透明背景 PNG，避免锯齿和残留杂色。',
        style: '自然',
      },
      {
        id: 'remove-text',
        title: '去文字',
        desc: '自动识别并去除图片中的文字，无痕修复背景',
        mode: 'img2img',
        icon: 'MessageSquareX',
        promptSeed: '移除图片中的文字和水印区域，并根据周围纹理无痕补全背景，保持原始光影与透视。',
        style: '自然',
      },
      {
        id: 'remove-shadow',
        title: '去阴影',
        desc: '移除人像或物体上的投影，还原本色',
        mode: 'img2img',
        icon: 'ShieldCheck',
        promptSeed: '移除主体或背景上的明显阴影，保持物体真实颜色和材质，画面干净自然。',
        style: '自然',
      },
      {
        id: 'image-enhance',
        title: '图片增强',
        desc: '去模糊、锐化、透视矫正，提升图像画质',
        mode: 'img2img',
        icon: 'Activity',
        promptSeed: '增强图片清晰度与细节，降低噪点，改善锐度和色彩层次，保持真实自然不失真。',
        style: '摄影',
      },
      {
        id: 'old-photo-restore',
        title: '老照片修复',
        desc: '修复划痕、褪色、破损，还老旧照片以新颜',
        mode: 'img2img',
        icon: 'History',
        promptSeed: '修复老照片划痕、褪色和破损区域，还原清晰人像与自然色彩，保留年代感。',
        style: '摄影',
      },
    ],
  },
  {
    id: 'portrait',
    name: '人像类',
    tone: 'lemon',
    tools: [
      {
        id: 'portrait-cartoon',
        title: '人像卡通化',
        desc: '将真人照片转为卡通 / 插画风格',
        mode: 'img2img',
        icon: 'Smile',
        promptSeed: '将真人人像转换为精致卡通插画风格，保留五官特征，线条干净，色彩明亮。',
        style: '插画',
      },
      {
        id: 'style-transfer',
        title: '风格转换',
        desc: '印象派、赛博朋克、水彩、素描等艺术风格',
        mode: 'img2img',
        icon: 'Aperture',
        promptSeed: '将参考图转换为目标艺术风格，保留主体结构和关键细节，画面风格统一，质感明确。',
        style: '赛博',
      },
      {
        id: 'replace-background',
        title: '背景替换',
        desc: '智能去除背景并替换为指定场景背景',
        mode: 'img2img',
        icon: 'Layers',
        promptSeed: '保留人物或产品主体，替换为干净专业的新背景，主体边缘自然融合，光影方向一致。',
        style: '自然',
      },
    ],
  },
]

export const toolEntries = toolGroups.flatMap((group) => group.tools)

export const stylePresets = ['自然', '摄影', '插画', '国潮', '赛博', '极简', '3D', '像素']

export const aspectPresets = [
  { id: 'square', name: '1:1', width: 1024, height: 1024 },
  { id: 'portrait', name: '2:3', width: 1024, height: 1536 },
  { id: 'landscape', name: '3:2', width: 1536, height: 1024 },
  { id: 'xhs', name: '小红书', width: 1080, height: 1440 },
  { id: 'bilibili', name: 'B站', width: 2560, height: 1440 },
  { id: 'douyin', name: '抖音', width: 1080, height: 1920 },
]

export const exportFormatOptions: Array<{ value: ExportFormat; label: string }> = [
  { value: 'svg', label: 'SVG 本地预览' },
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'webp', label: 'WEBP' },
  { value: 'gif', label: 'GIF' },
]

export const iconExportFormatOptions: Array<{ value: ExportFormat; label: string }> = [
  ...exportFormatOptions,
  { value: 'ico', label: 'ICO 多尺寸' },
]

export function getExportFormatOptions(mode?: GenerationMode): Array<{ value: ExportFormat; label: string }> {
  return mode === 'icon' ? iconExportFormatOptions : exportFormatOptions
}

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
