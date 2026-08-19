import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutGrid,
  MapPin,
  Settings,
  ChevronRight,
  ChevronUp,
  AlertTriangle as AlertTriangleIcon,
  Folder,
  Boxes,
  BarChart3,
  HelpCircle,
  Sparkles,
  Image
} from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName, buildLocationTree } from '../lib/api'
import { getCategoryIcon } from '../lib/categoryIcons'
import { cn } from '../lib/cn'
import { EASE } from '../lib/motion'

function Logo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="1024" rx="240" fill="url(#sidebar-logo-gradient)" />
      <rect x="284" y="424" width="456" height="48" rx="24" fill="currentColor" />
      <rect x="464" y="400" width="96" height="96" rx="32" fill="currentColor" />
      <defs>
        <linearGradient id="sidebar-logo-gradient" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10b981" />
          <stop offset="0.55" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function Sidebar({
  collapsed,
  activeCategory,
  onSelectCategory,
  activeLocation,
  onSelectLocation,
  counts,
  categories,
  locations,
  locationCounts,
  lang,
  onOpenSettings,
  onOpenStatistics,
  onOpenHelp,
  onOpenMaterials,
  onOpenLocationMap,
  activeView,
  showExpired = false,
  onToggleExpired,
  onClearLocation
}) {
  const { t } = useI18n()
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0)
  const locTree = buildLocationTree(locations)

  if (collapsed) {
    return (
      <motion.aside
        initial={false}
        animate={{ width: 64 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="flex shrink-0 flex-col border-r border-border bg-surface"
      >
        <div className="drag-region flex h-14 items-center justify-center border-b border-border">
          <div className="text-white">
            <Logo size={28} />
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-3">
          <IconButton
            active={activeView === 'help'}
            onClick={onOpenHelp}
            icon={<HelpCircle size={18} />}
            label={t('nav_help')}
          />
          <div className="my-1 h-px w-7 bg-border" />
          <IconButton
            active={activeCategory === '' && activeLocation.length === 0}
            onClick={() => onSelectCategory('')}
            icon={<LayoutGrid size={18} />}
            label={t('nav_all')}
            badge={totalCount}
          />
          {categories.map((c) => (
            <IconButton
              key={c.id}
              active={activeCategory === c.key}
              onClick={() => onSelectCategory(activeCategory === c.key ? '' : c.key)}
              icon={<CategoryIcon category={c} />}
              label={categoryDisplayName(c, lang)}
              badge={counts[c.key] || 0}
            />
          ))}
          <IconButton
            active={showExpired}
            onClick={onToggleExpired}
            icon={
              <span className={cn(showExpired && 'text-danger')}><AlertTriangleIcon size={18} /></span>
            }
            label={t('filter_expired')}
          />
        </div>

        <div className="flex flex-col items-center gap-1 border-t border-border py-2">
          <IconButton active={activeView === 'materials'} onClick={onOpenMaterials} icon={<Image size={18} />} label={t('nav_materials')} />
          <IconButton active={activeView === 'locationMap'} onClick={onOpenLocationMap} icon={<MapPin size={18} />} label={t('nav_locationMap')} />
          <IconButton active={activeView === 'statistics'} onClick={onOpenStatistics} icon={<BarChart3 size={18} />} label={t('nav_statistics')} />
          <IconButton active={activeView === 'settings'} onClick={onOpenSettings} icon={<Settings size={18} />} label={t('nav_settings')} />
        </div>
      </motion.aside>
    )
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: 256 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex w-64 shrink-0 flex-col border-r border-border bg-surface"
    >
      <div className="drag-region flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="text-white">
          <Logo size={28} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight text-text-primary">{t('appTitle')}</div>
          <div className="text-[11px] text-text-tertiary">{t('appSubtitle')}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {/* 常见问题 & 新手指南 */}
        <button
          onClick={onOpenHelp}
          className={cn(
            'group mb-3 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-smooth',
            activeView === 'help'
              ? 'border-primary/30 bg-primary-soft text-primary'
              : 'border-primary/20 bg-primary-soft/60 text-primary hover:bg-primary-soft hover:shadow-sm'
          )}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/60 dark:bg-white/10">
            <HelpCircle size={16} />
          </span>
          <span className="flex-1 text-left">{t('nav_help')}</span>
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">?</span>
        </button>

        {/* 分类 */}
        <div className="px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary/80">
          {t('nav_categories')}
        </div>
        <NavRow
          active={activeCategory === '' && activeLocation.length === 0}
          onClick={() => onSelectCategory('')}
          icon={<LayoutGrid size={16} />}
          label={t('nav_all')}
          badge={totalCount}
        />
        {categories.map((c) => {
          const active = activeCategory === c.key
          const count = counts[c.key] || 0
          return (
            <NavRow
              key={c.id}
              active={active}
              onClick={() => onSelectCategory(active ? '' : c.key)}
              icon={<CategoryIcon category={c} size={16} />}
              label={categoryDisplayName(c, lang)}
              badge={count}
            />
          )
        })}
        <button
          onClick={onOpenExpiryAlerts}
          className={cn(
            'relative mb-0.5 flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-sm transition-smooth',
            activeView === 'expiryAlerts' ? 'font-medium text-danger' : 'text-text-secondary hover:bg-surface-hover'
          )}
        >
          {activeView === 'expiryAlerts' && (
            <motion.span
              layoutId="sidebar-active-pill"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="absolute inset-0 rounded-xl bg-danger/10"
            />
          )}
          <span className="relative flex min-w-0 items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center">
              <AlertTriangleIcon size={16} />
            </span>
            <span className="truncate">{t('filter_expired')}</span>
          </span>
        </button>

        {/* 位置 */}
        {activeLocation && activeLocation.length > 0 ? (
          <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs text-text-secondary hover:text-text-primary">
            <button
              onClick={onClearLocation}
              className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-primary transition-smooth hover:bg-primary-soft"
            >
              <ChevronUp size={13} />
              <span>{t('nav_back_all')}</span>
            </button>
          </div>
        ) : null}
        <div className="mt-4 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary/80">
          {t('nav_locations')}
        </div>
        {locTree.length === 0 ? (
          <div className="px-3 py-2 text-xs text-text-tertiary/70">{t('loc_empty')}</div>
        ) : (
          locTree.map((node) => (
            <LocationNode
              key={node.id}
              node={node}
              depth={0}
              parentPath={[]}
              activeLocation={activeLocation}
              onSelectLocation={onSelectLocation}
              locationCounts={locationCounts}
            />
          ))
        )}
      </div>

      <button
        onClick={onOpenMaterials}
        className={cn(
          'group flex items-center gap-2.5 border-t border-border px-4 py-2.5 text-sm transition-smooth hover:bg-surface-hover hover:text-text-primary',
          activeView === 'materials' ? 'bg-primary-soft font-medium text-primary' : 'text-text-secondary'
        )}
      >
        <Image size={16} className="transition-transform group-hover:scale-110" />
        {t('nav_materials')}
      </button>
      <button
        onClick={onOpenLocationMap}
        className={cn(
          'group flex items-center gap-2.5 border-t border-border px-4 py-2.5 text-sm transition-smooth hover:bg-surface-hover hover:text-text-primary',
          activeView === 'locationMap' ? 'bg-primary-soft font-medium text-primary' : 'text-text-secondary'
        )}
      >
        <MapPin size={16} className="transition-transform group-hover:scale-110" />
        {t('nav_locationMap')}
      </button>
      <button
        onClick={onOpenStatistics}
        className={cn(
          'group flex items-center gap-2.5 border-t border-border px-4 py-2.5 text-sm transition-smooth hover:bg-surface-hover hover:text-text-primary',
          activeView === 'statistics' ? 'bg-primary-soft font-medium text-primary' : 'text-text-secondary'
        )}
      >
        <BarChart3 size={16} className="transition-transform group-hover:scale-110" />
        {t('nav_statistics')}
      </button>
      <button
        onClick={onOpenSettings}
        className={cn(
          'group flex items-center gap-2.5 border-t border-border px-4 py-2.5 text-sm transition-smooth hover:bg-surface-hover hover:text-text-primary',
          activeView === 'settings' ? 'bg-primary-soft font-medium text-primary' : 'text-text-secondary'
        )}
      >
        <Settings size={16} className="transition-transform group-hover:rotate-45" />
        {t('nav_settings')}
      </button>
      <div className="flex items-center gap-1.5 px-4 pb-2.5 text-[10px] leading-relaxed text-text-tertiary/70">
        <Boxes size={11} className="shrink-0" />
        {t('sidebar_localBackup')}
      </div>
    </motion.aside>
  )
}

function IconButton({ active, onClick, icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-xl transition-smooth',
        active ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-surface-hover'
      )}
    >
      {icon}
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-surface px-1 text-[9px] font-semibold text-text-secondary shadow-sm ring-1 ring-border">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function NavRow({ active, onClick, icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative mb-0.5 flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-sm transition-smooth',
        active ? 'font-medium text-primary' : 'text-text-secondary hover:bg-surface-hover'
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-pill"
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className="absolute inset-0 rounded-xl bg-primary-soft"
        />
      )}
      <span className="relative flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className={cn('relative shrink-0', active ? 'text-primary' : 'text-text-tertiary')}>
        <span className={cn(
          'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-smooth',
          active
            ? 'bg-primary/15 text-primary'
            : badge > 0 ? 'bg-surface-hover text-text-secondary' : ''
        )}>
          {badge}
        </span>
      </span>
    </button>
  )
}

