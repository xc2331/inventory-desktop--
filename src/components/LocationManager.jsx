import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, Check, X, ChevronRight, Folder, Package } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import {
  createLocation,
  updateLocation,
  deleteLocation,
  buildLocationTree,
  fetchLocationItemCounts
} from '../lib/api'
import { EASE } from '../lib/motion'
import ConfirmDialog from './ConfirmDialog'
import PageHeader from './PageHeader'

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

  const addAction = (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => setAddingRoot((a) => !a)}
      className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover hover:shadow-card"
    >
      <Plus size={16} strokeWidth={2.5} />
      {t('loc_addRoot')}
    </motion.button>
  )

  return (
    <div className="flex h-screen w-screen flex-col bg-bg">
      <PageHeader title={t('loc_title')} onBack={onBack} action={addAction} />

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-5">
        <AnimatePresence>
          {addingRoot && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              onSubmit={handleAddRoot}
              className="mb-4 overflow-hidden rounded-2xl border border-primary/40 bg-surface p-4 shadow-card"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={rootName}
                  onChange={(e) => setRootName(e.target.value)}
                  className="input"
                  placeholder={t('loc_name_placeholder')}
                  autoFocus
                />
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-smooth hover:bg-primary-hover"
                >
                  <Check size={15} />
                  {t('btn_save')}
                </motion.button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingRoot(false)
                    setRootName('')
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
                >
                  <X size={15} />
                  {t('btn_cancel')}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {tree.length === 0 && !addingRoot ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed border-border bg-surface px-4 py-16 text-center text-sm text-text-tertiary"
          >
            {t('loc_empty')}
          </motion.div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-3 shadow-card">
            {tree.map((node, idx) => (
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
                delay={idx * 0.04}
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
  onAskDelete,
  delay = 0
}) {
  const hasChildren = node.children && node.children.length > 0
  const [open, setOpen] = useState(depth < 1)
  const count = itemCounts[node.name] || 0
  const isEditing = editingId === node.id
  const isAddingChild = addChildId === node.id

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: Math.min(delay, 0.24) }}
    >
      <div
        className="group flex items-center gap-1 rounded-xl px-2 py-1.5 transition-smooth hover:bg-surface-hover"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex w-5 shrink-0 items-center justify-center text-text-tertiary transition-smooth hover:text-text-secondary"
          >
            <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2, ease: EASE }}>
              <ChevronRight size={14} />
            </motion.span>
          </button>
        ) : (
          <span className="w-5 shrink-0" />
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
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => onSaveRename(node.id)}
              className="flex shrink-0 h-7 w-7 items-center justify-center rounded-lg bg-primary text-white"
            >
              <Check size={14} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => setEditingId(null)}
              className="flex shrink-0 h-7 w-7 items-center justify-center rounded-lg border border-border text-text-tertiary hover:bg-surface-hover"
            >
              <X size={14} />
            </motion.button>
          </div>
        ) : (
          <>
            <Folder size={15} className="shrink-0 text-text-tertiary" />
            <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{node.name}</span>
            {count > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-text-tertiary">
                <Package size={10} />
                {t('loc_itemCount', { n: count })}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-smooth group-hover:opacity-100">
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => {
                  setEditingId(node.id)
                  setEditName(node.name)
                }}
                title={t('loc_rename')}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-bg hover:text-primary"
              >
                <Pencil size={13} />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => {
                  setAddChildId(isAddingChild ? null : node.id)
                  setChildName('')
                }}
                title={t('loc_addChild')}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-bg hover:text-primary"
              >
                <Plus size={14} />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => onAskDelete(node.id, node.name)}
                title={t('btn_delete')}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={13} />
              </motion.button>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {isAddingChild && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="overflow-hidden"
          >
            <div
              className="flex items-center gap-2 rounded-xl bg-primary-soft/40 py-1.5 pr-2"
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
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => onAddChild(node.id)}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white"
              >
                <Check size={13} />
                {t('btn_save')}
              </motion.button>
              <button
                onClick={() => setAddChildId(null)}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-3 py-1 text-xs text-text-tertiary hover:bg-surface-hover"
              >
                {t('btn_cancel')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
