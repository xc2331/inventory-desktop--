import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, Check, Package } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { createCategory, updateCategory, deleteCategory, categoryDisplayName } from '../lib/api'
import { EASE } from '../lib/motion'
import ConfirmDialog from './ConfirmDialog'
import PageHeader from './PageHeader'

const EMPTY_NEW = { icon: '🏷️', key: '', name: '', name_en: '' }

export default function CategoryManager({ categories, counts, lang, onBack, onChanged, showToast }) {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [newCat, setNewCat] = useState({ ...EMPTY_NEW })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' })

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!newCat.name.trim()) return
    try {
      await createCategory({
        key: newCat.key.trim() || newCat.name.trim(),
        name: newCat.name.trim(),
        name_en: newCat.name_en.trim(),
        icon: newCat.icon || '🏷️'
      })
      showToast(t('toast_addedCat'))
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
    try {
      await updateCategory(editingId, {
        key: editForm.key.trim() || editForm.name.trim(),
        name: editForm.name.trim(),
        name_en: editForm.name_en.trim(),
        icon: editForm.icon || '🏷️'
      })
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
      await deleteCategory(id)
      showToast(t('toast_deletedCat'))
      await onChanged()
    } catch (err) {
      showToast(t('toast_deleteFail', { msg: err.message }), 'error')
    }
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
                  <input
                    type="text"
                    value={newCat.icon}
                    onChange={(e) => setNewCat((f) => ({ ...f, icon: e.target.value }))}
                    className="input text-center text-lg"
                    maxLength={4}
                  />
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
                        <input
                          type="text"
                          value={editForm.icon}
                          onChange={(e) => setEditForm((f) => ({ ...f, icon: e.target.value }))}
                          className="input text-center text-lg"
                          maxLength={4}
                        />
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
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg text-xl">{cat.icon || '🏷️'}</span>
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
