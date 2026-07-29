import { useState } from 'react'
import { motion } from 'framer-motion'
import { Pencil, Trash2, Minus, Plus, MapPin, AlertTriangle, CalendarClock, Check, Package, Image as ImageIcon } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'
import { getCategoryIcon } from '../lib/categoryIcons'
import { expiryStatus } from '../lib/utils'
import { cn } from '../lib/cn'
import { EASE } from '../lib/motion'

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
  bulkMode,
  index = 0
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
  const CategoryIcon = getCategoryIcon(cat)

  const handleCardClick = () => {
    if (bulkMode) onToggleSelect(item.id)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE, delay: Math.min(index * 0.04, 0.32) }}
      whileHover={{ y: -4 }}
      onClick={handleCardClick}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-card transition-shadow duration-300 hover:shadow-float',
        selected ? 'border-primary' : 'border-border',
        bulkMode && 'cursor-pointer'
      )}
    >
      {selected && <span className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-2 ring-primary/30" />}

      {/* 图片区：去掉点击放大，仅保留悬停缩放 */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-bg">
        {hasPhoto ? (
          <>
            <img
              src={photoUrl}
              alt={item.name}
              className="h-full w-full object-cover transition-transform duration-500 ease-smooth group-hover:scale-[1.06]"
              onError={() => setImgErr(true)}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
            />
            <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-full bg-black/25 p-1.5 text-white backdrop-blur-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <ImageIcon size={14} />
            </span>
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-surface-hover to-bg text-text-tertiary/70 transition-transform duration-500 group-hover:scale-[1.02]">
            <CategoryIcon size={40} strokeWidth={1.4} />
          </div>
        )}

        {/* 底部渐变遮罩，提升标签可读性 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/15 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* 批量勾选 */}
        {bulkMode && (
          <div
            className={cn(
              'absolute left-2.5 top-2.5 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm transition-smooth',
              selected
                ? 'border-primary bg-primary text-white'
                : 'border-white/80 bg-surface/80 text-transparent backdrop-blur group-hover:border-primary'
            )}
          >
            <Check size={13} strokeWidth={3} />
          </div>
        )}

        {/* 分类标签 */}
        <span
          className="absolute left-2.5 z-10 inline-flex max-w-[70%] items-center gap-1 truncate rounded-full bg-surface/92 px-2 py-1 text-[11px] font-medium text-text-secondary shadow-sm backdrop-blur-md transition-smooth group-hover:bg-surface"
          style={{ top: bulkMode ? '2.5rem' : '0.625rem' }}
        >
          <CategoryIcon size={12} strokeWidth={2.2} />
          <span className="truncate">{cat ? categoryDisplayName(cat, lang) : item.category || t('nav_categories')}</span>
        </span>

        {/* 操作按钮组：hover 时强化 */}
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-surface/88 p-1 shadow-sm backdrop-blur-md transition-smooth group-hover:bg-surface">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation()
              onEdit(item)
            }}
            title={t('form_editTitle')}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary transition-smooth hover:bg-primary-soft hover:text-primary"
          >
            <Pencil size={14} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation()
              onDelete(item)
            }}
            title={t('btn_delete')}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary transition-smooth hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 size={14} />
          </motion.button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-[15px] font-semibold leading-tight text-text-primary" title={item.name}>
            {item.name || '—'}
          </h3>
          {item.item_no && (
            <span className="shrink-0 rounded-md bg-bg px-1.5 py-0.5 font-mono text-[11px] text-text-tertiary">
              #{item.item_no}
            </span>
          )}
        </div>

        {/* 位置 */}
        {locationText && (
          <div
            className="mt-2 inline-flex w-fit max-w-full items-center gap-1 truncate rounded-lg bg-primary-soft/70 px-2 py-1 text-xs font-medium text-primary"
            title={locationText}
          >
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{locationText}</span>
          </div>
        )}

        {/* 数量步进器 */}
        <div className="mt-3 flex items-center justify-between rounded-xl bg-bg p-1">
          <div className="flex items-center gap-0.5">
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={(e) => {
                e.stopPropagation()
                onAdjust(item.id, -1)
              }}
              disabled={item.quantity <= 0}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-surface text-text-secondary shadow-xs ring-1 ring-border transition-smooth hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Minus size={14} strokeWidth={2.5} />
            </motion.button>
            <motion.span
              key={item.quantity}
              initial={{ scale: 0.8, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="min-w-[2.5rem] text-center text-base font-semibold tabular-nums text-text-primary"
            >
              {item.quantity}
            </motion.span>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={(e) => {
                e.stopPropagation()
                onAdjust(item.id, 1)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-surface text-text-secondary shadow-xs ring-1 ring-border transition-smooth hover:bg-surface-hover hover:text-text-primary"
            >
              <Plus size={14} strokeWidth={2.5} />
            </motion.button>
          </div>
          {item.min_quantity > 0 && (
            <span className="pr-1 text-[11px] text-text-tertiary">
              {t('card_min')} <span className="font-medium tabular-nums">{item.min_quantity}</span>
            </span>
          )}
        </div>

        {/* 状态徽章 */}
        {(lowStock || (expiry && expiry.tone !== 'ok')) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {lowStock && (
              <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
                <AlertTriangle size={11} />
                {t('card_lowStock')}
              </span>
            )}
            {expiry && expiry.tone !== 'ok' && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium',
                  expiry.tone === 'expired' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'
                )}
              >
                <CalendarClock size={11} />
                {expiry.tone === 'expired' ? t('card_expired') : t('card_expireIn', { n: expiry.days })}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
