import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { withError, safe } from '../lib/errorHandler'
import {
  fetchAllItems,
  searchItems,
  fetchByCategory,
  fetchByCategoryAndKeyword,
  fetchCategoryCounts,
  fetchCategories,
  fetchLocations,
  fetchStatistics,
  fetchItemsPaged,
  fetchItemsTotal,
  createItem,
  updateItem,
  adjustQuantity,
  deleteItem,
  bulkDeleteItems,
  bulkUpdateCategory,
  bulkUpdateField,
  bulkPreview,
  exportJSON,
  exportCSV,
  exportSelectedJSON,
  exportExpiringReport,
  importJSON,
  saveFile,
  openFile,
  generateItemNo,
  buildLocationCounts
} from '../lib/api'

// ---------------------------------------------------------------------------
// useToasts
// ---------------------------------------------------------------------------
// 队列化 Toast：批量操作时不再前一条被顶掉，最多堆叠 3 条
const TOAST_DURATION = 2800
const MAX_STACK = 3

export function useToasts() {
  const [toast, setToast] = useState(null)
  const [queue, setQueue] = useState([])

  const showToast = useCallback((message, type = 'success', opts) => {
    const item = { message, type, id: Date.now() + Math.random(), targetId: opts?.targetId || null }
    if (toast) {
      setQueue((q) => {
        if (q.length >= MAX_STACK) return q
        return [...q, item]
      })
    } else {
      setToast(item)
    }
  }, [toast])

  const setToastInternal = useCallback((value) => {
    setToast(value)
  }, [])

  const done = useCallback(() => {
    setQueue((q) => {
      const next = q[0]
      if (next) {
        setToast(next)
        return q.slice(1)
      }
      setToast(null)
      return q
    })
  }, [])

  return { toast, setToast: setToastInternal, showToast, done }
}

// ---------------------------------------------------------------------------
// useFilters
// ---------------------------------------------------------------------------
export function useFilters() {
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [activeLocation, setActiveLocation] = useState([])
  const [showExpired, setShowExpired] = useState(false)
  const [searchHistory, setSearchHistory] = useState([])

  useEffect(() => {
    const tm = setTimeout(() => {
      const finalKeyword = keywordInput.trim()
      // requestIdleCallback defers the final state commit so rapid typing
      // does not block paint on the main thread during filter computation.
      if (typeof window !== 'undefined' && window.requestIdleCallback) {
        window.requestIdleCallback(() => setKeyword(finalKeyword), { timeout: 100 })
      } else {
        setKeyword(finalKeyword)
      }
    }, 250)
    return () => clearTimeout(tm)
  }, [keywordInput])

  const loadSearchHistory = useCallback(() => {
    try {
      const saved = localStorage.getItem('searchHistory')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setSearchHistory(parsed.slice(0, 10))
      }
    } catch { /* ignore */ }
  }, [])

  const saveSearchHistory = useCallback((term) => {
    if (!term) return
    try {
      const prev = JSON.parse(localStorage.getItem('searchHistory') || '[]')
      const next = [term, ...prev.filter((s) => s !== term)].slice(0, 10)
      localStorage.setItem('searchHistory', JSON.stringify(next))
      setSearchHistory(next)
    } catch { /* ignore */ }
  }, [])

  const applyFilter = useCallback(() => {
    // no-op — real filter application lives in useItems.reload
  }, [])

  return {
    keyword, setKeyword,
    keywordInput, setKeywordInput,
    activeCategory, setActiveCategory,
    activeLocation, setActiveLocation,
    showExpired, setShowExpired,
    searchHistory, setSearchHistory,
    loadSearchHistory,
    saveSearchHistory,
    applyFilter
  }
}

// ---------------------------------------------------------------------------
// useBulk — depends on filteredItems, selectedIds, setSelectedIds from useItems
// ---------------------------------------------------------------------------
export function useBulk(filteredItems, selectedIds, setSelectedIds) {
  const [bulkMode, setBulkMode] = useState(false)

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [setSelectedIds])

  const handleSelectAll = useCallback(() => {
    if (!filteredItems || filteredItems.length === 0) return
    setSelectedIds((prev) => {
      if (prev.size === filteredItems.length) return new Set()
      return new Set(filteredItems.map((it) => it.id))
    })
  }, [filteredItems, setSelectedIds])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [setSelectedIds])

  const handleClearSelection = clearSelection

  const exitBulkMode = useCallback(() => {
    setBulkMode(false)
    setSelectedIds(new Set())
  }, [setSelectedIds])

  const isBulkEmpty = selectedIds.size === 0

  return {
    bulkMode, setBulkMode,
    toggleSelect,
    clearSelection,
    handleSelectAll,
    handleClearSelection,
    exitBulkMode,
    isBulkEmpty
  }
}

