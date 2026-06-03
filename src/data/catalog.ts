import type { CoverPreset, ExportFormat, GenerationMode, ModelProfile, PromptItem } from '@/types/domain'
import { stableId } from '@/domain/ids'
import { normalizeBilingualPromptMarkdown } from '@/domain/promptImport'
import builtinPromptMarkdown from '../../docs/资料/常用提示词.md?raw'
import supplementalPromptMarkdown from '../../docs/资料/提示词补充.md?raw'

export type ToolControlType = 'range' | 'select' | 'chips'

export interface ToolControlOption {
  value: string
  label: string
}

export interface ToolControl {
  /** modeOptions 键名，会原样透传进生成任务 */
  key: string
  label: string
  type: ToolControlType
  /** range 的默认数值，或 select/chips 的默认选项值 */
  default: number | string
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: ToolControlOption[]
  hint?: string
  /** 拼入英文生成提示词的片段；可用 {value} 占位当前值 */
  promptFragment?: string
}

export interface ToolEntry {
  id: string
  title: string
  desc: string
  mode: GenerationMode
  icon: string
  promptSeed: string
  style?: string
  preset?: string
  /** 工作台头部副标题，概述工具定位 */
  subtitle?: string
  /** 工具专属反向提示词种子 */
  negativeSeed?: string
  /** 数据流说明，覆盖按模式的默认文案 */
  flowCopy?: string
  /** 提示词输入提示 */
  promptHint?: string
  /** 是否强烈建议/必须上传参考图 */
  referenceRequired?: boolean
  /** 推荐输出尺寸 */
  recommendedSize?: { width: number; height: number }
  /** 推荐画幅描述，仅用于展示 */
  recommendedAspect?: string
  /** 工具专属参数控件，渲染进"工具参数"块并合并入 modeOptions */
  extraControls?: ToolControl[]
  /**
   * 该工具是否依赖模式级参数（如文生图用右侧「创意度/细节」滑条）。
   * 设为 true 时，catalog 校验允许 extraControls 为空（因为参数已由"模式专属"块提供）。
   */
  usesModeLevelControls?: boolean
  /** 工作台底部使用提示 */
  tips?: string[]
}

