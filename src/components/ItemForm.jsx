import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Folder, ChevronRight, MapPin, Image as ImageIcon, Upload, FolderOpen, Smartphone, Sparkles, Receipt, Boxes, Wand2, Loader2, AlertTriangle, Check } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName, buildLocationTree, locationParts, pickImage, startQRUpload, stopQRUpload, onQRUploadImage, recognizeImageWithAI, getAIConfig } from '../lib/api'
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

// 从剪贴板事件中提取图片文件（没有则返回 null）
function getImageFromClipboard(e) {
  const dt = e.clipboardData
  if (!dt) return null
  if (dt.files && dt.files.length > 0) {
    for (const file of dt.files) {
      if (file.type && file.type.startsWith('image/')) return file
    }
  }
  if (dt.items && dt.items.length > 0) {
    for (const item of dt.items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) return file
      }
    }
  }
  return null
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
  notes: '',
  consume_rate: 0,
  consume_unit: 'day',
  consume_start_at: '',
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
      consume_start_at: tsToDateInput(initial.consume_start_at),
      _locId: locId
    }
  })
  const [errors, setErrors] = useState({})
  const [treeOpen, setTreeOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [photoHint, setPhotoHint] = useState('')
  const [qrState, setQrState] = useState({ url: '', status: 'idle' })
  const qrUnsubscribe = useRef(null)

  // AI 识别建议
  const [aiState, setAiState] = useState({ status: 'idle', suggestions: [], error: '' })
  const [aiConfig, setAiConfig] = useState(null)

  // 组件卸载时关闭二维码服务
  useEffect(() => {
    getAIConfig().then((c) => setAiConfig(c)).catch(() => {})
    return () => {
      if (qrUnsubscribe.current) {
        qrUnsubscribe.current()
        qrUnsubscribe.current = null
      }
      stopQRUpload().catch(() => {})
    }
  }, [])

  // 监听 Ctrl+V 粘贴图片（仅在表单打开时生效）
  useEffect(() => {
    const handlePaste = async (e) => {
      const file = getImageFromClipboard(e)
      if (!file) return
      e.preventDefault()
      setPhotoHint('图片压缩中…')
      const result = await compressImageToBase64(file)
      if (result.ok) {
        setForm((f) => ({ ...f, photo: result.data }))
        setPhotoHint(`已压缩至 ${result.sizeKB}KB`)
      } else {
        setPhotoHint(result.error)
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  // 清理二维码上传服务
  const cleanupQR = async () => {
    if (qrUnsubscribe.current) {
      qrUnsubscribe.current()
      qrUnsubscribe.current = null
    }
    await stopQRUpload().catch(() => {})
    setQrState({ url: '', status: 'idle' })
  }

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

  // 手机扫码传图
  const startQR = async () => {
    try {
      setPhotoHint('')
      setQrState({ url: '', status: 'starting' })
      if (qrUnsubscribe.current) {
        qrUnsubscribe.current()
        qrUnsubscribe.current = null
      }
      const info = await startQRUpload()
      setQrState({ url: info.url, status: 'waiting' })
      const unsub = onQRUploadImage(async ({ image }) => {
        setPhotoHint('图片压缩中…')
        const result = await compressImageToBase64(image)
        if (result.ok) {
          setForm((f) => ({ ...f, photo: result.data }))
          setQrState((s) => ({ ...s, status: 'success' }))
          setPhotoHint(`${t('qrUpload_success')}（已压缩至 ${result.sizeKB}KB）`)
        } else {
          setForm((f) => ({ ...f, photo: image }))
          setQrState((s) => ({ ...s, status: 'success' }))
          setPhotoHint(`${t('qrUpload_success')}，${result.error}`)
        }
      })
      qrUnsubscribe.current = unsub
    } catch (e) {
      setQrState({ url: '', status: 'error' })
      setPhotoHint(e.message || '启动失败')
    }
  }

  const refreshQR = async () => {
    await cleanupQR()
    await startQR()
  }

  const stopQR = async () => {
    await cleanupQR()
  }

  // AI 识别当前图片
  const handleRecognize = async () => {
    if (!form.photo) {
      setPhotoHint(t('ai_recognize_emptyPhoto'))
      return
    }
    const cfg = aiConfig || (await getAIConfig().catch(() => ({})))
    if (!cfg?.baseUrl || !cfg?.key) {
      setAiState({ status: 'error', suggestions: [], error: t('ai_recognize_configFirst') })
      return
    }
    setAiState({ status: 'loading', suggestions: [], error: '' })
    try {
      const result = await recognizeImageWithAI(form.photo)
      if (result.ok && Array.isArray(result.items) && result.items.length > 0) {
        setAiState({ status: 'done', suggestions: result.items, error: '' })
      } else if (result.ok) {
        setAiState({ status: 'done', suggestions: [], error: t('ai_recognize_noResult') })
      } else {
        setAiState({ status: 'error', suggestions: [], error: result.error || t('ai_recognize_error', { msg: 'unknown' }) })
      }
    } catch (e) {
      setAiState({ status: 'error', suggestions: [], error: e.message || t('ai_recognize_error', { msg: 'unknown' }) })
    }
  }

  // 应用某条 AI 建议到表单
  const applySuggestion = (s) => {
    const next = {
      name: s.name || form.name,
      category: s.category || form.category,
      quantity: s.quantity || 1,
      notes: s.note ? (form.notes ? `${form.notes}\n${s.note}` : s.note) : form.notes
    }
    if (s.location) {
      const parts = String(s.location).split(/\s*>\s*/).filter(Boolean)
      next.room = parts[0] || ''
      next.position = parts[parts.length - 1] || ''
      next.location = s.location
      // 尝试匹配已有位置
      const match = locations.find((l) => {
        const lp = locationParts(locations, l.id)
        return lp.location === s.location
      })
      if (match) next._locId = match.id
    }
    setForm((f) => ({ ...f, ...next }))
    setAiState({ status: 'idle', suggestions: [], error: '' })
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
      photo: form.photo.trim(),
      notes: form.notes,
      consume_rate: Number(form.consume_rate) || 0,
      consume_unit: form.consume_unit,
      consume_start_at: form.consume_start_at ? dateInputToTs(form.consume_start_at) : 0
    })
  }

  const tree = buildLocationTree(locations)

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
                    'flex flex-col gap-3 rounded-xl border-2 border-dashed p-3 transition-smooth',
                    dragOver
                      ? 'border-primary bg-primary-soft/40'
                      : 'border-border bg-surface hover:border-border-strong'
                  )}
                >
                  <div className="flex items-center gap-3">
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleBrowse}
                          className="flex items-center gap-1 rounded-md bg-surface-hover px-2 py-1 text-[11px] font-medium text-text-secondary transition-smooth hover:bg-surface-active hover:text-text-primary"
                        >
                          <FolderOpen size={12} />
                          {t('f_photo_browse')}
                        </button>
                        <button
                          type="button"
                          onClick={handleRecognize}
                          disabled={aiState.status === 'loading'}
                          className="flex items-center gap-1 rounded-md bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary transition-smooth hover:bg-primary-soft/80 disabled:opacity-60"
                        >
                          {aiState.status === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                          {aiState.status === 'loading' ? t('ai_recognize_loading') : t('ai_recognize_btn')}
                        </button>
                        <button
                          type="button"
                          onClick={qrState.status === 'idle' ? startQR : refreshQR}
                          className="flex items-center gap-1 rounded-md bg-surface-hover px-2 py-1 text-[11px] font-medium text-text-secondary transition-smooth hover:bg-surface-active hover:text-text-primary"
                        >
                          <Smartphone size={12} />
                          {qrState.status === 'idle' ? t('qrUpload_start') : t('qrUpload_refresh')}
                        </button>
                        {qrState.status !== 'idle' && (
                          <button
                            type="button"
                            onClick={stopQR}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-tertiary transition-smooth hover:text-danger"
                          >
                            <X size={12} />
                            {t('qrUpload_stop')}
                          </button>
                        )}
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

                  {qrState.url && (
                    <div className="flex items-center gap-4 rounded-xl bg-bg p-3">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrState.url)}`}
                        alt="QR"
                        className="h-24 w-24 rounded-lg ring-1 ring-border"
                      />
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
                </div>
              </Field>

              <Field label={t('f_notes')} className="col-span-2">
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={3}
                  className="input resize-none"
                  placeholder={t('f_notes')}
                />
              </Field>

              <Field label={t('f_consumeRate')} className="col-span-2 sm:col-span-1">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.consume_rate}
                  onChange={(e) => set('consume_rate', e.target.value)}
                  className="input"
                />
                <span className="mt-1 block text-[11px] text-text-tertiary">{t('f_consumeRateHint')}</span>
              </Field>

              <div className="col-span-2 grid grid-cols-2 gap-3">
                <Field label={t('f_consumeUnit')}>
                  <select value={form.consume_unit} onChange={(e) => set('consume_unit', e.target.value)} className="input">
                    <option value="day">{t('f_consumeUnit_day')}</option>
                    <option value="week">{t('f_consumeUnit_week')}</option>
                    <option value="month">{t('f_consumeUnit_month')}</option>
                  </select>
                </Field>
                <Field label={t('f_consumeStart')}>
                  <input type="date" value={form.consume_start_at} onChange={(e) => set('consume_start_at', e.target.value)} className="input" />
                </Field>
              </div>

              {/* AI 能力入口 */}
              <div className="col-span-2 rounded-xl border border-primary/20 bg-primary-soft/40 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Sparkles size={14} />
                  {t('ai_title')}
                </div>
                <div className="flex flex-wrap gap-2">
                  <AIBadge icon={Boxes} label={t('ai_recognize')} active />
                  <AIBadge icon={Boxes} label={`${t('ai_segment')} · ${t('ai_plan_badge')}`} />
                  <AIBadge icon={Receipt} label={`${t('ai_receipt')} · ${t('ai_plan_badge')}`} />
                </div>
                <p className="mt-2 text-[11px] text-text-tertiary">{t('ai_coming')}</p>
              </div>
            </div>
          </div>

          {/* AI 识别建议弹窗 */}
          <AnimatePresence>
            {(aiState.status === 'done' || aiState.status === 'error') && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="border-t border-border bg-surface p-5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-primary">{t('ai_recognize_suggestions')}</h3>
                  <button
                    type="button"
                    onClick={() => setAiState({ status: 'idle', suggestions: [], error: '' })}
                    className="text-[11px] text-text-tertiary hover:text-text-primary"
                  >
                    {t('ai_recognize_close')}
                  </button>
                </div>

                {aiState.error && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-xs text-danger">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>{aiState.error}</span>
                  </div>
                )}

                {aiState.suggestions.length === 0 && !aiState.error && (
                  <p className="text-xs text-text-tertiary">{t('ai_recognize_noResult')}</p>
                )}

                <div className="space-y-2">
                  {aiState.suggestions.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 rounded-xl border border-border bg-bg p-3"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <Boxes size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">{s.name}</span>
                          {s.confidence > 0 && (
                            <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-text-tertiary">
                              {t('ai_recognize_confidence')} {(s.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-text-secondary">
                          {s.category && (
                            <span>
                              {t('f_category')}: {categoryDisplayName(categories.find((c) => c.key === s.category), lang) || s.category}
                            </span>
                          )}
                          {s.location && <span>{t('f_location')}: {s.location}</span>}
                          {s.quantity > 0 && <span>{t('f_quantity')}: {s.quantity}</span>}
                        </div>
                        {s.note && <p className="mt-1 text-[11px] text-text-tertiary">{t('ai_recognize_note')}: {s.note}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => applySuggestion(s)}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-white transition-smooth hover:bg-primary-hover"
                      >
                        <Check size={12} />
                        {t('ai_recognize_apply')}
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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

function AIBadge({ icon: Icon, label, active }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium',
        active
          ? 'border-primary/30 bg-primary-soft text-primary'
          : 'border-primary/20 bg-white/60 text-primary/80 dark:bg-black/20'
      )}
    >
      <Icon size={11} />
      {label}
    </span>
  )
}
