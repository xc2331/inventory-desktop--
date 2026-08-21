import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  XCircle, AlertOctagon, AlertTriangle, Clock, ChevronRight, ArrowLeft,
  ShieldCheck, MapPin, Search
} from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { fetchAllItems, fetchCategories, fetchItemsTotal } from '../lib/api'
import { expiryStatus } from '../lib/utils'
import { formatDate } from '../lib/format'
import { categoryDisplayName } from '../lib/api'
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

const TIER_META = {
  critical: { label: '已过期', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500', softBg: 'bg-red-500/10', border: 'border-red-200' },
  urgent:   { label: '3 天内', icon: AlertOctagon, color: 'text-orange-500', bg: 'bg-orange-500', softBg: 'bg-orange-500/10', border: 'border-orange-200' },
  warning:  { label: '7 天内', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500', softBg: 'bg-amber-500/10', border: 'border-amber-200' },
}

function UrgencyBadge({ level }) {
  const m = TIER_META[level]
  if (!m) return null
  const Icon = m.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border', m.softBg, m.color, m.border)}>
      <Icon size={11} />
      {m.label}
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
  const { t } = useI18n()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterTier, setFilterTier] = useState('all')
  const [sortMode, setSortMode] = useState('urgency')
  const [showExpired, setShowExpired] = useState(false)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    Promise.all([fetchAllItems(), fetchCategories()])
      .then(([its, cats]) => { setItems(its); setCategories(cats) })
      .finally(() => setLoading(false))
  }, [])

  const filteredItems = useMemo(() => {
    let list = items.filter((it) => {
      if (keyword) {
        const kw = keyword.toLowerCase()
        const searchable = `${it.name || ''} ${categoryDisplayName(it.category, categories, 'zh_CN') || ''} ${it.location || ''} ${it.item_no || ''}`.toLowerCase()
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
  }, [items, keyword, filterTier, sortMode, showExpired, categories])

  const filteredTierCounts = useMemo(() => {
    const m = { critical: 0, urgent: 0, warning: 0 }
    filteredItems.forEach((it) => {
      const lv = urgencyLevel(it.expiry_date)
      if (m[lv] !== undefined) m[lv]++
    })
    return m
  }, [filteredItems])

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
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">{filteredItems.length}</span>
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
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setFilterTier(filterTier === key ? 'all' : key)}
              className={cn(
                'relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-smooth',
                isActive ? `${meta.softBg} ${meta.border} ring-1 ${meta.border}` : 'border-border bg-card'
              )}
            >
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                hasItems ? `${meta.bg} text-white` : 'bg-muted text-muted-foreground'
              )}>
                <Icon size={16} />
              </div>
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">{meta.label}</div>
                <div className="flex items-baseline gap-1">
                  <span className={cn('text-xl font-bold tabular-nums', hasItems ? meta.color : 'text-muted-foreground')}>{count}</span>
                  <span className="text-xs text-muted-foreground">件</span>
                </div>
              </div>
              {hasItems && (
                <motion.div
                  className="absolute right-2 top-2 h-2 w-2 rounded-full"
                  style={{ backgroundColor: meta.color.replace('text-', '') }}
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </motion.button>
          )
        })}
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索物品…"
            className="w-full rounded-lg border border-border bg-input py-2 pl-8 text-sm outline-none transition-smooth focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-input px-2.5 py-2 text-sm select-none transition-smooth hover:bg-background">
          <input
            type="checkbox"
            checked={showExpired}
            onChange={(e) => setShowExpired(e.target.checked)}
            className="accent-primary"
          />
          <span>显示已过期</span>
        </label>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {['urgency', 'date', 'name'].map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-smooth',
                sortMode === mode ? 'bg-primary text-primary-foreground' : 'bg-input text-muted-foreground hover:bg-background'
              )}
            >
              {mode === 'urgency' ? '紧迫度' : mode === 'date' ? '日期' : '名称'}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <ShieldCheck size={32} className="text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              {showExpired ? '没有物品需要关注 ✓' : '全部物品都在安全期内 ✓'}
            </p>
            {!showExpired && (
              <button
                onClick={() => setShowExpired(true)}
                className="mt-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-smooth hover:bg-primary/90"
              >
                查看已过期物品
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
                    transition={{ duration: 0.25, delay: idx * 0.015, ease: EASE }}
                    className="group relative flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-smooth hover:shadow-md"
                  >
                    {meta && <div className={cn('h-8 w-1 rounded-full shrink-0', meta.bg)} />}
                    <UrgencyBadge level={level} />
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                        {(item.name || '?')[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{item.name}</div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="rounded bg-muted px-1">{categoryDisplayName(item.category, categories, 'zh_CN')}</span>
                          {item.quantity !== undefined && (
                            <>
                              <span>·</span>
                              <span>数量 {item.quantity}{item.consume_unit ? ` ${item.consume_unit}` : ''}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <MapPin size={12} />
                      <span className="max-w-[120px] truncate">{item.location || '-'}</span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <div className="text-xs text-muted-foreground">{formatDate(item.expiry_date)}</div>
                      {daysInfo && daysInfo.tone === 'expired' && (
                        <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500">
                          已过期 {Math.abs(daysInfo.days)} 天
                        </span>
                      )}
                      {daysInfo && daysInfo.tone === 'soon' && (
                        <span className={cn('flex items-center gap-0.5 text-xs font-semibold', meta ? meta.color : '')}>
                          <Clock size={10} />
                          {daysInfo.days} 天
                        </span>
                      )}
                      {daysInfo && daysInfo.tone === 'ok' && (
                        <span className="flex items-center gap-0.5 text-xs text-emerald-500">
                          <ShieldCheck size={10} />
                          安全
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