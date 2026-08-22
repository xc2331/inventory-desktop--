import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  XCircle, AlertOctagon, AlertTriangle, Clock, ArrowLeft,
  ShieldCheck, MapPin, Search
} from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { fetchItemsMeta, fetchCategories, categoryDisplayName } from '../lib/api'
import { expiryStatus } from '../lib/utils'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'
import { EASE } from '../lib/motion'

// 紧迫度等级
function urgencyLevel(ts) {
  if (!ts) return null
  const days = Math.ceil((ts - Date.now()) / 86400000)
  if (days < 0) return 'critical'
  if (days <= 3) return 'urgent'
  if (days <= 7) return 'warning'
  return 'ok'
}

// 三档紧迫度元数据：统一走项目设计令牌（text-*/bg-*/border-*），
// dot 用 CSS 变量（light/dark 自动切换，修复旧版 'red-500' 非法颜色导致圆点透明）
const TIER_META = {
  critical: { labelKey: 'expiry_tierCritical', icon: XCircle, color: 'text-danger', bg: 'bg-danger', softBg: 'bg-danger-soft', dotVar: 'var(--color-danger)' },
  urgent:   { labelKey: 'expiry_tierUrgent', icon: AlertOctagon, color: 'text-warn', bg: 'bg-warn', softBg: 'bg-warn-soft', dotVar: 'var(--color-warn)' },
  warning:  { labelKey: 'expiry_tierWarning', icon: AlertTriangle, color: 'text-warn', bg: 'bg-warn', softBg: 'bg-warn-soft', dotVar: 'var(--color-primary)' }
}

function UrgencyBadge({ level, t }) {
  const m = TIER_META[level]
  if (!m) return null
  const Icon = m.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', m.softBg, m.color, 'border-border')}>
      <Icon size={11} />
      {t(m.labelKey)}
    </span>
  )
}

function sortKey(item) {
  if (!item.expiry_date) return { t: 2, d: 1e18 }
  const now = Date.now()
  const days = (item.expiry_date - now) / 86400000
  if (days < 0) return { t: 0, d: days }
  if (days <= 7) return { t: 1, d: days }
  return { t: 1.5, d: days }
}

