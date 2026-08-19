import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Trash2, Minus, Plus, MapPin, AlertTriangle, CalendarClock, Check, Image as ImageIcon, ShieldAlert, MoreVertical, Copy, ExternalLink } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'
import { getCategoryIcon } from '../lib/categoryIcons'
import { expiryStatus } from '../lib/utils'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'
import SearchHighlight from './SearchHighlight'
import { EASE, EASE_SPRING, cardHover } from '../lib/motion'

// 过期卡片抖动动画（只播 2 次后静止，避免 repeat:Infinity 持续占用 GPU）
const expiredShake = [
  { rotate: 0 }, { rotate: -4 }, { rotate: 4 }, { rotate: 0 }
]

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
  onDoubleClick,
  onAddToCart,
  onCopyItemNo,
  onOpenInMap,
  selected,
  onToggleSelect,
  bulkMode,
  keyword,
  index = 0
}) {
  const { t } = useI18n()
  const localeKey = lang === 'en' || lang === 'en_US' ? 'en_US' : 'zh_CN'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const cat = categories.find((c) => c.key === item.category)
  const expiry = expiryStatus(item.expiry_date)
  const lowStock = item.min_quantity > 0 && item.quantity <= item.min_quantity
  const isExpired = expiry && expiry.tone === 'expired'
  const isExpiringSoon = expiry && expiry.tone === 'warn'
  const [imgErr, setImgErr] = useState(false)
  const updatedAtStr = item.updated_at ? formatDate(item.updated_at, localeKey) : ''

  // UX-02 拖拽排序预览：Grip handle + framer-motion drag + spring snap-back
  const [isDragging, setIsDragging] = useState(false)
  const handleDragStart = () => setIsDragging(true)
  const handleDragEnd = () => setIsDragging(false)

  // U-09 右键菜单关闭：点击别处 / 按 Esc
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        return
      }
      // 仅左键关闭菜单；右键不关闭，避免右键打开菜单后被 mousedown 立即关闭
      if (e.type === 'mousedown' && e.button !== 0) return
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', handler)
    return () => { window.removeEventListener('mousedown', handler); window.removeEventListener('keydown', handler) }
  }, [menuOpen])

  const locationText = [item.room, item.position, item.location]
    .filter((x, i, a) => x && a.indexOf(x) === i)
    .join(' · ')

  const photoUrl = normalizePhotoUrl(item.photo)
  const hasPhoto = photoUrl && !imgErr
  const CategoryIcon = getCategoryIcon(cat)

  // 图片地址变化时重置错误状态，避免扫码上传的大图初次加载失败后必须切换分类才显示
  useEffect(() => {
    setImgErr(false)
  }, [photoUrl])

  const handleCardClick = () => {
    if (bulkMode) onToggleSelect(item.id)
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    // 设置菜单位置（相对视口）
    setMenuOpen({ x: e.clientX, y: e.clientY })
  }

  const handleMenuAction = (action) => {
    setMenuOpen(false)
    if (action === 'edit') onEdit(item)
    else if (action === 'delete') onDelete(item.id, item.name)
    else if (action === 'add') onAdjust(item.id, 1)
    else if (action === 'sub') onAdjust(item.id, -1)
    else if (action === 'cart') onAddToCart?.(item.id)
    else if (action === 'copy') onCopyItemNo?.(item.item_no)
    else if (action === 'map') onOpenInMap?.(item)
  }

  const handleDoubleClick = () => {
    if (hasPhoto && onDoubleClick) onDoubleClick(photoUrl, item.name)
  }

  // UX-01 卡片交互参数
  const baseHover = isExpired ? cardHover : {
    ...cardHover,
    scale: 1.018,
    y: -6,
    boxShadow: '0 12px 28px -8px rgba(15,23,42,0.18), 0 4px 10px -4px rgba(15,23,42,0.10)'
  }
  const baseTap = isExpired
    ? { scale: 1 }
    : { scale: 0.985, y: -2, boxShadow: '0 4px 12px -4px rgba(15,23,42,0.12)' }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0,
        boxShadow: isExpired ? '0 0 0 2px rgba(239,68,68,0.4), 0 4px 16px rgba(239,68,68,0.12)' : undefined
      }}
      whileHover={menuOpen ? undefined : baseHover}
      whileTap={baseTap}
      whileDrag={{ scale: 1.04, rotate: 1, boxShadow: '0 20px 40px -12px rgba(15,23,42,0.28), 0 8px 16px -6px rgba(15,23,42,0.18)', cursor: 'grabbing' }}
      drag={!bulkMode && !hasPhoto}
      dragConstraints={null}
      dragElastic={0.08}
      dragMomentum={false}
      dragTransition={{ bounceStiffness: 400, bounceDamping: 28 }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      focusable
      tabIndex={0}
      transition={{ duration: 0.28, ease: EASE, delay: Math.min(index * 0.025, 0.12) }}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      className={cn(
        'card-hover group relative flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-card',
        'transition-shadow duration-200 ease-[0.22,1,0.36,1]',
        'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
        isDragging && 'z-[50] opacity-80',
        selected ? 'border-primary shadow-[0_0_0_3px_rgba(16,185,129,0.22),0_8px_24px_-6px_rgba(16,185,129,0.25)] z-[5]' : 'border-border hover:shadow-lg',
        isExpired ? 'border-danger' : undefined,
        isExpiringSoon ? 'border-warn' : undefined,
        bulkMode && 'cursor-pointer',
        hasPhoto && 'cursor-zoom-in',
        !bulkMode && !hasPhoto && 'cursor-grab active:cursor-grabbing'
      )}
    >
      {/* UX-01 选中指示环（强化：外发光 + 顶部角标 + 呼吸脉冲） */}
      {selected && (
        <AnimatePresence>
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1,
              boxShadow: '0 0 0 0 rgba(16,185,129,0.4)'
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.25, ease: EASE_SPRING }}
            className="pointer-events-none absolute inset-0 z-[15] rounded-2xl ring-2 ring-primary animate-pulse"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0.22, ease: EASE_SPRING }}
            className="pointer-events-none absolute right-2.5 top-2.5 z-[16] flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-lg"
          >
            <Check size={12} strokeWidth={3} />
          </motion.div>
        </AnimatePresence>
      )}

      {/* 过期警示：顶部红色渐变带 + 边框 + 徽章（不遮挡卡片内容，避免信息丢失和 GPU 持续抖动） */}
      {isExpired && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_SPRING }}
          className="absolute inset-x-0 top-0 z-[12] flex items-center justify-center gap-1.5 rounded-t-2xl bg-gradient-to-r from-danger to-red-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm"
        >
          <motion.span
            animate={expiredShake}
            transition={{ duration: 0.4, times: [0, 0.3, 0.7, 1], repeat: 1 }}
            className="inline-flex"
          >
            <ShieldAlert size={12} />
          </motion.span>
          <span>{t('card_expired')}</span>
        </motion.div>
      )}

      {/* U-02 即将过期横幅（顶部黄色渐变带） */}
      {isExpiringSoon && !isExpired && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_SPRING }}
          className="absolute inset-x-0 top-0 z-[12] flex items-center justify-center gap-1.5 rounded-t-2xl bg-gradient-to-r from-warn to-amber-400 px-3 py-1.5 text-[11px] font-bold text-amber-950 shadow-sm"
        >
          <CalendarClock size={12} />
          <span>{t('card_expireIn', { n: expiry.days })}</span>
        </motion.div>
      )}

      {/* 图片区 (P-02：懒加载 + 错误恢复占位) */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-bg">
        {hasPhoto ? (
          <>
            <img
              src={photoUrl}
              alt={item.name}
              className="img-zoom h-full w-full object-cover"
              loading="lazy"
              onError={() => setImgErr(true)}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
            />
            <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-full bg-black/25 p-1.5 text-white backdrop-blur-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <ImageIcon size={14} />
            </span>
          </>
        ) : imgErr ? (
          <div className="flex h-full w-full items-center justify-center bg-bg text-text-tertiary">
            <ImageIcon size={28} className="opacity-30" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CategoryIcon className="text-text-tertiary/30" size={32} />
          </div>
        )}

        {/* 底部渐变遮罩 */}
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

        {/* 操作按钮组 */}
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
            <SearchHighlight text={item.name || '—'} keyword={keyword} />
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

      {/* U-09 右键菜单 */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: EASE }}
            className="absolute z-50 min-w-[160px] rounded-xl border border-border bg-surface p-1.5 shadow-float"
            style={{
              left: Math.min(menuOpen.x, window.innerWidth - 180),
              top: Math.min(menuOpen.y, window.innerHeight - 220),
              position: 'fixed'
            }}
          >
            <button onClick={() => handleMenuAction('edit')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-primary transition-smooth hover:bg-primary-soft hover:text-primary">
              <Pencil size={13} /> {t('card_edit')}
            </button>
            <button onClick={() => handleMenuAction('add')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-primary transition-smooth hover:bg-primary-soft hover:text-primary">
              <Plus size={13} /> {t('card_add1')}
            </button>
            <button onClick={() => handleMenuAction('sub')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-primary transition-smooth hover:bg-primary-soft hover:text-primary">
              <Minus size={13} /> {t('card_sub1')}
            </button>
            {item.item_no && (
              <button onClick={() => handleMenuAction('copy')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-primary transition-smooth hover:bg-primary-soft hover:text-primary">
                <Copy size={13} /> {t('card_copyNo')}
              </button>
            )}
            <div className="my-1 h-px bg-border" />
            <button onClick={() => handleMenuAction('delete')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition-smooth hover:bg-danger-soft">
              <Trash2 size={13} /> {t('card_delete')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
