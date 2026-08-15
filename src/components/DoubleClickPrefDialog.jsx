import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, ExternalLink, HelpCircle, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { EASE, EASE_SPRING } from '../lib/motion'

export default function DoubleClickPrefDialog({ open, onClose, onChoose, t }) {
  const options = [
    {
      key: 'openFile',
      icon: ExternalLink,
      title: t('materials_doubleClick_openFile'),
      desc: t('materials_doubleClick_openFileDesc')
    },
    {
      key: 'openFolder',
      icon: FolderOpen,
      title: t('materials_doubleClick_openFolder'),
      desc: t('materials_doubleClick_openFolderDesc')
    }
  ]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.3, ease: EASE_SPRING }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-float"
          >
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-text-primary">{t('materials_doubleClick_prefTitle')}</h3>
                <p className="mt-0.5 text-xs text-text-tertiary">{t('materials_doubleClick_prefDesc')}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-2 p-5">
              {options.map((opt) => {
                const Icon = opt.icon
                return (
                  <motion.button
                    key={opt.key}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onChoose(opt.key)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-smooth hover:border-primary hover:bg-primary-soft/50'
                    )}
                  >
                    {Icon ? (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                        <Icon size={18} />
                      </span>
                    ) : (
                      <span className="h-9 w-9 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-text-primary">{opt.title}</span>
                      <span className="block text-xs text-text-tertiary">{opt.desc}</span>
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
