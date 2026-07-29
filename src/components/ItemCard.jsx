import { getCategory } from '../lib/categories'
import { expiryStatus } from '../lib/utils'

export default function ItemCard({ item, onAdjust, onEdit, onDelete }) {
  const cat = getCategory(item.category)
  const expiry = expiryStatus(item.expiry_date)
  const lowStock = item.min_quantity > 0 && item.quantity <= item.min_quantity
  const locationText = [item.room, item.position, item.location].filter(Boolean).join(' · ')

  return (
    <div className="group flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-card transition hover:shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cat.chip}`}>
          <span>{cat.icon}</span> {cat.label}
        </span>
        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={() => onEdit(item)}
            title="编辑"
            className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(item)}
            title="删除"
            className="rounded-md p-1.5 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            🗑️
          </button>
        </div>
      </div>

      <h3 className="truncate text-base font-semibold text-stone-800" title={item.name}>
        {item.name || '未命名'}
      </h3>
      <div className="mt-0.5 mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-400">
        {item.item_no && <span>#{item.item_no}</span>}
        {locationText && <span className="truncate" title={locationText}>📍 {locationText}</span>}
      </div>

      {/* 数量步进 */}
      <div className="mt-auto flex items-center justify-between rounded-lg bg-stone-50 p-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onAdjust(item.id, -1)}
            disabled={item.quantity <= 0}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-lg font-semibold text-stone-600 shadow-sm transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-[2.5rem] text-center text-lg font-semibold text-stone-800">
            {item.quantity}
          </span>
          <button
            onClick={() => onAdjust(item.id, 1)}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-lg font-semibold text-stone-600 shadow-sm transition hover:bg-stone-100"
          >
            +
          </button>
        </div>
        {item.min_quantity > 0 && (
          <span className="text-[11px] text-stone-400">最低 {item.min_quantity}</span>
        )}
      </div>

      {/* 状态标签 */}
      {(lowStock || expiry) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lowStock && (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">
              ⚠ 库存不足
            </span>
          )}
          {expiry && expiry.tone !== 'ok' && (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                expiry.tone === 'expired' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
              }`}
            >
              📅 {expiry.label}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
