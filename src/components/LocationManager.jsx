import { useState, useEffect } from 'react'
import { useI18n } from '../lib/i18n'
import {
  createLocation,
  updateLocation,
  deleteLocation,
  buildLocationTree,
  fetchLocationItemCounts
} from '../lib/api'
import ConfirmDialog from './ConfirmDialog'

export default function LocationManager({ locations, lang, onBack, onChanged, showToast }) {
  const { t } = useI18n()
  const [addingRoot, setAddingRoot] = useState(false)
  const [rootName, setRootName] = useState('')
  const [addChildId, setAddChildId] = useState(null)
  const [childName, setChildName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' })
  const [itemCounts, setItemCounts] = useState({})

  const tree = buildLocationTree(locations)

  useEffect(() => {
    fetchLocationItemCounts()
      .then((rows) => {
        const m = {}
        rows.forEach((r) => (m[r.name] = r.count))
        setItemCounts(m)
      })
      .catch(() => {})
  }, [locations])

  const handleAddRoot = async (e) => {
    e.preventDefault()
    if (!rootName.trim()) return
    try {
      await createLocation({ name: rootName.trim(), parentId: '' })
      showToast(t('toast_addedLoc'))
      setRootName('')
      setAddingRoot(false)
      await onChanged()
    } catch (err) {
      showToast(t('toast_saveFail', { msg: err.message }), 'error')
    }
  }

  const handleAddChild = async (parentId) => {
    if (!childName.trim()) return
    try {
      await createLocation({ name: childName.trim(), parentId })
      showToast(t('toast_addedLoc'))
      setChildName('')
      setAddChildId(null)
      await onChanged()
    } catch (err) {
      showToast(t('toast_saveFail', { msg: err.message }), 'error')
    }
  }

  const handleSaveRename = async (id) => {
    if (!editName.trim()) return
    try {
      await updateLocation(id, { name: editName.trim() })
      showToast(t('toast_renamed'))
      setEditingId(null)
      await onChanged()
    } catch (err) {
      showToast(t('toast_saveFail', { msg: err.message }), 'error')
    }
  }

  const handleDelete = async () => {
    const { id } = confirm
    setConfirm({ open: false, id: null, name: '' })
    try {
      await deleteLocation(id)
      showToast(t('toast_deletedLoc'))
      await onChanged()
    } catch (err) {
      showToast(t('toast_deleteFail', { msg: err.message }), 'error')
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-stone-100">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-6 py-4">
        <button onClick={onBack} className="rounded-md p-1.5 text-stone-500 transition hover:bg-stone-100">
          ←
        </button>
        <h1 className="flex-1 text-lg font-semibold text-stone-800">{t('loc_title')}</h1>
        <button
          onClick={() => setAddingRoot((a) => !a)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
        >
          + {t('loc_addRoot')}
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        {addingRoot && (
          <form onSubmit={handleAddRoot} className="mb-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex gap-2">
              <input
                type="text"
                value={rootName}
                onChange={(e) => setRootName(e.target.value)}
                className="input"
                placeholder={t('loc_name_placeholder')}
                autoFocus
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                {t('btn_save')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingRoot(false)
                  setRootName('')
                }}
                className="shrink-0 rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
              >
                {t('btn_cancel')}
              </button>
            </div>
          </form>
        )}

        {tree.length === 0 && !addingRoot ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-12 text-center text-sm text-stone-400">
            {t('loc_empty')}
          </div>
        ) : (
          <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
            {tree.map((node) => (
              <LocationNode
                key={node.id}
                node={node}
                depth={0}
                itemCounts={itemCounts}
                t={t}
                editingId={editingId}
                editName={editName}
                setEditName={setEditName}
                setEditingId={setEditingId}
                addChildId={addChildId}
                childName={childName}
                setChildName={setChildName}
                setAddChildId={setAddChildId}
                onAddChild={handleAddChild}
                onSaveRename={handleSaveRename}
                onAskDelete={(id, name) => setConfirm({ open: true, id, name })}
              />
            ))}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirm.open}
        title={t('confirm_deleteLocTitle')}
        message={t('confirm_deleteLoc', { name: confirm.name })}
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ open: false, id: null, name: '' })}
      />
    </div>
  )
}

function LocationNode({
  node,
  depth,
  itemCounts,
  t,
  editingId,
  editName,
  setEditName,
  setEditingId,
  addChildId,
  childName,
  setChildName,
  setAddChildId,
  onAddChild,
  onSaveRename,
  onAskDelete
}) {
  const hasChildren = node.children && node.children.length > 0
  const [open, setOpen] = useState(depth < 1)
  const count = itemCounts[node.name] || 0
  const isEditing = editingId === node.id
  const isAddingChild = addChildId === node.id

  return (
    <div>
      <div
        className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-stone-50"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-4 shrink-0 text-stone-400"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {isEditing ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveRename(node.id)
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="input py-1"
              autoFocus
            />
            <button
              onClick={() => onSaveRename(node.id)}
              className="shrink-0 rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            >
              ✓
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="shrink-0 rounded-md border border-stone-200 px-3 py-1 text-xs text-stone-500 hover:bg-stone-50"
            >
              ✕
            </button>
          </div>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm text-stone-700">📁 {node.name}</span>
            {count > 0 && (
              <span className="shrink-0 text-[11px] text-stone-400">{t('loc_itemCount', { n: count })}</span>
            )}
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              <button
                onClick={() => {
                  setEditingId(node.id)
                  setEditName(node.name)
                }}
                title={t('loc_rename')}
                className="rounded p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              >
                ✏️
              </button>
              <button
                onClick={() => {
                  setAddChildId(isAddingChild ? null : node.id)
                  setChildName('')
                }}
                title={t('loc_addChild')}
                className="rounded p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              >
                ➕
              </button>
              <button
                onClick={() => onAskDelete(node.id, node.name)}
                title={t('btn_delete')}
                className="rounded p-1 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600"
              >
                🗑️
              </button>
            </div>
          </>
        )}
      </div>

      {isAddingChild && (
        <div
          className="flex items-center gap-2 rounded-lg bg-emerald-50/50 py-1.5 pr-2"
          style={{ marginLeft: `${depth * 20 + 28}px` }}
        >
          <input
            type="text"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAddChild(node.id)
              if (e.key === 'Escape') setAddChildId(null)
            }}
            className="input py-1"
            placeholder={t('loc_name_placeholder')}
            autoFocus
          />
          <button
            onClick={() => onAddChild(node.id)}
            className="shrink-0 rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
          >
            {t('btn_save')}
          </button>
          <button
            onClick={() => setAddChildId(null)}
            className="shrink-0 rounded-md border border-stone-200 px-3 py-1 text-xs text-stone-500 hover:bg-stone-50"
          >
            {t('btn_cancel')}
          </button>
        </div>
      )}

      {hasChildren &&
        open &&
        node.children.map((c) => (
          <LocationNode
            key={c.id}
            node={c}
            depth={depth + 1}
            itemCounts={itemCounts}
            t={t}
            editingId={editingId}
            editName={editName}
            setEditName={setEditName}
            setEditingId={setEditingId}
            addChildId={addChildId}
            childName={childName}
            setChildName={setChildName}
            setAddChildId={setAddChildId}
            onAddChild={onAddChild}
            onSaveRename={onSaveRename}
            onAskDelete={onAskDelete}
          />
        ))}
    </div>
  )
}