export interface ThreeDStylePreset {
  id: string
  name: string
  tone: string
  prompt: string
  depthStrength: number
  preview: string
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
        subtitle: '文字生图 · 自由创作',
        negativeSeed: '模糊、低分辨率、变形、多余肢体、水印、杂乱背景',
        flowCopy: '文生图读取提示词与画面参数，从零生成全新图像，无需上传任何参考图。',
        promptHint: '写清主体、风格、光线与场景，例如「黄昏海边的灯塔，暖色逆光，写实摄影」。',
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '1:1 方形',
        // 创意度/画面密度/细节等参数已由"模式专属"块统一提供（modeState → resolveToolEffects），
        // 此处不再重复声明，避免控件重复
        extraControls: [],
        usesModeLevelControls: true,
        tips: [
          '主体、风格、光线分句描述，AI 更容易抓住重点。',
          '同一句提示词可多次生成，挑选最满意的结果。',
          '创意度 / 细节 两个滑条在右侧「模式专属」块通用，无需在此工具再选。',
        ],
      },
      {
        id: 'image-to-image',
        title: '图生图',
        desc: '上传图片，输入目标风格描述，生成新的变体图像',
        mode: 'img2img',
        icon: 'Image',
        promptSeed: '保留参考图主体结构与核心轮廓，重绘为更精致的商业视觉作品，细节清晰，质感统一。',
        style: '自然',
        subtitle: '参考重绘 · 风格变体',
        negativeSeed: '结构错乱、主体走形、风格混杂、细节崩坏、噪点',
        flowCopy: '图生图读取参考图与重绘幅度，在保留原结构的基础上生成新的风格变体。',
        promptHint: '描述想要的目标风格与改动，例如「转成清新水彩，保留人物姿态」。',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '与原图一致',
        extraControls: [
          {
            key: 'redrawStrength',
            label: '重绘幅度',
            type: 'range',
            default: 55,
            min: 0,
            max: 100,
            unit: '',
            hint: '幅度越高越偏离原图、越接近提示词；越低越贴近原图。',
            promptFragment: 'redraw strength {value}/100, higher means more deviation from the reference',
          },
          {
            key: 'keepStructure',
            label: '保留结构',
            type: 'chips',
            default: 'medium',
            options: [
              { value: 'strong', label: '强' },
              { value: 'medium', label: '中' },
              { value: 'weak', label: '弱' },
            ],
            promptFragment: 'preserve original composition with {value} structural fidelity',
          },
        ],
        tips: [
          '想大改风格调高重绘幅度，想微调质感调低。',
          '保留结构选「强」可稳住人物姿态与构图。',
          '参考图越清晰，重绘结果细节越稳定。',
        ],
      },
      {
        id: 'three-d-image',
        title: '3D 图生成',
        desc: '生成带深度感和三维质感的图像作品',
        mode: '3d',
        icon: 'Box',
        promptSeed: '高质量 3D 产品概念图，柔和棚拍光，真实材质，干净背景，主体居中，具备空间深度。',
        style: '3D',
        subtitle: '三维质感 · 产品概念图',
        negativeSeed: '扁平、平面感、塑料假感、材质错乱、背景杂乱、漏光',
        flowCopy: '3D 图生成读取提示词与材质打光参数，直接生成带空间深度的三维质感图像。',
        promptHint: '描述主体、材质与场景，例如「一只陶瓷小鹿摆件，棚拍柔光，米色背景」。',
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '1:1 方形',
        extraControls: [
          {
            key: 'material',
            label: '材质',
            type: 'select',
            default: 'metal',
            options: [
              { value: 'metal', label: '金属' },
              { value: 'plastic', label: '塑料' },
              { value: 'ceramic', label: '陶瓷' },
              { value: 'glass', label: '玻璃' },
            ],
            promptFragment: 'rendered with realistic {value} material surface',
          },
          {
            key: 'lighting',
            label: '打光',
            type: 'select',
            default: 'softbox',
            options: [
              { value: 'softbox', label: '柔光棚拍' },
              { value: 'rim', label: '轮廓逆光' },
              { value: 'dramatic', label: '戏剧硬光' },
              { value: 'ambient', label: '环境均光' },
            ],
            promptFragment: '{value} studio lighting setup',
          },
        ],
        tips: [
          '材质与打光组合决定质感，金属配硬光更显高级。',
          '想突出体积感时选轮廓逆光。',
          '背景描述越简洁，主体三维感越突出。',
        ],
      },
      {
        id: 'eight-bit-pixel',
        title: '8bit 像素图',
        desc: '将图片转换为复古像素艺术风格',
        mode: 'img2img',
        icon: 'Grid2X2',
        promptSeed: '复古 8bit 像素艺术画面，低分辨率像素块质感，有限色板，怀旧游戏视觉，主体清楚。',
        style: '像素',
        subtitle: '复古像素 · 游戏风转换',
        negativeSeed: '高清平滑、抗锯齿、渐变过渡、写实材质、色彩过多',
        flowCopy: '8bit 像素图读取参考图与像素块、调色板参数，转换为复古低分辨率像素艺术。',
        promptHint: '描述要保留的主体，例如「保留角色轮廓，转成复古 GB 掌机画风」。',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '1:1 方形',
        extraControls: [
          {
            key: 'pixelBlockSize',
            label: '像素块大小',
            type: 'range',
            default: 8,
            min: 2,
            max: 32,
            step: 1,
            unit: 'px',
            hint: '数值越大像素块越粗，复古感越强；越小越精细。',
            promptFragment: 'pixel block size about {value}px, chunky retro pixels when larger',
          },
          {
            key: 'palette',
            label: '调色板',
            type: 'select',
            default: 'sixteen',
            options: [
              { value: 'eight', label: '8 色' },
              { value: 'sixteen', label: '16 色' },
              { value: 'gameboy', label: '复古 GB' },
            ],
            promptFragment: 'limited {value} color palette',
          },
        ],
        tips: [
          '主体简单、对比强的图片像素化效果更好。',
          '想要浓郁怀旧味就选复古 GB 调色板。',
          '像素块越大，细节丢失越多，注意保留主体识别度。',
        ],
      },
      {
        id: 'gif-animation',
        title: 'GIF 动图',
        desc: '生成静态图后由前端合成真循环动图',
        mode: 'gif',
        icon: 'Repeat',
        promptSeed: '一个 4 秒无缝循环 GIF 动图，主体动作平滑，场景变化自然，开头和结尾能够顺畅衔接。',
        style: '插画',
        subtitle: '短循环 · 动图生成',
        negativeSeed: '跳帧、闪烁、衔接生硬、主体抖动、画面撕裂',
        flowCopy: '上游返回静态主图，前端按帧率/时长/循环方式合成真动图（Ken Burns 缩放或多图交叉淡入）。',
        promptHint: '描述动作与节奏，例如「一杯咖啡冒着热气，缓慢循环，氛围温暖」。',
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '1:1 方形',
        extraControls: [
          {
            key: 'frameRate',
            label: '帧率',
            type: 'range',
            default: 12,
            min: 6,
            max: 30,
            step: 1,
            unit: 'fps',
            hint: '帧率越高动作越顺滑，文件也越大；越低越有定格感。',
            promptFragment: 'animate at about {value} fps, smoother motion when higher',
          },
          {
            key: 'loopMode',
            label: '循环方式',
            type: 'select',
            default: 'seamless',
            options: [
              { value: 'seamless', label: '无缝' },
              { value: 'pingpong', label: '来回' },
            ],
            promptFragment: '{value} loop playback style',
          },
        ],
        tips: [
          '前端会把单张主图按 Ken Burns 缩放合成运动帧；多张资产则交叉淡入。',
          '「来回」会在无缝序列后再正向播放一次，首尾衔接。',
          '帧率 12 fps 已足够顺滑，导出文件体积更小。',
        ],
      },
      {
        id: 'pattern-generator',
        title: '图案生成',
        desc: '生成可平铺的图案纹理，适用于壁纸与贴图',
        mode: 'txt2img',
        icon: 'Sparkles',
        promptSeed: '可无缝平铺的装饰图案纹理，元素重复自然，边缘连续，适合壁纸、贴图和包装背景。',
        style: '插画',
        subtitle: '无缝平铺 · 纹理图案',
        negativeSeed: '接缝明显、元素断裂、边缘对不齐、主体突兀、留白过多',
        flowCopy: '图案生成读取提示词与平铺密度、对称参数，直接生成可无缝拼接的图案纹理。',
        promptHint: '描述图案元素与风格，例如「小碎花配藤蔓，莫兰迪配色，清新北欧风」。',
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '1:1 方形',
        extraControls: [
          {
            key: 'tileDensity',
            label: '平铺密度',
            type: 'range',
            default: 50,
            min: 0,
            max: 100,
            unit: '',
            hint: '密度越高单元越密集细碎，越低单元越大越疏朗。',
            promptFragment: 'tiling element density {value}/100, denser repeats when higher',
          },
          {
            key: 'symmetry',
            label: '对称',
            type: 'select',
            // 去掉 random ——「随机散布」与「无缝平铺」语义冲突。
            // 需要自然不规则时改用「放射」或在后续迭代中再加专门的 organic 对称模式。
            default: 'grid',
            options: [
              { value: 'grid', label: '网格' },
              { value: 'mirror', label: '镜像' },
              { value: 'radial', label: '放射' },
            ],
            promptFragment: '{value} symmetry layout for seamless tiling',
          },
        ],
        tips: [
          '元素简洁、留白均匀的图案更容易无缝衔接。',
          '想要规整感选网格对称，想要秩序层次选镜像或放射。',
          '生成后可用作壁纸或包装贴图，注意预留平铺方向。',
        ],
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
        subtitle: '应用图标 · 高识别度',
        negativeSeed: '细节过多、文字堆砌、构图歪斜、低识别度、边缘毛糙',
        flowCopy: 'ICON 图标读取提示词与圆角、风格参数，直接生成居中、规整的方形应用图标，再由前端按圆角裁切。',
        promptHint: '描述图标主体与寓意，例如「一只折纸狐狸，扁平风，橙白配色」。',
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '1:1 方形',
        extraControls: [
          {
            key: 'cornerRadius',
            label: '圆角半径',
            type: 'range',
            default: 24,
            min: 0,
            max: 50,
            unit: '%',
            hint: '生成后由前端按此比例做 destination-in 圆角裁切；0 为直角。',
            promptFragment: 'rounded square icon with corner radius about {value}%',
          },
          {
            key: 'iconStyle',
            label: '风格',
            type: 'chips',
            default: 'flat',
            options: [
              { value: 'flat', label: '扁平' },
              { value: 'skeuomorphic', label: '拟物' },
              { value: 'glass', label: '玻璃' },
            ],
            promptFragment: '{value} icon design style',
          },
        ],
        tips: [
          '图标主体单一、轮廓清晰，缩小后才好辨认。',
          '玻璃与拟物风格更立体，扁平风格更现代通用。',
          '导出时可选 ICO 多尺寸，一次输出全套图标。',
          '右侧「模式专属」块的「圆角底/纯色底」只影响背景填色（前端 Canvas），不再控制圆角弧度。',
        ],
      },
      {
        id: 'social-avatar',
        title: '社交头像',
        desc: '生成适合各平台的社交媒体头像',
        mode: 'img2img',
        icon: 'UserRound',
        promptSeed: '适合社交媒体使用的头像，人物面部清晰，背景简洁，色彩友好，构图适配圆形裁切。',
        style: '插画',
        subtitle: '社交头像 · 多平台适配',
        negativeSeed: '面部模糊、背景杂乱、主体偏移、裁切丢失五官、过曝',
        flowCopy: '社交头像读取参考图与裁切、风格参数，生成居中、适配头像框的方形成像。',
        promptHint: '描述风格与氛围，例如「转成清新插画头像，浅色背景，微笑表情」。',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '1:1 方形',
        extraControls: [
          {
            key: 'cropShape',
            label: '裁切',
            type: 'select',
            default: 'circle',
            options: [
              { value: 'circle', label: '圆形' },
              { value: 'square', label: '方形' },
            ],
            promptFragment: 'composed to fit a {value} avatar crop, subject centered',
          },
          {
            key: 'avatarStyle',
            label: '风格',
            type: 'chips',
            default: 'illustration',
            options: [
              { value: 'illustration', label: '插画' },
              { value: 'realistic', label: '写实' },
              { value: 'anime', label: '二次元' },
            ],
            promptFragment: '{value} avatar art style',
          },
        ],
        tips: [
          '主体居中、背景简洁的头像在小尺寸下更清楚。',
          '多数平台用圆形裁切，注意别让五官贴边。',
          '同一张脸可换不同风格，做成系列头像。',
        ],
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
        subtitle: '自媒体封面 · 高点击构图',
        negativeSeed: '标题区拥挤、文字乱码、主体喧宾夺主、配色脏、留白失衡',
        flowCopy: '自媒体封面读取提示词与标题位置、信息密度参数，生成带标题区的竖版封面。',
        promptHint: '描述主题与氛围，例如「露营好物分享封面，暖色调，上方留标题区」。',
        recommendedSize: { width: 1080, height: 1440 },
        recommendedAspect: '3:4 小红书',
        extraControls: [
          {
            key: 'titlePosition',
            label: '标题位置',
            type: 'select',
            default: 'top',
            options: [
              { value: 'top', label: '上' },
              { value: 'center', label: '中' },
              { value: 'bottom', label: '下' },
            ],
            promptFragment: 'reserve a clear title area at the {value} of the cover',
          },
          {
            key: 'infoDensity',
            label: '信息密度',
            type: 'range',
            default: 50,
            min: 0,
            max: 100,
            unit: '',
            hint: '密度越高画面信息越满，越低越聚焦留白。',
            promptFragment: 'information density {value}/100, busier layout when higher',
          },
        ],
        tips: [
          '标题区预留充足，后期叠字才不会挤到主体。',
          '小红书竖版封面用 3:4，首屏占比更大。',
          '主色控制在两到三种，封面更干净有记忆点。',
        ],
      },
      {
        id: 'id-photo',
        title: 'AI 证件照',
        desc: '上传自拍，生成标准证件照规格',
        mode: 'img2img',
        icon: 'IdCard',
        promptSeed: '标准证件照效果，白色或浅色背景，正面人像，面部清晰，自然肤色，服装整洁。',
        style: '摄影',
        subtitle: '标准证件照 · 规格化输出',
        negativeSeed: '侧脸、夸张表情、复杂背景、阴影、过曝、美颜失真',
        flowCopy: '证件照读取自拍参考图、底色与规格，生成正面合规人像，背景干净、比例标准。',
        promptHint: '描述着装与表情要求，例如「深色正装、自然微笑」，背景与规格由下方参数控制。',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1280 },
        recommendedAspect: '约 5:6（一寸/二寸）',
        extraControls: [
          {
            key: 'backgroundColor',
            label: '底色',
            type: 'chips',
            default: 'white',
            options: [
              { value: 'white', label: '白底' },
              { value: 'blue', label: '蓝底' },
              { value: 'red', label: '红底' },
              { value: 'gray', label: '灰底' },
            ],
            promptFragment: 'solid {value} studio background for ID photo',
          },
          {
            key: 'idSpec',
            label: '规格',
            type: 'select',
            default: 'one-inch',
            options: [
              { value: 'one-inch', label: '一寸 295x413' },
              { value: 'two-inch', label: '二寸 413x579' },
              { value: 'small-one-inch', label: '小一寸 260x378' },
              { value: 'passport', label: '护照 354x472' },
            ],
            hint: '选择规格后会按该证件照的标准比例输出。',
            promptFragment: 'format the portrait as a {value} ID photo specification with compliant head ratio and margins',
          },
          {
            key: 'attire',
            label: '着装',
            type: 'select',
            default: 'business',
            options: [
              { value: 'business', label: '正装' },
              { value: 'casual', label: '休闲' },
              { value: 'keep', label: '保持原样' },
            ],
            promptFragment: 'subject wearing {value} attire',
          },
        ],
        tips: [
          '上传正面、光线均匀的自拍效果最好。',
          '底色与规格按目标用途选择，常见证件用白底一寸。',
          '导出时可按规格尺寸缩放，保证打印比例正确。',
          '「规格」会真实改变输出尺寸（一寸 295×413、护照 354×472 等）。',
          '「底色」由前端在生成结果上覆盖纯色背景。',
        ],
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
        subtitle: '主体抠图 · 透明背景输出',
        negativeSeed: '背景残留、边缘锯齿、抠图发丝缺失、白边、灰边',
        flowCopy: '去背景读取参考图与边缘羽化强度，分离主体并清理背景，输出可直接合成的透明 PNG。',
        promptHint: '描述需要保留的主体，例如「保留人物与发丝边缘」，AI 会据此优化抠图。',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '与原图一致',
        extraControls: [
          {
            key: 'edgeFeather',
            label: '边缘羽化',
            type: 'range',
            default: 30,
            min: 0,
            max: 100,
            unit: '',
            hint: '数值越高边缘越柔和，适合发丝与毛绒主体；数值越低边缘越锐利。',
            promptFragment: 'soft feathered cutout edges, edge feather strength {value}/100',
          },
          {
            key: 'matteOutput',
            label: '输出形式',
            type: 'select',
            default: 'transparent',
            options: [
              { value: 'transparent', label: '透明背景' },
              { value: 'white', label: '纯白背景' },
              { value: 'mask', label: '黑白蒙版' },
            ],
            promptFragment: 'output as {value} background result',
          },
        ],
        tips: [
          '主体与背景对比越强，抠图越干净。',
          '发丝、毛绒等复杂边缘建议提高边缘羽化。',
          '需要直接合成时选择透明背景，导出 PNG 保留通道。',
        ],
      },
      {
        id: 'remove-text',
        title: '去文字',
        desc: '由图像模型识别并补全文字区域（需 inpainting 能力）',
        mode: 'img2img',
        icon: 'MessageSquareX',
        promptSeed: '移除图片中的文字和水印区域，并根据周围纹理无痕补全背景，保持原始光影与透视。',
        style: '自然',
        subtitle: '去文字水印 · 无痕修复',
        negativeSeed: '修复痕迹、色块突兀、纹理错位、残留文字、边缘模糊',
        flowCopy: '由图像模型识别文字水印并按周围纹理补全；效果取决于模型 inpainting 能力。',
        promptHint: '说明要去除的内容与保留区域，例如「去掉右下角水印，保留人物」。',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '与原图一致',
        extraControls: [
          {
            key: 'repairStrength',
            label: '修复强度',
            type: 'range',
            default: 60,
            min: 0,
            max: 100,
            unit: '',
            hint: '强度越高补全越彻底，但可能改动更多周边像素（模型行为）。',
            promptFragment: 'inpainting strength {value}/100, more aggressive fill when higher',
          },
          {
            key: 'protectRegion',
            label: '保护对象',
            type: 'select',
            // 修复 B8：原"保护主体/保护背景/不限定"语义错位。去文字工具真正想保护的是
            // 「文字 / 主体」或「文字 / 背景」，改为更直白的"text-or-subject"分类。
            default: 'text',
            options: [
              { value: 'text', label: '保护文字' },
              { value: 'subject', label: '保护主体' },
              { value: 'all', label: '不限定' },
            ],
            promptFragment: 'treat the {value} area as protected while removing text',
          },
        ],
        tips: [
          '文字压在纯色或简单纹理上时修复最干净。',
          '复杂背景上的文字建议适当提高修复强度。',
          '「保护文字」= 让模型只补非文字区域；「保护主体」= 让人物不被改动。',
          '最终去字/补图效果由图像模型决定，多生成几次挑选最佳。',
        ],
      },
      {
        id: 'remove-shadow',
        title: '去阴影',
        desc: '移除人像或物体上的投影，还原本色',
        mode: 'img2img',
        icon: 'ShieldCheck',
        promptSeed: '移除主体或背景上的明显阴影，保持物体真实颜色和材质，画面干净自然。',
        style: '自然',
        subtitle: '去投影 · 还原本色',
        negativeSeed: '过曝、颜色发灰、立体感丢失、边缘残影、材质失真',
        flowCopy: '去阴影读取参考图与去除强度参数，移除投影并按真实材质还原主体本色。',
        promptHint: '指出阴影位置，例如「去掉脸部右侧的硬阴影，保持肤色自然」。',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '与原图一致',
        extraControls: [
          {
            key: 'removalStrength',
            label: '去除强度',
            type: 'range',
            default: 60,
            min: 0,
            max: 100,
            unit: '',
            hint: '强度越高阴影去得越彻底，过高可能让画面变扁。',
            promptFragment: 'shadow removal strength {value}/100, flatter lighting when higher',
          },
          {
            key: 'keepAmbient',
            label: '保留环境光',
            type: 'chips',
            default: 'soft',
            options: [
              { value: 'soft', label: '保留柔光' },
              { value: 'flat', label: '完全去除' },
            ],
            promptFragment: 'retain {value} ambient lighting after shadow removal',
          },
        ],
        tips: [
          '硬阴影比柔和阴影更容易残留边缘，可加大去除强度。',
          '想保住立体感就选保留柔光，别完全压平。',
          '去阴影后如有偏色，可再用图片增强微调。',
        ],
      },
      {
        id: 'image-enhance',
        title: '图片增强',
        desc: '去模糊、锐化、透视矫正，提升图像画质',
        mode: 'img2img',
        icon: 'Activity',
        promptSeed: '增强图片清晰度与细节，降低噪点，改善锐度和色彩层次，保持真实自然不失真。',
        style: '摄影',
        subtitle: '画质增强 · 清晰放大',
        negativeSeed: '过度锐化、涂抹感、噪点放大、色彩失真、边缘光晕',
        flowCopy: '图片增强读取参考图与锐化、降噪、放大参数，提升清晰度并放大成像。',
        promptHint: '说明诉求，例如「让模糊的旧照片更清晰，肤质保持自然」。',
        referenceRequired: true,
        recommendedSize: { width: 1536, height: 1536 },
        recommendedAspect: '与原图一致',
        extraControls: [
          {
            key: 'sharpen',
            label: '锐化',
            type: 'range',
            default: 50,
            min: 0,
            max: 100,
            unit: '',
            hint: '锐化越强细节越突出，过高会出现描边和噪点。',
            promptFragment: 'sharpening level {value}/100, crisper edges when higher',
          },
          {
            key: 'denoise',
            label: '降噪',
            type: 'range',
            default: 40,
            min: 0,
            max: 100,
            unit: '',
            hint: '降噪越强画面越干净，过高会损失细节变涂抹。',
            promptFragment: 'noise reduction {value}/100, cleaner but softer when higher',
          },
          {
            key: 'upscale',
            label: '放大倍数',
            type: 'select',
            default: '2x',
            options: [
              { value: '1x', label: '1x' },
              { value: '2x', label: '2x' },
              { value: '4x', label: '4x' },
            ],
            promptFragment: 'upscale resolution by {value}',
          },
        ],
        tips: [
          '锐化和降噪由模型决定，强度只是倾向。',
          '「2x / 4x 放大」是 Canvas 重采样（不是 AI 超分），原图太糊时细节仍补不回来。',
          '人像增强时降噪别太重，否则皮肤会发假。',
        ],
      },
      {
        id: 'old-photo-restore',
        title: '老照片修复',
        desc: '修复划痕、褪色、破损，还老旧照片以新颜',
        mode: 'img2img',
        icon: 'History',
        promptSeed: '修复老照片划痕、褪色和破损区域，还原清晰人像与自然色彩，保留年代感。',
        style: '摄影',
        subtitle: '老照片修复 · 焕新如初',
        negativeSeed: '过度磨皮、五官改变、上色失真、划痕残留、年代感尽失',
        flowCopy: '老照片修复读取参考图与修复、上色、去划痕参数，补全破损并还原清晰人像。',
        promptHint: '说明照片状况，例如「修复泛黄折痕，保留人物原貌，可自动上色」。',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '与原图一致',
        extraControls: [
          {
            key: 'restoreStrength',
            label: '修复强度',
            type: 'range',
            default: 65,
            min: 0,
            max: 100,
            unit: '',
            hint: '强度越高补全越彻底，过高可能改变人物原貌。',
            promptFragment: 'restoration strength {value}/100, more reconstruction when higher',
          },
          {
            key: 'colorize',
            label: '上色',
            type: 'chips',
            default: 'auto',
            options: [
              { value: 'keep-bw', label: '保持黑白' },
              { value: 'auto', label: '自动上色' },
            ],
            promptFragment: '{value} colorization for the restored photo',
          },
          {
            key: 'descratch',
            label: '去划痕',
            type: 'range',
            default: 70,
            min: 0,
            max: 100,
            unit: '',
            hint: '数值越高划痕折痕去得越干净。',
            promptFragment: 'scratch and crease removal {value}/100',
          },
        ],
        tips: [
          '修复强度别拉满，保留一点原貌更像本人。',
          '想保留怀旧氛围可选保持黑白，不强行上色。',
          '划痕密集的照片优先调高去划痕。',
          '上色/去划痕最终效果取决于模型对老照片的还原度，建议多次生成对比。',
        ],
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
        subtitle: '真人转卡通 · 保留神韵',
        negativeSeed: '五官走形、神似度低、线条脏乱、比例失调、表情僵硬',
        flowCopy: '人像卡通化读取参考图与卡通程度、风格参数，将真人转换为卡通插画。',
        promptHint: '描述目标画风，例如「转成日漫风，保留发型与笑容，背景简洁」。',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '1:1 方形',
        extraControls: [
          {
            key: 'cartoonLevel',
            label: '卡通程度',
            type: 'range',
            default: 60,
            min: 0,
            max: 100,
            unit: '',
            hint: '程度越高越夸张卡通，越低越接近真人。',
            promptFragment: 'cartoon stylization level {value}/100, more exaggerated when higher',
          },
          {
            key: 'cartoonStyle',
            label: '风格',
            type: 'select',
            default: 'anime',
            options: [
              { value: 'anime', label: '日漫' },
              { value: 'american', label: '美漫' },
              { value: 'pixar', label: '3D 皮克斯' },
            ],
            promptFragment: '{value} cartoon style',
          },
        ],
        tips: [
          '正脸、光线均匀的照片转出来最像本人。',
          '卡通程度调低能更好保留神韵，适合做头像。',
          '皮克斯风格更立体，日漫风格更扁平清新。',
          '「卡通程度」是模型倾向（不是真后处理），效果取决于模型对风格的还原度。',
        ],
      },
      {
        id: 'style-transfer',
        title: '风格转换',
        desc: '印象派、赛博朋克、水彩、素描等艺术风格',
        mode: 'img2img',
        icon: 'Aperture',
        promptSeed: '将参考图转换为目标艺术风格，保留主体结构和关键细节，画面风格统一，质感明确。',
        style: '赛博',
        subtitle: '艺术风格 · 一键转换',
        negativeSeed: '主体糊成一团、风格不统一、细节丢失、色彩脏、纹理杂乱',
        flowCopy: '风格转换读取参考图与风格、强度参数，在保留主体的前提下套用目标艺术风格。',
        promptHint: '点明目标风格，例如「转成梵高笔触的星空感，保留建筑轮廓」。',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '与原图一致',
        extraControls: [
          {
            key: 'artStyle',
            label: '风格',
            type: 'select',
            default: 'impressionism',
            options: [
              { value: 'impressionism', label: '印象派' },
              { value: 'cyberpunk', label: '赛博朋克' },
              { value: 'watercolor', label: '水彩' },
              { value: 'sketch', label: '素描' },
            ],
            promptFragment: 'transform into {value} art style',
          },
          {
            key: 'styleStrength',
            label: '风格强度',
            type: 'range',
            default: 60,
            min: 0,
            max: 100,
            unit: '',
            hint: '强度越高风格越浓、越偏离原图；越低越克制。',
            promptFragment: 'style intensity {value}/100, stronger stylization when higher',
          },
        ],
        tips: [
          '风格强度调高更出味道，但主体也会更抽象。',
          '结构复杂的照片建议适当降低强度，避免糊成一片。',
          '同一张图可尝试多种风格，对比挑最合适的。',
          '「风格强度」是模型倾向，最终效果取决于模型对风格的还原度。',
        ],
      },
      {
        id: 'replace-background',
        title: '背景替换',
        desc: '智能去除背景并替换为指定场景背景',
        mode: 'img2img',
        icon: 'Layers',
        promptSeed: '保留人物或产品主体，替换为干净专业的新背景，主体边缘自然融合，光影方向一致。',
        style: '自然',
        subtitle: '换背景 · 主体不变',
        negativeSeed: '边缘白边、光影方向冲突、主体浮空、比例失真、合成痕迹',
        flowCopy: '背景替换读取参考图与新背景、边缘融合参数，抠出主体并合成到新场景。',
        promptHint: '描述想要的新背景，例如「换成柔和虚化的咖啡馆室内，暖色光」。',
        referenceRequired: true,
        recommendedSize: { width: 1024, height: 1024 },
        recommendedAspect: '与原图一致',
        extraControls: [
          {
            key: 'newBackground',
            label: '新背景',
            type: 'select',
            default: 'blur',
            options: [
              { value: 'solid', label: '纯色' },
              { value: 'indoor', label: '室内' },
              { value: 'outdoor', label: '户外' },
              { value: 'blur', label: '虚化' },
            ],
            promptFragment: 'replace background with a {value} scene',
          },
          {
            key: 'edgeBlend',
            label: '边缘融合',
            type: 'range',
            default: 50,
            min: 0,
            max: 100,
            unit: '',
            hint: '融合越强主体与新背景过渡越自然，过高会吃掉边缘细节。',
            promptFragment: 'edge blending strength {value}/100 for natural compositing',
          },
        ],
        tips: [
          '主体边缘清晰的照片换背景更自然。',
          '新背景的光线方向尽量和主体一致，合成才不违和。',
          '发丝等复杂边缘可适当提高边缘融合。',
          '「边缘融合」是模型倾向（不是真后处理），最终效果取决于模型的合成能力。',
        ],
      },
    ],
  },
]