// ---------------------------------------------------------------------------
// useSettings
// ---------------------------------------------------------------------------
export function useSettings(getSettings, setSettingsFn, applyThemeClass) {
  const [theme, setTheme] = useState('light')
  const [animations, setAnimations] = useState(true)
  const [closeAction, setCloseAction] = useState('')
  const [lang, setLang] = useState('zh-CN')
  const [warmItems, setWarmItems] = useState([])
  const [warmStats, setWarmStats] = useState(null)

  useEffect(() => {
    if (!getSettings) return
    getSettings().then((s) => {
      const initialTheme = s.theme || 'light'
      setTheme(initialTheme)
      if (applyThemeClass) applyThemeClass(initialTheme)
      const anim = s.animations !== false
      setAnimations(anim)
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.toggle('no-anim', !anim)
      }
      setCloseAction(s.closeAction || '')
      if (s.language) setLang(s.language)
    }).catch(() => { /* ignore init failure */ })
  }, [getSettings, setSettingsFn, applyThemeClass])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyThemeClass && applyThemeClass(theme)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme, applyThemeClass])

  const handleChangeLang = useCallback(async (l) => {
    if (setSettingsFn) await setSettingsFn({ language: l })
    setLang(l)
    // 通知 I18nProvider 同步
    window.dispatchEvent(new CustomEvent('language:change', { detail: { lang: l } }))
  }, [setSettingsFn])

  const handleChangeTheme = useCallback(async (nextTheme) => {
    if (setSettingsFn) await setSettingsFn({ theme: nextTheme })
    setTheme(nextTheme)
    if (applyThemeClass) applyThemeClass(nextTheme)
  }, [setSettingsFn, applyThemeClass])

  const handleChangeAnimations = useCallback(async (on) => {
    if (setSettingsFn) await setSettingsFn({ animations: on })
    setAnimations(on)
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.classList.toggle('no-anim', !on)
    }
  }, [setSettingsFn])

  const handleChangeCloseAction = useCallback(async (action) => {
    if (setSettingsFn) await setSettingsFn({ closeAction: action })
    setCloseAction(action)
  }, [setSettingsFn])

  useEffect(() => {
    Promise.allSettled([
      fetchAllItems().then((all) => {
        setWarmItems(all)
        return { items: all }
      }),
      fetchStatistics().then((s) => { setWarmStats(s); return { stats: s } })
    ]).catch(() => {})
  }, [])

  return {
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
  }
}

