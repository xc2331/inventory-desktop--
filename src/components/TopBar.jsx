import { useState, useEffect } from 'react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName, winControl } from '../lib/api'
import { cn } from '../lib/cn'
import {
  Search,
  Plus,
  Download,
  Upload,
  FileJson,
  FileSpreadsheet,
  CheckSquare,
  Square,
  ChevronDown,
  Package,
  MapPin,
  X,
  Minus,
  Copy,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
  CalendarClock
} from 'lucide-react'
import { getCategoryIcon } from '../lib/categoryIcons'

/**
 * 统一顶栏（上下一体）：单行布局，frameless 窗口拖拽标题栏 + 工具栏 + 内联统计 + 窗口控制
 */
export default function TopBar({
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
  onToggleBulk,
  onToggleSidebar,
  sidebarCollapsed,
  total,
  lowStock,
  expiringSoon
}) {
  const { t } = useI18n()
  const [exportOpen, setExportOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const cat = categories.find((c) => c.key === activeCategory)

  useEffect(() => {
    let alive = true
    winControl.isMaximized().then((m) => alive && setMaximized(m))
    winControl.onMaximizeChange((m) => setMaximized(m))
    return () => {
      alive = false
    }
  }, [])

  const titleContent = () => {
    if (activeLocation && activeLocation.length > 0) {
      return (
        <>
          <MapPin size={15} className="shrink-0 text-primary" />
          <span className="truncate">{activeLocation.join(' › ')}</span>
        </>
      )
    }
    if (cat) {
      const CatIcon = getCategoryIcon(cat)
      return (
        <>
          <CatIcon size={15} className="shrink-0" />
          <span className="truncate">{categoryDisplayName(cat, lang)}</span>
        </>
      )
    }
    return (
      <>
        <Package size={15} className="shrink-0 text-primary" />
        <span className="truncate">{t('nav_all')}</span>
      </>
    )
  }

  return (
    <header className="glass drag-region relative z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      {/* 侧边栏展开/收起 */}
      <button
        onClick={onToggleSidebar}
        title={sidebarCollapsed ? t('sidebar_expand') : t('sidebar_collapse')}
        className="no-drag flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-smooth hover:bg-surface-hover hover:text-text-primary"
      >
        {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
      </button>

      {/* 当前视图标题 */}
      <h1 className="flex min-w-0 max-w-[160px] items-center gap-1.5 text-sm font-semibold tracking-tight text-text-primary">
        {titleContent()}
      </h1>

      {/* 内联统计（上下一体，融入单行） */}
      <div className="no-drag flex shrink-0 items-center gap-1 pl-1">
        <InlineStat icon={Package} value={total} tone="neutral" title={t('stat_items')} />
        {lowStock > 0 && (
          <InlineStat icon={AlertTriangle} value={lowStock} tone="danger" title={t('stat_lowStock')} />
        )}
        {expiringSoon > 0 && (
          <InlineStat icon={CalendarClock} value={expiringSoon} tone="warn" title={t('stat_expiringSoon')} />
        )}
      </div>

      {/* 搜索框 */}
      <div className="group no-drag relative mx-auto flex w-full max-w-xl flex-1 px-2">
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
            <X size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* 右侧操作区 */}
      <div className="no-drag flex shrink-0 items-center gap-1.5">
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

      {/* 窗口控制按钮 */}
      <div className="no-drag flex shrink-0 items-center gap-0.5 pl-1.5">
        <button
          onClick={() => winControl.minimize()}
          title={t('win_minimize')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
        >
          <Minus size={15} />
        </button>
        <button
          onClick={() => winControl.maximize()}
          title={maximized ? t('win_restore') : t('win_maximize')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
        >
          {maximized ? <Copy size={13} /> : <Square size={13} />}
        </button>
        <button
          onClick={() => winControl.close()}
          title={t('win_close')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-smooth hover:bg-danger hover:text-white"
        >
          <X size={15} />
        </button>
      </div>
    </header>
  )
}

/** 内联统计：无背景，仅图标+数字，融入顶栏单行 */
function InlineStat({ icon: Icon, value, tone, title }) {
  const tones = {
    neutral: 'text-text-tertiary',
    danger: 'text-danger',
    warn: 'text-warn'
  }
  return (
    <span
      title={title}
      className={cn('flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs font-medium tabular-nums', tones[tone])}
    >
      <Icon size={13} />
      {value}
    </span>
  )
}
