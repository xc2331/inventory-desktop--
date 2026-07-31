import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, MapPin, Boxes, ChevronRight, X, Search, Info } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { EASE } from '../lib/motion'
import { cn } from '../lib/cn'
import { itemLocationPath } from '../lib/api'

// 为常见房间名分配暖色色块
const ROOM_PALETTE = [
  { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  { bg: 'bg-sky-50 dark:bg-sky-900/20', border: 'border-sky-200 dark:border-sky-800', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  { bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-200 dark:border-rose-800', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
  { bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-800', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  { bg: 'bg-teal-50 dark:bg-teal-900/20', border: 'border-teal-200 dark:border-teal-800', text: 'text-teal-700 dark:text-teal-300', dot: 'bg-teal-500' },
  { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  { bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' }
]

function getRoomStyle(index) {
  return ROOM_PALETTE[index % ROOM_PALETTE.length]
}

export default function LocationMap({ items, locations, onBack, onSelectLocation }) {
  const { t } = useI18n()
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [keyword, setKeyword] = useState('')

  const rooms = useMemo(() => {
    const map = new Map()
    items.forEach((it) => {
      const path = itemLocationPath(it)
      const room = path[0] || t('locationMap_uncategorized')
      if (!map.has(room)) map.set(room, { name: room, items: [], subLocations: new Map() })
      const roomData = map.get(room)
      roomData.items.push(it)
      if (path.length > 1) {
        const sub = path.slice(1).join(' > ')
        roomData.subLocations.set(sub, (roomData.subLocations.get(sub) || 0) + 1)
      }
    })
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length)
  }, [items, t])

  const uncategorizedCount = useMemo(() => {
    return items.filter((it) => itemLocationPath(it).length === 0).length
  }, [items])

  const filteredItems = useMemo(() => {
    if (!selectedRoom) return []
    const list = selectedRoom.items
    if (!keyword.trim()) return list
    const k = keyword.trim().toLowerCase()
    return list.filter((it) =>
      (it.name || '').toLowerCase().includes(k) ||
      (it.item_no || '').toLowerCase().includes(k) ||
      (it.category || '').toLowerCase().includes(k)
    )
  }, [selectedRoom, keyword])

  const total = items.length

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg">
      <header className="drag-region flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="no-drag flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-text-primary">{t('nav_locationMap')}</h1>
            <p className="text-[11px] text-text-tertiary">{t('stats_byLocation')} · {total} {t('stat_items')} · {t('locationMap_totalRooms', { n: rooms.length })}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 平面图：房间卡片网格 */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <Info size={13} />
              {t('locationMap_hint')}
            </p>
            {uncategorizedCount > 0 && (
              <p className="text-xs text-warn">{t('locationMap_uncategorized')}: {uncategorizedCount}</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {rooms.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-text-tertiary">
                <MapPin size={40} className="mb-4 opacity-40" />
                <p className="mb-2 font-medium text-text-secondary">{t('loc_empty')}</p>
                <p className="max-w-xs text-xs leading-relaxed">{t('locationMap_emptyHint')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {rooms.map((room, i) => {
                  const style = getRoomStyle(i)
                  const isSelected = selectedRoom?.name === room.name
                  return (
                    <motion.button
                      key={room.name}
                      layout
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedRoom(room)}
                      className={cn(
                        'relative flex flex-col items-start rounded-2xl border p-4 text-left shadow-card transition-smooth hover:shadow-float',
                        style.bg,
                        isSelected ? `ring-2 ring-primary ${style.border}` : style.border
                      )}
                    >
                      <div className="flex w-full items-start justify-between">
                        <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 dark:bg-black/20', style.text)}>
                          <Boxes size={20} />
                        </div>
                        <span className={cn('flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-2 text-xs font-bold text-white shadow-sm', style.dot)}>
                          {room.items.length}
                        </span>
                      </div>
                      <h3 className={cn('text-sm font-semibold', style.text)}>{room.name}</h3>
                      <p className="mt-0.5 text-2xl font-bold text-text-primary">{room.items.length}</p>
                      <p className="text-[11px] text-text-tertiary">{t('stat_items')}</p>
                      {room.subLocations.size > 0 && (
                        <div className="mt-3 flex w-full flex-wrap gap-1">
                          {Array.from(room.subLocations.entries()).slice(0, 4).map(([name, count]) => (
                            <span key={name} className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] text-text-secondary dark:bg-black/30">
                              {name} · {count}
                            </span>
                          ))}
                          {room.subLocations.size > 4 && (
                            <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] text-text-secondary dark:bg-black/30">
                              +{room.subLocations.size - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </motion.button>
                  )
                })}
              </div>
            )}
          </div>
        </main>

        {/* 右侧详情抽屉 */}
        <AnimatePresence>
          {selectedRoom && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="flex shrink-0 flex-col overflow-hidden border-l border-border bg-surface"
            >
              <div className="flex h-14 items-center justify-between border-b border-border px-4">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{selectedRoom.name}</h2>
                  <p className="text-[11px] text-text-tertiary">{selectedRoom.items.length} {t('stat_items')}</p>
                </div>
                <button
                  onClick={() => setSelectedRoom(null)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={t('search_placeholder')}
                    className="input w-full pl-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                <div className="space-y-2">
                  {filteredItems.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => {
                        onSelectLocation(itemLocationPath(it))
                        setSelectedRoom(null)
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-border bg-bg p-2.5 text-left transition-smooth hover:border-primary/30 hover:bg-primary-soft/30"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-text-tertiary ring-1 ring-border">
                        {it.photo ? (
                          <img src={it.photo.startsWith('data:') ? it.photo : `file:///${it.photo.replace(/\\/g, '/')}`} alt="" className="h-full w-full rounded-lg object-cover" />
                        ) : (
                          <Boxes size={16} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-text-primary">{it.name}</p>
                        <p className="truncate text-[10px] text-text-tertiary">
                          {it.category} · {it.location || it.position || it.room || '-'}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-text-tertiary" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border p-3">
                <button
                  onClick={() => {
                    onSelectLocation([selectedRoom.name])
                    setSelectedRoom(null)
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
                >
                  <MapPin size={13} />
                  在物品列表中查看此位置
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
