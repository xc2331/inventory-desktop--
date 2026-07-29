import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { EASE, EASE_SPRING } from '../lib/motion'

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  const { t } = useI18n()
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.3, ease: EASE_SPRING }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface shadow-float"
          >
            <div className="flex items-start gap-3.5 p-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-text-primary">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-text-tertiary">{message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-bg/50 px-6 py-3.5">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onCancel}
                className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
              >
                {t('btn_cancel')}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onConfirm}
                className="rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:brightness-110"
              >
                {t('btn_delete')}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