export const toolEntries = toolGroups.flatMap((group) => group.tools)

export function findToolEntry(id: string | null | undefined): ToolEntry | undefined {
  if (!id) return undefined
  return toolEntries.find((tool) => tool.id === id)
}

/** 给定模式，返回该模式下的第一个工具，作为只带 mode 入口时的默认工具 */
export function defaultToolForMode(mode: GenerationMode): ToolEntry | undefined {
  return toolEntries.find((tool) => tool.mode === mode)
}

export const stylePresets = ['自然', '摄影', '插画', '国潮', '赛博', '极简', '3D', '像素']

function makeThreeDPreview(id: string, title: string, colors: [string, string, string], shape: string): string {
  const [start, end, accent] = colors
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">`,
    '<defs>',
    `<linearGradient id="${id}-bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient>`,
    `<linearGradient id="${id}-obj" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ffffff"/><stop offset=".55" stop-color="${accent}"/><stop offset="1" stop-color="#111827"/></linearGradient>`,
    '<filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="28" stdDeviation="30" flood-color="#000000" flood-opacity=".42"/></filter>',
    '</defs>',
    `<rect width="960" height="720" fill="url(#${id}-bg)"/>`,
    '<ellipse cx="480" cy="600" rx="255" ry="58" fill="rgba(0,0,0,.28)"/>',
    shape,
    `<text x="48" y="76" fill="rgba(255,255,255,.88)" font-family="Segoe UI, sans-serif" font-size="34" font-weight="800">${title}</text>`,
    '<text x="48" y="116" fill="rgba(255,255,255,.62)" font-family="Cascadia Mono, monospace" font-size="18">SAMIMAGE 3D REFERENCE</text>',
    '</svg>',
  ].join('')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export const threeDStylePresets: ThreeDStylePreset[] = [
  {
    id: 'stone-carving',
    name: '精细石雕',
    tone: '雕刻纹理',
    depthStrength: 88,
    prompt: '精细石雕风格的 3D 主体，灰白大理石材质，细密浮雕纹路，手工凿刻边缘，柔和博物馆布光，主体居中，背景干净，强调体积、阴影和真实石材颗粒。',
    preview: makeThreeDPreview(
      'stone-carving',
      '精细石雕',
      ['#273244', '#8a8178', '#d7d0c6'],
      '<path d="M480 132 L672 244 L642 500 L480 590 L318 500 L288 244 Z" fill="url(#stone-carving-obj)" stroke="rgba(255,255,255,.5)" stroke-width="5" filter="url(#soft-shadow)"/><path d="M480 132 L480 590 M288 244 L642 500 M672 244 L318 500" stroke="rgba(38,45,58,.38)" stroke-width="8"/><circle cx="480" cy="352" r="82" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="18"/>',
    ),
  },
  {
    id: 'sci-fi-armor',
    name: '科幻装甲',
    tone: '硬面结构',
    depthStrength: 92,
    prompt: '科幻装甲风格的 3D 机械主体，硬表面分件结构，金属护甲板、发光能量线、精密螺丝与切面，冷色棚拍光，未来军工质感，轮廓强烈，适合概念设计参考。',
    preview: makeThreeDPreview(
      'sci-fi-armor',
      '科幻装甲',
      ['#07111f', '#17436b', '#62d7ff'],
      '<path d="M480 108 L672 236 L604 552 L480 628 L356 552 L288 236 Z" fill="url(#sci-fi-armor-obj)" stroke="rgba(133,232,255,.78)" stroke-width="5" filter="url(#soft-shadow)"/><path d="M382 270 H578 L616 430 L480 526 L344 430 Z" fill="rgba(3,12,24,.58)" stroke="rgba(98,215,255,.62)" stroke-width="7"/><path d="M480 160 V528 M348 338 H612 M398 246 L562 246" stroke="#62d7ff" stroke-width="10" stroke-linecap="round"/>',
    ),
  },
  {
    id: 'steampunk',
    name: '蒸汽朋克',
    tone: '铜件齿轮',
    depthStrength: 84,
    prompt: '蒸汽朋克风格的 3D 装置，黄铜、皮革、铆钉、齿轮和蒸汽管线，复古机械结构，暖色电影光，表面有磨损与油渍细节，空间层次丰富，主体像可收藏模型。',
    preview: makeThreeDPreview(
      'steampunk',
      '蒸汽朋克',
      ['#28170f', '#7a4a22', '#e0a646'],
      '<circle cx="480" cy="360" r="178" fill="url(#steampunk-obj)" stroke="rgba(255,220,150,.72)" stroke-width="8" filter="url(#soft-shadow)"/><circle cx="480" cy="360" r="82" fill="rgba(38,23,15,.75)" stroke="rgba(255,220,150,.56)" stroke-width="12"/><g stroke="#2a160d" stroke-width="18" stroke-linecap="round"><path d="M480 172 V258"/><path d="M480 462 V548"/><path d="M292 360 H378"/><path d="M582 360 H668"/><path d="M347 227 L408 288"/><path d="M552 432 L613 493"/><path d="M613 227 L552 288"/><path d="M408 432 L347 493"/></g>',
    ),
  },
  {
    id: 'porcelain-cutout',
    name: '白瓷镂刻',
    tone: '通透釉面',
    depthStrength: 80,
    prompt: '白瓷镂刻风格的 3D 艺术主体，温润白瓷釉面，精细镂空花纹，边缘薄而通透，柔和高调布光，淡雅背景，强调洁净材质、透光孔洞和手作陶瓷质感。',
    preview: makeThreeDPreview(
      'porcelain-cutout',
      '白瓷镂刻',
      ['#dbeafe', '#f8fafc', '#e7eef8'],
      '<path d="M480 110 C620 170 686 302 650 450 C618 582 540 632 480 632 C420 632 342 582 310 450 C274 302 340 170 480 110 Z" fill="url(#porcelain-cutout-obj)" stroke="rgba(255,255,255,.9)" stroke-width="9" filter="url(#soft-shadow)"/><g fill="rgba(30,41,59,.26)"><circle cx="428" cy="280" r="34"/><circle cx="532" cy="280" r="34"/><circle cx="480" cy="380" r="48"/><circle cx="408" cy="468" r="28"/><circle cx="552" cy="468" r="28"/></g>',
    ),
  },
  {
    id: 'designer-toy',
    name: '潮流手办',
    tone: '收藏玩具',
    depthStrength: 76,
    prompt: '潮流手办风格的 3D 角色或产品，圆润比例，乙烯基玩具材质，夸张头身比，亮面涂装，商业棚拍，底座展示，颜色鲜明但干净，适合盲盒和收藏模型视觉。',
    preview: makeThreeDPreview(
      'designer-toy',
      '潮流手办',
      ['#14213d', '#ef476f', '#ffd166'],
      '<circle cx="480" cy="238" r="126" fill="url(#designer-toy-obj)" filter="url(#soft-shadow)"/><rect x="356" y="336" width="248" height="218" rx="72" fill="url(#designer-toy-obj)" stroke="rgba(255,255,255,.58)" stroke-width="8"/><circle cx="432" cy="226" r="22" fill="#111827"/><circle cx="528" cy="226" r="22" fill="#111827"/><path d="M430 286 Q480 324 530 286" fill="none" stroke="#111827" stroke-width="12" stroke-linecap="round"/><rect x="334" y="548" width="292" height="52" rx="26" fill="rgba(255,255,255,.76)"/>',
    ),
  },
]

