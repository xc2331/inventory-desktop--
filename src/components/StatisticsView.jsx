import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line,
  Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts'
import {
  LayoutGrid, AlertTriangle, CalendarClock, Package,
  BarChart2, PieChart as PieIcon, MapPin, TrendingUp,
  Activity, Boxes
} from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { fetchStatistics } from '../lib/api'
import { cn } from '../lib/cn'
import { EASE } from '../lib/motion'
import PageHeader from './PageHeader'

const COLORS = ['#10b981', '#14b8a6', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#84cc16', '#06b6d4']
const GLASS_COLORS = ['rgba(16,185,129,0.85)', 'rgba(20,184,166,0.85)', 'rgba(14,165,233,0.85)', 'rgba(139,92,246,0.85)', 'rgba(245,158,11,0.85)', 'rgba(239,68,68,0.85)', 'rgba(236,72,153,0.85)', 'rgba(99,102,241,0.85)']

export default function StatisticsView({ onBack }) {
  const { t, lang } = useI18n()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetchStatistics()
      .then((d) => {
        setData(d)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const l = (zh, en) => (lang === 'en' ? en : zh)

  const categoryData = useMemo(() => data?.categoryStats || [], [data])
  const locationData = useMemo(() => data?.locationStats || [], [data])
  const expiryData = useMemo(() => (data?.expiryStats || []).filter((d) => d.count > 0), [data])
  const stockData = useMemo(() => (data?.stockStats || []).filter((d) => d.count > 0), [data])
  const timeData = useMemo(() => data?.timeStats || [], [data])
  const quantityData = useMemo(() => data?.quantityStats || [], [data])

  const totalExpired = useMemo(
    () => (data?.expiryStats || []).reduce((s, it) => (it.key === 'expired' ? s + it.count : s), 0),
    [data]
  )
  const totalExpiring7 = useMemo(
    () => (data?.expiryStats || []).reduce((s, it) => (it.key === 'expiring7' ? s + it.count : s), 0),
    [data]
  )

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
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {/* KPI 卡片 */}
          <KpiCard
            icon={<Package size={20} />}
            label={t('stat_items')}
            value={data?.total || 0}
            color="from-emerald-500 to-teal-500"
            delay={0}
          />
          <KpiCard
            icon={<Boxes size={20} />}
            label={t('stats_totalQuantity')}
            value={data?.totalQuantity || 0}
            color="from-sky-500 to-blue-500"
            delay={0.05}
          />
          <KpiCard
            icon={<AlertTriangle size={20} />}
            label={t('stat_lowStock')}
            value={(data?.stockStats || []).find((d) => d.key === 'low')?.count || 0}
            color="from-rose-500 to-red-500"
            delay={0.1}
          />
          <KpiCard
            icon={<CalendarClock size={20} />}
            label={t('stats_expiryAlert')}
            value={totalExpired + totalExpiring7}
            color="from-amber-500 to-orange-500"
            delay={0.15}
          />
        </div>

        {/* 分类饼图 + 柱状图 */}
        <div className="mx-auto mt-5 grid max-w-7xl grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCard icon={<PieIcon size={16} />} title={t('stats_byCategory')} delay={0.2}>
            {categoryData.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <defs>
                    {categoryData.map((_, i) => (
                      <linearGradient key={i} id={`catGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.6} />
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={categoryData}
                    dataKey="count"
                    nameKey={lang === 'en' ? 'name_en' : 'name'}
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={`cell-${i}`} fill={`url(#catGrad${i})`} />
                    ))}
                  </Pie>
                  <ReTooltip content={<CustomTooltip l={l} />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard icon={<BarChart2 size={16} />} title={t('stats_categoryBar')} delay={0.25}>
            {categoryData.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={categoryData.slice(0, 10)} layout="vertical" margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey={lang === 'en' ? 'name_en' : 'name'}
                    type="category"
                    width={90}
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ReTooltip content={<CustomTooltip l={l} />} cursor={{ fill: 'var(--color-primary-soft)' }} />
                  <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                    {categoryData.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* 过期 + 库存 环形图 */}
        <div className="mx-auto mt-5 grid max-w-7xl grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCard icon={<CalendarClock size={16} />} title={t('stats_byExpiry')} delay={0.3}>
            {expiryData.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={expiryData}
                    dataKey="count"
                    nameKey={lang === 'en' ? 'name_en' : 'name'}
                    innerRadius={70}
                    outerRadius={105}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {expiryData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <ReTooltip content={<CustomTooltip l={l} />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard icon={<AlertTriangle size={16} />} title={t('stats_byStock')} delay={0.35}>
            {stockData.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stockData}
                    dataKey="count"
                    nameKey={lang === 'en' ? 'name_en' : 'name'}
                    innerRadius={70}
                    outerRadius={105}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {stockData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <ReTooltip content={<CustomTooltip l={l} />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* 位置柱状图 */}
        <div className="mx-auto mt-5 max-w-7xl">
          <ChartCard icon={<MapPin size={16} />} title={t('stats_byLocation')} delay={0.4}>
            {locationData.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={locationData} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="locGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.35} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                    angle={locationData.length > 6 ? 30 : 0}
                    textAnchor={locationData.length > 6 ? 'start' : 'middle'}
                    height={locationData.length > 6 ? 60 : 30}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReTooltip content={<CustomTooltip l={l} />} cursor={{ fill: 'var(--color-primary-soft)' }} />
                  <Bar dataKey="count" fill="url(#locGrad)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* 时间趋势折线 */}
        <div className="mx-auto mt-5 max-w-7xl">
          <ChartCard icon={<TrendingUp size={16} />} title={t('stats_byTime')} delay={0.45}>
            {timeData.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={timeData} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
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
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReTooltip content={<CustomTooltip l={l} />} />
                  <Legend verticalAlign="top" height={24} />
                  <Area type="monotone" dataKey="created" name={t('stats_created')} stroke="#10b981" strokeWidth={3} fill="url(#createdGrad)" dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 6 }} />
                  <Area type="monotone" dataKey="updated" name={t('stats_updated')} stroke="#8b5cf6" strokeWidth={3} fill="url(#updatedGrad)" dot={{ r: 3, fill: '#8b5cf6' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* 数量 Top 15 雷达图 */}
        <div className="mx-auto mt-5 max-w-7xl">
          <ChartCard icon={<Activity size={16} />} title={t('stats_quantityRadar')} delay={0.5}>
            {quantityData.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={380}>
                <RadarChart data={quantityData} outerRadius="70%">
                  <PolarGrid stroke="var(--color-border)" />
                  <PolarAngleAxis
                    dataKey="name"
                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 10 }}
                  />
                  <PolarRadiusAxis tick={{ fill: 'var(--color-text-tertiary)', fontSize: 10 }} axisLine={false} />
                  <ReTooltip content={<CustomTooltip l={l} />} />
                  <Radar
                    name={t('stats_quantity')}
                    dataKey="quantity"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="#f59e0b"
                    fillOpacity={0.35}
                  />
                  <Radar
                    name={t('f_minQuantity')}
                    dataKey="min"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="#ef4444"
                    fillOpacity={0.15}
                  />
                  <Legend verticalAlign="top" height={24} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <div className="mx-auto h-8 max-w-7xl" />
      </main>
    </div>
  )
}

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
          <p className="text-2xl font-bold tracking-tight text-text-primary">{value}</p>
        </div>
      </div>
    </motion.div>
  )
}

function ChartCard({ icon, title, children, delay, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE, delay }}
      className={cn('rounded-2xl border border-border bg-surface p-4 shadow-card', className)}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</span>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="text-text-secondary">{children}</div>
    </motion.div>
  )
}

function CustomTooltip({ active, payload, label, l }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="rounded-xl border border-border bg-surface p-2.5 text-xs shadow-float">
      {label && <p className="mb-1 font-medium text-text-primary">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="font-semibold text-text-primary">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function Empty() {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-text-tertiary">
      <LayoutGrid size={36} strokeWidth={1.4} className="mb-2 opacity-40" />
      <span className="text-xs">暂无数据</span>
    </div>
  )
}
