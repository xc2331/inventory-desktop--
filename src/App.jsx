import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, PackageOpen, Plus, Loader2 } from 'lucide-react'
import { useI18n } from './lib/i18n'
import { EASE } from './lib/motion'
import { cn } from './lib/cn'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import ItemCard from './components/ItemCard'
import ItemForm from './components/ItemForm'
import Lightbox from './components/Lightbox'
import ConfirmDialog from './components/ConfirmDialog'
import CloseActionDialog from './components/CloseActionDialog'
import UpdateDialog from './components/UpdateDialog'
import Toast from './components/Toast'
import SettingsView from './components/SettingsView'
import StatisticsView from './components/StatisticsView'
import CategoryManager from './components/CategoryManager'
import LocationManager from './components/LocationManager'
import BulkEditBar from './components/BulkEditBar'
import HelpView from './components/HelpView'
import MaterialLibrary from './components/MaterialLibrary'
import LocationMap from './components/LocationMap'
import FloorPlanEditor from './components/FloorPlanEditor'
import {
  fetchAllItems,
  searchItems,
  fetchByCategory,
  fetchByCategoryAndKeyword,
  fetchCategoryCounts,
  fetchCategories,
  fetchLocations,
  createItem,
  updateItem,
  adjustQuantity,
  deleteItem,
  bulkDeleteItems,
  bulkUpdateCategory,
  exportJSON,
  importJSON,
  exportCSV,
  saveFile,
  openFile,
  getSettings,
  setSettings,
  setDataDir,
  resetDataDir,
  pickFolder,
  generateItemNo,
  locationMatchesPath,
  buildLocationCounts,
  winControl,
  getUpdaterInfo,
  checkUpdate,
  setUpdateSource,
  setAutoCheckUpdate,
  downloadUpdate,
  openUpdateExternal,
  onUpdateAvailable,
  onUpdateNotAvailable,
  onUpdateDownloadStart,
  onUpdateProgress,
  onUpdateDownloaded,
  onUpdateInstalling,
  onUpdateError
} from './lib/api'