export const aspectPresets = [
  { id: 'square', name: '1:1', width: 1024, height: 1024 },
  { id: 'portrait', name: '2:3', width: 1024, height: 1536 },
  { id: 'landscape', name: '3:2', width: 1536, height: 1024 },
  { id: 'xhs', name: '小红书', width: 1080, height: 1440 },
  { id: 'bilibili', name: 'B站', width: 2560, height: 1440 },
  { id: 'douyin', name: '抖音', width: 1080, height: 1920 },
]

export const iconSizePresets = [
  { id: 'icon-16', name: '16 x 16', width: 16, height: 16, hint: '浏览器标签' },
  { id: 'icon-32', name: '32 x 32', width: 32, height: 32, hint: '标准 favicon' },
  { id: 'icon-48', name: '48 x 48', width: 48, height: 48, hint: '桌面快捷方式' },
  { id: 'icon-64', name: '64 x 64', width: 64, height: 64, hint: '应用图标' },
  { id: 'icon-128', name: '128 x 128', width: 128, height: 128, hint: '高清预览' },
  { id: 'icon-256', name: '256 x 256', width: 256, height: 256, hint: '商店上传' },
  { id: 'icon-512', name: '512 x 512', width: 512, height: 512, hint: '主视觉源图' },
] as const

export function getAvailableIcoExportSizes(maxSide?: number): Array<(typeof iconSizePresets)[number]> {
  if (!maxSide || maxSide < 16) return [...iconSizePresets]
  return iconSizePresets.filter((preset) => preset.width <= maxSide)
}

