import {
  Activity,
  Aperture,
  Badge,
  Box,
  Eraser,
  Grid2X2,
  History,
  IdCard,
  Image as ImageIcon,
  Layers,
  MessageSquareX,
  PanelsTopLeft,
  Plus,
  Repeat,
  ShieldCheck,
  Smile,
  Sparkles,
  UserRound,
  Wrench,
} from 'lucide-vue-next'

type LucideComponent = typeof Plus

/**
 * 把 ToolEntry.icon 字符串（catalog 中以 PascalCase 形式声明的 lucide 名称）
 * 映射到真实 lucide-vue-next 组件。集中放在 domain 便于测试和替换。
 */
const ICON_REGISTRY: Record<string, LucideComponent> = {
  Plus,
  Image: ImageIcon,
  Box,
  Grid2X2,
  Repeat,
  Sparkles,
  Badge,
  UserRound,
  PanelsTopLeft,
  IdCard,
  Eraser,
  MessageSquareX,
  ShieldCheck,
  Activity,
  History,
  Smile,
  Aperture,
  Layers,
  Wrench,
}

const FALLBACK: LucideComponent = Wrench

export function resolveToolIcon(name: string | undefined | null): LucideComponent {
  if (!name) return FALLBACK
  return ICON_REGISTRY[name] ?? FALLBACK
}

export function isKnownToolIcon(name: string | undefined | null): boolean {
  return Boolean(name && ICON_REGISTRY[name])
}
