import { useState } from 'react'
import { CATEGORIES } from '../lib/categories'
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
  photo: ''
}

export default function ItemForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...initial,
    expiry_date: initial ? tsToDateInput(initial.expiry_date) : ''
  }))
  const [errors, setErrors] = useState({})

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setErrors({ name: '请输入物品名称' })
      return
    }
    onSave({
      ...form,
      name: form.name.trim(),
      item_no: form.item_no.trim(),
      room: form.room.trim(),
      position: form.position.trim(),
      location: form.location.trim(),
      quantity: Number(form.quantity) || 0,
      min_quantity: Number(form.min_quantity) || 0,
      expiry_date: form.expiry_date ? dateInputToTs(form.expiry_date) : 0,
      photo: form.photo.trim()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-800">
            {initial ? '编辑物品' : '添加物品'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-stone-400 hover:bg-stone-100">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="物品名称" required error={errors.name} className="col-span-2">
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="例如：东北大米"
              className="input"
              autoFocus
            />
          </Field>

          <Field label="分类">
            <select value={form.category} onChange={(e) => set('category', e.target.value)} className="input">
              <option value="">请选择</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="编号">
            <input
              type="text"
              value={form.item_no}
              onChange={(e) => set('item_no', e.target.value)}
              placeholder="可选"
              className="input"
            />
          </Field>

          <Field label="房间">
            <input
              type="text"
              value={form.room}
              onChange={(e) => set('room', e.target.value)}
              placeholder="例如：厨房"
              className="input"
            />
          </Field>

          <Field label="位置">
            <input
              type="text"
              value={form.position}
              onChange={(e) => set('position', e.target.value)}
              placeholder="例如：吊柜上层"
              className="input"
            />
          </Field>

          <Field label="详细位置">
            <input
              type="text"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="可选"
              className="input"
            />
          </Field>

          <Field label="过期日期">
            <input
              type="date"
              value={form.expiry_date}
              onChange={(e) => set('expiry_date', e.target.value)}
              className="input"
            />
          </Field>

          <Field label="数量">
            <input
              type="number"
              min="0"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              className="input"
            />
          </Field>

          <Field label="最低库存">
            <input
              type="number"
              min="0"
              value={form.min_quantity}
              onChange={(e) => set('min_quantity', e.target.value)}
              className="input"
            />
          </Field>

          <Field label="图片地址" className="col-span-2">
            <input
              type="text"
              value={form.photo}
              onChange={(e) => set('photo', e.target.value)}
              placeholder="可选，图片 URL 或路径"
              className="input"
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-50"
          >
            取消
          </button>
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
          >
            保存
          </button>
        </div>

        <style>{`
          .input {
            width: 100%;
            border-radius: 0.5rem;
            border: 1px solid #e7e5e4;
            background: #fafaf9;
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            color: #292524;
            outline: none;
            transition: all 0.15s;
          }
          .input:focus {
            border-color: #34d399;
            background: #fff;
            box-shadow: 0 0 0 2px #a7f3d0;
          }
        `}</style>
      </form>
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
