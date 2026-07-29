import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'

export default function TopBar({
  keyword,
  onKeywordChange,
  onAdd,
  onImport,
  onExportJSON,
  onExportCSV,
  total,
  lowStock,
  expiringSoon,
  activeCategory,
  activeLocation,
  categories,
  lang
}) {
  const { t } = useI18n()
  const cat = categories.find((c) => c.key === activeCategory)

  const title = () => {
    if (activeLocation && activeLocation.length > 0) {
      return (
        <>
          <span>📍</span>
          <span className="truncate">{activeLocation.join(' > ')}</span>
        </>
      )
    }
    if (cat) {
      return (
        <>
          <span>{cat.icon || '🏷️'}</span>
          <span className="truncate">{categoryDisplayName(cat, lang)}</span>
        </>
      )
    }
    return t('nav_all')
  }

  return (
    <header className="flex flex-col gap-3 border-b border-stone-200 bg-white px-6 py-4">
      <div className="flex items-center gap-3">
        <h1 className="flex min-w-0 max-w-[260px] items-center gap-2 text-lg font-semibold text-stone-800">
          {title()}
        </h1>

        <div className="relative max-w-md flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">🔍</span>
          <input
            type="text"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder={t('search_placeholder')}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm text-stone-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onImport}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
          >
            {t('btn_import')}
          </button>
          <div className="group relative">
            <button className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50">
              {t('btn_export')} ▾
            </button>
            <div className="absolute right-0 top-full z-20 mt-1 hidden w-36 rounded-lg border border-stone-200 bg-white py-1 shadow-lg group-hover:block">
              <button
                onClick={onExportJSON}
                className="block w-full px-4 py-2 text-left text-sm text-stone-600 hover:bg-stone-50"
              >
                {t('export_json')}
              </button>
              <button
                onClick={onExportCSV}
                className="block w-full px-4 py-2 text-left text-sm text-stone-600 hover:bg-stone-50"
              >
                {t('export_csv')}
              </button>
            </div>
          </div>
          <button
            onClick={onAdd}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
          >
            + {t('btn_add')}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <StatChip label={t('stat_items')} value={total} tone="neutral" />
        <StatChip label={t('stat_lowStock')} value={lowStock} tone={lowStock > 0 ? 'danger' : 'neutral'} />
        <StatChip
          label={t('stat_expiringSoon')}
          value={expiringSoon}
          tone={expiringSoon > 0 ? 'warn' : 'neutral'}
        />
      </div>
    </header>
  )
}

function StatChip({ label, value, tone }) {
  const tones = {
    neutral: 'bg-stone-100 text-stone-600',
    danger: 'bg-rose-100 text-rose-700',
    warn: 'bg-amber-100 text-amber-700'
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${tones[tone]}`}>
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  )
}
