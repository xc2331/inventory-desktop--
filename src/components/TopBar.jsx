import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  CalendarClock,
  Bell
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
  onExportSelected,
  onExportReport,
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
  expiringSoon,
  density = 'medium',
  onDensityChange,
  notifOn,
  onToggleNotif
}) {
  const { t } = useI18n()
  const [exportOpen, setExportOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [focused, setFocused] = useState(false)
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('searchHistory') || '[]')
    } catch {
      return []
    }
  })
  const inputRef = useRef(null)
  const historyMenuRef = useRef(null)
  const exportBtnRef = useRef(null)
  const [historyPos, setHistoryPos] = useState({ left: 0, top: 0, width: 280 })
  const [exportPos, setExportPos] = useState({ left: 0, top: 0 })

  // 当搜索框聚焦或 history 变化时，计算下拉菜单位置（createPortal 到 body 需要 fixed 坐标）
  useEffect(() => {
    if (focused && !keyword && history.length > 0 && inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setHistoryPos({ left: r.left, top: r.bottom + 4, width: r.width })
    }
  }, [focused, keyword, history])

  // 保存搜索历史到 localStorage
  useEffect(() => {
    localStorage.setItem('searchHistory', JSON.stringify(history))
  }, [history])

  const addToHistory = (kw) => {
    const trimmed = kw.trim()
    if (!trimmed) return
    const deduped = history.filter((h) => h !== trimmed)
    setHistory([trimmed, ...deduped].slice(0, 5))
  }

  const cat = categories.find((c) => c.key === activeCategory)

  // U-03 匹配数 badge 颜色
  const matchCount = total
  const matchTone = matchCount > 0 ? 'text-primary' : 'text-danger'

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

      {/* 搜索框 (U-03：焦点态强化 + 匹配数 badge + 关键词高亮预留) */}
      <div className="group no-drag relative mx-auto flex w-full max-w-xl min-w-0 flex-1 px-2">
        <Search
          size={15}
          className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-text-tertiary transition-all duration-300 group-focus-within:text-primary group-focus-within:scale-110"
        />
        <input
          ref={inputRef}
          id="search-input"
          type="text"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (keyword) addToHistory(keyword)
              onKeywordChange('')
            }
          }}
          placeholder={t('search_placeholder')}
          className="h-9 w-full rounded-full border border-border bg-surface/60 pl-10 pr-24 text-sm text-text-primary outline-none transition-all duration-300 placeholder:text-text-tertiary hover:border-border-strong hover:bg-surface focus:border-primary/70 focus:bg-surface focus:shadow-glow focus:ring-2 focus:ring-primary/10"
        />
        {keyword ? (
          <>
            {/* 匹配数 badge (U-03) */}
            <span className={`absolute right-12 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-semibold tabular-nums ${matchTone} transition-all duration-300`}>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
              {matchCount}
            </span>
            <button
              type="button"
              onMouseDown={(e) => {
                // 防止 onBlur 先于 onClick 触发导致按钮被卸载（修复"按 3 次才清空"）
                e.preventDefault()
              }}
              onClick={() => {
                if (keyword) addToHistory(keyword)
                onKeywordChange('')
                inputRef.current?.focus()
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-text-tertiary transition hover:bg-danger hover:text-white"
              title={t('search_clear')}
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </>
        ) : (
          <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-text-tertiary opacity-0 transition-opacity duration-300 group-hover:opacity-100" title="Esc 退出">
            <X size={9} />
          </span>
        )}
        {/* 搜索历史下拉（U-12：仅当输入聚焦且关键词为空时显示） */}
        {focused && !keyword && history.length > 0 && createPortal(
          <div
            ref={historyMenuRef}
            className="fixed z-[9999] min-w-[260px] max-w-[420px] rounded-xl border border-border bg-surface p-1.5 shadow-float"
            style={{ left: historyPos.left, top: historyPos.top, width: historyPos.width }}>
            <div className="px-3 py-1.5 text-[10px] font-medium text-text-tertiary">{t('search_history')}</div>
            {history.map((h, i) => (
              <button
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onKeywordChange(h)
                  setFocused(true)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
              >
                <Search size={12} className="shrink-0 text-text-tertiary" />
                <span className="truncate">{h}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>

      {/* 右侧操作区 */}
      <div className="no-drag flex shrink-0 items-center gap-1.5">
        <div className="relative">
          <button
            ref={exportBtnRef}
            onClick={() => {
              setExportOpen((v) => {
                if (!v && exportBtnRef.current) {
                  const r = exportBtnRef.current.getBoundingClientRect()
                  setExportPos({ left: r.right - 176, top: r.bottom + 6 })
                }
                return !v
              })
            }}
            onBlur={() => setTimeout(() => setExportOpen(false), 150)}
            className="flex h-8 items-center gap-1 rounded-lg border border-border bg-surface/60 px-2.5 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-hover hover:text-text-primary"
          >
            <Download size={14} />
            <ChevronDown size={12} className={cn('transition-transform', exportOpen && 'rotate-180')} />
          </button>
          {exportOpen && createPortal(
            <div
              className="fixed z-[9999] w-44 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-float"
              style={{ left: exportPos.left, top: exportPos.top }}>
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
              <div className="my-1 h-px bg-border" />
              <button
                onMouseDown={onExportSelected}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover"
              >
                <CheckSquare size={14} className="text-primary" />
                {t('export_selected')}
              </button>
              <button
                onMouseDown={onExportReport}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition hover:bg-surface-hover"
              >
                <AlertTriangle size={14} className="text-amber-500" />
                {t('export_report')}
              </button>
            </div>,
            document.body
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

        {/* 密度三段选择器：显式展示当前档位，替代原先的隐形循环按钮 */}
        <div
          className="flex h-8 items-center overflow-hidden rounded-lg border border-border bg-surface/60 p-0.5"
          role="group"
          aria-label={t('density_toggle')}
        >
          {[
            { key: 'compact', label: t('density_compact') },
            { key: 'medium', label: t('density_medium') },
            { key: 'relaxed', label: t('density_relaxed') }
          ].map((d) => (
            <button
              key={d.key}
              onClick={() => onDensityChange(d.key)}
              aria-pressed={density === d.key}
              title={`${t('density_toggle')}: ${d.label}`}
              className={cn(
                'flex h-7 items-center rounded-md px-2 text-[11px] font-medium transition-smooth',
                density === d.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-tertiary hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        <button
          onClick={onToggleNotif}
          title={notifOn ? t('notify_disabled') : t('notify_enabled')}
          className={cn(
            'flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-smooth',
            notifOn
              ? 'border-primary/40 bg-primary-soft text-primary shadow-sm'
              : 'border-border bg-surface/60 text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          )}
        >
          <Bell size={14} />
          {notifOn ? t('notify_enabled') : t('notify_disabled')}
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
