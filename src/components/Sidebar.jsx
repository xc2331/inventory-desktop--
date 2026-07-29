import { useState, useEffect } from 'react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName, buildLocationTree } from '../lib/api'

export default function Sidebar({
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

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-stone-200 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xl text-white shadow-sm">
          🏠
        </div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-tight text-stone-800">{t('appTitle')}</div>
          <div className="text-[11px] text-stone-400">{t('appSubtitle')}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {/* 分类 */}
        <div className="mt-2 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
          {t('nav_categories')}
        </div>
        <button
          onClick={() => {
            onSelectCategory('')
            onSelectLocation([])
          }}
          className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
            activeCategory === '' && activeLocation.length === 0
              ? 'bg-emerald-50 font-medium text-emerald-700'
              : 'text-stone-600 hover:bg-stone-50'
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="text-base">📋</span> {t('nav_all')}
          </span>
          <span className="text-xs text-stone-400">{totalCount}</span>
        </button>
        {categories.map((c) => {
          const active = activeCategory === c.key
          const count = counts[c.key] || 0
          return (
            <button
              key={c.id}
              onClick={() => {
                onSelectCategory(active ? '' : c.key)
                onSelectLocation([])
              }}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                active ? 'bg-emerald-50 font-medium text-emerald-700' : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-base">{c.icon || '🏷️'}</span>
                <span className="truncate">{categoryDisplayName(c, lang)}</span>
              </span>
              <span className="text-xs text-stone-400">{count}</span>
            </button>
          )
        })}

        {/* 位置 */}
        <div className="mt-4 px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
          {t('nav_locations')}
        </div>
        {locTree.length === 0 ? (
          <div className="px-3 py-2 text-xs text-stone-300">{t('loc_empty')}</div>
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
        className="flex items-center gap-2 border-t border-stone-100 px-5 py-3 text-sm text-stone-500 transition hover:bg-stone-50 hover:text-stone-700"
      >
        <span className="text-base">⚙️</span> {t('nav_settings')}
      </button>
      <div className="px-5 pb-3 text-[11px] leading-relaxed text-stone-400">{t('sidebar_localBackup')}</div>
    </aside>
  )
}

function LocationNode({ node, depth, parentPath, activeLocation, onSelectLocation, locationCounts }) {
  const [open, setOpen] = useState(depth < 1)
  const hasChildren = node.children && node.children.length > 0

  // 节点的真实路径：基于父路径 + 当前节点名，绝不能用 activeLocation 推导
  const path = [...parentPath, node.name]
  const pathKey = path.join(' > ')

  const activeKey = activeLocation.join(' > ')
  const isOnActivePath = activeKey.startsWith(pathKey)
  const isActive = isOnActivePath && activeLocation.length >= path.length
  const isSelected = activeLocation.length === path.length && isActive
  const count = locationCounts[pathKey] || 0

  // 当当前节点位于选中路径上时，自动展开
  useEffect(() => {
    if (isActive && hasChildren) setOpen(true)
  }, [isActive, hasChildren])

  return (
    <div>
      <div
        className={`group mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition ${
          isSelected ? 'bg-emerald-50 font-medium text-emerald-700' : 'text-stone-600 hover:bg-stone-50'
        }`}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
      >
        <button
          onClick={() => onSelectLocation(isSelected ? [] : path)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          title={pathKey}
        >
          <span className="text-stone-400">📁</span>
          <span className="truncate">{node.name}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-stone-400">{count}</span>
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setOpen((o) => !o)
              }}
              className="w-4 text-stone-400"
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
