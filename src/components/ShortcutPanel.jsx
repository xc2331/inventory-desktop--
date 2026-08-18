import { motion } from 'framer-motion'
import { useI18n } from '../lib/i18n'
import { X, Search, SquareCheck, Square, Command } from 'lucide-react'

export default function ShortcutPanel({ open, onClose }) {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[92vw] rounded-2xl border border-border bg-surface p-5 shadow-float"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Command size={20} className="text-primary" />
            <h3 className="text-base font-semibold text-text-primary">{t('shortcuts_title')}</h3>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SHORTCUTS.map((s) => (
            <div key={s.name + '-' + s.key} className="flex items-center justify-between rounded-lg bg-surface-hover px-3 py-2">
              <span className="text-sm text-text-secondary">{t(s.name)}</span>
              <kbd className="flex items-center gap-0.5">
                {(s.mods || []).map((m) => (
                  <span key={m} className="inline-block rounded bg-border px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary">{m}</span>
                ))}
                <span className="inline-block rounded bg-surface px-1.5 py-0.5 text-xs font-semibold text-text-primary">{s.key}</span>
              </kbd>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

const SHORTCUTS = [
  { name: 'shortcuts_search', key: 'K', mods: ['⌘/Ctrl'] },
  { name: 'shortcuts_bulk', key: 'B', mods: ['⌘/Ctrl'] },
  { name: 'shortcuts_close', key: 'Esc', mods: [] },
  { name: 'shortcuts_panel', key: '?', mods: [] },
  { name: 'shortcuts_submit', key: 'Enter', mods: [] },
  { name: 'shortcuts_cancel', key: 'Esc', mods: [] },
]