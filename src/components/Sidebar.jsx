import { useState, useEffect } from 'react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName, buildLocationTree } from '../lib/api'

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
      <aside className="flex w-16 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex h-[66px] items-center justify-center border-b border-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-600 text-xl text-white shadow-sm">
            🏠
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-3 px-2">
          <IconButton
            active={activeCategory === '' && activeLocation.length === 0}
            onClick={() => {
              onSelectCategory('')
              onSelectLocation([])
            }}
            icon="📋"
            label={t('nav_all')}
            badge={totalCount}
          />
          {categories.map((c) => (
            <IconButton
              key={c.id}
              active={activeCategory === c.key}
              onClick={() => {
                onSelectCategory(activeCategory === c.key ? '' : c.key)
                onSelectLocation([])
              }}
              icon={c.icon || '🏷️'}
              label={categoryDisplayName(c, lang)}
              badge={counts[c.key] || 0}
            />
          ))}
          <IconButton
            active={activeLocation.length > 0}
            onClick={() => {
              onToggleCollapse()
            }}
            icon="📍"
            label={t('nav_locations')}
          />
        </div>

        <div className="flex flex-col items-center gap-1 border-t border-border py-2">
          <IconButton active={false} onClick={onOpenSettings} icon="⚙️" label={t('nav_settings')} />
          <IconButton active={false} onClick={onToggleCollapse} icon="▸" label={t('close')} />
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-600 text-xl text-white shadow-sm">
            🏠
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight text-text-primary">{t('appTitle')}</div>
            <div className="text-[11px] text-text-tertiary">{t('appSubtitle')}</div>
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="rounded-md p-1 text-text-tertiary transition hover:bg-surface-hover"
          title={t('close')}
        >
          ◀
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {/* 分类 */}
        <div className="mt-2 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
          {t('nav_categories')}
        </div>
        <NavRow
          active={activeCategory === '' && activeLocation.length === 0}
          onClick={() => {
            onSelectCategory('')
            onSelectLocation([])
          }}
          icon="📋"
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
              onClick={() => {
                onSelectCategory(active ? '' : c.key)
                onSelectLocation([])
              }}
              icon={c.icon || '🏷️'}
              label={categoryDisplayName(c, lang)}
              badge={count}
            />
          )
        })}

        {/* 位置 */}
        <div className="mt-4 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
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
        className="flex items-center gap-2 border-t border-border px-5 py-3 text-sm text-text-secondary transition hover:bg-surface-hover hover:text-text-primary"
      >
        <span className="text-base">⚙️</span> {t('nav_settings')}
      </button>
      <div className="px-5 pb-3 text-[11px] leading-relaxed text-text-tertiary">{t('sidebar_localBackup')}</div>
    </aside>
  )
}

function IconButton({ active, onClick, icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative flex h-10 w-10 items-center justify-center rounded-xl text-lg transition ${
        active
          ? 'bg-primary-soft text-primary'
          : 'text-text-secondary hover:bg-surface-hover'
      }`}
    >
      {icon}
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-surface px-1 text-[10px] font-semibold text-text-secondary shadow-sm ring-1 ring-border">
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
      className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
        active ? 'bg-primary-soft font-medium text-primary' : 'text-text-secondary hover:bg-surface-hover'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className="text-xs text-text-tertiary">{badge}</span>
    </button>
  )
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
        className={`group mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition ${
          isSelected ? 'bg-primary-soft font-medium text-primary' : 'text-text-secondary hover:bg-surface-hover'
        }`}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
      >
        <button
          onClick={() => onSelectLocation(isSelected ? [] : path)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          title={pathKey}
        >
          <span className="text-text-tertiary">📁</span>
          <span className="truncate">{node.name}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-text-tertiary">{count}</span>
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setOpen((o) => !o)
              }}
              className="w-4 text-text-tertiary"
            >
              {open ? '▾' : '▸'}
            </button>
          )}
        </div>
      </div>
      {hasChildren && open &&
        node.children.map((c) => (
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
    </div>
  )
}
