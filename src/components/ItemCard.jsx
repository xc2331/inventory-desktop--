import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'
import { expiryStatus } from '../lib/utils'
import ImageLightbox from './ImageLightbox'

function normalizePhotoUrl(photo) {
  if (!photo) return ''
  const trimmed = photo.trim()
  if (!trimmed) return ''
  if (/^(data:|https?:|file:)/i.test(trimmed)) return trimmed
  if (/^[a-z]:[\\/]/i.test(trimmed) || trimmed.startsWith('/')) {
    const withSlash = trimmed.replace(/\\/g, '/')
    return withSlash.startsWith('/') ? 'file://' + withSlash : 'file:///' + withSlash
  }
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
  const [imgRatio, setImgRatio] = useState(4 / 3)
  const [lightbox, setLightbox] = useState(false)

  const locationText = [item.room, item.position, item.location]
    .filter((x, i, a) => x && a.indexOf(x) === i)
    .join(' · ')

  const photoUrl = normalizePhotoUrl(item.photo)
  const hasPhoto = photoUrl && !imgErr

  const handleImgLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.target
    if (w && h) {
      // 限制比例范围：最宽 16:9，最高 2:3，避免极端比例破坏布局
      const ratio = Math.max(2 / 3, Math.min(16 / 9, w / h))
      setImgRatio(ratio)
    }
  }

  return (
    <div
      className={`group break-inside-avoid flex flex-col overflow-hidden rounded-xl border bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-float ${
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
      }`}
    >
      {/* 图片区：按图片比例自适应 */}
      <div
        className="relative w-full cursor-zoom-in bg-bg"
        style={{ aspectRatio: `${imgRatio} / 1`, maxHeight: '320px' }}
        onClick={() => hasPhoto && setLightbox(true)}
      >
        {bulkMode && (
          <label
            className="absolute left-2 top-2 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-surface/90 shadow-sm backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(item.id)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        )}

        {hasPhoto ? (
          <img
            src={photoUrl}
            alt={item.name}
            className="h-full w-full object-contain"
            onError={() => setImgErr(true)}
            onLoad={handleImgLoad}
            draggable={false}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-text-tertiary/60">
            {cat?.icon || '📦'}
          </div>
        )}

        {/* 分类标签：批量模式下避开勾选框 */}
        <span
          className={`absolute inline-flex max-w-[70%] items-center gap-1 truncate rounded-full bg-surface/90 px-2 py-0.5 text-xs font-medium text-text-secondary shadow-sm backdrop-blur ${
            bulkMode ? 'left-2 top-10' : 'left-2 top-2'
          }`}
        >
          <span>{cat?.icon || '🏷️'}</span>
          <span className="truncate">{cat ? categoryDisplayName(cat, lang) : item.category || t('nav_categories')}</span>
        </span>

        {/* 操作按钮 */}
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-surface/90 p-1 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit(item)
            }}
            title={t('form_editTitle')}
            className="rounded-md p-1 text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
          >
            ✏️
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(item)
            }}
            title={t('btn_delete')}
            className="rounded-md p-1 text-text-secondary transition hover:bg-danger-soft hover:text-danger"
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="flex flex-col p-4">
        <h3 className="truncate text-base font-semibold text-text-primary" title={item.name}>
          {item.name || '—'}
        </h3>

        {item.item_no && <div className="mt-0.5 text-xs text-text-tertiary">#{item.item_no}</div>}

        {/* 位置高亮 */}
        {locationText && (
          <div
            className="mt-2 inline-flex w-fit max-w-full items-center gap-1 truncate rounded-md bg-primary-soft px-2 py-1 text-xs font-medium text-primary"
            title={locationText}
          >
            <span>📍</span>
            <span className="truncate">{locationText}</span>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between rounded-lg bg-bg p-1.5">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAdjust(item.id, -1)}
              disabled={item.quantity <= 0}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-surface text-lg font-semibold text-text-secondary shadow-sm ring-1 ring-border transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-[2.5rem] text-center text-lg font-semibold text-text-primary">{item.quantity}</span>
            <button
              onClick={() => onAdjust(item.id, 1)}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-surface text-lg font-semibold text-text-secondary shadow-sm ring-1 ring-border transition hover:bg-surface-hover"
            >
              +
            </button>
          </div>
          {item.min_quantity > 0 && (
            <span className="text-[11px] text-text-tertiary">
              {t('card_min')} {item.min_quantity}
            </span>
          )}
        </div>

        {(lowStock || (expiry && expiry.tone !== 'ok')) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lowStock && (
              <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                ⚠ {t('card_lowStock')}
              </span>
            )}
            {expiry && expiry.tone !== 'ok' && (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                  expiry.tone === 'expired' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'
                }`}
              >
                📅 {expiry.tone === 'expired' ? t('card_expired') : t('card_expireIn', { n: expiry.days })}
              </span>
            )}
          </div>
        )}
      </div>

      {lightbox && <ImageLightbox src={photoUrl} alt={item.name} onClose={() => setLightbox(false)} />}
    </div>
  )
}
