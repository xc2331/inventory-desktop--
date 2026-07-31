import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Plus,
  Search,
  X,
  FileText,
  Link,
  Image as ImageIcon,
  ChefHat,
  GraduationCap,
  FolderOpen,
  MoreHorizontal,
  Smartphone,
  Trash2,
  Edit2,
  ExternalLink,
  Tags,
  Sparkles
} from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { EASE, EASE_SPRING } from '../lib/motion'
import { cn } from '../lib/cn'
import {
  fetchMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  startQRUpload,
  stopQRUpload,
  onQRUploadImage,
  pickImage
} from '../lib/api'
import { compressImageToBase64 } from '../lib/imageCompress'
import ConfirmDialog from './ConfirmDialog'
import Toast from './Toast'

const MATERIAL_TYPES = ['note', 'url', 'photo', 'recipe', 'tutorial', 'doc', 'other']

const TYPE_META = {
  note: { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  url: { icon: Link, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  photo: { icon: ImageIcon, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20' },
  recipe: { icon: ChefHat, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  tutorial: { icon: GraduationCap, color: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-900/20' },
  doc: { icon: FolderOpen, color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-900/20' },
  other: { icon: Tags, color: 'text-stone-500', bg: 'bg-stone-50 dark:bg-stone-900/20' }
}

function TypeIcon({ type, size = 16 }) {
  const meta = TYPE_META[type] || TYPE_META.other
  const Icon = meta.icon
  return (
    <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', meta.bg)}>
      <Icon size={size} className={meta.color} />
    </span>
  )
}

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

export default function MaterialLibrary({ onBack }) {
  const { t } = useI18n()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [keyword, setKeyword] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' })
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchMaterials({ type: typeFilter, keyword: keyword.trim() || undefined })
      setItems(rows)
    } catch (e) {
      showToast(t('toast_loadFail', { msg: e.message }), 'error')
    } finally {
      setLoading(false)
    }
  }, [typeFilter, keyword, t, showToast])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async (data) => {
    try {
      if (editing) {
        await updateMaterial(editing.id, data)
        showToast(t('materials_toast_updated'))
      } else {
        await createMaterial(data)
        showToast(t('materials_toast_added'))
      }
      setFormOpen(false)
      setEditing(null)
      load()
    } catch (e) {
      showToast(t('toast_saveFail', { msg: e.message }), 'error')
    }
  }

  const handleDelete = (item) => {
    setConfirm({ open: true, id: item.id, name: item.title || t('materials_title') })
  }

  const confirmDelete = async () => {
    const { id } = confirm
    setConfirm({ open: false, id: null, name: '' })
    try {
      await deleteMaterial(id)
      showToast(t('materials_toast_deleted'))
      load()
    } catch (e) {
      showToast(t('toast_deleteFail', { msg: e.message }), 'error')
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg">
      <header className="drag-region flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <div>
            <h1 className="text-sm font-semibold text-text-primary">{t('materials_title')}</h1>
            <p className="text-[11px] text-text-tertiary">{t('materials_subtitle')}</p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { setEditing(null); setFormOpen(true) }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover hover:shadow-card"
        >
          <Plus size={14} strokeWidth={2.5} />
          {t('materials_add')}
        </motion.button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧类型筛选 */}
        <aside className="w-48 shrink-0 border-r border-border bg-surface p-3">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary/80">
            {t('materials_type')}
          </div>
          <button
            onClick={() => setTypeFilter('')}
            className={cn(
              'mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-smooth',
              typeFilter === '' ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-surface-hover'
            )}
          >
            <Tags size={14} />
            {t('materials_allTypes')}
          </button>
          {MATERIAL_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={cn(
                'mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-smooth',
                typeFilter === type ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-surface-hover'
              )}
            >
              <TypeIcon type={type} size={13} />
              {t(`materials_type_${type}`)}
            </button>
          ))}
        </aside>

        {/* 主内容 */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('materials_search')}
                className="input w-full pl-9 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {loading && items.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-text-tertiary">{t('loading')}</div>
            ) : items.length === 0 ? (
              <EmptyState onAdd={() => { setEditing(null); setFormOpen(true) }} />
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {items.map((item) => (
                  <MaterialCard
                    key={item.id}
                    item={item}
                    onEdit={() => { setEditing(item); setFormOpen(true) }}
                    onDelete={() => handleDelete(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <AnimatePresence>
        {formOpen && (
          <MaterialForm
            initial={editing}
            onSave={handleSave}
            onClose={() => { setFormOpen(false); setEditing(null) }}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirm.open}
        title={t('materials_delete')}
        message={t('materials_deleteConfirm', { name: confirm.name })}
        onConfirm={confirmDelete}
        onCancel={() => setConfirm({ open: false, id: null, name: '' })}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}

function MaterialCard({ item, onEdit, onDelete }) {
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const tags = item.tags ? item.tags.split(/[,，\s]+/).filter(Boolean) : []

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="group relative flex gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-smooth hover:shadow-float"
    >
      <div className="shrink-0 pt-0.5">
        <TypeIcon type={item.type} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-text-primary">{item.title || t('materials_title')}</h3>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary opacity-0 transition-smooth hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
            >
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-7 z-40 w-28 overflow-hidden rounded-xl border border-border bg-surface shadow-float">
                  <button
                    onClick={() => { setMenuOpen(false); onEdit() }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-smooth hover:bg-surface-hover"
                  >
                    <Edit2 size={12} />
                    {t('materials_edit')}
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onDelete() }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-danger transition-smooth hover:bg-danger-soft"
                  >
                    <Trash2 size={12} />
                    {t('materials_delete')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {item.content && (
          <p className="mb-2 line-clamp-3 text-xs leading-relaxed text-text-secondary">{item.content}</p>
        )}

        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="mb-2 flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink size={11} />
            <span className="truncate">{item.url}</span>
          </a>
        )}

        {item.photo && (
          <img
            src={toPhotoSrc(item.photo)}
            alt={item.title}
            className="mb-2 h-28 w-full rounded-lg object-cover ring-1 ring-border"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}

        {tags.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {tags.map((tag, i) => (
              <span key={i} className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] text-text-tertiary">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2 text-[10px] text-text-tertiary/70">
          {t('materials_updated')}: {item.updated_at ? new Date(item.updated_at).toLocaleString() : '-'}
        </div>
      </div>
    </motion.div>
  )
}

function MaterialForm({ initial, onSave, onClose }) {
  const { t } = useI18n()
  const [form, setForm] = useState(() => ({
    type: initial?.type || 'note',
    title: initial?.title || '',
    content: initial?.content || '',
    url: initial?.url || '',
    tags: initial?.tags || '',
    photo: initial?.photo || ''
  }))
  const [photoHint, setPhotoHint] = useState('')
  const [qrState, setQrState] = useState({ url: '', status: 'idle' })
  const qrUnsubscribe = useRef(null)

  useEffect(() => {
    return () => {
      if (qrUnsubscribe.current) qrUnsubscribe.current()
      stopQRUpload().catch(() => {})
    }
  }, [])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

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

  const startQR = async () => {
    try {
      setQrState({ url: '', status: 'starting' })
      if (qrUnsubscribe.current) qrUnsubscribe.current()
      const info = await startQRUpload()
      setQrState({ url: info.url, status: 'waiting' })
      qrUnsubscribe.current = onQRUploadImage(({ image }) => {
        set('photo', image)
        setQrState((s) => ({ ...s, status: 'success' }))
        setPhotoHint(t('qrUpload_success'))
      })
    } catch (e) {
      setQrState({ url: '', status: 'error' })
      setPhotoHint(e.message || '启动失败')
    }
  }

  const refreshQR = async () => {
    await stopQRUpload().catch(() => {})
    await startQR()
  }

  const stopQR = async () => {
    if (qrUnsubscribe.current) qrUnsubscribe.current()
    await stopQRUpload().catch(() => {})
    setQrState({ url: '', status: 'idle' })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({ ...form, title: form.title.trim() })
  }

  return (
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
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-surface shadow-float"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-5 py-3.5 backdrop-blur">
          <h2 className="text-base font-semibold text-text-primary">
            {initial ? t('materials_edit') : t('materials_add')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
          >
            <X size={17} />
          </button>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-2 gap-3.5">
            <Field label={t('materials_type')} className="col-span-2 sm:col-span-1">
              <select value={form.type} onChange={(e) => set('type', e.target.value)} className="input">
                {MATERIAL_TYPES.map((type) => (
                  <option key={type} value={type}>{t(`materials_type_${type}`)}</option>
                ))}
              </select>
            </Field>

            <Field label={t('materials_titleLabel')} required className="col-span-2 sm:col-span-1">
              <input type="text" value={form.title} onChange={(e) => set('title', e.target.value)} className="input" autoFocus />
            </Field>

            {form.type === 'url' && (
              <Field label={t('materials_url')} className="col-span-2">
                <input type="url" value={form.url} onChange={(e) => set('url', e.target.value)} className="input" placeholder="https://" />
              </Field>
            )}

            <Field label={t('materials_content')} className="col-span-2">
              <textarea
                value={form.content}
                onChange={(e) => set('content', e.target.value)}
                rows={4}
                className="input resize-none"
              />
            </Field>

            <Field label={t('materials_tags')} className="col-span-2">
              <input
                type="text"
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                className="input"
                placeholder={t('materials_tagsPlaceholder')}
              />
            </Field>

            <Field label={t('materials_photo')} className="col-span-2">
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-3">
                {form.photo && (
                  <img
                    src={toPhotoSrc(form.photo)}
                    alt="preview"
                    className="h-32 w-full rounded-lg object-cover ring-1 ring-border"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBrowse}
                    className="flex items-center gap-1 rounded-md bg-surface-hover px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-active hover:text-text-primary"
                  >
                    <ImageIcon size={12} />
                    {t('f_photo_browse')}
                  </button>
                  <button
                    type="button"
                    onClick={qrState.status === 'idle' ? startQR : refreshQR}
                    className="flex items-center gap-1 rounded-md bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary transition-smooth hover:bg-primary-soft/80"
                  >
                    <Smartphone size={12} />
                    {qrState.status === 'idle' ? t('qrUpload_start') : t('qrUpload_refresh')}
                  </button>
                  {qrState.status !== 'idle' && (
                    <button
                      type="button"
                      onClick={stopQR}
                      className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-tertiary transition-smooth hover:text-danger"
                    >
                      <X size={12} />
                      {t('qrUpload_stop')}
                    </button>
                  )}
                  {form.photo && (
                    <button
                      type="button"
                      onClick={() => set('photo', '')}
                      className="ml-auto flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-text-tertiary transition-smooth hover:text-danger"
                    >
                      <Trash2 size={12} />
                      {t('btn_delete')}
                    </button>
                  )}
                </div>
                {qrState.url && (
                  <div className="flex items-center gap-4 rounded-xl bg-surface-hover p-3">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrState.url)}`} alt="QR" className="h-24 w-24 rounded-lg ring-1 ring-border" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-text-secondary">{t('qrUpload_title')}</p>
                      <p className="mt-1 text-[11px] text-text-tertiary">{t('qrUpload_desc')}</p>
                      <p className={cn('mt-1 text-[11px] font-medium', qrState.status === 'success' ? 'text-primary' : 'text-text-tertiary')}>
                        {qrState.status === 'success' ? t('qrUpload_success') : t('qrUpload_waiting')}
                      </p>
                      <p className="mt-1 text-[10px] text-text-tertiary/70">{t('qrUpload_tip')}</p>
                    </div>
                  </div>
                )}
                {photoHint && (
                  <p className={cn('text-[11px]', photoHint.includes('失败') ? 'text-danger' : 'text-text-tertiary')}>
                    {photoHint}
                  </p>
                )}
              </div>
            </Field>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface/95 px-5 py-3 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
          >
            {t('btn_cancel')}
          </button>
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover hover:shadow-card"
          >
            {t('materials_save')}
          </button>
        </div>
      </motion.form>
    </motion.div>
  )
}

function Field({ label, required, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-text-tertiary">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  )
}

function EmptyState({ onAdd }) {
  const { t } = useI18n()
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="flex h-full flex-col items-center justify-center text-center"
    >
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-text-tertiary/80 shadow-card ring-1 ring-border">
        <Sparkles size={28} strokeWidth={1.4} />
      </div>
      <p className="mb-1 text-sm font-semibold text-text-secondary">{t('materials_empty')}</p>
      <p className="mb-5 max-w-xs text-xs text-text-tertiary">{t('materials_emptyTip')}</p>
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
      >
        <Plus size={14} strokeWidth={2.5} />
        {t('materials_add')}
      </button>
    </motion.div>
  )
}
