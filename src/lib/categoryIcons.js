// 分类图标映射：将分类 key/emoji 统一映射到 Lucide 图标组件
import {
  LayoutGrid,
  Smartphone,
  UtensilsCrossed,
  Coffee,
  Droplets,
  ChefHat,
  Sparkles,
  Pill,
  Pencil,
  Wrench,
  Package,
  Tag,
  MapPin,
  Home,
  Folder
} from 'lucide-react'

export const CATEGORY_ICON_MAP = {
  electronic: Smartphone,
  food: UtensilsCrossed,
  beverage: Coffee,
  daily: Droplets,
  kitchen: ChefHat,
  cleaning: Sparkles,
  medical: Pill,
  stationery: Pencil,
  tools: Wrench,
  other: Package,
  all: LayoutGrid,
  default: Tag
}

export function getCategoryIcon(category) {
  if (!category) return CATEGORY_ICON_MAP.default
  const key = typeof category === 'string' ? category : category.key
  const icon = category?.icon
  // 如果分类存储的是 lucide 图标名，可直接映射
  if (icon && CATEGORY_ICON_MAP[icon]) return CATEGORY_ICON_MAP[icon]
  if (key && CATEGORY_ICON_MAP[key]) return CATEGORY_ICON_MAP[key]
  return CATEGORY_ICON_MAP.default
}