function applyThemeClass(theme) {
  const isDark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

export default function App() {
  const { t, lang, setLang } = useI18n()
  const [view, setView] = useState('items') // items | settings | statistics | categories | locations | materials | locationMap | floorPlan
  const [items, setItems] = useState([])
  const [allItems, setAllItems] = useState([]) // 全量物品，用于位置计数（不受筛选影响）
  const [lightbox, setLightbox] = useState({ src: '', alt: '' })
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [activeLocation, setActiveLocation] = useState([]) // 位置路径数组
  const [counts, setCounts] = useState({})
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' })
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [theme, setTheme] = useState('light')
  const [animations, setAnimations] = useState(true)
  const [closeAction, setCloseAction] = useState('')
  const [closePromptOpen, setClosePromptOpen] = useState(false)
  const [updaterInfo, setUpdaterInfo] = useState({ currentVersion: '', source: '', sources: [], autoCheck: true })
  const [updateDialog, setUpdateDialog] = useState({ open: false, status: 'idle', info: null, progress: { downloaded: 0, total: 0, percent: 0 } })
  const [floorPlanLocation, setFloorPlanLocation] = useState(null)

  // 初始化主题、动效与关闭行为
  useEffect(() => {
    getSettings().then((s) => {
      const initialTheme = s.theme || 'light'
      setTheme(initialTheme)
      applyThemeClass(initialTheme)
      const anim = s.animations !== false
      setAnimations(anim)
      document.documentElement.classList.toggle('no-anim', !anim)
      setCloseAction(s.closeAction || '')
    })
  }, [])

  // 监听系统主题变化（仅在 auto 模式）
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyThemeClass(theme)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  // 首次关闭窗口时，主进程请求渲染进程弹出选择框
  useEffect(() => {
    const remove = winControl.onRequestCloseAction(() => setClosePromptOpen(true))
    return remove
  }, [])

  // 初始化更新器信息并监听更新事件
  useEffect(() => {
    getUpdaterInfo().then((info) => setUpdaterInfo(info))

    const removes = []
    removes.push(
      onUpdateAvailable((payload) => {
        setUpdateDialog({ open: true, status: 'available', info: payload, progress: { downloaded: 0, total: 0, percent: 0 } })
      })
    )
    removes.push(
      onUpdateNotAvailable((payload) => {
        setUpdateDialog({ open: true, status: 'notAvailable', info: payload, progress: { downloaded: 0, total: 0, percent: 0 } })
      })
    )
    removes.push(
      onUpdateDownloadStart((payload) => {
        setUpdateDialog((d) => ({ ...d, status: 'downloading', info: { ...d.info, ...payload }, progress: { downloaded: 0, total: payload.size || 0, percent: 0 } }))
      })
    )
    removes.push(
      onUpdateProgress((payload) => {
        setUpdateDialog((d) => ({ ...d, progress: payload }))
      })
    )
    removes.push(
      onUpdateDownloaded(() => {
        setUpdateDialog((d) => ({ ...d, status: 'installing' }))
      })
    )
    removes.push(
      onUpdateInstalling(() => {
        setUpdateDialog((d) => ({ ...d, status: 'installing' }))
      })
    )
    removes.push(
      onUpdateError((payload) => {
        setUpdateDialog((d) => ({ ...d, status: 'error', info: payload }))
      })
    )

    return () => removes.forEach((fn) => fn())
  }, [])

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() })
  }, [])

  useEffect(() => {
    const tm = setTimeout(() => setKeyword(keywordInput.trim()), 250)
    return () => clearTimeout(tm)
  }, [keywordInput])

  const refreshCategories = useCallback(async () => {
    try {
      setCategories(await fetchCategories())
    } catch (e) {
      /* ignore */
    }
  }, [])

  const refreshLocations = useCallback(async () => {
    try {
      setLocations(await fetchLocations())
    } catch (e) {
      /* ignore */
    }
  }, [])

  const refreshCounts = useCallback(async () => {
    try {
      const rows = await fetchCategoryCounts()
      const m = {}
      rows.forEach((r) => (m[r.category] = r.count))
      setCounts(m)
    } catch (e) {
      /* ignore */
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      // 并行：当前筛选列表 + 全量物品（用于位置计数，不受筛选影响）
      const [rows, all] = await Promise.all([
        (async () => {
          if (keyword) {
            return activeCategory
              ? await fetchByCategoryAndKeyword(activeCategory, keyword)
              : await searchItems(keyword)
          } else if (activeCategory) {
            return await fetchByCategory(activeCategory)
          }
          return await fetchAllItems()
        })(),
        fetchAllItems()
      ])
      setItems(rows)
      setAllItems(all)
    } catch (e) {
      showToast(t('toast_loadFail', { msg: e.message }), 'error')
    } finally {
      setLoading(false)
    }
  }, [keyword, activeCategory, showToast, t])

  useEffect(() => {
    refreshCategories()
    refreshLocations()
  }, [refreshCategories, refreshLocations])

  useEffect(() => {
    if (view === 'items') reload()
  }, [reload, view])
  useEffect(() => {
    refreshCounts()
  }, [refreshCounts])

  // 菜单快捷键：用 ref 持有最新处理器，避免陈旧闭包
  const handlersRef = useRef({ imp: () => {}, ej: () => {}, ec: () => {} })
  useEffect(() => {
    const api = window.lingguang
    api.menu.onImport(() => handlersRef.current.imp())
    api.menu.onExportJson(() => handlersRef.current.ej())
    api.menu.onExportCsv(() => handlersRef.current.ec())
  }, [])

  // Agent API 外部操作后通知前端刷新（解决 Agent 新建/修改/删除物品 UI 不同步问题）
  useEffect(() => {
    const remove = window.lingguang.agent.onDataChanged(async (payload) => {
      await reload()
      await refreshCounts()
      if (payload.type === 'categories') {
        await refreshCategories()
      } else if (payload.type === 'locations') {
        await refreshLocations()
      }
    })
    return remove
  }, [reload, refreshCounts, refreshCategories, refreshLocations])

  // 当前可见物品（含位置筛选）
  const filteredItems = useMemo(() => {
    if (!activeLocation || activeLocation.length === 0) return items
    return items.filter((it) => locationMatchesPath(it, activeLocation))
  }, [items, activeLocation])

  // 位置计数基于全量数据，选分类时数量保持不变
  const locationCounts = useMemo(() => buildLocationCounts(allItems), [allItems])

  const total = filteredItems.length
  const lowStock = filteredItems.filter((it) => it.min_quantity > 0 && it.quantity <= it.min_quantity).length
  const expiringSoon = filteredItems.filter((it) => {
    if (!it.expiry_date) return false
    return Math.ceil((it.expiry_date - Date.now()) / 86400000) <= 7
  }).length

  const handleOpenNew = () => {
    setEditingItem(null)
    setFormOpen(true)
  }
  const handleOpenEdit = (item) => {
    setEditingItem(item)
    setFormOpen(true)
  }

  const handleSave = async (data) => {
    try {
      const payload = { ...data }
      // 新建物品且编号留空时，参考已有数据规则自动生成编号
      if (!editingItem && !payload.item_no?.trim()) {
        try {
          payload.item_no = await generateItemNo()
        } catch (e) {
          /* 生成失败则保留空值 */
        }
      }
      if (editingItem) {
        await updateItem(editingItem.id, payload)
        showToast(t('toast_updated', { name: data.name || '—' }))
      } else {
        await createItem(payload)
        showToast(t('toast_added', { name: data.name || '—' }))
      }
      setFormOpen(false)
      setEditingItem(null)
      await reload()
      await refreshCounts()
    } catch (e) {
      showToast(t('toast_saveFail', { msg: e.message }), 'error')
    }
  }

  const handleAdjust = async (id, delta) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, quantity: Math.max(0, it.quantity + delta), updated_at: Date.now() } : it
      )
    )
    try {
      await adjustQuantity(id, delta)
    } catch (e) {
      showToast(t('toast_qtyFail'), 'error')
      reload()
    }
  }

  const handleAskDelete = (item) => setConfirm({ open: true, id: item.id, name: item.name || '—' })
  const handleConfirmDelete = async () => {
    const { id, name } = confirm
    setConfirm({ open: false, id: null, name: '' })
    try {
      await deleteItem(id)
      showToast(t('toast_deleted', { name }))
      await reload()
      await refreshCounts()
    } catch (e) {
      showToast(t('toast_deleteFail', { msg: e.message }), 'error')
    }
  }

  // ---- 批量选择 ----
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredItems.map((it) => it.id)))
    }
  }

  const handleClearSelection = () => setSelectedIds(new Set())

  const exitBulkMode = () => {
    setBulkMode(false)
    setSelectedIds(new Set())
  }

  const handleBulkChangeCategory = async (category) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      const res = await bulkUpdateCategory(ids, category)
      showToast(t('toast_bulkUpdated', { n: res.updated }))
      setSelectedIds(new Set())
      await reload()
      await refreshCounts()
    } catch (e) {
      showToast(t('toast_saveFail', { msg: e.message }), 'error')
    }
  }

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setConfirm({ open: true, bulk: true, ids, name: t('confirm_bulkDeleteMsg', { n: ids.length }) })
  }

  const handleConfirmBulkDelete = async () => {
    const { ids } = confirm
    setConfirm({ open: false, id: null, name: '' })
    try {
      const res = await bulkDeleteItems(ids)
      showToast(t('toast_bulkDeleted', { n: res.deleted }))
      setSelectedIds(new Set())
      await reload()
      await refreshCounts()
    } catch (e) {
      showToast(t('toast_deleteFail', { msg: e.message }), 'error')
    }
  }

  const handleExportJSON = async () => {
    try {
      const json = await exportJSON()
      const res = await saveFile({
        content: json,
        defaultName: `inventory-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (!res.canceled) showToast(t('toast_exported'))
    } catch (e) {
      showToast(t('toast_exportFail', { msg: e.message }), 'error')
    }
  }

  const handleExportCSV = async () => {
    try {
      const csv = await exportCSV()
      const res = await saveFile({
        content: csv,
        defaultName: `inventory-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (!res.canceled) showToast(t('toast_exported'))
    } catch (e) {
      showToast(t('toast_exportFail', { msg: e.message }), 'error')
    }
  }

  const handleImportJSON = async () => {
    try {
      const res = await openFile({ filters: [{ name: 'JSON', extensions: ['json'] }] })
      if (res.canceled) return
      const { imported } = await importJSON(res.content)
      showToast(t('toast_imported', { n: imported }))
      await reload()
      await refreshCounts()
      await refreshCategories()
      await refreshLocations()
    } catch (e) {
      showToast(t('toast_importFail', { msg: e.message }), 'error')
    }
  }

  // 设置页：切换语言
  const handleChangeLang = async (l) => {
    await setSettings({ language: l })
    setLang(l)
    showToast(t('toast_langChanged'))
  }

  // 设置页：切换主题
  const handleChangeTheme = async (nextTheme) => {
    await setSettings({ theme: nextTheme })
    setTheme(nextTheme)
    applyThemeClass(nextTheme)
  }

  // 设置页：切换动效
  const handleChangeAnimations = async (on) => {
    await setSettings({ animations: on })
    setAnimations(on)
    document.documentElement.classList.toggle('no-anim', !on)
  }

  // 设置页：切换关闭行为
  const handleChangeCloseAction = async (action) => {
    await setSettings({ closeAction: action })
    setCloseAction(action)
    showToast(t('toast_settingsSaved'))
  }

  // 关闭行为弹窗：用户选择后通知主进程
  const handleResolveCloseAction = async (action, remember) => {
    setClosePromptOpen(false)
    if (remember) setCloseAction(action)
    await winControl.resolveCloseAction({ action, remember })
  }

  // 软件更新：切换更新源 / 自动检查 / 手动检查 / 下载安装
  const handleChangeUpdateSource = async (sourceId) => {
    await setUpdateSource(sourceId)
    const info = await getUpdaterInfo()
    setUpdaterInfo(info)
  }

  const handleChangeAutoCheckUpdate = async (enabled) => {
    await setAutoCheckUpdate(enabled)
    setUpdaterInfo((prev) => ({ ...prev, autoCheck: enabled }))
  }

  const handleCheckUpdate = async () => {
    setUpdateDialog({ open: true, status: 'checking', info: null, progress: { downloaded: 0, total: 0, percent: 0 } })
    await checkUpdate({ silent: false })
  }

  const handleDownloadUpdate = async () => {
    await downloadUpdate()
  }

  const handleCloseUpdateDialog = () => {
    setUpdateDialog((d) => ({ ...d, open: false }))
  }

  const handleOpenUpdateExternal = async (url) => {
    await openUpdateExternal(url)
  }

  // 设置页：切换数据目录
  const handleChangeDataDir = async () => {
    const res = await pickFolder()
    if (res.canceled) return
    const r = await setDataDir(res.path)
    if (r.ok) {
      showToast(t('toast_dataDirChanged'))
      setTimeout(() => location.reload(), 800)
    } else {
      showToast(t('toast_dataDirFail', { msg: r.error }), 'error')
    }
  }
  const handleResetDataDir = async () => {
    await resetDataDir()
    showToast(t('toast_dataDirChanged'))
    setTimeout(() => location.reload(), 800)
  }

  // 分类/位置管理变更后刷新
  const handleCatsChanged = async () => {
    await refreshCategories()
    await refreshCounts()
  }
  const handleLocsChanged = async () => {
    await refreshLocations()
  }

  // 同步菜单处理器引用（每渲染更新，避免陈旧闭包）
  handlersRef.current.imp = handleImportJSON
  handlersRef.current.ej = handleExportJSON
  handlersRef.current.ec = handleExportCSV

  // ---- 渲染 ----
  const statisticsView = (
    <StatisticsView onBack={() => setView('items')} animations={animations} />
  )
  const settingsView = (
    <SettingsView
      theme={theme}
      animations={animations}
      closeAction={closeAction}
      onChangeTheme={handleChangeTheme}
      onChangeAnimations={handleChangeAnimations}
      onChangeCloseAction={handleChangeCloseAction}
      onBack={() => setView('items')}
      onChangeLang={handleChangeLang}
      onChangeDataDir={handleChangeDataDir}
      onResetDataDir={handleResetDataDir}
      onManageCategories={() => setView('categories')}
      onManageLocations={() => setView('locations')}
      onExportJSON={handleExportJSON}
      onExportCSV={handleExportCSV}
      onImport={handleImportJSON}
      updaterInfo={updaterInfo}
      isCheckingUpdate={updateDialog.status === 'checking'}
      onChangeUpdateSource={handleChangeUpdateSource}
      onChangeAutoCheckUpdate={handleChangeAutoCheckUpdate}
      onCheckUpdate={handleCheckUpdate}
    />
  )
  const categoriesView = (
    <CategoryManager
      categories={categories}
      counts={counts}
      lang={lang}
      onBack={() => setView('settings')}
      onChanged={handleCatsChanged}
      showToast={showToast}
    />
  )
  const locationsView = (
    <LocationManager
      locations={locations}
      lang={lang}
      onBack={() => setView('settings')}
      onChanged={handleLocsChanged}
      showToast={showToast}
    />
  )
  const helpView = <HelpView onBack={() => setView('items')} />

  return (
    <>
      <AnimatePresence mode="wait">
      {view === 'statistics' && (
        <motion.div
          key="statistics"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="h-screen w-screen"
        >
          {statisticsView}
        </motion.div>
      )}
      {view === 'settings' && (
        <motion.div
          key="settings"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="h-screen w-screen"
        >
          {settingsView}
        </motion.div>
      )}
      {view === 'categories' && (
        <motion.div
          key="categories"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="h-screen w-screen"
        >
          {categoriesView}
        </motion.div>
      )}
      {view === 'locations' && (
        <motion.div
          key="locations"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="h-screen w-screen"
        >
          {locationsView}
        </motion.div>
      )}
      {view === 'help' && (
        <motion.div
          key="help"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="h-screen w-screen"
        >
          {helpView}
        </motion.div>
      )}
      {view === 'materials' && (
        <motion.div
          key="materials"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="h-screen w-screen"
        >
          <MaterialLibrary onBack={() => setView('items')} />
        </motion.div>
      )}
      {view === 'locationMap' && (
        <motion.div
          key="locationMap"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="h-screen w-screen"
        >
          <LocationMap
            items={allItems}
            locations={locations}
            onBack={() => setView('items')}
            onSelectLocation={(path) => {
              setActiveLocation(path)
              setActiveCategory('')
              setView('items')
              exitBulkMode()
            }}
            onEditFloorPlan={(loc) => {
              setFloorPlanLocation(loc)
              setView('floorPlan')
            }}
          />
        </motion.div>
      )}
      {view === 'floorPlan' && floorPlanLocation && (
        <motion.div
          key="floorPlan"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="h-screen w-screen"
        >
          <FloorPlanEditor
            locationId={floorPlanLocation.id}
            locationName={floorPlanLocation.name}
            locations={locations}
            items={allItems}
            onBack={() => {
              setFloorPlanLocation(null)
              setView('locationMap')
            }}
            onSelectSubLocation={(path) => {
              setFloorPlanLocation(null)
              setActiveLocation(path)
              setActiveCategory('')
              setView('items')
              exitBulkMode()
            }}
          />
        </motion.div>
      )}
      {view === 'items' && (
        <motion.div
          key="items"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: EASE }}
          className="h-screen w-screen"
        >
      <div className="flex h-screen w-screen overflow-hidden bg-bg">
      <Sidebar
        collapsed={sidebarCollapsed}
        activeCategory={activeCategory}
        onSelectCategory={(c) => {
          setActiveCategory(c)
          setActiveLocation([])
          setView('items')
          exitBulkMode()
        }}
        activeLocation={activeLocation}
        onSelectLocation={(path) => {
          setActiveLocation(path)
          setActiveCategory('')
          setView('items')
          exitBulkMode()
        }}
        counts={counts}
        categories={categories}
        locations={locations}
        locationCounts={locationCounts}
        lang={lang}
        activeView={view}
        onOpenSettings={() => setView('settings')}
        onOpenStatistics={() => setView('statistics')}
        onOpenHelp={() => setView('help')}
        onOpenMaterials={() => setView('materials')}
        onOpenLocationMap={() => setView('locationMap')}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          keyword={keywordInput}
          onKeywordChange={setKeywordInput}
          onAdd={handleOpenNew}
          onImport={handleImportJSON}
          onExportJSON={handleExportJSON}
          onExportCSV={handleExportCSV}
          activeCategory={activeCategory}
          activeLocation={activeLocation}
          categories={categories}
          lang={lang}
          bulkMode={bulkMode}
          onToggleBulk={() => {
            if (bulkMode) exitBulkMode()
            else setBulkMode(true)
          }}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
          sidebarCollapsed={sidebarCollapsed}
          total={total}
          lowStock={lowStock}
          expiringSoon={expiringSoon}
        />
        <main className="relative flex flex-1 flex-col overflow-y-auto p-6">
          <AnimatePresence>
            {bulkMode && (
              <div className="mb-4">
                <BulkEditBar
                  selectedCount={selectedIds.size}
                  total={filteredItems.length}
                  categories={categories}
                  lang={lang}
                  onSelectAll={handleSelectAll}
                  onClear={handleClearSelection}
                  onChangeCategory={handleBulkChangeCategory}
                  onDelete={handleBulkDelete}
                  onClose={exitBulkMode}
                />
              </div>
            )}
          </AnimatePresence>
          {loading && items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-text-tertiary">
              <Loader2 size={28} className="animate-spin" />
              <span className="text-sm">{t('loading')}</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState onAdd={handleOpenNew} hasFilter={!!keyword || !!activeCategory || activeLocation.length > 0} />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredItems.map((it, i) => (
                <ItemCard
                  key={it.id}
                  item={it}
                  categories={categories}
                  lang={lang}
                  onAdjust={handleAdjust}
                  onEdit={handleOpenEdit}
                  onDelete={handleAskDelete}
                  onDoubleClick={(src, name) => setLightbox({ src, alt: name })}
                  selected={selectedIds.has(it.id)}
                  onToggleSelect={toggleSelect}
                  bulkMode={bulkMode}
                  index={i}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {formOpen && (
        <ItemForm
          initial={editingItem}
          categories={categories}
          locations={locations}
          lang={lang}
          onSave={handleSave}
          onClose={() => setFormOpen(false)}
        />
      )}
      <ConfirmDialog
        open={confirm.open}
        title={confirm.bulk ? t('confirm_bulkDeleteTitle') : t('confirm_deleteTitle')}
        message={confirm.name}
        onConfirm={confirm.bulk ? handleConfirmBulkDelete : handleConfirmDelete}
        onCancel={() => setConfirm({ open: false, id: null, name: '' })}
      />
      <CloseActionDialog
        open={closePromptOpen}
        onResolve={handleResolveCloseAction}
        onCancel={() => setClosePromptOpen(false)}
      />
      <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox({ src: '', alt: '' })} />
      <Toast toast={toast} onDone={() => setToast(null)} />
      </div>
        </motion.div>
      )}
    </AnimatePresence>
    <UpdateDialog
      open={updateDialog.open}
      status={updateDialog.status}
      info={updateDialog.info}
      progress={updateDialog.progress}
      onCheck={handleCheckUpdate}
      onDownload={handleDownloadUpdate}
      onClose={handleCloseUpdateDialog}
      onOpenExternal={handleOpenUpdateExternal}
    />
  </>)

  function EmptyState({ onAdd, hasFilter }) {
    const Icon = hasFilter ? Search : PackageOpen
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="flex h-full flex-col items-center justify-center text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
          className="mb-5 flex h-[5.5rem] w-[5.5rem] items-center justify-center rounded-[1.75rem] bg-surface text-text-tertiary/80 shadow-card ring-1 ring-border"
        >
          <Icon size={34} strokeWidth={1.4} />
        </motion.div>
        <p className="mb-1 text-base font-semibold text-text-secondary">
          {hasFilter ? t('empty_noMatch') : t('empty_noItems')}
        </p>
        <p className="mb-6 text-sm text-text-tertiary">
          {hasFilter ? t('empty_tryFilter') : t('empty_addFirst')}
        </p>
        {!hasFilter && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onAdd}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover hover:shadow-card"
          >
            <Plus size={15} strokeWidth={2.5} />
            {t('btn_add')}
          </motion.button>
        )}
      </motion.div>
    )
  }
}
