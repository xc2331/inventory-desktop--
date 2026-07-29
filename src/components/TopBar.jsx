import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'

export default function TopBar({
  collapsed,
  onToggleSidebar,
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
  lang,
  bulkMode,
  onToggleBulk
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
    <header className="flex flex-col gap-3 border-b border-border bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-lg text-text-secondary transition hover:bg-surface-hover"
          title={collapsed ? t('nav_categories') : t('close')}
        >
          {collapsed ? '☰' : '◀'}
        </button>

        <h1 className="flex min-w-0 max-w-[220px] items-center gap-2 text-base font-semibold text-text-primary">
          {title()}
        </h1>

        <div className="relative max-w-md flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">🔍</span>
          <input
            type="text"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder={t('search_placeholder')}
            className="input w-full rounded-xl py-2 pl-9 pr-3 text-sm"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="group relative">
            <button className="flex h-9 items-center gap-1 rounded-lg border border-border bg-bg px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-hover">
              {t('btn_import')} / {t('btn_export')} ▾
            </button>
            <div className="absolute right-0 top-full z-20 mt-1 hidden w-40 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-float group-hover:block">
              <button
                onClick={onImport}
                className="block w-full px-4 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover"
              >
                {t('btn_import')} JSON
              </button>
              <div className="my-1 border-t border-border" />
              <button
                onClick={onExportJSON}
                className="block w-full px-4 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover"
              >
                {t('export_json')}
              </button>
              <button
                onClick={onExportCSV}
                className="block w-full px-4 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover"
              >
                {t('export_csv')}
              </button>
            </div>
          </div>
          <button
            onClick={onToggleBulk}
            title={bulkMode ? t('bulk_select') + '（已开启）' : t('bulk_select')}
            className={`flex h-9 items-center gap-1 rounded-lg border px-3 text-sm font-medium transition ${
              bulkMode
                ? 'border-primary/40 bg-primary-soft text-primary shadow-sm'
                : 'border-border bg-bg text-text-secondary shadow-sm hover:bg-surface-hover'
            }`}
          >
            <span>{bulkMode ? '☑' : '☐'}</span>
            {t('bulk_select')}
          </button>
          <button
            onClick={onAdd}
            className="flex h-9 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition hover:bg-primary-hover"
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
    neutral: 'bg-surface-hover text-text-secondary ring-1 ring-border',
    danger: 'bg-danger-soft text-danger',
    warn: 'bg-warn-soft text-warn'
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${tones[tone]}`}>
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  )
}
