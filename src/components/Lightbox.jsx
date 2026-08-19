import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw, X } from 'lucide-react'
import { EASE } from '../lib/motion'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 0.5
const WHEEL_SENSITIVITY = 0.08
const PAN_STEP = 60

/**
 * 图片大图查看器：
 * - ESC / 点击遮罩关闭
 * - 双击图片切换缩放级别（1x → 2x → 3x → 1x）
 * - 滚轮缩放（0.5x ~ 4x）
 * - 缩放后键盘 ←→↑↓ 平移
 * - 触屏双指捏合缩放
 * - 缩放后显示重置按钮 + 当前缩放百分比
 */
export default function Lightbox({ src, alt, onClose }) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isZoomed = scale !== 1 || pan.x !== 0 || pan.y !== 0

  // 触屏捏合引用
  const pinchStart = useRef(null)
  const pinchStartScale = useRef(1)

  const reset = useCallback(() => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [])

  // 平滑缩放动画
  const animateToScale = useCallback((next) => {
    setScale(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)))
    setPan({ x: 0, y: 0 })
  }, [])

  // 双击缩放：1x → 2x → 3x → 1x 循环
  const handleDoubleClick = useCallback(() => {
    let next = 1
    if (scale < 1.5) next = 2
    else if (scale < 2.5) next = 3
    else if (scale < 3.5) next = 1
    animateToScale(next)
  }, [scale, animateToScale])

  // 滚轮缩放
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      const delta = -e.deltaY * WHEEL_SENSITIVITY
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale + delta))
      setScale(next)
      if (next <= ZOOM_MIN) reset()
    },
    [scale, reset]
  )

  // 缩放状态下键盘操作
  useEffect(() => {
    if (!isZoomed) return
    const onKey = (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault()
        setPan((p) => {
          const s = scale * PAN_STEP
          return {
            x: e.key === 'ArrowLeft' ? p.x + s : e.key === 'ArrowRight' ? p.x - s : p.x,
            y: e.key === 'ArrowUp' ? p.y + s : e.key === 'ArrowDown' ? p.y - s : p.y,
          }
        })
      }
      if (e.key === '+' || e.key === '=') animateToScale(Math.min(ZOOM_MAX, scale + ZOOM_STEP))
      if (e.key === '-') animateToScale(Math.max(ZOOM_MIN, scale - ZOOM_STEP))
      if (e.key === '0') reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scale, isZoomed, reset, animateToScale])

  // 触屏双指捏合
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const t = e.touches
      const dist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
      pinchStart.current = dist
      pinchStartScale.current = scale
    }
  }, [scale])

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchStart.current) {
      const t = e.touches
      const dist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
      const ratio = dist / pinchStart.current
      setScale(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinchStartScale.current * ratio)))
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    pinchStart.current = null
  }, [])

  // ESC 关闭
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { reset(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, reset])

  const zoomLabel = `${Math.round(scale * 100)}%`

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md select-none"
          onClick={onClose}
        >
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            data-lightbox-close
            className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-smooth hover:bg-white/20 hover:text-white"
          >
            <X size={18} />
          </button>

          {/* 缩放百分比 + 重置按钮 */}
          <AnimatePresence>
            {isZoomed && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-medium text-white/90 backdrop-blur-sm"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); reset() }}
                  data-lightbox-reset
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-smooth hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw size={14} />
                  <span>重置</span>
                </button>
                <span className="tabular-nums">{zoomLabel}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 图片 */}
          <motion.img
            key={src}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale, x: pan.x, y: pan.y }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: EASE }}
            src={src}
            alt={alt || ''}
            draggable={false}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            style={{ cursor: isZoomed ? 'grab' : 'default' }}
          />

          {/* 底部操作提示 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            className="absolute left-0 right-0 bottom-4 flex justify-center pointer-events-none"
          >
            <div className="rounded-lg bg-black/40 px-4 py-2 text-xs text-white/60 backdrop-blur-sm">
              双击缩放 · 滚轮缩放 · ←→ 平移 · ESC 关闭
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}