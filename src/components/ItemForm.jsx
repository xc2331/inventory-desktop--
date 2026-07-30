import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Folder, ChevronRight, MapPin, Image as ImageIcon, Upload, FolderOpen } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName, buildLocationTree, locationParts, pickImage } from '../lib/api'
import { compressImageToBase64 } from '../lib/imageCompress'
import { getCategoryIcon } from '../lib/categoryIcons'
import { tsToDateInput, dateInputToTs } from '../lib/utils'
import { EASE, EASE_SPRING } from '../lib/motion'
import { cn } from '../lib/cn'

// 把存储的图片值（路径 / URL / data URL）转为可显示的 src
function toPhotoSrc(photo) {
  if (!photo) return ''
  const s = photo.trim()
  if (!s) return ''
  if (/^(data:|https?:|file:)/i.test(s)) return s
  if (/^[a-z]:[\\/]/i.test(s) || s.startsWith('/')) {
    const withSlash = s.replace(/\\/g, '/')
    return withSlash.startsWith('/') ? 'file://' + withSlash : 'file:///' + withSlash
  }
  return 'file:///' + s.replace(/\\/g, '/')
}

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
  const [dragOver, setDragOver] = useState(false)
  const [photoHint, setPhotoHint] = useState('')

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  // 点击浏览：选择本地图片后自动压缩为 Base64 存入 photo
  const handleBrowse = async () => {
    try {
      setPhotoHint('')
      const res = await pickImage()
      if (res.canceled || !res.path) return
      setPhotoHint('图片压缩中…')
      const result = await compressImageToBase64(res.path)
      if (result.ok) {
        set('photo', result.data)
        setPhotoHint(`已压缩至 ${result.sizeKB}KB`)
      } else {
        setPhotoHint(result.error)
      }
    } catch (e) {
      setPhotoHint(e.message || '图片读取失败')
    }
  }

  // 拖拽图片：自动压缩为 Base64 存入 photo
  const handleDrop = async (e) => {
    e.preventDefault()
    setDragOver(false)
    setPhotoHint('')
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    if (!file.type || !file.type.startsWith('image/')) return
    setPhotoHint('图片压缩中…')
    const result = await compressImageToBase64(file)
    if (result.ok) {
      set('photo', result.data)
      setPhotoHint(`已压缩至 ${result.sizeKB}KB`)
    } else {
      setPhotoHint(result.error)
    }
  }

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
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        className="fixed inset-0 z-[65] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.form
          onSubmit={handleSubmit}
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 6 }}
          transition={{ duration: 0.32, ease: EASE_SPRING }}
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface shadow-float"
        >
          {/* 头部 */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-5 py-3.5 backdrop-blur">
            <h2 className="text-base font-semibold text-text-primary">
              {initial ? t('form_editTitle') : t('form_addTitle')}
            </h2>
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
            >
              <X size={17} />
            </motion.button>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-2 gap-3.5">
              <Field label={t('f_name')} required error={errors.name} className="col-span-2">
                <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className="input" autoFocus />
              </Field>

              <Field label={t('f_category')}>
                <select value={form.category} onChange={(e) => set('category', e.target.value)} className="input">
                  <option value="">{t('f_selectCategory')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.key}>
                      {categoryDisplayName(c, lang)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t('f_itemNo')}>
                <input
                  type="text"
                  value={form.item_no}
                  onChange={(e) => set('item_no', e.target.value)}
                  className="input"
                  placeholder={initial ? '' : 'WP-YYYYMMDD-NNN'}
                />
                {!initial && (
                  <span className="mt-1 block text-[11px] text-text-tertiary">{t('f_itemNo_auto')}</span>
                )}
              </Field>

              {/* 位置选择器 */}
              <Field label={t('f_position')} className="col-span-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTreeOpen((o) => !o)}
                    className="input flex items-center justify-between text-left"
                  >
                    <span className={form.location ? 'flex items-center gap-1.5 text-text-secondary' : 'flex items-center gap-1.5 text-text-tertiary'}>
                      <MapPin size={14} />
                      {form.location || t('f_pickLocation')}
                    </span>
                    <motion.span animate={{ rotate: treeOpen ? 90 : 0 }} transition={{ duration: 0.2, ease: EASE }}>
                      <ChevronRight size={15} className="text-text-tertiary" />
                    </motion.span>
                  </button>
                  <AnimatePresence>
                    {treeOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-float"
                      >
                        {tree.length === 0 && (
                          <div className="px-3 py-2 text-xs text-text-tertiary">{t('loc_empty')}</div>
                        )}
                        {tree.map((node) => (
                          <LocationTreeNode key={node.id} node={node} depth={0} selectedId={form._locId} onSelect={pickLocation} />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
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
                <p className="mt-1.5 text-[11px] text-text-tertiary">{t('f_orManual')}</p>
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

              <Field label={t('f_photo')} className="col-span-2">
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border-2 border-dashed p-2.5 transition-smooth',
                    dragOver
                      ? 'border-primary bg-primary-soft/40'
                      : 'border-border bg-surface hover:border-border-strong'
                  )}
                >
                  {form.photo ? (
                    <img
                      src={toPhotoSrc(form.photo)}
                      alt="preview"
                      className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-border"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-bg text-text-tertiary">
                      <ImageIcon size={22} />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <input
                      type="text"
                      value={form.photo}
                      onChange={(e) => {
                        set('photo', e.target.value)
                        setPhotoHint('')
                      }}
                      placeholder={t('f_photo_dragHint')}
                      className="input h-8 py-1 text-xs"
                    />
                    {photoHint && (
                      <p className={cn('text-[11px]', photoHint.includes('失败') || photoHint.includes('超过') ? 'text-danger' : 'text-text-tertiary')}>
                        {photoHint}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleBrowse}
                        className="flex items-center gap-1 rounded-md bg-surface-hover px-2 py-1 text-[11px] font-medium text-text-secondary transition-smooth hover:bg-surface-active hover:text-text-primary"
                      >
                        <FolderOpen size={12} />
                        {t('f_photo_browse')}
                      </button>
                      {form.photo && (
                        <button
                          type="button"
                          onClick={() => set('photo', '')}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-tertiary transition-smooth hover:text-danger"
                        >
                          <X size={12} />
                          {t('btn_delete')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Field>
            </div>
          </div>

          {/* 底部操作 */}
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface/95 px-5 py-3 backdrop-blur">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              className="rounded-lg border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
            >
              {t('btn_cancel')}
            </motion.button>
            <motion.button
              type="submit"
              whileTap={{ scale: 0.97 }}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover hover:shadow-card"
            >
              {t('btn_save')}
            </motion.button>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  )
}

function LocationTreeNode({ node, depth, selectedId, onSelect }) {
  const [open, setOpen] = useState(depth < 1)
  const hasChildren = node.children && node.children.length > 0
  const selected = selectedId === node.id
  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-smooth ${
          selected ? 'bg-primary-soft font-medium text-primary' : 'text-text-secondary hover:bg-surface-hover'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-4 w-4 items-center justify-center text-text-tertiary">
            <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2, ease: EASE }}>
              <ChevronRight size={13} />
            </motion.span>
          </button>
        ) : (
          <span className="w-4" />
        )}
        <button type="button" onClick={() => onSelect(node.id)} className="flex flex-1 items-center gap-1 text-left">
          <Folder size={13} className={selected ? 'text-primary' : 'text-text-tertiary'} />
          {node.name}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {hasChildren && open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden"
          >
            {node.children.map((c) => (
              <LocationTreeNode key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Field({ label, required, error, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-text-tertiary">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  )
}

function MiniField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-text-tertiary">{label}</span>
      {children}
    </label>
  )
}
