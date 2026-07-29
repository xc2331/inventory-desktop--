import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'
import { expiryStatus } from '../lib/utils'

function normalizePhotoUrl(photo) {
  if (!photo) return ''
  const trimmed = photo.trim()
  if (!trimmed) return ''
  // 已经是协议 URL：直接返回
  if (/^(data:|https?:|file:)/i.test(trimmed)) return trimmed
  // Windows / Unix 绝对路径 -> file://
  if (/^[a-z]:[\\/]/i.test(trimmed) || trimmed.startsWith('/')) {
    const withSlash = trimmed.replace(/\\/g, '/')
    return withSlash.startsWith('/') ? 'file://' + withSlash : 'file:///' + withSlash
  }
  // 相对路径也尝试用 file 协议（Electron 本地场景）
  return 'file:///' + trimmed.replace(/\\/g, '/')
}

export default function ItemCard({
  item,
  categories,
  lang,
  onAdjust,
  onEdit,
  onDelete,
  selected,
  onToggleSelect,
  bulkMode
}) {
  const { t } = useI18n()
  const cat = categories.find((c) => c.key === item.category)
  const expiry = expiryStatus(item.expiry_date)
  const lowStock = item.min_quantity > 0 && item.quantity <= item.min_quantity
  const [imgErr, setImgErr] = useState(false)

  const locationText = [item.room, item.position, item.location]
    .filter((x, i, a) => x && a.indexOf(x) === i)
    .join(' · ')

  const photoUrl = normalizePhotoUrl(item.photo)
  const hasPhoto = photoUrl && !imgErr

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        selected ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-stone-200'
      }`}
    >
      {/* 图片区 */}
      <div className="relative h-28 w-full bg-stone-100">
        {bulkMode && (
          <label className="absolute left-2 top-2 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(item.id)}
              className="h-4 w-4 accent-emerald-600"
            />
          </label>
        )}

        {hasPhoto ? (
          <img
            src={photoUrl}
            alt={item.name}
            className="h-full w-full object-cover"
            onError={() => setImgErr(true)}
            draggable={false}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-stone-300">
            {cat?.icon || '📦'}
          </div>
        )}

        {/* 分类标签 */}
        <span className="absolute left-2 top-2 inline-flex max-w-[70%] items-center gap-1 truncate rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium text-stone-700 shadow-sm backdrop-blur">
          <span>{cat?.icon || '🏷️'}</span>
          <span className="truncate">{cat ? categoryDisplayName(cat, lang) : item.category || t('nav_categories')}</span>
        </span>

        {/* 操作按钮 */}
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-white/90 p-1 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100">
          <button
            onClick={() => onEdit(item)}
            title={t('form_editTitle')}
            className="rounded-md p-1 text-stone-500 transition hover:bg-stone-100 hover:text-stone-700"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(item)}
            title={t('btn_delete')}
            className="rounded-md p-1 text-stone-500 transition hover:bg-rose-50 hover:text-rose-600"
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate text-base font-semibold text-stone-800" title={item.name}>
          {item.name || '—'}
        </h3>

        {item.item_no && <div className="mt-0.5 text-xs text-stone-400">#{item.item_no}</div>}

        {/* 位置高亮 */}
        {locationText && (
          <div
            className="mt-2 inline-flex w-fit max-w-full items-center gap-1 truncate rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
            title={locationText}
          >
            <span>📍</span>
            <span className="truncate">{locationText}</span>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between rounded-lg bg-stone-50 p-1.5 pt-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAdjust(item.id, -1)}
              disabled={item.quantity <= 0}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-lg font-semibold text-stone-600 shadow-sm transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-[2.5rem] text-center text-lg font-semibold text-stone-800">{item.quantity}</span>
            <button
              onClick={() => onAdjust(item.id, 1)}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-lg font-semibold text-stone-600 shadow-sm transition hover:bg-stone-100"
            >
              +
            </button>
          </div>
          {item.min_quantity > 0 && (
            <span className="text-[11px] text-stone-400">
              {t('card_min')} {item.min_quantity}
            </span>
          )}
        </div>

        {(lowStock || (expiry && expiry.tone !== 'ok')) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lowStock && (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">
                ⚠ {t('card_lowStock')}
              </span>
            )}
            {expiry && expiry.tone !== 'ok' && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                  expiry.tone === 'expired' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                }`}
              >
                📅 {expiry.tone === 'expired' ? t('card_expired') : t('card_expireIn', { n: expiry.days })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
