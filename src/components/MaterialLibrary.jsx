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
  Sparkles,
  CheckSquare,
  Square,
  Folder,
  Globe,
  Check,
  Monitor
} from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { EASE, EASE_SPRING } from '../lib/motion'
import { cn } from '../lib/cn'
import {
  fetchMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  bulkDeleteMaterials,
  bulkUpdateMaterialType,
  startQRUpload,
  stopQRUpload,
  onQRUploadImage,
  pickImage,
  openPath,
  openExternal
} from '../lib/api'
import { compressImageToBase64 } from '../lib/imageCompress'
import ConfirmDialog from './ConfirmDialog'
import Toast from './Toast'
import Lightbox from './Lightbox'

const MATERIAL_TYPES = ['note', 'url', 'photo', 'recipe', 'tutorial', 'doc', 'other']

const TYPE_META = {
  note: { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', labelKey: 'materials_type_note' },
  url: { icon: Globe, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20', labelKey: 'materials_type_url' },
  photo: { icon: ImageIcon, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20', labelKey: 'materials_type_photo' },
  recipe: { icon: ChefHat, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', labelKey: 'materials_type_recipe' },
  tutorial: { icon: GraduationCap, color: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-900/20', labelKey: 'materials_type_tutorial' },
  doc: { icon: FolderOpen, color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-900/20', labelKey: 'materials_type_doc' },
  other: { icon: Tags, color: 'text-stone-500', bg: 'bg-stone-50 dark:bg-stone-900/20', labelKey: 'materials_type_other' }
}

function TypeIcon({ type, size = 16 }) {
  const meta = TYPE_META[type] || TYPE_META.other
  const Icon = meta.icon
  return (
    <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', meta.bg)}>
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

function isFolderPath(s) {
  if (!s) return false
  if (/^(data:|https?:|file:)/i.test(s)) return false
  const clean = s.replace(/^file:\/+/i, '').replace(/\\/g, '/')
  if (/\.[a-zA-Z0-9]{2,8}$/.test(clean)) return false
  return true
}

function isUrl(s) {
  return /^https?:\/\//i.test(s || '')
}

function isImageResource(s) {
  if (!s) return false
  if (/^data:image\//i.test(s)) return true
  if (/\.(jpg|jpeg|png|gif|bmp|webp|svg)(\?.*)?$/i.test(s)) return true
  return false
}

export default function MaterialLibrary({ onBack }) {
  const { t } = useI18n()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [keyword, setKeyword] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '', bulk: false, ids: [] })
  const [toast, setToast] = useState(null)

  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [lightbox, setLightbox] = useState({ src: '', alt: '' })

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

  useEffect(() => {
    if (!bulkMode) setSelectedIds(new Set())
  }, [bulkMode])

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
    setConfirm({ open: true, id: item.id, name: item.title || t('materials_title'), bulk: false, ids: [] })
  }

  const confirmDelete = async () => {
    const { id, bulk, ids } = confirm
    setConfirm({ open: false, id: null, name: '', bulk: false, ids: [] })
    try {
      if (bulk) {
        const res = await bulkDeleteMaterials(ids)
        showToast(t('toast_bulkDeleted', { n: res.deleted }))
        setSelectedIds(new Set())
      } else {
        await deleteMaterial(id)
        showToast(t('materials_toast_deleted'))
      }
      load()
    } catch (e) {
      showToast(t('toast_deleteFail', { msg: e.message }), 'error')
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map((it) => it.id)))
    }
  }

  const clearSelection = () => setSelectedIds(new Set())

  const exitBulkMode = () => {
    setBulkMode(false)
    setSelectedIds(new Set())
  }

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setConfirm({ open: true, bulk: true, ids, name: t('confirm_bulkDeleteMsg', { n: ids.length }) })
  }

  const handleBulkChangeType = async (type) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      const res = await bulkUpdateMaterialType(ids, type)
      showToast(t('materials_bulkTypeUpdated', { n: res.updated }))
      setSelectedIds(new Set())
      load()
    } catch (e) {
      showToast(t('toast_saveFail', { msg: e.message }), 'error')
    }
  }

  const openAdd = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (item) => {
    setEditing(item)
    setFormOpen(true)
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg">
      <header className="drag-region flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="no-drag flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-text-primary">{t('materials_title')}</h1>
            <p className="text-[11px] text-text-tertiary">{t('materials_subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (bulkMode) exitBulkMode()
              else setBulkMode(true)
            }}
            className={cn(
              'no-drag flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-smooth',
              bulkMode
                ? 'border-primary/40 bg-primary-soft text-primary'
                : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            )}
          >
            {bulkMode ? <CheckSquare size={14} /> : <Square size={14} />}
            {t('bulk_select')}
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="no-drag flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover hover:shadow-card"
          >
            <Plus size={14} strokeWidth={2.5} />
            {t('materials_add')}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧类型筛选 */}
        <aside className="w-48 shrink-0 border-r border-border bg-surface p-3">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary/80">
            {t('materials_type')}
          </div>
          <button
            type="button"
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
              type="button"
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

          {bulkMode && (
            <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-2">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <button
                  type="button"
                  onClick={selectAll}
                  className="flex items-center gap-1 rounded-md px-2 py-1 transition-smooth hover:bg-surface-hover"
                >
                  {selectedIds.size === items.length && items.length > 0 ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                  {t('bulk_selectAll')}
                </button>
                <span className="text-text-tertiary">{t('bulk_selected', { n: selectedIds.size })}</span>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-text-tertiary hover:text-text-secondary"
                  >
                    {t('bulk_clear')}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleBulkChangeType(e.target.value)
                        e.target.value = ''
                      }
                    }}
                    className="input h-7 w-28 py-0 text-[11px]"
                  >
                    <option value="">{t('materials_bulkChangeType')}</option>
                    {MATERIAL_TYPES.map((type) => (
                      <option key={type} value={type}>{t(`materials_type_${type}`)}</option>
                    ))}
                  </select>
                )}
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="flex h-7 items-center gap-1 rounded-md bg-danger-soft px-2.5 text-xs font-medium text-danger transition-smooth hover:bg-danger/10"
                  >
                    <Trash2 size={12} />
                    {t('bulk_delete')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={exitBulkMode}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-secondary"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5">
            {loading && items.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-text-tertiary">{t('loading')}</div>
            ) : items.length === 0 ? (
              <EmptyState onAdd={openAdd} />
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {items.map((item) => (
                  <MaterialCard
                    key={item.id}
                    item={item}
                    selected={selectedIds.has(item.id)}
                    bulkMode={bulkMode}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onEdit={() => openEdit(item)}
                    onDelete={() => handleDelete(item)}
                    onOpenLightbox={(src, alt) => setLightbox({ src, alt })}
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
        title={confirm.bulk ? t('confirm_bulkDeleteTitle') : t('materials_delete')}
        message={confirm.bulk ? confirm.name : t('materials_deleteConfirm', { name: confirm.name })}
        onConfirm={confirmDelete}
        onCancel={() => setConfirm({ open: false, id: null, name: '', bulk: false, ids: [] })}
      />
      <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox({ src: '', alt: '' })} />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}

function MaterialCard({ item, selected, bulkMode, onToggleSelect, onEdit, onDelete, onOpenLightbox }) {
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const tags = item.tags ? item.tags.split(/[,，\s]+/).filter(Boolean) : []
  const resource = item.photo || item.url || ''
  const resourceIsImage = isImageResource(resource)

  const handleOpenResource = async (e) => {
    if (e) e.stopPropagation()
    if (!resource) return
    if (resourceIsImage) {
      const src = toPhotoSrc(resource)
      if (src) onOpenLightbox(src, item.title)
      return
    }
    if (isUrl(resource)) {
      await openExternal(resource)
    } else if (isFolderPath(resource)) {
      await openPath(resource.replace(/^file:\/+/i, ''))
    } else {
      // 其它文件：使用系统默认程序打开
      await openPath(resource.replace(/^file:\/+/i, ''))
    }
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    onEdit()
  }

  const handleDoubleClick = () => {
    if (bulkMode) return
    if (resource) {
      handleOpenResource()
    } else {
      onEdit()
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      className={cn(
        'group relative flex gap-3 rounded-2xl border bg-surface p-4 shadow-card transition-smooth',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-border-strong hover:shadow-float'
      )}
    >
      {bulkMode && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border text-text-tertiary transition-smooth hover:border-primary hover:text-primary"
        >
          {selected && <Check size={13} className="text-primary" />}
        </button>
      )}
      <div className="shrink-0 pt-0.5">
        <TypeIcon type={item.type} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-text-primary">{item.title || t('materials_title')}</h3>
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o) }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary opacity-0 transition-smooth hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
            >
              <MoreHorizontal size={15} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-7 z-40 w-28 overflow-hidden rounded-xl border border-border bg-surface shadow-float">
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); onEdit() }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-text-secondary transition-smooth hover:bg-surface-hover"
                  >
                    <Edit2 size={12} />
                    {t('materials_edit')}
                  </button>
                  <button
                    type="button"
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
            onClick={(e) => e.stopPropagation()}
            className="mb-2 flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink size={11} />
            <span className="truncate">{item.url}</span>
          </a>
        )}

        {resource && (
          <button
            type="button"
            onClick={handleOpenResource}
            className="mb-2 flex w-full items-center gap-2 overflow-hidden rounded-xl border border-border bg-bg p-2 text-left transition-smooth hover:border-primary/30 hover:bg-primary-soft/20"
          >
            <ResourcePreview resource={resource} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">{resource.replace(/^file:\/+/i, '').replace(/^[a-zA-Z]:[\\/]/, '')}</span>
            <ExternalLink size={12} className="shrink-0 text-text-tertiary" />
          </button>
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

function ResourcePreview({ resource }) {
  if (isUrl(resource)) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500 dark:bg-indigo-900/20">
        <Globe size={16} />
      </span>
    )
  }
  if (isFolderPath(resource)) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-500 dark:bg-amber-900/20">
        <Folder size={16} />
      </span>
    )
  }
  const src = toPhotoSrc(resource)
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-border"
        onError={(e) => { e.target.style.display = 'none' }}
      />
    )
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-text-tertiary ring-1 ring-border">
      <ImageIcon size={16} />
    </span>
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
    if (qrUnsubscribe.current) { qrUnsubscribe.current(); qrUnsubscribe.current = null }
    await startQR()
  }

  const stopQR = async () => {
    if (qrUnsubscribe.current) { qrUnsubscribe.current(); qrUnsubscribe.current = null }
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
                  <div className="flex items-center gap-3 rounded-lg bg-surface p-2 ring-1 ring-border">
                    <ResourcePreview resource={form.photo} />
                    <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{form.photo}</span>
                  </div>
                )}
                <input
                  type="text"
                  value={form.photo}
                  onChange={(e) => { set('photo', e.target.value); setPhotoHint('') }}
                  placeholder={t('materials_photoPlaceholder')}
                  className="input h-8 text-xs"
                />
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
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
      >
        <Plus size={14} strokeWidth={2.5} />
        {t('materials_add')}
      </button>
    </motion.div>
  )
}
