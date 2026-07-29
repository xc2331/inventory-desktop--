import { CATEGORIES } from '../lib/categories'

export default function Sidebar({ activeCategory, onSelect, counts }) {
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-stone-200 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-xl text-white shadow-sm">
          🏠
        </div>
        <div>
          <div className="text-[15px] font-semibold leading-tight text-stone-800">家庭物资管家</div>
          <div className="text-[11px] text-stone-400">Family Inventory</div>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={() => onSelect('')}
          className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
            activeCategory === ''
              ? 'bg-emerald-50 font-medium text-emerald-700'
              : 'text-stone-600 hover:bg-stone-50'
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="text-base">📋</span> 全部
          </span>
          <span className="text-xs text-stone-400">{totalCount}</span>
        </button>
      </div>

      <div className="mt-2 px-5 pb-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
        分类
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {CATEGORIES.map((c) => {
          const active = activeCategory === c.key
          const count = counts[c.key] || 0
          return (
            <button
              key={c.key}
              onClick={() => onSelect(active ? '' : c.key)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                active ? 'bg-emerald-50 font-medium text-emerald-700' : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-base">{c.icon}</span> {c.label}
              </span>
              <span className="text-xs text-stone-400">{count}</span>
            </button>
          )
        })}
      </nav>

      <div className="border-t border-stone-100 px-5 py-3 text-[11px] leading-relaxed text-stone-400">
        数据本地存储 · 启动自动备份
      </div>
    </aside>
  )
}
