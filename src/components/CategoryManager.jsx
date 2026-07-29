import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { createCategory, updateCategory, deleteCategory, categoryDisplayName } from '../lib/api'
import ConfirmDialog from './ConfirmDialog'

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

  return (
    <div className="flex h-screen w-screen flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-6 py-4">
        <button onClick={onBack} className="rounded-md p-1.5 text-text-tertiary transition hover:bg-bg">
          ←
        </button>
        <h1 className="flex-1 text-lg font-semibold text-text-primary">{t('cat_title')}</h1>
        <button
          onClick={() => setAdding((a) => !a)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-hover"
        >
          + {t('cat_addNew')}
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        {adding && (
          <form onSubmit={handleAdd} className="mb-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-tertiary">{t('cat_icon')}</span>
                <input
                  type="text"
                  value={newCat.icon}
                  onChange={(e) => setNewCat((f) => ({ ...f, icon: e.target.value }))}
                  className="input text-center text-lg"
                  maxLength={4}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-tertiary">{t('cat_key')}</span>
                <input
                  type="text"
                  value={newCat.key}
                  onChange={(e) => setNewCat((f) => ({ ...f, key: e.target.value }))}
                  className="input"
                  placeholder={t('cat_key_placeholder')}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-tertiary">{t('cat_name')}</span>
                <input
                  type="text"
                  value={newCat.name}
                  onChange={(e) => setNewCat((f) => ({ ...f, name: e.target.value }))}
                  className="input"
                  placeholder={t('cat_name_placeholder')}
                  autoFocus
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-text-tertiary">{t('cat_name_en')}</span>
                <input
                  type="text"
                  value={newCat.name_en}
                  onChange={(e) => setNewCat((f) => ({ ...f, name_en: e.target.value }))}
                  className="input"
                  placeholder={t('cat_name_en_placeholder')}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  setNewCat({ ...EMPTY_NEW })
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-hover"
              >
                {t('btn_cancel')}
              </button>
              <button
                type="submit"
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-hover"
              >
                {t('btn_save')}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {categories.map((cat) => {
            const count = counts[cat.key] || 0
            if (editingId === cat.id) {
              return (
                <div key={cat.id} className="rounded-xl border border-primary/40 bg-surface p-4 shadow-sm">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-tertiary">{t('cat_icon')}</span>
                      <input
                        type="text"
                        value={editForm.icon}
                        onChange={(e) => setEditForm((f) => ({ ...f, icon: e.target.value }))}
                        className="input text-center text-lg"
                        maxLength={4}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-tertiary">{t('cat_key')}</span>
                      <input
                        type="text"
                        value={editForm.key}
                        onChange={(e) => setEditForm((f) => ({ ...f, key: e.target.value }))}
                        className="input"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-tertiary">{t('cat_name')}</span>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className="input"
                        autoFocus
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-text-tertiary">{t('cat_name_en')}</span>
                      <input
                        type="text"
                        value={editForm.name_en}
                        onChange={(e) => setEditForm((f) => ({ ...f, name_en: e.target.value }))}
                        className="input"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-hover"
                    >
                      {t('btn_cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-hover"
                    >
                      {t('btn_save')}
                    </button>
                  </div>
                </div>
              )
            }
            return (
              <div
                key={cat.id}
                className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm transition hover:shadow-md"
              >
                <span className="text-xl">{cat.icon || '🏷️'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary">{categoryDisplayName(cat, lang)}</div>
                  <div className="text-xs text-text-tertiary">{cat.key}</div>
                </div>
                <span className="rounded-full bg-bg px-2.5 py-0.5 text-xs font-medium text-text-tertiary">
                  {count} {t('cat_count')}
                </span>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => startEdit(cat)}
                    title={t('cat_rename')}
                    className="rounded-md p-1.5 text-text-tertiary transition hover:bg-bg hover:text-text-secondary"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setConfirm({ open: true, id: cat.id, name: categoryDisplayName(cat, lang) })}
                    title={t('btn_delete')}
                    className="rounded-md p-1.5 text-text-tertiary transition hover:bg-danger-soft hover:text-danger"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )
          })}
          {categories.length === 0 && !adding && (
            <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-12 text-center text-sm text-text-tertiary">
              {t('cat_addNew')}…
            </div>
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
