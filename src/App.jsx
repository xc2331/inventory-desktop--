import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect, Component, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, PackageOpen, Plus, Loader2, XCircle } from 'lucide-react'
import { useI18n } from './lib/i18n'
import { EASE } from './lib/motion'
import { cn } from './lib/cn'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import ItemCard from './components/ItemCard'
import ItemForm from './components/ItemForm'
import Lightbox from './components/Lightbox'
import EmptyState from './components/EmptyState'
import ConfirmDialog from './components/ConfirmDialog'
import CloseActionDialog from './components/CloseActionDialog'
import ShortcutPanel from './components/ShortcutPanel'
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
import ErrorBoundary from './components/ErrorBoundary'
import {
  fetchAllItems,
  searchItems,
  fetchByCategory,
  fetchByCategoryAndKeyword,
  fetchCategoryCounts,
  fetchCategories,
  fetchLocations,
  fetchStatistics,
  createItem,
  updateItem,
  adjustQuantity,
  deleteItem,
  bulkDeleteItems,
  bulkUpdateCategory,
  bulkPreview,
  bulkUpdateField,
  exportJSON,
  exportCSV,
  exportSelectedJSON,
  exportExpiringReport,
  importJSON,
  rebuildCategories,
  rebuildLocations,
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
  cancelDownloadUpdate,
  installDownloadedUpdate,
  showUpdateInFolder,
  getUpdateDownloadDir,
  pickUpdateDownloadDir,
  openUpdateExternal,
  onUpdateAvailable,
  onUpdateNotAvailable,
  onUpdateDownloadStart,
  onUpdateProgress,
  onUpdateDownloaded,
  onUpdateInstalling,
  onUpdateError
} from './lib/api'
import {
  useToasts,
  useFilters,
  useBulk,
  useSettings,
  useItems
} from './hooks'

function applyThemeClass(theme) {
  const isDark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', isDark)
}

