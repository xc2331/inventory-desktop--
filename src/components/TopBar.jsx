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
          <MapPin size={16} className="shrink-0 text-primary" />
          <span className="truncate">{activeLocation.join(' › ')}</span>
        </>
      )
    }
    if (cat) {
      const CatIcon = getCategoryIcon(cat)
      return (
        <>
          <CatIcon size={16} className="shrink-0" />
          <span className="truncate">{categoryDisplayName(cat, lang)}</span>
        </>
      )
    }
    return (
      <>
        <Package size={16} className="shrink-0 text-primary" />
        <span className="truncate">{t('nav_all')}</span>
      </>
    )
  }

  return (
    <header className="glass z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      {/* 左侧：收起侧边栏 + 当前视图标题 */}
      <button
        onClick={onToggleSidebar}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-secondary"
        title={collapsed ? t('nav_categories') : t('close')}
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <h1 className="flex min-w-0 max-w-[180px] items-center gap-1.5 text-sm font-semibold tracking-tight text-text-primary">
        {titleContent()}
      </h1>

      {/* 中间：搜索框 */}
      <div className="group relative mx-auto max-w-xl flex-1 px-2">
        <Search
          size={15}
          className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-text-tertiary transition-smooth group-focus-within:text-primary"
        />
        <input
          type="text"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder={t('search_placeholder')}
          className="h-9 w-full rounded-full border border-border bg-surface/60 pl-10 pr-9 text-sm text-text-primary outline-none transition-smooth placeholder:text-text-tertiary hover:border-border-strong hover:bg-surface focus:border-primary/60 focus:bg-surface focus:shadow-glow"
        />
        {keyword && (
          <button
            onClick={() => onKeywordChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-text-tertiary transition hover:bg-surface-hover hover:text-text-secondary"
          >
            ×
          </button>
        )}
      </div>

      {/* 右侧：导入/导出 + 批量 + 添加 */}
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="relative">
          <button
            onClick={() => setExportOpen((v) => !v)}
            onBlur={() => setTimeout(() => setExportOpen(false), 150)}
            className="flex h-8 items-center gap-1 rounded-lg border border-border bg-surface/60 px-2.5 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-hover hover:text-text-primary"
          >
            <Download size={14} />
            <ChevronDown size={12} className={cn('transition-transform', exportOpen && 'rotate-180')} />
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full z-40 mt-1.5 w-44 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-float">
              <button
                onMouseDown={onImport}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover"
              >
                <Upload size={14} className="text-primary" />
                {t('btn_import')} JSON
              </button>
              <div className="my-1 h-px bg-border" />
              <button
                onMouseDown={onExportJSON}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover"
              >
                <FileJson size={14} className="text-primary" />
                {t('export_json')}
              </button>
              <button
                onMouseDown={onExportCSV}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover"
              >
                <FileSpreadsheet size={14} className="text-primary" />
                {t('export_csv')}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={onToggleBulk}
          title={t('bulk_select')}
          className={cn(
            'flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-smooth',
            bulkMode
              ? 'border-primary/40 bg-primary-soft text-primary shadow-sm'
              : 'border-border bg-surface/60 text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          )}
        >
          {bulkMode ? <CheckSquare size={14} /> : <Square size={14} />}
          {t('bulk_select')}
        </button>

        <button
          onClick={onAdd}
          className="flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover hover:shadow-card"
        >
          <Plus size={15} strokeWidth={2.5} />
          {t('btn_add')}
        </button>
      </div>
    </header>
  )
}
