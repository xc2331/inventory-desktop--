import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { EASE_SPRING, EASE } from '../lib/motion'

export default function Toast({ toast, onDone }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, 2600)
    return () => clearTimeout(t)
  }, [toast, onDone])

  const isError = toast?.type === 'error'

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.34, ease: EASE_SPRING }}
            className={`glass flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-medium shadow-float ${
              isError
                ? 'border-danger/30 text-danger'
                : 'border-border text-text-primary'
            }`}
          >
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.12, type: 'spring', stiffness: 500, damping: 18 }}
            >
              {isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} className="text-primary" />}
            </motion.span>
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
