import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckSquare, Square, Trash2, FolderInput, ChevronDown } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'
import { getCategoryIcon } from '../lib/categoryIcons'
import { EASE } from '../lib/motion'

export default function BulkEditBar({
  selectedCount,
  total,
  categories,
  lang,
  onSelectAll,
  onClear,
  onChangeCategory,
  onDelete,
  onClose
}) {
  const { t } = useI18n()
  const [showCat, setShowCat] = useState(false)
  const allSelected = selectedCount > 0 && selectedCount === total

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="glass flex items-center justify-between gap-3 rounded-2xl border border-primary/30 px-4 py-3 shadow-card"
    >
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          title={t('close')}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-primary transition-smooth hover:bg-primary-soft"
        >
          <X size={16} />
        </motion.button>
        <span className="text-sm font-semibold text-primary">
          {t('bulk_selected', { n: selectedCount })}
        </span>
        <button
          onClick={onSelectAll}
          className="flex cursor-pointer items-center gap-1.5 text-sm text-primary transition-smooth hover:opacity-80"
        >
          {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
          {t('bulk_selectAll')}
        </button>
        <button
          onClick={onClear}
          className="text-sm text-primary underline-offset-2 transition-smooth hover:underline"
        >
          {t('bulk_clear')}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowCat((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-medium text-primary shadow-sm transition-smooth hover:bg-primary-soft"
          >
            <FolderInput size={15} />
            {t('bulk_changeCategory')}
            <ChevronDown size={13} className={`transition-transform ${showCat ? 'rotate-180' : ''}`} />
          </motion.button>
          <AnimatePresence>
            {showCat && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="absolute bottom-full right-0 z-30 mb-1.5 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-float"
              >
                {categories.map((c) => {
                  const CatIcon = getCategoryIcon(c)
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        onChangeCategory(c.key)
                        setShowCat(false)
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary transition-smooth hover:bg-surface-hover"
                    >
                      <CatIcon size={15} className="text-text-tertiary" />
                      {categoryDisplayName(c, lang)}
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-xl bg-danger px-3 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:brightness-110"
        >
          <Trash2 size={15} />
          {t('bulk_delete')}
        </motion.button>
      </div>
    </motion.div>
  )
}