export const exportFormatOptions: Array<{ value: ExportFormat; label: string }> = [
  { value: 'svg', label: 'SVG' },
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'webp', label: 'WEBP' },
  { value: 'gif', label: 'GIF' },
]

export type IconExportKind = 'png' | 'ico' | 'zip'

export const iconExportFormatOptions: Array<{ value: IconExportKind; label: string }> = [
  { value: 'png', label: 'PNG 单张' },
  { value: 'ico', label: 'ICO 多尺寸' },
  { value: 'zip', label: 'ZIP 多尺寸' },
]

export function getExportFormatOptions(mode?: GenerationMode): Array<{ value: ExportFormat; label: string }> {
  void mode // ICON 模式使用 iconExportFormatOptions 独立处理，此处仅返回通用格式
  return exportFormatOptions
}

export const defaultCoverPresets: CoverPreset[] = [
  { id: 'xiaohongshu', name: '小红书封面', width: 1080, height: 1440, enabled: true, custom: false },
  { id: 'wechat', name: '公众号封面', width: 900, height: 383, enabled: true, custom: false },
  { id: 'bilibili', name: 'B站封面', width: 2560, height: 1440, enabled: true, custom: false },
  { id: 'douyin', name: '抖音/视频号', width: 1080, height: 1920, enabled: true, custom: false },
]

