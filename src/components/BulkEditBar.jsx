import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'

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

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          title={t('close')}
          className="rounded-md p-1 text-emerald-700 transition hover:bg-emerald-100"
        >
          ✕
        </button>
        <span className="text-sm font-medium text-emerald-900">
          {t('bulk_selected', { n: selectedCount })}
        </span>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-emerald-800">
          <input
            type="checkbox"
            checked={selectedCount > 0 && selectedCount === total}
            onChange={onSelectAll}
            className="h-4 w-4 accent-emerald-600"
          />
          {t('bulk_selectAll')}
        </label>
        <button
          onClick={onClear}
          className="text-sm text-emerald-700 underline-offset-2 hover:underline"
        >
          {t('bulk_clear')}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setShowCat((v) => !v)}
            className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm transition hover:bg-emerald-100"
          >
            {t('bulk_changeCategory')} ▾
          </button>
          {showCat && (
            <div className="absolute bottom-full right-0 z-30 mb-1 w-44 rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onChangeCategory(c.key)
                    setShowCat(false)
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-stone-600 hover:bg-stone-50"
                >
                  {c.icon ? c.icon + ' ' : ''}
                  {categoryDisplayName(c, lang)}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onDelete}
          className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700"
        >
          {t('bulk_delete')}
        </button>
      </div>
    </div>
  )
}
