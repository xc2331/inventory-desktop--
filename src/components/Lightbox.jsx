import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'
import { EASE } from '../lib/motion'

/**
 * 图片大图查看器：点击遮罩或 ESC 关闭，支持滚轮缩放与旋转
 */
export default function Lightbox({ src, alt, onClose }) {
  const [zoom, setZoom] = useState(1)
  const [rotate, setRotate] = useState(0)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setZoom(1)
    setRotate(0)
  }, [src])

  const onWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.12 : 0.12
    setZoom((z) => Math.min(4, Math.max(0.3, z + delta)))
  }

  return (
    <AnimatePresence>
      {src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md"
          onClick={onClose}
          onWheel={onWheel}
        >
          {/* 工具栏 */}
          <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setZoom((z) => Math.max(0.3, z - 0.25))}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-smooth hover:bg-white/20 hover:text-white"
            >
              <ZoomOut size={18} />
            </button>
            <span className="min-w-[3rem] text-center text-xs font-medium text-white/60 tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-smooth hover:bg-white/20 hover:text-white"
            >
              <ZoomIn size={18} />
            </button>
            <button
              onClick={() => setRotate((r) => r + 90)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-smooth hover:bg-white/20 hover:text-white"
            >
              <RotateCw size={18} />
            </button>
            <div className="mx-1 h-5 w-px bg-white/20" />
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-smooth hover:bg-danger/80 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <motion.img
            key={src}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: EASE }}
            src={src}
            alt={alt || ''}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            style={{
              transform: `scale(${zoom}) rotate(${rotate}deg)`,
              transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)'
            }}
            className="max-h-[88vh] max-w-[90vw] select-none rounded-xl object-contain shadow-2xl"
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
