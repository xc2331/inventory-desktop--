// 9 大预设分类定义（key 与手机端分类保持一致）
export const CATEGORIES = [
  { key: '食品', label: '食品', icon: '🍱', chip: 'bg-orange-100 text-orange-700 ring-orange-200', dot: 'bg-orange-400' },
  { key: '饮料', label: '饮料', icon: '🥤', chip: 'bg-sky-100 text-sky-700 ring-sky-200', dot: 'bg-sky-400' },
  { key: '日用品', label: '日用品', icon: '🧴', chip: 'bg-violet-100 text-violet-700 ring-violet-200', dot: 'bg-violet-400' },
  { key: '厨房用品', label: '厨房用品', icon: '🍳', chip: 'bg-amber-100 text-amber-700 ring-amber-200', dot: 'bg-amber-400' },
  { key: '清洁用品', label: '清洁用品', icon: '🧹', chip: 'bg-teal-100 text-teal-700 ring-teal-200', dot: 'bg-teal-400' },
  { key: '医药', label: '医药', icon: '💊', chip: 'bg-rose-100 text-rose-700 ring-rose-200', dot: 'bg-rose-400' },
  { key: '文具', label: '文具', icon: '✏️', chip: 'bg-indigo-100 text-indigo-700 ring-indigo-200', dot: 'bg-indigo-400' },
  { key: '工具', label: '工具', icon: '🔧', chip: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' },
  { key: '其他', label: '其他', icon: '📦', chip: 'bg-stone-100 text-stone-700 ring-stone-200', dot: 'bg-stone-400' }
]

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]))

export function getCategory(key) {
  return CATEGORY_MAP[key] || CATEGORY_MAP['其他']
}