// ---------------------------------------------------------------------------
// useItems — main data hook; owns selectedIds internally
// ---------------------------------------------------------------------------
export function useItems(deps) {
  const {
    keyword,
    activeCategory,
    showExpired,
    showToast,
    t
  } = deps || {}

  const [items, setItems] = useState([])
  const [allItems, setAllItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [counts, setCounts] = useState({})
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [editingItem, setEditingItem] = useState(null)
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' })
  const [formOpen, setFormOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [paginationPage, setPaginationPage] = useState(1)
  const [paginationLoading, setPaginationLoading] = useState(false)
  const [paginationHasMore, setPaginationHasMore] = useState(true)
  const [paginationLoadedIds, setPaginationLoadedIds] = useState(new Set())
  const [totalCount, setTotalCount] = useState(0)
  const [totalAllCount, setTotalAllCount] = useState(0)

  const PAGE_SIZE = 60

  const paginationOpts = useMemo(() => ({
    category: activeCategory,
    keyword,
    showExpired
  }), [activeCategory, keyword, showExpired])

  // Stable refs for callbacks that change but whose identity is not needed.
  const depsRef = useRef({ showToast, t, paginationOpts })
  useEffect(() => { depsRef.current = { showToast, t, paginationOpts } }, [showToast, t, paginationOpts])

  const refreshCategories = useCallback(async () => {
    await safe(fetchCategories, [])
      .then(({ ok, data }) => { if (ok) setCategories(data) })
  }, [])

  const refreshLocations = useCallback(async () => {
    await safe(fetchLocations, [])
      .then(({ ok, data }) => { if (ok) setLocations(data) })
  }, [])

  const refreshCounts = useCallback(async () => {
    await safe(fetchCategoryCounts, [])
      .then(({ ok, data }) => {
        if (ok) {
          const m = {}
          data.forEach((r) => (m[r.category] = r.count))
          setCounts(m)
        }
      })
  }, [])

  const fetchItems = useCallback(async (initialPage = false, forceOpts) => {
    setLoadingItems(true)
    const { showToast: st, t: tx } = depsRef.current
    // 允许传入强制 opts，避免 ref 更新时机竞争
    const opts = forceOpts || depsRef.current.paginationOpts
    try {
      let rows
      let all
      let total
      if (showExpired) {
        all = await fetchAllItems()
        const now = Date.now()
        const sevenDays = 7 * 86400000
        rows = all.filter((it) => {
          if (!it.expiry_date) return false
          return it.expiry_date <= now + sevenDays
        })
        setAllItems(all)
        total = rows.length
        setTotalCount(total)
        setTotalAllCount(all.length)
        setPaginationPage(1)
        setPaginationHasMore(false)
        setPaginationLoadedIds(new Set(rows.map((it) => it.id)))
        setItems(rows)
      } else {
        const [rowsFetched, totalFetched, allItemsFromDB] = await Promise.all([
          fetchItemsPaged(0, PAGE_SIZE, opts),
          fetchItemsTotal(opts),
          fetchAllItems()
        ])
        rows = rowsFetched
        all = allItemsFromDB
        setAllItems(all)
        total = (totalFetched && totalFetched[0] && totalFetched[0].cnt) || 0
        setTotalCount(total)
        setTotalAllCount(all.length)
        setPaginationPage(1)
        setPaginationHasMore(rowsFetched.length >= PAGE_SIZE)
        setPaginationLoadedIds(new Set(rowsFetched.map((it) => it.id)))
        setItems(rowsFetched)
      }
    } finally {
      setLoadingItems(false)
    }
  }, [showExpired])

  const loadNextPage = useCallback(async () => {
    if (paginationLoading || !paginationHasMore || showExpired) return
    setPaginationLoading(true)
    try {
      const nextPage = paginationPage + 1
      const offset = (nextPage - 1) * PAGE_SIZE
      const opts = depsRef.current.paginationOpts
      const result = await safe(
        () => fetchItemsPaged(offset, PAGE_SIZE, opts),
        []
      )
      if (!result.ok) return
      const nextRows = result.data
      if (nextRows && nextRows.length > 0) {
        setPaginationPage(nextPage)
        setPaginationLoadedIds((prev) => {
          const next = new Set(prev)
          nextRows.forEach((it) => next.add(it.id))
          return next
        })
        setItems((prev) => [...prev, ...nextRows])
        setPaginationHasMore(nextRows.length >= PAGE_SIZE)
      } else {
        setPaginationHasMore(false)
      }
    } finally {
      setPaginationLoading(false)
    }
  }, [paginationPage, paginationLoading, paginationHasMore, showExpired])

  const reload = useCallback(async () => {
    await fetchItems()
    await refreshCounts()
  }, [fetchItems, refreshCounts])

  useEffect(() => {
    refreshCategories()
    refreshLocations()
  }, [refreshCategories, refreshLocations])

  // 当过滤条件（分类/关键词/过期）变化时重新加载数据，确保主页面分类切换后右侧列表同步更新
  const paginationKey = JSON.stringify(paginationOpts)
  useEffect(() => {
    // 直接传 forceOpts，避免 depsRef.current 更新时机竞争
    fetchItems(false, paginationOpts)
  }, [paginationKey, fetchItems])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.lingguang && window.lingguang.agent) {
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
    }
  }, [reload, refreshCounts, refreshCategories, refreshLocations])

  const handleCreateItem = async (data) => {
    const { showToast: st, t: tx } = depsRef.current
    const doCreate = async (d) => {
      const payload = { ...d }
      if (!payload.item_no?.trim()) {
        try { payload.item_no = await generateItemNo() } catch { /* keep empty */ }
      }
      await createItem(payload)
      if (st) st(tx ? tx('toast_added', { name: d.name || '—' }) : 'Added')
      setFormOpen(false)
      setEditingItem(null)
      await reload()
      await refreshCategories()
      await refreshLocations()
    }
    const result = await withError(doCreate, {
      fallback: null,
      onError: (e) => {
        if (st) st(tx ? tx('toast_saveFail', { msg: e.message }) : e.message, 'error')
      }
    })(data)
    return result
  }

  const handleUpdateItem = async (data) => {
    const { showToast: st, t: tx } = depsRef.current
    const doUpdate = async (d) => {
      const payload = { ...d }
      if (!editingItem && !payload.item_no?.trim()) {
        try { payload.item_no = await generateItemNo() } catch { /* keep empty */ }
      }
      if (editingItem) {
        await updateItem(editingItem.id, payload)
        if (st) st(tx ? tx('toast_updated', { name: d.name || '—' }) : 'Updated')
      } else {
        await createItem(payload)
        if (st) st(tx ? tx('toast_added', { name: d.name || '—' }) : 'Added')
      }
      setFormOpen(false)
      setEditingItem(null)
      await reload()
      await refreshCategories()
      await refreshLocations()
    }
    const result = await withError(doUpdate, {
      fallback: null,
      onError: (e) => {
        if (st) st(tx ? tx('toast_saveFail', { msg: e.message }) : e.message, 'error')
      }
    })(data)
    return result
  }

  const handleDeleteItem = async (id) => {
    const { showToast: st, t: tx } = depsRef.current
    const result = await withError(async () => {
      await deleteItem(id)
      if (st) st(tx ? tx('toast_deleted', { name: '—' }) : 'Deleted')
      await reload()
    }, {
      fallback: null,
      onError: (e) => {
        if (st) st(tx ? tx('toast_deleteFail', { msg: e.message }) : e.message, 'error')
      }
    })()
    return result
  }

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const msg = t ? t('confirm_bulkDeleteMsg', { n: ids.length }) : `${ids.length} items`
    setConfirm({ open: true, bulk: true, ids, name: msg })
  }, [selectedIds, t])

  const handleConfirmBulkDelete = async () => {
    const { ids } = confirm
    setConfirm({ open: false, id: null, name: '' })
    try {
      const res = await bulkDeleteItems(ids)
      if (showToast) showToast(t ? t('toast_bulkDeleted', { n: res.deleted }) : `Deleted ${res.deleted}`)
      setSelectedIds(new Set())
      await reload()
    } catch (e) {
      if (showToast) showToast(t ? t('toast_deleteFail', { msg: e.message }) : e.message, 'error')
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
      if (showToast) showToast(t ? t('toast_qtyFail') : 'Quantity update failed', 'error')
      await reload()
    }
  }

  const handleBulkChangeCategory = async (category) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      const res = await bulkUpdateCategory(ids, category)
      if (showToast) showToast(t ? t('toast_bulkUpdated', { n: res.updated }) : `Updated ${res.updated}`)
      setSelectedIds(new Set())
      await reload()
    } catch (e) {
      if (showToast) showToast(t ? t('toast_saveFail', { msg: e.message }) : e.message, 'error')
    }
  }

  const handleBulkUpdateQuantity = async ({ op, value }) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      const changed = []
      if (typeof window !== 'undefined' && window.lingguang && window.lingguang.api && window.lingguang.api.db) {
        const rows = await window.lingguang.api.db.query({
          sql: `SELECT id, name, quantity FROM items WHERE id IN (${ids.map(() => '?').join(',')})`,
          binds: ids
        })
        for (const r of rows) {
          const cur = Number(r.quantity) || 0
          const next = op === '+' ? cur + value : op === '-' ? Math.max(0, cur - value) : value
          if (cur === next) continue
          changed.push({ name: r.name, from: cur, to: next })
        }
        if (changed.length === 0) {
          if (showToast) showToast(t ? t('toast_bulkQtyUpdated', { n: 0 }) : 'No quantity changes')
          return
        }
        // Use batch IPC: single transaction
        if (op === 'set') {
          await window.lingguang.items.batchUpdate('quantity', value, ids)
        } else if (op === '+') {
          await window.lingguang.items.batchChangeQty(ids, 'add', value)
        } else if (op === '-') {
          await window.lingguang.items.batchChangeQty(ids, 'add', -value)
        }
      }
      if (showToast) showToast(t ? t('toast_bulkQtyUpdated', { n: changed.length }) : `Updated qty for ${changed.length}`)
      setSelectedIds(new Set())
      await reload()
    } catch (e) {
      if (showToast) showToast(t ? t('toast_saveFail', { msg: e.message }) : e.message, 'error')
    }
  }

  const handleBulkUpdateField = async (ids, field, value) => {
    try {
      const res = await bulkUpdateField(ids, field, value)
      if (showToast) showToast(t ? t('toast_bulkUpdated', { n: res.updated }) : `Updated ${res.updated}`)
      setSelectedIds(new Set())
      await reload()
    } catch (e) {
      if (showToast) showToast(t ? t('toast_saveFail', { msg: e.message }) : e.message, 'error')
    }
  }

  const handleBulkPreview = async (ids, field) => {
    try {
      const preview = await bulkPreview(ids, field)
      return preview
    } catch (e) {
      if (showToast) showToast(t ? t('toast_saveFail', { msg: e.message }) : e.message, 'error')
      return null
    }
  }

  const handleBulkChangeQty = handleBulkUpdateQuantity

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [setSelectedIds])

  const handleAddToCart = useCallback(() => {
    // placeholder for cart integration
  }, [])

  const handleCopyItemNo = useCallback((itemNo) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(itemNo).catch(() => { /* ignore */ })
    }
  }, [])

  const handleOpenInMap = useCallback((location) => {
    return location
  }, [])

  const handleExportJSON = async () => {
    try {
      const json = await exportJSON()
      const res = await saveFile({
        content: json,
        defaultName: `inventory-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (!res.canceled && showToast) showToast(t ? t('toast_exported') : 'Exported')
    } catch (e) {
      if (showToast) showToast(t ? t('toast_exportFail', { msg: e.message }) : e.message, 'error')
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
      if (!res.canceled && showToast) showToast(t ? t('toast_exported') : 'Exported')
    } catch (e) {
      if (showToast) showToast(t ? t('toast_exportFail', { msg: e.message }) : e.message, 'error')
    }
  }

  const handleExportSelected = async () => {
    if (selectedIds.size === 0) {
      if (showToast) showToast(t ? t('toast_selectedEmpty') : 'No items selected', 'warning')
      return
    }
    try {
      const json = await exportSelectedJSON(Array.from(selectedIds))
      const res = await saveFile({
        content: json,
        defaultName: `inventory-selected-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (!res.canceled && showToast) showToast(t ? t('toast_exported') : 'Exported')
    } catch (e) {
      if (showToast) showToast(t ? t('toast_exportFail', { msg: e.message }) : e.message, 'error')
    }
  }

  const handleExportExpiringReport = async () => {
    try {
      const report = await exportExpiringReport()
      const lines = []
      lines.push('=== 过期物品报表 / Expiry Report ===')
      lines.push(`生成时间 / Generated: ${new Date().toISOString()}`)
      lines.push('')
      lines.push(`已过期 / Expired: ${report.expired.length}`)
      lines.push(`即将过期 (7天内) / Expiring within 7d: ${report.expiring.length}`)
      lines.push(`低库存 / Low Stock: ${report.lowStock.length}`)
      lines.push('')
      if (report.expired.length) {
        lines.push('--- 已过期 ---')
        report.expired.forEach((it) => lines.push(`${it.item_no || '—'}\t${it.name}\t过期 ${Math.abs(it.daysLeft)} 天\t${it.position || ''}`))
        lines.push('')
      }
      if (report.expiring.length) {
        lines.push('--- 即将过期 ---')
        report.expiring.forEach((it) => lines.push(`${it.item_no || '—'}\t${it.name}\t剩余 ${it.daysLeft} 天\t${it.position || ''}`))
        lines.push('')
      }
      if (report.lowStock.length) {
        lines.push('--- 低库存 ---')
        report.lowStock.forEach((it) => lines.push(`${it.item_no || '—'}\t${it.name}\t数量 ${it.quantity}/${it.min_quantity}\t${it.position || ''}`))
      }
      const res = await saveFile({
        content: lines.join('\n'),
        defaultName: `expiry-report-${new Date().toISOString().slice(0, 10)}.txt`,
        filters: [{ name: '文本', extensions: ['txt'] }]
      })
      if (!res.canceled && showToast) showToast(t ? t('toast_exportedReport') : 'Exported')
    } catch (e) {
      if (showToast) showToast(t ? t('toast_exportFail', { msg: e.message }) : e.message, 'error')
    }
  }

  const handleImport = async () => {
    try {
      const res = await openFile({ filters: [{ name: 'JSON', extensions: ['json'] }] })
      if (res.canceled) return
      const { imported } = await importJSON(res.content)
      if (showToast) showToast(t ? t('toast_imported', { n: imported }) : `Imported ${imported}`)
      await reload()
      await refreshCategories()
      await refreshLocations()
    } catch (e) {
      if (showToast) showToast(t ? t('toast_importFail', { msg: e.message }) : e.message, 'error')
    }
  }

  return {
    items, setItems,
    allItems, setAllItems,
    loadingItems, setLoadingItems,
    counts, setCounts,
    categories, setCategories,
    locations, setLocations,
    editingItem, setEditingItem,
    confirm, setConfirm,
    formOpen, setFormOpen,
    selectedIds, setSelectedIds,
    fetchItems,
    reload,
    refreshCategories,
    refreshLocations,
    refreshCounts,
    handleCreateItem,
    handleUpdateItem,
    handleDeleteItem,
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
    handleImport,
    handleClearSelection,
    handleAddToCart,
    handleCopyItemNo,
    handleOpenInMap,
    paginationPage,
    paginationLoading,
    paginationHasMore,
    paginationLoadedIds,
    loadNextPage,
    totalCount,
    totalAllCount,
    PAGE_SIZE
  }
}