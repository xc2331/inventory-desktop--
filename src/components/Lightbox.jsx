import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { EASE } from '../lib/motion'

/**
 * 图片大图查看器：点击遮罩或 ESC 关闭，仅保留关闭按钮
 */
export default function Lightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
        >
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-smooth hover:bg-danger/80 hover:text-white"
          >
            <X size={18} />
          </button>

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
            className="max-h-[88vh] max-w-[90vw] select-none rounded-xl object-contain shadow-2xl"
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
