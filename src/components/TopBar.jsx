import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'
import { cn } from '../lib/cn'
import {
  Search,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  Upload,
  FileJson,
  FileSpreadsheet,
  CheckSquare,
  Square,
  ChevronDown,
  Package,
  AlertTriangle,
  CalendarClock,
  MapPin
} from 'lucide-react'
import { getCategoryIcon } from '../lib/categoryIcons'

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
  const [exportOpen, setExportOpen] = useState(false)
  const cat = categories.find((c) => c.key === activeCategory)

  const titleContent = () => {
    if (activeLocation && activeLocation.length > 0) {
      return (
        <>
          <MapPin size={18} className="shrink-0 text-primary" />
          <span className="truncate">{activeLocation.join(' › ')}</span>
        </>
      )
    }
    if (cat) {
      const CatIcon = getCategoryIcon(cat)
      return (
        <>
          <CatIcon size={18} className="shrink-0" />
          <span className="truncate">{categoryDisplayName(cat, lang)}</span>
        </>
      )
    }
    return (
      <>
        <Package size={18} className="shrink-0 text-primary" />
        <span className="truncate">{t('nav_all')}</span>
      </>
    )
  }

  return (
    <header className="glass z-30 flex flex-col gap-3 border-b border-border px-5 py-3.5">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface/60 text-text-secondary transition-smooth hover:bg-surface-hover hover:text-text-primary"
          title={collapsed ? t('nav_categories') : t('close')}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <h1 className="flex min-w-0 max-w-[220px] items-center gap-2 text-[17px] font-semibold tracking-tight text-text-primary">
          {titleContent()}
        </h1>

        {/* 搜索框：明确 padding，避免与图标重叠 */}
        <div className="group relative max-w-md flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary transition-smooth group-focus-within:text-primary"
          />
          <input
            type="text"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder={t('search_placeholder')}
            className="h-9 w-full rounded-xl border border-border bg-surface/60 pl-10 pr-9 text-sm text-text-primary outline-none transition-smooth placeholder:text-text-tertiary hover:border-border-strong focus:border-primary focus:bg-surface focus:shadow-glow"
          />
          {keyword && (
            <button
              onClick={() => onKeywordChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-text-tertiary transition hover:bg-surface-hover hover:text-text-secondary"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* 导入/导出 */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              onBlur={() => setTimeout(() => setExportOpen(false), 150)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface/60 px-3 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover hover:text-text-primary"
            >
              <Download size={15} />
              <ChevronDown size={13} className={cn('transition-transform', exportOpen && 'rotate-180')} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-float">
                <button
                  onMouseDown={onImport}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover"
                >
                  <Upload size={15} className="text-primary" />
                  {t('btn_import')} JSON
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  onMouseDown={onExportJSON}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover"
                >
                  <FileJson size={15} className="text-primary" />
                  {t('export_json')}
                </button>
                <button
                  onMouseDown={onExportCSV}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover"
                >
                  <FileSpreadsheet size={15} className="text-primary" />
                  {t('export_csv')}
                </button>
              </div>
            )}
          </div>

          {/* 批量选择 */}
          <button
            onClick={onToggleBulk}
            title={t('bulk_select')}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-smooth',
              bulkMode
                ? 'border-primary/40 bg-primary-soft text-primary shadow-sm'
                : 'border-border bg-surface/60 text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            )}
          >
            {bulkMode ? <CheckSquare size={15} /> : <Square size={15} />}
            {t('bulk_select')}
          </button>

          {/* 添加 */}
          <button
            onClick={onAdd}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover hover:shadow-card"
          >
            <Plus size={16} strokeWidth={2.5} />
            {t('btn_add')}
          </button>
        </div>
      </div>

      {/* 统计标签 */}
      <div className="flex items-center gap-2 text-xs">
        <StatChip icon={Package} label={t('stat_items')} value={total} tone="neutral" />
        <StatChip icon={AlertTriangle} label={t('stat_lowStock')} value={lowStock} tone={lowStock > 0 ? 'danger' : 'neutral'} />
        <StatChip icon={CalendarClock} label={t('stat_expiringSoon')} value={expiringSoon} tone={expiringSoon > 0 ? 'warn' : 'neutral'} />
      </div>
    </header>
  )
}

function StatChip({ icon: Icon, label, value, tone }) {
  const tones = {
    neutral: 'bg-surface-hover/60 text-text-secondary ring-1 ring-inset ring-border',
    danger: 'bg-danger-soft text-danger ring-1 ring-inset ring-danger/20',
    warn: 'bg-warn-soft text-warn ring-1 ring-inset ring-warn/20'
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium', tones[tone])}>
      <Icon size={12} />
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  )
}