export const defaultModels: ModelProfile[] = [
  {
    id: 'text-polish',
    name: 'Text Polish',
    provider: 'openai-compatible',
    endpoint: '',
    apiPath: 'v1/chat/completions',
    apiProtocol: 'openai-chat',
    apiKey: '',
    model: '',
    kind: 'text',
    isPrimary: false,
    status: 'untested',
  },
]

const now = new Date().toISOString()
const fallbackBuiltinPrompts = [
  ['封面', '小红书知识封面', '一张小红书知识分享封面，醒目的中文标题，暖色科技风格，主体清晰。'],
  ['图生图', '漫画滤镜', '保留原图人物姿态与轮廓，转换为干净的日漫线稿风格。'],
  ['ICON', '本地工具图标', '一个本地 AI 图像工具 App Icon，中心是抽象相机与星光。'],
  ['3D', '3D 产品渲染', '高质量 3D 产品渲染，柔和棚拍光，暗色科技背景，真实材质。'],
  ['GIF', '循环动图', '一个 4 秒无缝循环动图，图像卡片从草图逐渐变成高清成品。'],
  ['文生图', 'Tech 工作室场景', '冷峻的桌面创作工作室界面，深空色背景，电光蓝色按钮。'],
] as const

const parsedBuiltinPrompts = normalizeBilingualPromptMarkdown(`${builtinPromptMarkdown}\n\n${supplementalPromptMarkdown}`)

export const defaultPrompts: PromptItem[] = parsedBuiltinPrompts.length ? parsedBuiltinPrompts : fallbackBuiltinPrompts.map(([category, title, prompt], index) => ({
  id: stableId('prompt', `${title}-${prompt}`),
  title,
  prompt,
  promptZh: prompt,
  language: 'zh',
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
