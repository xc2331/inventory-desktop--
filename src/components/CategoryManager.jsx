import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, Check, Package } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { createCategory, updateCategory, deleteCategory, categoryDisplayName, mergeCategories } from '../lib/api'
import { CATEGORY_ICON_POOL, getCategoryIcon } from '../lib/categoryIcons'
import { EASE, EASE_SPRING } from '../lib/motion'
import ConfirmDialog from './ConfirmDialog'
import PageHeader from './PageHeader'

const EMPTY_NEW = { icon: '', key: '', name: '', name_en: '' }

export default function CategoryManager({ categories, counts, lang, onBack, onChanged, showToast }) {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [newCat, setNewCat] = useState({ ...EMPTY_NEW })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' })
  const [dupConfirm, setDupConfirm] = useState({ open: false, fromKey: '', toKey: '', name: '' })
  const [editDupConfirm, setEditDupConfirm] = useState({ open: false, fromKey: '', toKey: '', name: '', editingId: null })
  const [iconPicker, setIconPicker] = useState({ open: false, target: null, current: '' })

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newCat.name.trim()) return
    const existing = categories.find(
      (c) =>
        c.name.toLowerCase() === newCat.name.trim().toLowerCase() ||
        (newCat.name_en && c.name_en && c.name_en.toLowerCase() === newCat.name_en.trim().toLowerCase())
    )
    if (existing) {
      setDupConfirm({
        open: true,
        fromKey: newCat.key.trim() || newCat.name.trim(),
        toKey: existing.key,
        name: newCat.name
      })
      return
    }
    try {
      await createCategory({
        key: newCat.key.trim() || newCat.name.trim(),
        name: newCat.name.trim(),
        name_en: newCat.name_en.trim(),
        icon: newCat.icon || ''
      })
      showToast(t('toast_addedCat'))
      setNewCat({ ...EMPTY_NEW })
      setAdding(false)
      await onChanged()
    } catch (err) {
      showToast(t('toast_saveFail', { msg: err.message }), 'error')
    }
  }

  const handleMerge = async () => {
    const { fromKey, toKey, name } = dupConfirm
    setDupConfirm({ open: false, fromKey: '', toKey: '', name: '' })
    try {
      const res = await mergeCategories(fromKey, toKey)
      showToast(t('cat_dupMerged', { n: res.migrated }))
      setNewCat({ ...EMPTY_NEW })
      setAdding(false)
      await onChanged()
    } catch (err) {
      showToast(t('toast_saveFail', { msg: err.message }), 'error')
    }
  }

  const startEdit = (cat) => {
    setEditingId(cat.id)
    setEditForm({ key: cat.key, name: cat.name, name_en: cat.name_en, icon: cat.icon })
  }

  const handleSaveEdit = async () => {
    const trimmedName = editForm.name.trim()
    const trimmedKey = editForm.key.trim() || trimmedName
    // 检测重名（排除当前正在编辑的分类本身）
    const existing = categories.find(
      (c) =>
        c.id !== editingId &&
        (c.name.toLowerCase() === trimmedName.toLowerCase() ||
        (editForm.name_en && c.name_en && c.name_en.toLowerCase() === editForm.name_en.trim().toLowerCase()))
    )
    if (existing) {
      setEditDupConfirm({
        open: true,
        fromKey: trimmedKey,
        toKey: existing.key,
        name: trimmedName,
        editingId
      })
      return
    }
    try {
      await updateCategory(editingId, {
        key: trimmedKey,
        name: trimmedName,
        name_en: editForm.name_en.trim(),
        icon: editForm.icon || ''
      })
      showToast(t('toast_renamed'))
      setEditingId(null)
      await onChanged()
    } catch (err) {
      showToast(t('toast_saveFail', { msg: err.message }), 'error')
    }
  }

  const handleEditMerge = async () => {
    const { fromKey, toKey, name } = editDupConfirm
    setEditDupConfirm({ open: false, fromKey: '', toKey: '', name: '', editingId: null })
    try {
      const res = await mergeCategories(fromKey, toKey)
      showToast(t('cat_dupMerged', { n: res.migrated }))
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
      await deleteCategory(id)
      showToast(t('toast_deletedCat'))
      await onChanged()
    } catch (err) {
      showToast(t('toast_deleteFail', { msg: err.message }), 'error')
    }
  }

  const openIconPicker = (target) => {
    const current = target === 'new' ? newCat.icon : editForm.icon
    setIconPicker({ open: true, target, current: current || '' })
  }

  const handlePickIcon = (key) => {
    if (iconPicker.target === 'new') {
      setNewCat((f) => ({ ...f, icon: key }))
    } else if (iconPicker.target === 'edit') {
      setEditForm((f) => ({ ...f, icon: key }))
    }
    setIconPicker({ open: false, target: null, current: '' })
  }

  const addAction = (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => setAdding((a) => !a)}
      className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover hover:shadow-card"
    >
      <Plus size={16} strokeWidth={2.5} />
      {t('cat_addNew')}
    </motion.button>
  )

  return (
    <div className="flex h-screen w-screen flex-col bg-bg">
      <PageHeader title={t('cat_title')} onBack={onBack} action={addAction} />

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-5">
        <AnimatePresence>
          {adding && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              onSubmit={handleAdd}
              className="mb-4 overflow-hidden rounded-2xl border border-primary/40 bg-surface p-5 shadow-card"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <FieldGrid label={t('cat_icon')}>
                  <button
                    type="button"
                    onClick={() => openIconPicker('new')}
                    className="input flex cursor-pointer items-center justify-center transition-smooth hover:border-primary"
                  >
                    {(() => {
                      const Icon = getCategoryIcon(newCat)
                      return <Icon size={20} className="text-text-secondary" />
                    })()}
                  </button>
                </FieldGrid>
                <FieldGrid label={t('cat_key')}>
                  <input
                    type="text"
                    value={newCat.key}
                    onChange={(e) => setNewCat((f) => ({ ...f, key: e.target.value }))}
                    className="input"
                    placeholder={t('cat_key_placeholder')}
                  />
                </FieldGrid>
                <FieldGrid label={t('cat_name')}>
                  <input
                    type="text"
                    value={newCat.name}
                    onChange={(e) => setNewCat((f) => ({ ...f, name: e.target.value }))}
                    className="input"
                    placeholder={t('cat_name_placeholder')}
                    autoFocus
                    required
                  />
                </FieldGrid>
                <FieldGrid label={t('cat_name_en')}>
                  <input
                    type="text"
                    value={newCat.name_en}
                    onChange={(e) => setNewCat((f) => ({ ...f, name_en: e.target.value }))}
                    className="input"
                    placeholder={t('cat_name_en_placeholder')}
                  />
                </FieldGrid>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false)
                    setNewCat({ ...EMPTY_NEW })
                  }}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
                >
                  {t('btn_cancel')}
                </button>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
                >
                  <Check size={15} />
                  {t('btn_save')}
                </motion.button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="space-y-2">
          <AnimatePresence>
            {categories.map((cat, idx) => {
              const count = counts[cat.key] || 0
              if (editingId === cat.id) {
                return (
                  <motion.div
                    key={cat.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-2xl border border-primary/40 bg-surface p-4 shadow-card"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      <FieldGrid label={t('cat_icon')}>
                        <button
                          type="button"
                          onClick={() => openIconPicker('edit')}
                          className="input flex cursor-pointer items-center justify-center transition-smooth hover:border-primary"
                        >
                          {(() => {
                            const Icon = getCategoryIcon(editForm)
                            return <Icon size={20} className="text-text-secondary" />
                          })()}
                        </button>
                      </FieldGrid>
                      <FieldGrid label={t('cat_key')}>
                        <input
                          type="text"
                          value={editForm.key}
                          onChange={(e) => setEditForm((f) => ({ ...f, key: e.target.value }))}
                          className="input"
                        />
                      </FieldGrid>
                      <FieldGrid label={t('cat_name')}>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className="input"
                          autoFocus
                        />
                      </FieldGrid>
                      <FieldGrid label={t('cat_name_en')}>
                        <input
                          type="text"
                          value={editForm.name_en}
                          onChange={(e) => setEditForm((f) => ({ ...f, name_en: e.target.value }))}
                          className="input"
                        />
                      </FieldGrid>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
                      >
                        {t('btn_cancel')}
                      </button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSaveEdit}
                        className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
                      >
                        <Check size={15} />
                        {t('btn_save')}
                      </motion.button>
                    </div>
                  </motion.div>
                )
              }
              const ListIcon = getCategoryIcon(cat)
              return (
                <motion.div
                  key={cat.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.3, ease: EASE, delay: Math.min(idx * 0.03, 0.2) }}
                  className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card transition-smooth hover:shadow-float"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg">
                    <ListIcon size={20} className="text-text-secondary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-text-primary">{categoryDisplayName(cat, lang)}</div>
                    <div className="font-mono text-xs text-text-tertiary">{cat.key}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-bg px-2.5 py-1 text-xs font-medium text-text-tertiary">
                    <Package size={11} />
                    {count} {t('cat_count')}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 transition-smooth group-hover:opacity-100">
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      onClick={() => startEdit(cat)}
                      title={t('cat_rename')}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-primary"
                    >
                      <Pencil size={15} />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      onClick={() => setConfirm({ open: true, id: cat.id, name: categoryDisplayName(cat, lang) })}
                      title={t('btn_delete')}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={15} />
                    </motion.button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {categories.length === 0 && !adding && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl border border-dashed border-border bg-surface px-4 py-16 text-center text-sm text-text-tertiary"
            >
              {t('cat_addNew')}…
            </motion.div>
          )}
        </div>
      </main>

      <ConfirmDialog
        open={confirm.open}
        title={t('confirm_deleteCatTitle')}
        message={t('confirm_deleteCat', { name: confirm.name })}
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ open: false, id: null, name: '' })}
      />

      <ConfirmDialog
        open={dupConfirm.open}
        title={t('cat_dupTitle')}
        message={t('cat_dupMsg', { name: dupConfirm.name })}
        onConfirm={handleMerge}
        onCancel={() => setDupConfirm({ open: false, fromKey: '', toKey: '', name: '' })}
      />

      <ConfirmDialog
        open={editDupConfirm.open}
        title={t('cat_editDupTitle')}
        message={t('cat_editDupMsg', { name: editDupConfirm.name })}
        onConfirm={handleEditMerge}
        onCancel={() => setEditDupConfirm({ open: false, fromKey: '', toKey: '', name: '', editingId: null })}
      />

      <IconPicker
        open={iconPicker.open}
        current={iconPicker.current}
        onPick={handlePickIcon}
        onClose={() => setIconPicker({ open: false, target: null, current: '' })}
      />
    </div>
  )
}

function FieldGrid({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-tertiary">{label}</span>
      {children}
    </label>
  )
}

function IconPicker({ open, current, onPick, onClose }) {
  const { t } = useI18n()
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.3, ease: EASE_SPRING }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-float"
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-text-primary">{t('cat_iconPicker')}</h3>
              <p className="mt-0.5 text-xs text-text-tertiary">{t('cat_iconPicker_desc')}</p>
            </div>
            <div
              className="grid grid-cols-8 gap-1 overflow-y-auto p-3"
              style={{ maxHeight: 320 }}
            >
              {CATEGORY_ICON_POOL.map(({ key, Icon }) => (
                <motion.button
                  key={key}
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  whileHover={{ scale: 1.08 }}
                  onClick={() => onPick(key)}
                  title={key}
                  className={`flex aspect-square items-center justify-center rounded-lg transition-smooth hover:bg-primary-soft hover:text-primary ${
                    current === key
                      ? 'bg-primary-soft text-primary ring-2 ring-primary'
                      : 'text-text-secondary'
                  }`}
                >
                  <Icon size={20} />
                </motion.button>
              ))}
            </div>
            <div className="flex justify-end border-t border-border bg-bg/50 px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
              >
                {t('btn_cancel')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