export default function App() {
  const { t, lang: i18nLang, setLang: setI18nLang } = useI18n()
  const [globalError, setGlobalError] = useState(null)

  // 全局异步错误兜底：捕获 useEffect、异步回调、Promise 未处理拒绝等 ErrorBoundary 捕获不到的错误
  useEffect(() => {
    const handler = (event) => {
      event.preventDefault()
      const msg = event.error?.message || String(event.error || 'Unknown error')
      const stack = event.error?.stack || ''
      setGlobalError({ message: msg, stack })
      console.error('[GlobalErrorHandler]', msg, stack)
    }
    window.addEventListener('error', handler)
    window.addEventListener('unhandledrejection', handler)
    return () => {
      window.removeEventListener('error', handler)
      window.removeEventListener('unhandledrejection', handler)
    }
  }, [])

  if (globalError) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
        <XCircle size={36} className="text-red-500" />
        <h2 className="text-lg font-bold text-text-primary">应用发生异步错误</h2>
        <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-xs font-mono text-red-700 dark:bg-red-950 dark:text-red-300">
          <p className="font-semibold mb-2">错误信息（请复制到聊天记录）：</p>
          <p>{globalError.message}</p>
          <p className="mt-3 pt-2 border-t border-red-200 dark:border-red-800 max-h-48 overflow-auto break-all">{globalError.stack}</p>
        </div>
        <button onClick={() => setGlobalError(null)} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
          重试
        </button>
      </div>
    )
  }

  // ---- Extracted hooks ----
  const { toast, setToast, showToast, done: toastDone } = useToasts()
  const {
    keyword, setKeyword,
    keywordInput, setKeywordInput,
    activeCategory, setActiveCategory,
    activeLocation, setActiveLocation,
    showExpired, setShowExpired,
    searchHistory, setSearchHistory,
    loadSearchHistory,
    saveSearchHistory,
    applyFilter
  } = useFilters()

  const {
    theme, setTheme,
    animations, setAnimations,
    closeAction, setCloseAction,
    lang, setLang,
    warmItems, setWarmItems,
    warmStats, setWarmStats,
    handleChangeLang,
    handleChangeTheme,
    handleChangeAnimations,
    handleChangeCloseAction
  } = useSettings(getSettings, setSettings, applyThemeClass)

  const itemsHook = useItems({
    keyword,
    activeCategory,
    showExpired,
    showToast,
    t
  })
  const {
    items, setItems,
    allItems, setAllItems,
    loadingItems: loading,
    setLoadingItems: setLoading,
    counts, setCounts,
    categories, setCategories,
    locations, setLocations,
    confirm, setConfirm,
    selectedIds, setSelectedIds,
    fetchItems,
    reload,
    refreshCategories,
    refreshLocations,
    refreshCounts,
    handleBulkDelete,
    handleConfirmBulkDelete,
    handleAdjust,
    handleBulkChangeCategory,
    handleBulkUpdateQuantity,
    handleBulkChangeQty,
    handleBulkUpdateField,
    handleBulkPreview,
    handleExportJSON,
    handleExportCSV,
    handleExportSelected,
    handleExportExpiringReport,
    handleImport: handleImportJSON,
    paginationPage,
    paginationLoading,
    paginationHasMore,
    loadNextPage,
    totalCount,
    totalAllCount
  } = itemsHook

  const filteredItems = useMemo(() => {
    if (!activeLocation || activeLocation.length === 0) return items
    return items.filter((it) => locationMatchesPath(it, activeLocation))
  }, [items, activeLocation])

  // Infinite scroll: auto-load next page when user scrolls near bottom of items grid
  const itemsGridRef = useRef(null)
  useEffect(() => {
    if (showExpired || paginationLoading || !paginationHasMore || !itemsGridRef.current) return
    const el = itemsGridRef.current
    const handler = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
        loadNextPage()
      }
    }
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [paginationLoading, paginationHasMore, showExpired, loadNextPage])

  const locationCounts = useMemo(() => buildLocationCounts(allItems), [allItems])

  const {
    bulkMode, setBulkMode,
    toggleSelect,
    clearSelection,
    handleSelectAll,
    handleClearSelection,
    exitBulkMode,
    isBulkEmpty
  } = useBulk(filteredItems, selectedIds, setSelectedIds)

  // ---- Local App state ----
  const [view, setView] = useState('items')
  const [lightbox, setLightbox] = useState({ src: '', alt: '' })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [closePromptOpen, setClosePromptOpen] = useState(false)
  const [updaterInfo, setUpdaterInfo] = useState({ currentVersion: '', source: '', sources: [], autoCheck: true })
  const [updateDialog, setUpdateDialog] = useState({ open: false, status: 'idle', info: null, progress: { downloaded: 0, total: 0, percent: 0 }, downloadPath: '' })
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [floorPlanLocation, setFloorPlanLocation] = useState(null)
  const [cardDensity, setCardDensity] = useState('medium')
  const [notifyEnabled, setNotifyEnabled] = useState(() => {
    try { return JSON.parse(localStorage.getItem('notifyEnabled') || 'false') } catch { return false }
  })

  const exitBulkRef = useRef(null)
  const lastNotifyCount = useRef(0)

  useEffect(() => {
    setToast(null)
    setLightbox({ src: '', alt: '' })
    setConfirm({ open: false, id: null, name: '' })
  }, [view])

  useEffect(() => {
    localStorage.setItem('notifyEnabled', JSON.stringify(notifyEnabled))
  }, [notifyEnabled])

  useEffect(() => {
    if (notifyEnabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    if (!notifyEnabled) return

    const intervalId = setInterval(async () => {
      try {
        const all = await fetchAllItems()
        const now = Date.now()
        const expired = all.filter((it) => it.expiry_date && it.expiry_date < now)
        const expiring = all.filter((it) => it.expiry_date && it.expiry_date >= now && it.expiry_date < now + 7 * 86400000)
        const list = expired.concat(expiring)

        if (
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted' &&
          notifyEnabled &&
          list.length > 0 &&
          list.length > lastNotifyCount.current
        ) {
          lastNotifyCount.current = list.length
          const preview = list.slice(0, 3).map((it) => it.name || it.item_no || '—')
          new Notification(t('notify_expiryTitle'), {
            body: `${list.length} ${t('notify_expiryBody')} · ${preview.join('、')}`,
            tag: 'expiry-' + Date.now()
          })
        }
      } catch (e) {
        console.warn('[App] 过期通知检查失败', e)
      }
    }, 60_000)

    return () => clearInterval(intervalId)
  }, [notifyEnabled, t])

  useEffect(() => {
    const remove = winControl.onRequestCloseAction(() => setClosePromptOpen(true))
    return remove
  }, [])

  useEffect(() => {
    getUpdaterInfo().then((info) => setUpdaterInfo(info)).catch(() => {
      console.warn('[App] 更新器信息获取失败，使用默认值')
      setUpdaterInfo({ currentVersion: '', source: '', sources: [], autoCheck: true })
    })

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
      onUpdateDownloaded((payload) => {
        setUpdateDialog((d) => ({ ...d, status: 'downloaded', downloadPath: payload?.path || '' }))
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

  useEffect(() => {
    if (view === 'items' || view === 'locationMap') reload()
  }, [reload, view])
  useEffect(() => {
    refreshCounts()
  }, [refreshCounts])

  const handlersRef = useRef({ imp: () => {}, ej: () => {}, ec: () => {} })
  useEffect(() => {
    const api = window.lingguang
    api.menu.onImport(() => handlersRef.current.imp())
    api.menu.onExportJson(() => handlersRef.current.ej())
    api.menu.onExportCsv(() => handlersRef.current.ec())
  }, [])

  const total = useMemo(() => {
    if (showExpired) return filteredItems.length
    return totalCount || filteredItems.length
  }, [totalCount, filteredItems.length, showExpired])
  const lowStock = useMemo(() => filteredItems.filter((it) => it.min_quantity > 0 && it.quantity <= it.min_quantity).length, [filteredItems])
  const expiringSoon = useMemo(() => filteredItems.filter((it) => {
    if (!it.expiry_date) return false
    return Math.ceil((it.expiry_date - Date.now()) / 86400000) <= 7
  }).length, [filteredItems])

  const handleOpenNew = () => {
    itemsHook.setEditingItem(null)
    itemsHook.setFormOpen(true)
  }
  const handleOpenEdit = (item) => {
    itemsHook.setEditingItem(item)
    itemsHook.setFormOpen(true)
  }

  const handleToggleExpired = () => {
    const next = !showExpired
    setShowExpired(next)
    if (next) {
      setActiveCategory('')
      setKeyword('')
      setKeywordInput('')
      setActiveLocation([])
    }
  }
  const handleClearLocation = () => {
    setActiveLocation([])
  }

  const handleSave = async (data) => {
    try {
      const payload = { ...data }
      if (!itemsHook.editingItem && !payload.item_no?.trim()) {
        try {
          payload.item_no = await generateItemNo()
        } catch { /* keep empty */ }
      }
      if (itemsHook.editingItem) {
        await updateItem(itemsHook.editingItem.id, payload)
        showToast(t('toast_updated', { name: data.name || '—' }))
      } else {
        await createItem(payload)
        showToast(t('toast_added', { name: data.name || '—' }))
      }
      itemsHook.setFormOpen(false)
      itemsHook.setEditingItem(null)
      await reload()
      await refreshCounts()
      await refreshCategories()
      await refreshLocations()
    } catch (e) {
      showToast(t('toast_saveFail', { msg: e.message }), 'error')
    }
  }

  const handleAskDelete = (item) => setConfirm({ open: true, id: item.id, name: item.name || '—' })

  exitBulkRef.current = exitBulkMode

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        const searchInput = document.querySelector('#search-input')
        searchInput?.focus()
      } else if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        exitBulkRef.current?.()
      } else if (e.key === '?' && !e.ctrlKey && !e.altKey && !(document.activeElement?.matches?.('input, textarea, [contenteditable]'))) {
        setShowShortcuts((v) => !v)
      } else if (e.key === 'Escape') {
        if (showShortcuts) setShowShortcuts(false)
        else if (itemsHook.formOpen) itemsHook.setFormOpen(false)
        else if (bulkMode) exitBulkRef.current?.()
        else if (lightbox.src) setLightbox({ src: '', alt: '' })
        else if (confirm.open) setConfirm({ open: false, id: null, name: '' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showShortcuts])

  handlersRef.current.imp = handleImportJSON
  handlersRef.current.ej = handleExportJSON
  handlersRef.current.ec = handleExportCSV

  const handleResolveCloseAction = async (action, remember) => {
    setClosePromptOpen(false)
    if (remember) setCloseAction(action)
    await winControl.resolveCloseAction({ action, remember })
  }

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

  const handleCancelDownloadUpdate = async () => {
    await cancelDownloadUpdate()
  }

  const handleInstallDownloadedUpdate = async () => {
    await installDownloadedUpdate()
  }

  const handleShowUpdateInFolder = async () => {
    await showUpdateInFolder()
  }

  const handlePickUpdateDownloadDir = async () => {
    const res = await pickUpdateDownloadDir()
    if (!res.canceled) {
      setUpdaterInfo((prev) => ({ ...prev, downloadDir: res.path }))
    }
  }

  const handleCloseUpdateDialog = () => {
    setUpdateDialog((d) => ({ ...d, open: false }))
  }

  const handleOpenUpdateExternal = async (url) => {
    await openUpdateExternal(url)
  }

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

  const handleCatsChanged = async () => {
    await refreshCategories()
    await refreshCounts()
  }
  const handleLocsChanged = async () => {
    await refreshLocations()
  }

  const handleRebuildMeta = async () => {
    try {
      const [catRes, locRes] = await Promise.all([rebuildCategories(), rebuildLocations()])
      await refreshCategories()
      await refreshLocations()
      await refreshCounts()
      await reload()
      showToast(
        t('toast_rebuildMeta', {
          cats: catRes.created || 0,
          locs: locRes.created || 0
        })
      )
    } catch (e) {
      showToast(t('toast_rebuildMetaFail', { msg: e.message }), 'error')
    }
  }

  const statisticsView = (
    <StatisticsView onBack={() => setView('items')} animations={animations} warmItems={warmItems} warmStats={warmStats} />
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
      onRebuildMeta={handleRebuildMeta}
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
      <div className="relative h-screen w-screen overflow-hidden bg-bg">
        <AnimatePresence>
          {view === 'statistics' && (
            <motion.div
              key="statistics"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.1, ease: EASE }}
              className="absolute inset-0 will-change-transform"
            >
              <ErrorBoundary onBack={() => setView('items')} onRetry={() => setView('items')}>
                {statisticsView}
              </ErrorBoundary>
            </motion.div>
          )}
          {view === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.1, ease: EASE }}
              className="absolute inset-0 will-change-transform"
            >
              <ErrorBoundary onBack={() => setView('items')} onRetry={() => setView('items')}>
                {settingsView}
              </ErrorBoundary>
            </motion.div>
          )}
          {view === 'categories' && (
            <motion.div
              key="categories"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.1, ease: EASE }}
              className="absolute inset-0 will-change-transform"
            >
              <ErrorBoundary onBack={() => setView('items')} onRetry={() => setView('items')}>
                {categoriesView}
              </ErrorBoundary>
            </motion.div>
          )}
          {view === 'locations' && (
            <motion.div
              key="locations"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.1, ease: EASE }}
              className="absolute inset-0 will-change-transform"
            >
              <ErrorBoundary onBack={() => setView('items')} onRetry={() => setView('items')}>
                {locationsView}
              </ErrorBoundary>
            </motion.div>
          )}
          {view === 'help' && (
            <motion.div
              key="help"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.1, ease: EASE }}
              className="absolute inset-0 will-change-transform"
            >
              <ErrorBoundary onBack={() => setView('items')} onRetry={() => setView('items')}>
                {helpView}
              </ErrorBoundary>
            </motion.div>
          )}
          {view === 'materials' && (
            <motion.div
              key="materials"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.1, ease: EASE }}
              className="absolute inset-0 will-change-transform"
            >
              <ErrorBoundary onBack={() => setView('items')} onRetry={() => setView('items')}>
                <MaterialLibrary onBack={() => setView('items')} />
              </ErrorBoundary>
            </motion.div>
          )}
          {view === 'locationMap' && (
            <motion.div
              key="locationMap"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.1, ease: EASE }}
              className="absolute inset-0 will-change-transform"
            >
              <ErrorBoundary onBack={() => setView('items')} onRetry={() => setView('items')}>
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
              </ErrorBoundary>
            </motion.div>
          )}
          {view === 'floorPlan' && floorPlanLocation && (
            <motion.div
              key="floorPlan"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.1, ease: EASE }}
              className="absolute inset-0 will-change-transform"
            >
              <ErrorBoundary
                onBack={() => {
                  setFloorPlanLocation(null)
                  setView('locationMap')
                }}
                onRetry={() => setView('items')}
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
              </ErrorBoundary>
            </motion.div>
          )}
          {view === 'items' && (
            <motion.div
              key="items"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.08, ease: EASE }}
              className="absolute inset-0 will-change-transform"
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
                  showExpired={showExpired}
                  onToggleExpired={handleToggleExpired}
                  onClearLocation={handleClearLocation}
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
                    onExportSelected={handleExportSelected}
                    onExportReport={handleExportExpiringReport}
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
                    onDensityChange={() => setCardDensity((d) => d === 'compact' ? 'medium' : d === 'medium' ? 'relaxed' : 'compact')}
                    notifOn={notifyEnabled}
                    onToggleNotif={() => setNotifyEnabled((v) => !v)}
                  />
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 pb-4" ref={itemsGridRef}>
                      <AnimatePresence>
                        {bulkMode && (
                          <div className="mb-4">
                            <BulkEditBar
                              selectedCount={selectedIds.size}
                              total={total}
                              categories={categories}
                              lang={lang}
                              onSelectAll={handleSelectAll}
                              onClear={handleClearSelection}
                              onChangeCategory={handleBulkChangeCategory}
                              onDelete={handleBulkDelete}
                              onBulkUpdateQuantity={handleBulkUpdateQuantity}
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
                        <>
                          <EmptyState onAdd={handleOpenNew} hasFilter={!!keyword || !!activeCategory || activeLocation.length > 0} t={t} />
                          {keyword && (
                            <div className="mb-4 flex flex-col items-center gap-2">
                              <span className="rounded-full bg-surface-hover px-3 py-1 text-xs text-text-tertiary">
                                {t('search_noResults')}
                              </span>
                              <button
                                type="button"
                                onClick={() => { setKeyword(''); setKeywordInput('') }}
                                className="flex items-center gap-1.5 rounded-lg bg-surface border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-hover hover:text-text-primary"
                              >
                                <XCircle size={13} />
                                {t('empty_clearFilter')}
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div>
                          <div className={cn(
                            'grid gap-4',
                            cardDensity === 'compact' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8' :
                            cardDensity === 'relaxed' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-2' :
                            'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
                          )}>
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
                                keyword={keyword}
                                index={i}
                              />
                            ))}
                          </div>
                          {paginationHasMore && !showExpired && (
                            <div className="mt-6 flex items-center justify-center gap-2 pb-2">
                              <button
                                type="button"
                                onClick={loadNextPage}
                                disabled={paginationLoading}
                                className="flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-border/60 hover:text-text disabled:opacity-50"
                                aria-label={t('items_loadMore')}
                              >
                                {paginationLoading ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <span className="opacity-60">+</span>
                                )}
                                {paginationLoading ? t('items_loadingMore') : t('items_loadMore')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {itemsHook.formOpen && (
                  <ItemForm
                    initial={itemsHook.editingItem}
                    categories={categories}
                    locations={locations}
                    lang={lang}
                    onSave={handleSave}
                    onClose={() => itemsHook.setFormOpen(false)}
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Toast toast={toast} onDone={() => setToast(null)} />
      <UpdateDialog
        open={updateDialog.open}
        status={updateDialog.status}
        info={updateDialog.info}
        progress={updateDialog.progress}
        downloadPath={updateDialog.downloadPath}
        onCheck={handleCheckUpdate}
        onDownload={handleDownloadUpdate}
        onCancelDownload={handleCancelDownloadUpdate}
        onInstall={handleInstallDownloadedUpdate}
        onShowInFolder={handleShowUpdateInFolder}
        onPickDownloadDir={handlePickUpdateDownloadDir}
        onClose={handleCloseUpdateDialog}
        onOpenExternal={handleOpenUpdateExternal}
      />
      <AnimatePresence>
        {showShortcuts && <ShortcutPanel open={showShortcuts} onClose={() => setShowShortcuts(false)} />}
      </AnimatePresence>
    </>
  )

  async function handleConfirmDelete() {
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
}