function CategoryIcon({ category, size = 18 }) {
  const Icon = getCategoryIcon(category)
  return <Icon size={size} strokeWidth={2} />
}

function LocationNode({ node, depth, parentPath, activeLocation, onSelectLocation, locationCounts }) {
  const [open, setOpen] = useState(depth < 1)
  const hasChildren = node.children && node.children.length > 0

  const path = [...parentPath, node.name]
  const pathKey = path.join(' > ')

  const activeKey = activeLocation.join(' > ')
  const isOnActivePath = activeKey.startsWith(pathKey)
  const isActive = isOnActivePath && activeLocation.length >= path.length
  const isSelected = activeLocation.length === path.length && isActive
  const count = locationCounts[pathKey] || 0

  useEffect(() => {
    if (isActive && hasChildren) setOpen(true)
  }, [isActive, hasChildren])

  return (
    <div>
      <div
        className={cn(
          'group relative mb-0.5 flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-sm transition-smooth',
          isSelected ? 'bg-primary-soft font-medium text-primary' : 'text-text-secondary hover:bg-surface-hover'
        )}
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
      >
        {isSelected && depth === 0 && (
          <motion.span
            layoutId="sidebar-loc-active"
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="absolute inset-0 rounded-xl bg-primary-soft"
          />
        )}
        <button
          onClick={() => onSelectLocation(isSelected ? [] : path)}
          className="relative flex min-w-0 flex-1 items-center gap-1.5 text-left"
          title={pathKey}
        >
          <Folder size={14} className={cn('shrink-0', isSelected ? 'text-primary' : 'text-text-tertiary')} />
          <span className="truncate">{node.name}</span>
        </button>
        <div className="relative flex shrink-0 items-center gap-1">
          <span className="text-xs tabular-nums text-text-tertiary/80">{count}</span>
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setOpen((o) => !o)
              }}
              className="flex h-5 w-5 items-center justify-center rounded-md text-text-tertiary transition-smooth hover:bg-surface-active hover:text-text-secondary"
            >
              <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2, ease: EASE }}>
                <ChevronRight size={13} />
              </motion.span>
            </button>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {hasChildren && open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.05 } }
              }}
            >
              {node.children.map((c) => (
                <motion.div
                  initial={{ height: 0, opacity: 0, x: -6 }}
                  animate={{ height: 'auto', opacity: 1, x: 0 }}
                  exit={{ height: 0, opacity: 0, x: -6 }}
                  transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                  key={c.id}
                >
                  <LocationNode
                    key={c.id}
                    node={c}
                    depth={depth + 1}
                    parentPath={path}
                    activeLocation={activeLocation}
                    onSelectLocation={onSelectLocation}
                    locationCounts={locationCounts}
                  />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
