import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import ItemCard from './components/ItemCard'
import ItemForm from './components/ItemForm'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import {
  fetchAllItems,
  searchItems,
  fetchByCategory,
  fetchByCategoryAndKeyword,
  fetchCategoryCounts,
  createItem,
  updateItem,
  adjustQuantity,
  deleteItem,
  exportJSON,
  importJSON,
  exportCSV,
  saveFile,
  openFile
} from './lib/api'

export default function App() {
  const [items, setItems] = useState([])
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [counts, setCounts] = useState({})
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' })
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(false)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() })
  }, [])

  // 关键词防抖
  useEffect(() => {
    const t = setTimeout(() => setKeyword(keywordInput.trim()), 250)
    return () => clearTimeout(t)
  }, [keywordInput])

  const refreshCounts = useCallback(async () => {
    try {
      const rows = await fetchCategoryCounts()
      const m = {}
      rows.forEach((r) => (m[r.category] = r.count))
      setCounts(m)
    } catch (e) {
      // 忽略计数错误
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
      showToast('加载失败：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [keyword, activeCategory, showToast])

  useEffect(() => {
    reload()
  }, [reload])
  useEffect(() => {
    refreshCounts()
  }, [refreshCounts])

  // 统计（基于当前视图）
  const total = items.length
  const lowStock = items.filter((it) => it.min_quantity > 0 && it.quantity <= it.min_quantity).length
  const expiringSoon = items.filter((it) => {
    if (!it.expiry_date) return false
    const days = Math.ceil((it.expiry_date - Date.now()) / 86400000)
    return days <= 7
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
        showToast('已更新「' + (data.name || '物品') + '」')
      } else {
        await createItem(data)
        showToast('已添加「' + (data.name || '物品') + '」')
      }
      setFormOpen(false)
      setEditingItem(null)
      await reload()
      await refreshCounts()
    } catch (e) {
      showToast('保存失败：' + e.message, 'error')
    }
  }

  const handleAdjust = async (id, delta) => {
    // 乐观更新本地数量，保持顺序不跳动
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, quantity: Math.max(0, it.quantity + delta), updated_at: Date.now() } : it
      )
    )
    try {
      await adjustQuantity(id, delta)
    } catch (e) {
      showToast('更新数量失败', 'error')
      reload()
    }
  }

  const handleAskDelete = (item) => {
    setConfirm({ open: true, id: item.id, name: item.name || '该物品' })
  }
  const handleConfirmDelete = async () => {
    const { id, name } = confirm
    setConfirm({ open: false, id: null, name: '' })
    try {
      await deleteItem(id)
      showToast('已删除「' + name + '」')
      await reload()
      await refreshCounts()
    } catch (e) {
      showToast('删除失败：' + e.message, 'error')
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
      if (!res.canceled) showToast('已导出 JSON')
    } catch (e) {
      showToast('导出失败：' + e.message, 'error')
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
      if (!res.canceled) showToast('已导出 CSV')
    } catch (e) {
      showToast('导出失败：' + e.message, 'error')
    }
  }

  const handleImportJSON = async () => {
    try {
      const res = await openFile({ filters: [{ name: 'JSON', extensions: ['json'] }] })
      if (res.canceled) return
      const { imported } = await importJSON(res.content)
      showToast(`已导入 ${imported} 条物品`)
      await reload()
      await refreshCounts()
    } catch (e) {
      showToast('导入失败，请检查文件格式：' + e.message, 'error')
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-100">
      <Sidebar
        activeCategory={activeCategory}
        onSelect={setActiveCategory}
        counts={counts}
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
        />
        <main className="flex-1 overflow-y-auto p-6">
          {loading && items.length === 0 ? (
            <div className="flex h-full items-center justify-center text-stone-400">加载中…</div>
          ) : items.length === 0 ? (
            <EmptyState onAdd={handleOpenNew} hasFilter={!!keyword || !!activeCategory} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.map((it) => (
                <ItemCard
                  key={it.id}
                  item={it}
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
        <ItemForm initial={editingItem} onSave={handleSave} onClose={() => setFormOpen(false)} />
      )}
      <ConfirmDialog
        open={confirm.open}
        title="删除物品"
        message={`确定要删除「${confirm.name}」吗？此操作不可撤销。`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirm({ open: false, id: null, name: '' })}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}

function EmptyState({ onAdd, hasFilter }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-4 text-6xl">{hasFilter ? '🔍' : '🏠'}</div>
      <p className="mb-1 text-lg font-medium text-stone-600">
        {hasFilter ? '没有找到匹配的物品' : '还没有物品'}
      </p>
      <p className="mb-6 text-sm text-stone-400">
        {hasFilter ? '试试换个关键词或分类' : '点击下方按钮，添加你的第一件家庭物品'}
      </p>
      {!hasFilter && (
        <button
          onClick={onAdd}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
        >
          + 添加物品
        </button>
      )}
    </div>
  )
}
