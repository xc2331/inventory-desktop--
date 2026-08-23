import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Trash2, Minus, Plus, MapPin, AlertTriangle, CalendarClock, Check, Image as ImageIcon, ShieldAlert, GripVertical, Copy } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'
import { getCategoryIcon } from '../lib/categoryIcons'
import { expiryStatus } from '../lib/utils'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'
import { readPhoto } from '../lib/imageStore'
import SearchHighlight from './SearchHighlight'
import { EASE, EASE_SPRING, cardHover } from '../lib/motion'

const expiredShake = [
  { rotate: 0 }, { rotate: -4 }, { rotate: 4 }, { rotate: 0 }
]

function normalizePhotoUrl(photo) {
  if (!photo) return ''
  const trimmed = photo.trim()
  if (!trimmed) return ''
  if (/^(data:|https?:|file:)/i.test(trimmed)) return trimmed
  // 相对路径：交给 Electron 后端转成真实的 file:// 绝对路径
  if (window && window.lingguang && window.lingguang.photo && window.lingguang.photo.url) {
    return window.lingguang.photo.url(trimmed) || ''
  }
  return trimmed
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
  index = 0,
  onSort,
  gridRef
}) {
  const { t } = useI18n()
  const localeKey = lang === 'en' || lang === 'en_US' ? 'en_US' : 'zh_CN'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const cardRef = useRef(null)
  const cat = categories.find((c) => c.key === item.category)
  const expiry = expiryStatus(item.expiry_date)
  const lowStock = item.min_quantity > 0 && item.quantity <= item.min_quantity
  const isExpired = expiry && expiry.tone === 'expired'
  const isExpiringSoon = expiry && expiry.tone === 'warn'
  const [imgErr, setImgErr] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState('')

  const photoUrl = normalizePhotoUrl(item.photo)
  const displayUrl = fallbackUrl || photoUrl

  // 兜底：如果同步拼接的 file:// URL 加载失败（相对路径 → file:// 出错），尝试通过 IPC 读取 base64
  useEffect(() => {
    if (!imgErr || !item.photo) return
    if (/^(data:|https?:|file:)/i.test(item.photo)) return
    let cancelled = false
    readPhoto(item.photo).then((data) => {
      if (!cancelled) {
        setFallbackUrl(data)
        // 关键修复：fallbackUrl 就绪后清除 imgErr，否则 hasPhoto = displayUrl && !imgErr 仍为 false，<img> 不渲染
        setImgErr(false)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [imgErr, item.photo])

  const canDrag = !bulkMode

  // ---- 数量步进器长按连击 ----
  // 按下 <300ms 松手 = 单击 ±1；按住 ≥300ms 开始每 120ms 重复一次。
  // 卸载时清理定时器；pointerleave/pointercancel 视为松手。
  const holdTimerRef = useRef(null)
  const repeatTimerRef = useRef(null)
  const holdFiredRef = useRef(false)

  const stopStepperHold = useCallback(() => {
    clearTimeout(holdTimerRef.current)
    clearInterval(repeatTimerRef.current)
    holdTimerRef.current = null
    repeatTimerRef.current = null
  }, [])
  useEffect(() => stopStepperHold, [stopStepperHold])

  const bindStepper = useCallback((delta) => ({
    onPointerDown: (e) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.currentTarget.setPointerCapture?.(e.pointerId)
      holdFiredRef.current = false
      stopStepperHold()
      holdTimerRef.current = setTimeout(() => {
        holdFiredRef.current = true
        onAdjust(item.id, delta)
        repeatTimerRef.current = setInterval(() => onAdjust(item.id, delta), 120)
      }, 300)
    },
    onPointerUp: (e) => {
      e.stopPropagation()
      if (!holdFiredRef.current && holdTimerRef.current) onAdjust(item.id, delta)
      stopStepperHold()
    },
    onPointerLeave: stopStepperHold,
    onPointerCancel: stopStepperHold
  }), [item.id, onAdjust, stopStepperHold])

  // ---- 纯原生 pointer event 拖拽：完全绕开 framer-motion 的 drag ----
  // 核心思路：按下 Grip Handle → 隐藏原卡片 + 创建 body-level ghost 跟随鼠标；
  // 松手时：把原卡片显形（此时 React 已将其放入新 grid 位置）+ 删除 ghost。
  // 因为没有 transform 叠加，被拖卡片永远精确对齐 grid。
  //
  // 健壮性：所有退出路径（pointerup / pointercancel / Esc / 组件卸载）统一走 cleanup，
  // 避免触屏系统中断拖拽时 ghost 残留、原卡片永久隐藏。
  const dragCleanupRef = useRef(null)
  useEffect(() => () => { dragCleanupRef.current?.() }, [])

  // 键盘可达的拖拽等价操作：聚焦把手后按方向键与相邻卡片交换位置。
  // 左右 ±1；上下 ±网格列数（从 grid 的 grid-template-columns 实时计算，随密度/窗口宽度自适应）。
  const handleGripKeyDown = useCallback((e) => {
    const key = e.key
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') return
    const card = cardRef.current
    const grid = gridRef?.current
    if (!card || !grid || !onSort) return
    e.preventDefault()
    e.stopPropagation()

    const cards = Array.from(grid.children).filter(
      (c) => c.hasAttribute && c.hasAttribute('data-item-id')
    )
    const curIdx = cards.indexOf(card)
    if (curIdx < 0) return

    let step = 0
    if (key === 'ArrowLeft') step = -1
    else if (key === 'ArrowRight') step = 1
    else {
      // 列数：解析 computed style 的 grid-template-columns 空白分隔
      let cols = 1
      try {
        cols = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length || 1
      } catch { /* ignore */ }
      step = key === 'ArrowUp' ? -cols : cols
    }
    const targetIdx = curIdx + step
    if (targetIdx < 0 || targetIdx >= cards.length || targetIdx === curIdx) return
    onSort(item.id, targetIdx)
  }, [item.id, onSort, gridRef])

  const handleGripPointerDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const card = cardRef.current
    if (!card || !gridRef?.current) return

    const cardRect = card.getBoundingClientRect()
    const offset = {
      x: e.clientX - cardRect.left,
      y: e.clientY - cardRect.top
    }

    // 克隆卡片为 ghost
    const ghost = card.cloneNode(true)
    ghost.id = 'drag-ghost'
    ghost.style.cssText = `
      position: fixed;
      top: ${cardRect.top}px;
      left: ${cardRect.left}px;
      width: ${cardRect.width}px;
      height: ${cardRect.height}px;
      z-index: 99999;
      opacity: 0.85;
      pointer-events: none;
      transform: scale(1.03);
      box-shadow: 0 20px 40px -12px rgba(15,23,42,0.28), 0 8px 16px -6px rgba(15,23,42,0.18);
      border-radius: 16px;
    `
    // 移除 ghost 上的交互属性
    ghost.onPointerDown = null
    ghost.onclick = null
    document.body.appendChild(ghost)

    // 隐藏原卡片
    card.style.visibility = 'hidden'

    let didMove = false
    const startX = e.clientX
    const startY = e.clientY
    let lastPos = { x: cardRect.left, y: cardRect.top }
    let highlightTarget = null

    const setHighlight = (el) => {
      if (highlightTarget === el) return
      highlightTarget?.classList.remove('drag-target')
      highlightTarget = el
      if (el) el.classList.add('drag-target')
    }

    // 在网格卡片中查找与 (cx, cy) 中心最近的其它卡片（返回 DOM index）
    const findNearestIndex = (cx, cy, skipId) => {
      const grid = gridRef.current
      if (!grid) return -1
      const children = Array.from(grid.children).filter(
        (c) => c.hasAttribute && c.hasAttribute('data-item-id')
      )
      let nearestIdx = -1
      let nearestEl = null
      let nearestD2 = Infinity
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (child.dataset.itemId === skipId) continue
        const rect = child.getBoundingClientRect()
        const ccx = rect.left + rect.width / 2
        const ccy = rect.top + rect.height / 2
        const d2 = (cx - ccx) ** 2 + (cy - ccy) ** 2
        if (d2 < nearestD2) {
          nearestD2 = d2
          nearestIdx = i
          nearestEl = child
        }
      }
      return { nearestIdx, nearestEl }
    }

    // 统一清理：移除 ghost / 监听 / 高亮，恢复原卡片可见性
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onEsc)
      setHighlight(null)
      ghost.remove()
      if (card.isConnected) card.style.visibility = 'visible'
      if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null
    }
    dragCleanupRef.current = cleanup

    const onMove = (ev) => {
      didMove = true
      const left = ev.clientX - offset.x
      const top = ev.clientY - offset.y
      lastPos = { x: left, y: top }
      ghost.style.left = `${left}px`
      ghost.style.top = `${top}px`
      // 实时高亮最近的放置目标，让用户在松手前就知道会交换到哪
      const cx = left + cardRect.width / 2
      const cy = top + cardRect.height / 2
      const { nearestEl } = findNearestIndex(cx, cy, item.id)
      setHighlight(nearestEl)
    }

    // pointercancel：触屏系统手势 / Alt+Tab 中断，等同放弃本次拖拽
    const onCancel = () => cleanup()

    // Esc：取消拖拽（不触发排序）
    const onEsc = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        ev.stopPropagation()
        didMove = false
        cleanup()
      }
    }

    const onUp = () => {
      // 先记录落点再清理（ghost.remove 后 style 仍在，但语义上先取值更稳）
      const dragCX = lastPos.x + cardRect.width / 2
      const dragCY = lastPos.y + cardRect.height / 2
      const endX = lastPos.x + offset.x
      const endY = lastPos.y + offset.y
      const dist = Math.hypot(endX - startX, endY - startY)
      cleanup()

      if (!didMove) return
      if (dist < 30 || !onSort) return

      const { nearestIdx } = findNearestIndex(dragCX, dragCY, item.id)
      if (nearestIdx >= 0) {
        onSort(item.id, nearestIdx)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onEsc, true)
  }

  // U-09 右键菜单关闭
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (e.key === 'Escape') { setMenuOpen(false); return }
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

  // 多图支持（photo 字段可能以 \n 存多张路径）：封面取第一张，其余计数徽章
  const photoList = (item.photo || '').split('\n').map((p) => p.trim()).filter(Boolean)
  const photoCount = photoList.length
  const coverPhoto = photoList[0] || ''

  const hasPhoto = displayUrl && !imgErr
  const CategoryIcon = getCategoryIcon(cat)

  useEffect(() => { setImgErr(false); setFallbackUrl('') }, [photoUrl])

  const handleCardClick = () => {
    if (bulkMode) onToggleSelect(item.id)
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    setMenuOpen({ x: e.clientX, y: e.clientY })
  }

  const handleMenuAction = (action) => {
    setMenuOpen(false)
    switch (action) {
      case 'edit':   if (onEdit)   onEdit(item); break
      case 'add':    if (onAdjust) onAdjust(item.id, 1); break
      case 'sub':    if (onAdjust) onAdjust(item.id, -1); break
      case 'copy':   onCopyItemNo?.(item.item_no); break
      case 'delete': if (onDelete) onDelete(item); break
    }
  }

  const handleDoubleClick = () => {
    // 使用 displayUrl（可能已通过 readPhoto 兜底转为 base64），确保 lightbox 能正常显示
    // 仅当 displayUrl 有值且不是当前 photoUrl（说明兜底成功）时，兜底数据才是可显示的
    if (hasPhoto && onDoubleClick) onDoubleClick(displayUrl || photoUrl, item.name)
  }

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
      ref={cardRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0,
        boxShadow: isExpired ? '0 0 0 2px rgba(239,68,68,0.4), 0 4px 16px rgba(239,68,68,0.12)' : undefined
      }}
      whileHover={menuOpen ? undefined : baseHover}
      whileTap={baseTap}
      focusable
      tabIndex={0}
      transition={{ duration: 0.28, ease: EASE, delay: Math.min(index * 0.025, 0.12) }}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      className={cn(
        'card-hover group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-surface shadow-card',
        'transition-shadow duration-200 ease-[0.22,1,0.36,1]',
        'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
        selected ? 'border-primary shadow-[0_0_0_3px_rgba(16,185,129,0.22),0_8px_24px_-6px_rgba(16,185,129,0.25)] z-[5]' : 'border-border hover:shadow-lg',
        isExpired ? 'border-danger' : undefined,
        isExpiringSoon ? 'border-warn' : undefined,
        bulkMode && 'cursor-pointer',
        hasPhoto && 'cursor-zoom-in'
      )}
      data-item-id={item.id}
    >
      {canDrag && (
        <div
          onPointerDown={handleGripPointerDown}
          onKeyDown={handleGripKeyDown}
          tabIndex={0}
          role="button"
          aria-label={`${t('card_drag')}（方向键交换位置）`}
          className={cn(
            'absolute right-2 top-2 z-30 flex h-7 w-7 cursor-grab items-center justify-center rounded-full bg-surface/90 shadow-sm backdrop-blur-md transition-smooth hover:bg-surface',
            'active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          )}
          title={t('card_drag')}
        >
          <GripVertical size={14} className="text-text-tertiary" />
        </div>
      )}
      {selected && (
        <AnimatePresence>
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, boxShadow: '0 0 0 0 rgba(16,185,129,0.4)' }}
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

      <div className="relative aspect-[4/3] w-full overflow-hidden bg-bg">
        {hasPhoto ? (
          <>
            <img
              src={displayUrl}
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

        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/15 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

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

        <span
          className="absolute left-2.5 z-10 inline-flex max-w-[70%] items-center gap-1 truncate rounded-full bg-surface/92 px-2 py-1 text-[11px] font-medium text-text-secondary shadow-sm backdrop-blur-md transition-smooth group-hover:bg-surface"
          style={{ top: bulkMode ? '2.5rem' : '0.625rem' }}
        >
          <CategoryIcon size={12} strokeWidth={2.2} />
          <span className="truncate">{cat ? categoryDisplayName(cat, lang) : item.category || t('nav_categories')}</span>
        </span>

        <div className={cn(
          'absolute right-2 z-10 flex items-center gap-1 rounded-full bg-surface/88 p-1 shadow-sm backdrop-blur-md transition-smooth group-hover:bg-surface',
          canDrag ? 'top-10' : 'top-2'
        )}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); onEdit(item) }}
            title={t('form_editTitle')}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary transition-smooth hover:bg-primary-soft hover:text-primary"
          >
            <Pencil size={14} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); onDelete(item) }}
            title={t('btn_delete')}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary transition-smooth hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 size={14} />
          </motion.button>
        </div>
      </div>

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

        {locationText && (
          <div
            className="mt-2 inline-flex w-fit max-w-full items-center gap-1 truncate rounded-lg bg-primary-soft/70 px-2 py-1 text-xs font-medium text-primary"
            title={locationText}
          >
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{locationText}</span>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between rounded-xl bg-bg p-1">
          <div className="flex items-center gap-0.5">
            {/* 长按连击步进：按下 <300ms 视为单击 ±1；按住 300ms 后每 120ms 重复，
                家庭场景常需 +5/+10 不必连点。全部走 pointer 事件，避免与 click 双触发 */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              {...bindStepper(-1)}
              disabled={item.quantity <= 0}
              aria-label={t('card_sub1')}
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
              {...bindStepper(1)}
              aria-label={t('card_add1')}
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

      {menuOpen && typeof document !== 'undefined' && document.body &&
        createPortal(
          <AnimatePresence>
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15, ease: EASE }}
              className="z-[9999] min-w-[160px] rounded-xl border border-border bg-surface p-1.5 shadow-float"
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
          </AnimatePresence>,
          document.body
        )
      }
    </motion.div>
  )
}