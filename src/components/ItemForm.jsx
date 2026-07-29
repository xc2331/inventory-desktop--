import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName, buildLocationTree, locationParts } from '../lib/api'
import { tsToDateInput, dateInputToTs } from '../lib/utils'

const EMPTY = {
  name: '',
  item_no: '',
  category: '',
  room: '',
  position: '',
  location: '',
  quantity: 1,
  min_quantity: 0,
  expiry_date: '',
  photo: '',
  _locId: ''
}

export default function ItemForm({ initial, categories, locations, lang, onSave, onClose }) {
  const { t } = useI18n()
  const [form, setForm] = useState(() => {
    if (!initial) return { ...EMPTY }
    // 反查 location id：匹配 location 路径
    let locId = ''
    if (initial.location) {
      const match = locations.find((l) => {
        const parts = locationParts(locations, l.id)
        return parts.location === initial.location
      })
      if (match) locId = match.id
    }
    return {
      ...EMPTY,
      ...initial,
      expiry_date: tsToDateInput(initial.expiry_date),
      _locId: locId
    }
  })
  const [errors, setErrors] = useState({})
  const [treeOpen, setTreeOpen] = useState(false)

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const pickLocation = (id) => {
    const parts = locationParts(locations, id)
    setForm((f) => ({
      ...f,
      _locId: id,
      room: parts.room,
      position: parts.position,
      location: parts.location
    }))
    setTreeOpen(false)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setErrors({ name: t('err_nameRequired') })
      return
    }
    onSave({
      name: form.name.trim(),
      item_no: form.item_no.trim(),
      category: form.category,
      room: form.room.trim(),
      position: form.position.trim(),
      location: form.location.trim(),
      quantity: Number(form.quantity) || 0,
      min_quantity: Number(form.min_quantity) || 0,
      expiry_date: form.expiry_date ? dateInputToTs(form.expiry_date) : 0,
      photo: form.photo.trim()
    })
  }

  const tree = buildLocationTree(locations)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-800">{initial ? t('form_editTitle') : t('form_addTitle')}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-stone-400 hover:bg-stone-100">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('f_name')} required error={errors.name} className="col-span-2">
            <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className="input" autoFocus />
          </Field>

          <Field label={t('f_category')}>
            <select value={form.category} onChange={(e) => set('category', e.target.value)} className="input">
              <option value="">{t('f_selectCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.key}>
                  {c.icon ? c.icon + ' ' : ''}{categoryDisplayName(c, lang)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('f_itemNo')}>
            <input type="text" value={form.item_no} onChange={(e) => set('item_no', e.target.value)} className="input" />
          </Field>

          {/* 位置选择器 */}
          <Field label={t('f_position')} className="col-span-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setTreeOpen((o) => !o)}
                className="input flex items-center justify-between text-left"
              >
                <span className={form.location ? 'text-stone-700' : 'text-stone-400'}>
                  {form.location || t('f_pickLocation')}
                </span>
                <span className="text-stone-400">▾</span>
              </button>
              {treeOpen && (
                <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
                  {tree.length === 0 && (
                    <div className="px-3 py-2 text-xs text-stone-400">{t('loc_empty')}</div>
                  )}
                  {tree.map((node) => (
                    <LocationTreeNode key={node.id} node={node} depth={0} selectedId={form._locId} onSelect={pickLocation} />
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MiniField label={t('f_room')}>
                <input type="text" value={form.room} onChange={(e) => set('room', e.target.value)} className="input" />
              </MiniField>
              <MiniField label={t('f_position')}>
                <input type="text" value={form.position} onChange={(e) => set('position', e.target.value)} className="input" />
              </MiniField>
              <MiniField label={t('f_location')}>
                <input type="text" value={form.location} onChange={(e) => set('location', e.target.value)} className="input" />
              </MiniField>
            </div>
            <p className="mt-1 text-[11px] text-stone-400">{t('f_orManual')}</p>
          </Field>

          <Field label={t('f_quantity')}>
            <input type="number" min="0" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} className="input" />
          </Field>

          <Field label={t('f_minQuantity')}>
            <input type="number" min="0" value={form.min_quantity} onChange={(e) => set('min_quantity', e.target.value)} className="input" />
          </Field>

          <Field label={t('f_expiry')}>
            <input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} className="input" />
          </Field>

          <Field label={t('f_photo')}>
            <input type="text" value={form.photo} onChange={(e) => set('photo', e.target.value)} className="input" />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
          >
            {t('btn_cancel')}
          </button>
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
          >
            {t('btn_save')}
          </button>
        </div>
      </form>
    </div>
  )
}

function LocationTreeNode({ node, depth, selectedId, onSelect }) {
  const [open, setOpen] = useState(depth < 1)
  const hasChildren = node.children && node.children.length > 0
  const selected = selectedId === node.id
  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
          selected ? 'bg-emerald-50 text-emerald-700' : 'text-stone-600 hover:bg-stone-50'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="w-4 text-stone-400">
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <button type="button" onClick={() => onSelect(node.id)} className="flex-1 text-left">
          📁 {node.name}
        </button>
      </div>
      {hasChildren && open && node.children.map((c) => (
        <LocationTreeNode key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  )
}

function Field({ label, required, error, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-stone-500">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-500">{error}</span>}
    </label>
  )
}

function MiniField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-stone-400">{label}</span>
      {children}
    </label>
  )
}
