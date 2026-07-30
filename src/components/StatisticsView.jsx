import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line,
  Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ComposedChart, ScatterChart, Scatter, ZAxis
} from 'recharts'
import {
  LayoutGrid, AlertTriangle, CalendarClock, Package, Boxes,
  BarChart2, PieChart as PieIcon, MapPin, TrendingUp,
  Activity, FolderOpen, Clock, CircleDollarSign, Hash,
  ChevronRight, Layers, ShoppingCart, Sparkles
} from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { fetchStatistics } from '../lib/api'
import { cn } from '../lib/cn'
import { EASE } from '../lib/motion'
import PageHeader from './PageHeader'

const COLORS = ['#10b981', '#14b8a6', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#84cc16', '#06b6d4', '#f97316', '#a855f7']
const EXPIRY_COLORS = { expired: '#ef4444', expiring7: '#f97316', expiring30: '#fbbf24', normal: '#22c55e', noExpiry: '#94a3b8' }

const TABS = [
  { key: 'overview', icon: LayoutGrid, labelKey: 'stats_overview', color: '#10b981' },
  { key: 'category', icon: PieIcon, labelKey: 'stats_byCategory', color: '#8b5cf6' },
  { key: 'location', icon: MapPin, labelKey: 'stats_byLocation', color: '#0ea5e9' },
  { key: 'expiry', icon: CalendarClock, labelKey: 'stats_byExpiry', color: '#f97316' },
  { key: 'stock', icon: AlertTriangle, labelKey: 'stats_byStock', color: '#ef4444' },
  { key: 'time', icon: TrendingUp, labelKey: 'stats_byTime', color: '#14b8a6' }
]

export default function StatisticsView({ onBack, animations = true }) {
  const { t, lang } = useI18n()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [subView, setSubView] = useState({ category: 'pie', location: 'bar', expiry: 'donut', stock: 'gauge', time: 'line' })

  useEffect(() => {
    setLoading(true)
    fetchStatistics()
      .then((d) => { setData(d); setError('') })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const total = data?.total || 0
  const totalQuantity = data?.totalQuantity || 0
  const lowStock = useMemo(() => (data?.stockStats || []).find((d) => d.key === 'low')?.count || 0, [data])
  const expired = useMemo(() => (data?.expiryStats || []).find((d) => d.key === 'expired')?.count || 0, [data])
  const expiring7 = useMemo(() => (data?.expiryStats || []).find((d) => d.key === 'expiring7')?.count || 0, [data])

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col bg-bg">
        <PageHeader title={t('stats_title')} onBack={onBack} />
        <div className="flex flex-1 items-center justify-center text-text-tertiary">
          <Activity size={28} className="mr-2 animate-spin" />
          {t('loading')}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen flex-col bg-bg">
        <PageHeader title={t('stats_title')} onBack={onBack} />
        <div className="flex flex-1 items-center justify-center text-danger">{error}</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-bg">
      <PageHeader title={t('stats_title')} onBack={onBack} />

      <main className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-7xl space-y-5">
          {/* KPI 卡片 */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard icon={<Package size={20} />} label={t('stat_items')} value={total} color="from-emerald-500 to-teal-500" delay={0} />
            <KpiCard icon={<Boxes size={20} />} label={t('stats_totalQuantity')} value={totalQuantity} color="from-sky-500 to-blue-500" delay={0.05} />
            <KpiCard icon={<AlertTriangle size={20} />} label={t('stat_lowStock')} value={lowStock} color="from-rose-500 to-red-500" delay={0.1} />
            <KpiCard icon={<CalendarClock size={20} />} label={t('stats_expiryAlert')} value={expired + expiring7} color="from-amber-500 to-orange-500" delay={0.15} />
          </div>

          {/* 选项卡 */}
          <div className="sticky top-0 z-20 -mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex gap-2 rounded-2xl border border-border bg-surface p-1.5 shadow-card">
              {TABS.map((tab) => {
                const Icon = tab.icon
                const active = activeTab === tab.key
                return (
                  <motion.button
                    key={tab.key}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'relative flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-smooth',
                      active ? 'text-white' : 'text-text-secondary hover:bg-surface-hover'
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="stats-tab-active"
                        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                        className="absolute inset-0 rounded-xl"
                        style={{ background: tab.color }}
                      />
                    )}
                    <Icon size={15} className="relative" />
                    <span className="relative">{t(tab.labelKey)}</span>
                  </motion.button>
                )
              })}
            </div>
          </div>

          {/* 内容区 */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {activeTab === 'overview' && <OverviewTab data={data} t={t} lang={lang} animations={animations} />}
              {activeTab === 'category' && <CategoryTab data={data} t={t} lang={lang} subView={subView.category} setSubView={(v) => setSubView((s) => ({ ...s, category: v }))} animations={animations} />}
              {activeTab === 'location' && <LocationTab data={data} t={t} lang={lang} subView={subView.location} setSubView={(v) => setSubView((s) => ({ ...s, location: v }))} animations={animations} />}
              {activeTab === 'expiry' && <ExpiryTab data={data} t={t} lang={lang} subView={subView.expiry} setSubView={(v) => setSubView((s) => ({ ...s, expiry: v }))} animations={animations} />}
              {activeTab === 'stock' && <StockTab data={data} t={t} lang={lang} subView={subView.stock} setSubView={(v) => setSubView((s) => ({ ...s, stock: v }))} animations={animations} />}
              {activeTab === 'time' && <TimeTab data={data} t={t} lang={lang} subView={subView.time} setSubView={(v) => setSubView((s) => ({ ...s, time: v }))} animations={animations} />}
            </motion.div>
          </AnimatePresence>

          <div className="h-6" />
        </div>
      </main>
    </div>
  )
}

/* ================= 选项卡内容 ================= */

function OverviewTab({ data, t, lang, animations }) {
  const categoryData = data?.categoryStats || []
  const expiryData = (data?.expiryStats || []).filter((d) => d.count > 0)
  const stockData = (data?.stockStats || []).filter((d) => d.count > 0)
  const timeData = data?.timeStats || []

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title={t('stats_byCategory')} icon={<PieIcon size={16} />} delay={0.1}>
          <MiniDonut data={categoryData.slice(0, 6)} nameKey={lang === 'en' ? 'name_en' : 'name'} />
        </ChartCard>
        <ChartCard title={t('stats_byExpiry')} icon={<CalendarClock size={16} />} delay={0.15}>
          <MiniDonut data={expiryData} nameKey={lang === 'en' ? 'name_en' : 'name'} fixedColors />
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title={t('stats_byStock')} icon={<AlertTriangle size={16} />} delay={0.2} className="lg:col-span-1">
          <MiniDonut data={stockData} nameKey={lang === 'en' ? 'name_en' : 'name'} fixedColors />
        </ChartCard>
        <ChartCard title={t('stats_byTime')} icon={<TrendingUp size={16} />} delay={0.25} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={timeData} t={t} />
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}

function CategoryTab({ data, t, lang, subView, setSubView, animations }) {
  const categoryData = data?.categoryStats || []
  const total = data?.total || 1

  const subTabs = [
    { key: 'pie', icon: PieIcon, label: t('stats_pie') },
    { key: 'bar', icon: BarChart2, label: t('stats_bar') },
    { key: 'donut', icon: CircleDollarSign, label: t('stats_donut') },
    { key: 'list', icon: Layers, label: t('stats_list') }
  ]

  return (
    <div className="space-y-4">
      <SubTabs tabs={subTabs} active={subView} onChange={setSubView} />
      <AnimatePresence mode="wait">
        <motion.div key={subView} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: EASE }}>
          {subView === 'pie' && (
            <ChartCard title={t('stats_categoryPie')} icon={<PieIcon size={16} />}>
              <ResponsiveContainer width="100%" height={420}>
                <PieChart>
                  <Pie data={categoryData} dataKey="count" nameKey={lang === 'en' ? 'name_en' : 'name'} outerRadius={160} paddingAngle={2} stroke="none" isAnimationActive animationBegin={100} animationDuration={500}>
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <ReTooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {subView === 'donut' && (
            <ChartCard title={t('stats_categoryDonut')} icon={<CircleDollarSign size={16} />}>
              <MiniDonut data={categoryData} nameKey={lang === 'en' ? 'name_en' : 'name'} size={420} inner={90} outer={150} showPercent />
            </ChartCard>
          )}
          {subView === 'bar' && (
            <ChartCard title={t('stats_categoryBar')} icon={<BarChart2 size={16} />}>
              <ResponsiveContainer width="100%" height={420}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 16, right: 24, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey={lang === 'en' ? 'name_en' : 'name'} type="category" width={110} tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <ReTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-primary-soft)' }} />
                  <Bar dataKey="count" radius={[0, 10, 10, 0]} isAnimationActive={animations} animationBegin={0} animationDuration={400} animationEasing="ease-out">
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {subView === 'list' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryData.map((c, i) => (
                <motion.div
                  key={c.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3, ease: EASE }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-card"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: COLORS[i % COLORS.length] }}>
                    <Hash size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{lang === 'en' ? c.name_en : c.name}</p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(c.count / total) * 100}%` }} transition={{ duration: 0.8, ease: EASE, delay: 0.2 }} className="h-full rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                  <span className="text-lg font-bold text-text-primary"><AnimatedNumber value={c.count} /></span>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function LocationTab({ data, t, lang, subView, setSubView }) {
  const locationData = data?.locationStats || []
  const total = data?.total || 1

  const subTabs = [
    { key: 'bar', icon: BarChart2, label: t('stats_bar') },
    { key: 'horizontal', icon: FolderOpen, label: t('stats_horizontal') },
    { key: 'treemap', icon: LayoutGrid, label: t('stats_grid') }
  ]

  return (
    <div className="space-y-4">
      <SubTabs tabs={subTabs} active={subView} onChange={setSubView} />
      <AnimatePresence mode="wait">
        <motion.div key={subView} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: EASE }}>
          {subView === 'bar' && (
            <ChartCard title={t('stats_locationBar')} icon={<BarChart2 size={16} />}>
              <ResponsiveContainer width="100%" height={420}>
                <BarChart data={locationData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="locGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} angle={locationData.length > 6 ? 30 : 0} textAnchor={locationData.length > 6 ? 'start' : 'middle'} height={locationData.length > 6 ? 60 : 30} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-primary-soft)' }} />
                  <Bar dataKey="count" fill="url(#locGrad2)" radius={[10, 10, 0, 0]} isAnimationActive animationDuration={500} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {subView === 'horizontal' && (
            <ChartCard title={t('stats_locationHorizontal')} icon={<FolderOpen size={16} />}>
              <div className="space-y-3">
                {locationData.map((loc, i) => (
                  <motion.div key={loc.name} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, duration: 0.35, ease: EASE }} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <MapPin size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="truncate font-medium text-text-primary">{loc.name}</span>
                        <span className="font-semibold text-text-secondary"><AnimatedNumber value={loc.count} /></span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${(loc.count / Math.max(...locationData.map((d) => d.count), 1)) * 100}%` }} transition={{ duration: 0.8, ease: EASE, delay: 0.15 }} className="h-full rounded-full bg-sky-500" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </ChartCard>
          )}
          {subView === 'treemap' && (
            <ChartCard title={t('stats_locationGrid')} icon={<LayoutGrid size={16} />}>
              <div className="flex flex-wrap gap-3">
                {locationData.map((loc, i) => {
                  const ratio = loc.count / Math.max(...locationData.map((d) => d.count), 1)
                  const size = Math.max(80, Math.round(ratio * 160))
                  return (
                    <motion.div
                      key={loc.name}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 20 }}
                      className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface p-3 text-center shadow-card"
                      style={{ width: size, height: size }}
                    >
                      <MapPin size={18} className="mb-1 text-sky-500" />
                      <span className="line-clamp-2 text-xs font-medium text-text-secondary">{loc.name}</span>
                      <span className="text-lg font-bold text-text-primary"><AnimatedNumber value={loc.count} /></span>
                    </motion.div>
                  )
                })}
              </div>
            </ChartCard>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function ExpiryTab({ data, t, lang, subView, setSubView, animations }) {
  const expiryData = (data?.expiryStats || []).filter((d) => d.count > 0)
  const items = data?.__rawItems || []

  const subTabs = [
    { key: 'donut', icon: CircleDollarSign, label: t('stats_donut') },
    { key: 'timeline', icon: Clock, label: t('stats_timeline') },
    { key: 'list', icon: ShoppingCart, label: t('stats_list') }
  ]

  const now = Date.now()
  const oneDay = 86400000
  const timeline = useMemo(() => {
    const buckets = { '<0': 0, '0-7': 0, '8-30': 0, '31-90': 0, '>90': 0 }
    items.forEach((it) => {
      if (!it.expiry_date) { buckets['>90']++; return }
      const days = Math.ceil((it.expiry_date - now) / oneDay)
      if (days < 0) buckets['<0']++
      else if (days <= 7) buckets['0-7']++
      else if (days <= 30) buckets['8-30']++
      else if (days <= 90) buckets['31-90']++
      else buckets['>90']++
    })
    return Object.entries(buckets).map(([range, count]) => ({ range, count, label: range.replace('<0', t('stats_expired')).replace('0-7', '≤7' + t('stats_days')).replace('8-30', '8-30' + t('stats_days')).replace('31-90', '31-90' + t('stats_days')).replace('>90', '>90' + t('stats_days')) }))
  }, [items, now, t])

  return (
    <div className="space-y-4">
      <SubTabs tabs={subTabs} active={subView} onChange={setSubView} />
      <AnimatePresence mode="wait">
        <motion.div key={subView} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: EASE }}>
          {subView === 'donut' && (
            <ChartCard title={t('stats_expiryDonut')} icon={<CircleDollarSign size={16} />}>
              <ResponsiveContainer width="100%" height={420}>
                <PieChart>
                  <Pie data={expiryData} dataKey="count" nameKey={lang === 'en' ? 'name_en' : 'name'} innerRadius={100} outerRadius={160} paddingAngle={3} stroke="none" isAnimationActive animationDuration={500}>
                    {expiryData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <ReTooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {subView === 'timeline' && (
            <ChartCard title={t('stats_expiryTimeline')} icon={<Clock size={16} />}>
              <ResponsiveContainer width="100%" height={420}>
                <BarChart data={timeline} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReTooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[10, 10, 0, 0]} isAnimationActive animationDuration={500}>
                    {timeline.map((entry, i) => <Cell key={i} fill={EXPIRY_COLORS[Object.keys(EXPIRY_COLORS)[i]] || COLORS[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {subView === 'list' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {expiryData.map((e, i) => (
                <motion.div key={e.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }} className="rounded-xl border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: e.color }}>
                      <CalendarClock size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{lang === 'en' ? e.name_en : e.name}</p>
                      <p className="text-2xl font-bold text-text-primary"><AnimatedNumber value={e.count} /></p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function StockTab({ data, t, lang, subView, setSubView, animations }) {
  const stockData = (data?.stockStats || []).filter((d) => d.count > 0)
  const lowStockItems = useMemo(() => (data?.__rawItems || []).filter((it) => it.min_quantity > 0 && it.quantity <= it.min_quantity).sort((a, b) => a.quantity - b.quantity), [data])

  const subTabs = [
    { key: 'gauge', icon: Activity, label: t('stats_gauge') },
    { key: 'donut', icon: PieIcon, label: t('stats_donut') },
    { key: 'list', icon: AlertTriangle, label: t('stats_lowStockList') }
  ]

  const low = stockData.find((d) => d.key === 'low')?.count || 0
  const ok = stockData.find((d) => d.key === 'ok')?.count || 0
  const total = low + ok || 1

  return (
    <div className="space-y-4">
      <SubTabs tabs={subTabs} active={subView} onChange={setSubView} />
      <AnimatePresence mode="wait">
        <motion.div key={subView} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: EASE }}>
          {subView === 'gauge' && (
            <ChartCard title={t('stats_stockGauge')} icon={<Activity size={16} />}>
              <div className="flex flex-col items-center justify-center py-6">
                <div className="relative h-56 w-56">
                  <svg viewBox="0 0 120 64" className="h-full w-full overflow-visible">
                    <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="var(--color-bg)" strokeWidth="12" strokeLinecap="round" />
                    <motion.path
                      d="M 10 60 A 50 50 0 0 1 110 60"
                      fill="none"
                      stroke="url(#gaugeGrad)"
                      strokeWidth="12"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: ok / total }}
                      transition={{ duration: 1.2, ease: EASE }}
                    />
                    <defs>
                      <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#ef4444" />
                        <stop offset="100%" stopColor="#22c55e" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-end pb-4">
                    <span className="text-3xl font-bold text-text-primary"><AnimatedNumber value={Math.round((ok / total) * 100)} />%</span>
                    <span className="text-xs text-text-tertiary">{t('stats_stockHealthy')}</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-6 text-sm">
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rose-500" />{t('stat_lowStock')} <strong>{low}</strong></span>
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" />{t('stats_sufficient')} <strong>{ok}</strong></span>
                </div>
              </div>
            </ChartCard>
          )}
          {subView === 'donut' && (
            <ChartCard title={t('stats_byStock')} icon={<PieIcon size={16} />}>
              <MiniDonut data={stockData} nameKey={lang === 'en' ? 'name_en' : 'name'} fixedColors size={420} />
            </ChartCard>
          )}
          {subView === 'list' && (
            <div className="space-y-3">
              {lowStockItems.length === 0 && <Empty text={t('stats_noLowStock')} />}
              {lowStockItems.map((it, i) => (
                <motion.div key={it.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, duration: 0.35 }} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-card">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{it.name}</p>
                    <p className="text-xs text-text-tertiary">{t('f_minQuantity')}: {it.min_quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-rose-500"><AnimatedNumber value={it.quantity} /></p>
                    <p className="text-[10px] text-text-tertiary">{t('f_quantity')}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function TimeTab({ data, t, lang, subView, setSubView }) {
  const timeData = data?.timeStats || []

  const subTabs = [
    { key: 'line', icon: TrendingUp, label: t('stats_line') },
    { key: 'area', icon: Activity, label: t('stats_area') },
    { key: 'bar', icon: BarChart2, label: t('stats_bar') },
    { key: 'dual', icon: Layers, label: t('stats_dual') }
  ]

  return (
    <div className="space-y-4">
      <SubTabs tabs={subTabs} active={subView} onChange={setSubView} />
      <AnimatePresence mode="wait">
        <motion.div key={subView} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: EASE }}>
          {subView === 'line' && (
            <ChartCard title={t('stats_timeLine')} icon={<TrendingUp size={16} />}>
              <ResponsiveContainer width="100%" height={420}>
                <LineChart data={timeData} margin={{ left: 8, right: 24, top: 24, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReTooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={24} />
                  <Line type="monotone" dataKey="created" name={t('stats_created')} stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 7 }} isAnimationActive animationDuration={600} />
                  <Line type="monotone" dataKey="updated" name={t('stats_updated')} stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6' }} activeDot={{ r: 7 }} isAnimationActive animationDuration={600} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {subView === 'area' && (
            <ChartCard title={t('stats_timeArea')} icon={<Activity size={16} />}>
              <ResponsiveContainer width="100%" height={420}>
                <AreaChart data={timeData} t={t} large />
              </ResponsiveContainer>
            </ChartCard>
          )}
          {subView === 'bar' && (
            <ChartCard title={t('stats_timeBar')} icon={<BarChart2 size={16} />}>
              <ResponsiveContainer width="100%" height={420}>
                <BarChart data={timeData} margin={{ left: 8, right: 24, top: 24, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReTooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={24} />
                  <Bar dataKey="created" name={t('stats_created')} fill="#10b981" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={500} />
                  <Bar dataKey="updated" name={t('stats_updated')} fill="#8b5cf6" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={500} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {subView === 'dual' && (
            <ChartCard title={t('stats_timeDual')} icon={<Layers size={16} />}>
              <ResponsiveContainer width="100%" height={420}>
                <ComposedChart data={timeData} margin={{ left: 8, right: 24, top: 24, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReTooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="top" height={24} />
                  <Bar dataKey="created" name={t('stats_created')} fill="#10b981" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={500} />
                  <Line type="monotone" dataKey="updated" name={t('stats_updated')} stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 7 }} isAnimationActive animationDuration={600} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ================= 通用组件 ================= */

function KpiCard({ icon, label, value, color, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
      className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-card"
    >
      <div className={cn('absolute right-0 top-0 h-full w-1.5 bg-gradient-to-b', color)} />
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', color)}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium text-text-tertiary">{label}</p>
          <p className="text-2xl font-bold tracking-tight text-text-primary"><AnimatedNumber value={value} /></p>
        </div>
      </div>
    </motion.div>
  )
}

function ChartCard({ title, children, icon, delay, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE, delay: delay ?? 0 }}
      className={cn('rounded-2xl border border-border bg-surface p-4 shadow-card', className)}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</span>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="chart-fade-in">{children}</div>
    </motion.div>
  )
}

function SubTabs({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = active === tab.key
        return (
          <motion.button
            key={tab.key}
            whileTap={{ scale: 0.96 }}
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-smooth',
              isActive ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
            )}
          >
            <Icon size={13} />
            {tab.label}
          </motion.button>
        )
      })}
    </div>
  )
}

function MiniDonut({ data, nameKey, fixedColors, size = 320, inner = 70, outer = 110, showPercent = false }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1
  return (
    <ResponsiveContainer width="100%" height={size}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey={nameKey} innerRadius={inner} outerRadius={outer} paddingAngle={2} stroke="none" isAnimationActive animationBegin={100} animationDuration={500}>
          {data.map((entry, i) => <Cell key={i} fill={fixedColors ? entry.color || COLORS[i % COLORS.length] : COLORS[i % COLORS.length]} />)}
        </Pie>
        <ReTooltip content={<CustomTooltip showPercent={showPercent} total={total} />} />
        <Legend verticalAlign="bottom" height={36} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  )
}

function AreaChart({ data, t, large = false }) {
  return (
    <LineChart data={data} margin={{ left: 8, right: 24, top: 24, bottom: 8 }}>
      <defs>
        <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
        </linearGradient>
        <linearGradient id="updatedGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
      <XAxis dataKey="month" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
      <ReTooltip content={<CustomTooltip />} />
      <Legend verticalAlign="top" height={24} />
      <Area type="monotone" dataKey="created" name={t('stats_created')} stroke="#10b981" strokeWidth={3} fill="url(#createdGrad)" dot={{ r: large ? 4 : 3, fill: '#10b981' }} activeDot={{ r: large ? 7 : 6 }} isAnimationActive animationDuration={600} />
      <Area type="monotone" dataKey="updated" name={t('stats_updated')} stroke="#8b5cf6" strokeWidth={3} fill="url(#updatedGrad)" dot={{ r: large ? 4 : 3, fill: '#8b5cf6' }} activeDot={{ r: large ? 7 : 6 }} isAnimationActive animationDuration={600} />
    </LineChart>
  )
}

function CustomTooltip({ active, payload, label, showPercent, total }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-xl border border-border bg-surface p-2.5 text-xs shadow-float">
      {label && <p className="mb-1 font-medium text-text-primary">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="font-semibold text-text-primary">{p.value}{showPercent && total ? ` (${((p.value / total) * 100).toFixed(1)}%)` : ''}</span>
        </div>
      ))}
    </div>
  )
}

function Empty({ text }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-text-tertiary">
      <LayoutGrid size={36} strokeWidth={1.4} className="mb-2 opacity-40" />
      <span className="text-xs">{text || '暂无数据'}</span>
    </div>
  )
}

function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)
  const startRef = useRef(null)

  useEffect(() => {
    const duration = 900
    const start = performance.now()
    startRef.current = start
    let raf
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(value * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return <span ref={ref}>{display}</span>
}