export default function ExpiryAlerts({ dark, onNavigate }) {
  const { t, lang } = useI18n()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [filterTier, setFilterTier] = useState('all')
  const [sortMode, setSortMode] = useState('urgency')
  const [showExpired, setShowExpired] = useState(false)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    // 本页不展示图片，用轻量元数据查询（不含 photo 大字段）
    Promise.all([fetchItemsMeta(), fetchCategories()])
      .then(([its, cats]) => { setItems(its); setCategories(cats) })
      .catch((e) => setLoadError(e?.message || 'load failed'))
      .finally(() => setLoading(false))
  }, [])

  // key -> 分类对象映射（categoryDisplayName 需要分类对象而非 key 字符串）
  const catMap = useMemo(() => {
    const m = {}
    categories.forEach((c) => { m[c.key] = c })
    return m
  }, [categories])

  const filteredItems = useMemo(() => {
    let list = items.filter((it) => {
      if (keyword) {
        const kw = keyword.toLowerCase()
        const catName = categoryDisplayName(catMap[it.category], lang) || ''
        const searchable = `${it.name || ''} ${catName} ${it.location || ''} ${it.item_no || ''}`.toLowerCase()
        if (!searchable.includes(kw)) return false
      }
      if (!it.expiry_date) return false
      if (!showExpired && Date.now() > it.expiry_date) return false
      if (filterTier !== 'all' && urgencyLevel(it.expiry_date) !== filterTier) return false
      return true
    })
    if (sortMode === 'urgency') {
      list.sort((a, b) => {
        const sa = sortKey(a), sb = sortKey(b)
        if (sa.t !== sb.t) return sa.t - sb.t
        return sa.d - sb.d
      })
    } else if (sortMode === 'date') {
      list.sort((a, b) => (a.expiry_date || 0) - (b.expiry_date || 0))
    } else if (sortMode === 'name') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'))
    }
    return list
  }, [items, keyword, filterTier, sortMode, showExpired, catMap, lang])

  const filteredTierCounts = useMemo(() => {
    const m = { critical: 0, urgent: 0, warning: 0 }
    filteredItems.forEach((it) => {
      const lv = urgencyLevel(it.expiry_date)
      if (m[lv] !== undefined) m[lv]++
    })
    return m
  }, [filteredItems])

  const loadFailed = loadError && items.length === 0

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('items')}
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
            title={t('nav_back_all')}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-text-primary">{t('nav_expired')}</h1>
              <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">{filteredItems.length}</span>
            </div>
            <p className="text-[11px] text-text-tertiary">{t('nav_back_all')}</p>
          </div>
        </div>
      </div>

      {/* 预警摘要 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: 'critical', count: filteredTierCounts.critical },
          { key: 'urgent', count: filteredTierCounts.urgent },
          { key: 'warning', count: filteredTierCounts.warning },
        ].map(({ key, count }) => {
          const meta = TIER_META[key]
          const Icon = meta.icon
          const hasItems = count > 0
          const isActive = filterTier === key
          return (
            <motion.button
              key={key}
              whileTap={{ scale: 0.98 }}
              onClick={() => setFilterTier(filterTier === key ? 'all' : key)}
              aria-pressed={isActive}
              className={cn(
                'relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-smooth',
                isActive
                  ? `${meta.softBg} border-border ring-1 ring-primary/40`
                  : 'border-border bg-surface hover:bg-surface-hover'
              )}
            >
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                hasItems ? `${meta.bg} text-white` : 'bg-surface-hover text-text-tertiary'
              )}>
                <Icon size={16} />
              </div>
              <div className="flex-1">
                <div className="text-xs text-text-tertiary">{t(meta.labelKey)}</div>
                <div className="flex items-baseline gap-1">
                  <span className={cn('text-xl font-bold tabular-nums', hasItems ? meta.color : 'text-text-tertiary')}>{count}</span>
                  <span className="text-xs text-text-tertiary">{t('expiry_unit')}</span>
                </div>
              </div>
              {hasItems && !isActive && (
                <span
                  aria-hidden
                  className="no-anim-pulse-dot absolute right-2 top-2 h-2 w-2 rounded-full"
                  style={{ backgroundColor: meta.dotVar }}
                />
              )}
            </motion.button>
          )
        })}
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('expiry_searchPlaceholder')}
            className="w-full rounded-lg border border-border bg-surface py-2 pl-8 text-sm text-text-primary outline-none transition-smooth placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-text-secondary select-none transition-smooth hover:bg-surface-hover">
          <input
            type="checkbox"
            checked={showExpired}
            onChange={(e) => setShowExpired(e.target.checked)}
            className="accent-primary"
          />
          <span>{t('expiry_showExpired')}</span>
        </label>
        <div className="flex overflow-hidden rounded-lg border border-border">
          {['urgency', 'date', 'name'].map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-smooth',
                sortMode === mode ? 'bg-primary text-white' : 'bg-surface text-text-tertiary hover:bg-surface-hover hover:text-text-secondary'
              )}
            >
              {mode === 'urgency' ? t('expiry_sortUrgency') : mode === 'date' ? t('expiry_sortDate') : t('expiry_sortName')}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {loadFailed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <AlertTriangle size={28} className="text-warn" />
            <p className="text-sm text-text-secondary">{t('toast_loadFail', { msg: loadError })}</p>
            <button
              onClick={() => {
                setLoading(true); setLoadError(null)
                Promise.all([fetchItemsMeta(), fetchCategories()])
                  .then(([its, cats]) => { setItems(its); setCategories(cats) })
                  .catch((e) => setLoadError(e?.message || 'load failed'))
                  .finally(() => setLoading(false))
              }}
              className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-smooth hover:bg-primary-hover"
            >
              {t('btn_retry')}
            </button>
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-sm text-text-tertiary">{t('loading')}</div>
        ) : filteredItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-hover">
              <ShieldCheck size={32} className="text-text-tertiary" />
            </div>
            <p className="text-text-tertiary">
              {showExpired ? t('expiry_noAttention') : t('expiry_allSafe')}
            </p>
            {!showExpired && (
              <button
                onClick={() => setShowExpired(true)}
                className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-smooth hover:bg-primary-hover"
              >
                {t('expiry_viewExpired')}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence>
              {filteredItems.map((item, idx) => {
                const level = urgencyLevel(item.expiry_date)
                const meta = TIER_META[level] || null
                const daysInfo = expiryStatus(item.expiry_date)
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.25, delay: Math.min(idx * 0.015, 0.15), ease: EASE }}
                    className="group relative flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-smooth hover:shadow-md"
                  >
                    {meta && <div className={cn('h-8 w-1 shrink-0 rounded-full', meta.bg)} />}
                    <UrgencyBadge level={level} t={t} />
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-lg text-text-secondary">
                        {(item.name || '?')[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">{item.name}</div>
                        <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
                          <span className="rounded bg-surface-hover px-1 text-text-secondary">
                            {categoryDisplayName(catMap[item.category], lang) || item.category || '—'}
                          </span>
                          {item.quantity !== undefined && (
                            <>
                              <span>·</span>
                              <span>{t('expiry_qty')} {item.quantity}{item.consume_unit ? ` ${item.consume_unit}` : ''}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-xs text-text-tertiary">
                      <MapPin size={12} />
                      <span className="max-w-[120px] truncate">{item.location || '-'}</span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <div className="text-xs text-text-tertiary">{formatDate(item.expiry_date)}</div>
                      {daysInfo && daysInfo.tone === 'expired' && (
                        <span className="flex items-center gap-0.5 text-xs font-semibold text-danger">
                          {t('expiry_expiredDays', { n: Math.abs(daysInfo.days) })}
                        </span>
                      )}
                      {daysInfo && daysInfo.tone === 'soon' && (
                        <span className={cn('flex items-center gap-0.5 text-xs font-semibold', meta ? meta.color : 'text-warn')}>
                          <Clock size={10} />
                          {t('expiry_daysLeft', { n: daysInfo.days })}
                        </span>
                      )}
                      {daysInfo && daysInfo.tone === 'ok' && (
                        <span className="flex items-center gap-0.5 text-xs font-semibold text-primary">
                          <ShieldCheck size={10} />
                          {t('expiry_safe')}
                        </span>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
