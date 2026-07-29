import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutGrid,
  MapPin,
  Settings,
  ChevronRight,
  Folder,
  ChevronLeft,
  Boxes,
  Home
} from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName, buildLocationTree } from '../lib/api'
import { getCategoryIcon } from '../lib/categoryIcons'
import { cn } from '../lib/cn'
import { EASE } from '../lib/motion'

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  activeCategory,
  onSelectCategory,
  activeLocation,
  onSelectLocation,
  counts,
  categories,
  locations,
  locationCounts,
  lang,
  onOpenSettings
}) {
  const { t } = useI18n()
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0)
  const locTree = buildLocationTree(locations)

  if (collapsed) {
    return (
      <motion.aside
        initial={{ width: 256 }}
        animate={{ width: 64 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="flex shrink-0 flex-col border-r border-border bg-surface"
      >
        <div className="flex h-[66px] items-center justify-center border-b border-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm">
            <Home size={20} strokeWidth={2.2} />
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-3">
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
            active={activeLocation.length > 0}
            onClick={onToggleCollapse}
            icon={<MapPin size={18} />}
            label={t('nav_locations')}
          />
        </div>

        <div className="flex flex-col items-center gap-1 border-t border-border py-2">
          <IconButton active={false} onClick={onOpenSettings} icon={<Settings size={18} />} label={t('nav_settings')} />
          <IconButton active={false} onClick={onToggleCollapse} icon={<ChevronLeft size={18} />} label={t('close')} />
        </div>
      </motion.aside>
    )
  }

  return (
    <motion.aside
      initial={{ width: 64 }}
      animate={{ width: 256 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex w-64 shrink-0 flex-col border-r border-border bg-surface"
    >
      <div className="flex items-center justify-between px-5 py-[18px]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm">
            <Home size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight text-text-primary">{t('appTitle')}</div>
            <div className="text-[11px] text-text-tertiary">{t('appSubtitle')}</div>
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-secondary"
          title={t('close')}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {/* 分类 */}
        <div className="mt-2 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
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

        {/* 位置 */}
        <div className="mt-4 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
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
        onClick={onOpenSettings}
        className="group flex items-center gap-2.5 border-t border-border px-5 py-3 text-sm text-text-secondary transition-smooth hover:bg-surface-hover hover:text-text-primary"
      >
        <Settings size={16} className="transition-transform group-hover:rotate-45" />
        {t('nav_settings')}
      </button>
      <div className="flex items-center gap-1.5 px-5 pb-3 text-[11px] leading-relaxed text-text-tertiary">
        <Boxes size={12} className="shrink-0" />
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
        'relative flex h-10 w-10 items-center justify-center rounded-xl transition-smooth',
        active ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-surface-hover'
      )}
    >
      {icon}
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-surface px-1 text-[10px] font-semibold text-text-secondary shadow-sm ring-1 ring-border">
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
        'relative mb-0.5 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-smooth',
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
      <span className="relative flex min-w-0 items-center gap-2.5">
        <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className={cn('relative shrink-0 text-xs tabular-nums', active ? 'text-primary' : 'text-text-tertiary')}>
        {badge}
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
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
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
        <div className="relative flex shrink-0 items-center gap-1.5">
          <span className="text-xs tabular-nums text-text-tertiary">{count}</span>
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setOpen((o) => !o)
              }}
              className="flex h-4 w-4 items-center justify-center text-text-tertiary transition-smooth hover:text-text-secondary"
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
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            {node.children.map((c) => (
              <LocationNode
                key={c.id}
                node={c}
                depth={depth + 1}
                parentPath={path}
                activeLocation={activeLocation}
                onSelectLocation={onSelectLocation}
                locationCounts={locationCounts}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
