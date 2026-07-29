import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'

export default function Sidebar({ activeCategory, onSelectCategory, counts, categories, lang, onOpenSettings }) {
  const { t } = useI18n()
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xl text-white shadow-sm">
          🏠
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-tight text-stone-800">{t('appTitle')}</div>
          <div className="text-[11px] text-stone-400">{t('appSubtitle')}</div>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={() => onSelectCategory('')}
          className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
            activeCategory === ''
              ? 'bg-emerald-50 font-medium text-emerald-700'
              : 'text-stone-600 hover:bg-stone-50'
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="text-base">📋</span> {t('nav_all')}
          </span>
          <span className="text-xs text-stone-400">{totalCount}</span>
        </button>
      </div>

      <div className="mt-2 px-5 pb-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
        {t('nav_categories')}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {categories.map((c) => {
          const active = activeCategory === c.key
          const count = counts[c.key] || 0
          return (
            <button
              key={c.id}
              onClick={() => onSelectCategory(active ? '' : c.key)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                active ? 'bg-emerald-50 font-medium text-emerald-700' : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-base">{c.icon || '🏷️'}</span>
                <span className="truncate">{categoryDisplayName(c, lang)}</span>
              </span>
              <span className="text-xs text-stone-400">{count}</span>
            </button>
          )
        })}
        {categories.length === 0 && (
          <div className="px-3 py-2 text-xs text-stone-300">{t('cat_addNew')}…</div>
        )}
      </nav>

      <button
        onClick={onOpenSettings}
        className="flex items-center gap-2 border-t border-stone-100 px-5 py-3 text-sm text-stone-500 transition hover:bg-stone-50 hover:text-stone-700"
      >
        <span className="text-base">⚙️</span> {t('nav_settings')}
      </button>
      <div className="px-5 pb-3 text-[11px] leading-relaxed text-stone-400">{t('sidebar_localBackup')}</div>
    </aside>
  )
}
