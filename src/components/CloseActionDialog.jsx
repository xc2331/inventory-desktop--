import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Minimize2, X, Settings2 } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { EASE, EASE_SPRING } from '../lib/motion'
import { cn } from '../lib/cn'

export default function CloseActionDialog({ open, onResolve, onCancel }) {
  const { t } = useI18n()
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    if (open) setRemember(false)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
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
            <div className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Settings2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-text-primary">{t('closeAction_title')}</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-text-tertiary">{t('closeAction_message')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <OptionButton
                  icon={<Minimize2 size={18} />}
                  label={t('closeAction_minimize')}
                  onClick={() => onResolve('minimize', remember)}
                />
                <OptionButton
                  icon={<X size={18} />}
                  label={t('closeAction_quit')}
                  onClick={() => onResolve('quit', remember)}
                />
              </div>

              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary accent-primary focus:ring-primary"
                />
                {t('closeAction_remember')}
              </label>

              <p className="mt-3 flex items-start gap-1.5 text-xs text-text-tertiary/80">
                <Settings2 size={13} className="mt-0.5 shrink-0" />
                {t('closeAction_note')}
              </p>
            </div>

            <div className="flex justify-end border-t border-border bg-bg/50 px-6 py-3.5">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onCancel}
                className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
              >
                {t('btn_cancel')}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function OptionButton({ icon, label, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-smooth',
        'border-border bg-surface text-text-secondary hover:border-primary/40 hover:bg-primary-soft hover:text-primary'
      )}
    >
      {icon}
      {label}
    </motion.button>
  )
}
