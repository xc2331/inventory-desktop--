import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useI18n } from './lib/i18n'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import ItemCard from './components/ItemCard'
import ItemForm from './components/ItemForm'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import SettingsView from './components/SettingsView'
import CategoryManager from './components/CategoryManager'
import LocationManager from './components/LocationManager'
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
  exportJSON,
  importJSON,
  exportCSV,
  saveFile,
  openFile,
  setSettings,
  setDataDir,
  resetDataDir,
  pickFolder,
  locationMatchesPath,
  buildLocationCounts
} from './lib/api'

export default function App() {
  const { t, lang, setLang } = useI18n()
  const [view, setView] = useState('items') // items | settings | categories | locations
  const [items, setItems] = useState([])
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
      let rows
      if (keyword) {
        rows = activeCategory
          ? await fetchByCategoryAndKeyword(activeCategory, keyword)
          : await searchItems(keyword)
      } else if (activeCategory) {
        rows = await fetchByCategory(activeCategory)
      } else {
        rows = await fetchAllItems()
      }
      setItems(rows)
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

  // 当前可见物品（含位置筛选）
  const filteredItems = useMemo(() => {
    if (!activeLocation || activeLocation.length === 0) return items
    return items.filter((it) => locationMatchesPath(it, activeLocation))
  }, [items, activeLocation])

  const locationCounts = useMemo(() => buildLocationCounts(items), [items])

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
      if (editingItem) {
        await updateItem(editingItem.id, data)
        showToast(t('toast_updated', { name: data.name || '—' }))
      } else {
        await createItem(data)
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
  if (view === 'settings') {
    return (
      <SettingsView
        onBack={() => setView('items')}
        onChangeLang={handleChangeLang}
        onChangeDataDir={handleChangeDataDir}
        onResetDataDir={handleResetDataDir}
        onManageCategories={() => setView('categories')}
        onManageLocations={() => setView('locations')}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onImport={handleImportJSON}
      />
    )
  }
  if (view === 'categories') {
    return (
      <CategoryManager
        categories={categories}
        counts={counts}
        lang={lang}
        onBack={() => setView('settings')}
        onChanged={handleCatsChanged}
        showToast={showToast}
      />
    )
  }
  if (view === 'locations') {
    return (
      <LocationManager
        locations={locations}
        lang={lang}
        onBack={() => setView('settings')}
        onChanged={handleLocsChanged}
        showToast={showToast}
      />
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-100">
      <Sidebar
        activeCategory={activeCategory}
        onSelectCategory={(c) => {
          setActiveCategory(c)
          setView('items')
        }}
        activeLocation={activeLocation}
        onSelectLocation={(path) => {
          setActiveLocation(path)
          setActiveCategory('')
          setView('items')
        }}
        counts={counts}
        categories={categories}
        locations={locations}
        locationCounts={locationCounts}
        lang={lang}
        onOpenSettings={() => setView('settings')}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          keyword={keywordInput}
          onKeywordChange={setKeywordInput}
          onAdd={handleOpenNew}
          onImport={handleImportJSON}
          onExportJSON={handleExportJSON}
          onExportCSV={handleExportCSV}
          total={total}
          lowStock={lowStock}
          expiringSoon={expiringSoon}
          activeCategory={activeCategory}
          activeLocation={activeLocation}
          categories={categories}
          lang={lang}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {loading && items.length === 0 ? (
            <div className="flex h-full items-center justify-center text-stone-400">{t('loading')}</div>
          ) : filteredItems.length === 0 ? (
            <EmptyState onAdd={handleOpenNew} hasFilter={!!keyword || !!activeCategory || activeLocation.length > 0} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredItems.map((it) => (
                <ItemCard
                  key={it.id}
                  item={it}
                  categories={categories}
                  lang={lang}
                  onAdjust={handleAdjust}
                  onEdit={handleOpenEdit}
                  onDelete={handleAskDelete}
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
        title={t('confirm_deleteTitle')}
        message={t('confirm_deleteMsg', { name: confirm.name })}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirm({ open: false, id: null, name: '' })}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  )

  function EmptyState({ onAdd, hasFilter }) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="mb-4 text-6xl">{hasFilter ? '🔍' : '🏠'}</div>
        <p className="mb-1 text-lg font-medium text-stone-600">
          {hasFilter ? t('empty_noMatch') : t('empty_noItems')}
        </p>
        <p className="mb-6 text-sm text-stone-400">
          {hasFilter ? t('empty_tryFilter') : t('empty_addFirst')}
        </p>
        {!hasFilter && (
          <button
            onClick={onAdd}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
          >
            + {t('btn_add')}
          </button>
        )}
      </div>
    )
  }
}
