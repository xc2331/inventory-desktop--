import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Plus,
  MousePointer2,
  Square,
  Move,
  Trash2,
  Save,
  Maximize2,
  Boxes,
  MapPin,
  Palette,
  Type,
  Link2,
  X,
  Layers,
  ChevronUp,
  ChevronDown,
  ArrowUpToLine,
  ArrowDownToLine,
  Image as ImageIcon,
  Smartphone,
  FolderOpen
} from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { EASE } from '../lib/motion'
import { cn } from '../lib/cn'
import {
  fetchFloorPlan,
  saveFloorPlan,
  deleteFloorPlan,
  createFloorPlanSubLocation,
  locationPath,
  locationParts,
  itemLocationPath,
  pickImage,
  startQRUpload,
  stopQRUpload,
  onQRUploadImage
} from '../lib/api'
import { compressImageToBase64 } from '../lib/imageCompress'
import ConfirmDialog from './ConfirmDialog'
import Toast from './Toast'

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

const MIN_SIZE_PCT = 6
const DEFAULT_AREA_SIZE = 16
const ROOM_COLOR_INDEX = 0

const AREA_PALETTE = [
  { bg: 'bg-amber-100 dark:bg-amber-900/30', border: 'border-amber-300 dark:border-amber-700', text: 'text-amber-800 dark:text-amber-200' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-800 dark:text-emerald-200' },
  { bg: 'bg-sky-100 dark:bg-sky-900/30', border: 'border-sky-300 dark:border-sky-700', text: 'text-sky-800 dark:text-sky-200' },
  { bg: 'bg-rose-100 dark:bg-rose-900/30', border: 'border-rose-300 dark:border-rose-700', text: 'text-rose-800 dark:text-rose-200' },
  { bg: 'bg-violet-100 dark:bg-violet-900/30', border: 'border-violet-300 dark:border-violet-700', text: 'text-violet-800 dark:text-violet-200' },
  { bg: 'bg-teal-100 dark:bg-teal-900/30', border: 'border-teal-300 dark:border-teal-700', text: 'text-teal-800 dark:text-teal-200' },
  { bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-300 dark:border-orange-700', text: 'text-orange-800 dark:text-orange-200' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/30', border: 'border-indigo-300 dark:border-indigo-700', text: 'text-indigo-800 dark:text-indigo-200' }
]

const ROOM_STYLE = {
  bg: 'bg-stone-100 dark:bg-stone-800/40',
  border: 'border-stone-300 dark:border-stone-600',
  text: 'text-stone-700 dark:text-stone-300'
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function round2(n) {
  return Math.round(n * 100) / 100
}

function ensurePlan(plan) {
  const baseAreas = Array.isArray(plan?.areas) ? plan.areas : []
  return {
    room: { x: 10, y: 10, w: 80, h: 80, colorIndex: ROOM_COLOR_INDEX, label: '', ...(plan?.room || {}) },
    // 兼容旧数据：没有 zIndex 时按原数组顺序赋值
    areas: baseAreas.map((a, i) => ({ ...a, zIndex: typeof a.zIndex === 'number' ? a.zIndex : i + 1 }))
  }
}

function nextAreaColor(areas) {
  const used = new Set(areas.map((a) => a.colorIndex).filter((n) => typeof n === 'number'))
  for (let i = 1; i < AREA_PALETTE.length; i++) {
    if (!used.has(i)) return i
  }
  return 1
}

function findNonOverlappingPosition(areas, size = DEFAULT_AREA_SIZE) {
  const candidates = [
    { x: 50 - size / 2, y: 50 - size / 2 },
    { x: 50 - size / 2, y: 35 - size / 2 },
    { x: 50 - size / 2, y: 65 - size / 2 },
    { x: 35 - size / 2, y: 50 - size / 2 },
    { x: 65 - size / 2, y: 50 - size / 2 },
    { x: 35 - size / 2, y: 35 - size / 2 },
    { x: 65 - size / 2, y: 35 - size / 2 },
    { x: 35 - size / 2, y: 65 - size / 2 },
    { x: 65 - size / 2, y: 65 - size / 2 }
  ]
  for (const pos of candidates) {
    const rect = { x: clamp(pos.x, 0, 100 - size), y: clamp(pos.y, 0, 100 - size), w: size, h: size }
    const overlap = areas.some((a) => !(rect.x + rect.w <= a.x || a.x + a.w <= rect.x || rect.y + rect.h <= a.y || a.y + a.h <= rect.y))
    if (!overlap) return rect
  }
  // 随机靠边偏移
  const offset = areas.length * 3
  return { x: clamp(10 + offset, 0, 100 - size), y: clamp(10 + offset, 0, 100 - size), w: size, h: size }
}

export default function FloorPlanEditor({ locationId, locationName, locations, items, onBack, onSelectSubLocation }) {
  const { t } = useI18n()
  const canvasRef = useRef(null)
  const [plan, setPlan] = useState(null)
  const [original, setOriginal] = useState(null)
  const [selectedId, setSelectedId] = useState('room')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirm, setConfirm] = useState({ open: false, title: '', message: '', onConfirm: null })
  const [createDialog, setCreateDialog] = useState({ open: false, name: '', bindLocationId: '', mode: 'visual' })
  const [qrDialog, setQrDialog] = useState({ open: false, url: '', status: 'idle' })
  const [imageHint, setImageHint] = useState('')
  const qrUnsubscribe = useRef(null)

  // 拖拽/缩放/绘制状态
  const actionRef = useRef(null)

  const subLocations = useMemo(() => {
    return locations.filter((l) => l.parent_id === locationId).sort((a, b) => a.sort_order - b.sort_order)
  }, [locations, locationId])

  const boundIds = useMemo(() => {
    const set = new Set((plan?.areas || []).map((a) => a.bindLocationId).filter(Boolean))
    return set
  }, [plan])

  const unboundSubLocations = useMemo(() => {
    return subLocations.filter((l) => !boundIds.has(l.id))
  }, [subLocations, boundIds])

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() })
  }, [])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetchFloorPlan(locationId)
      .then((data) => {
        if (!mounted) return
        const p = ensurePlan(data)
        setPlan(p)
        setOriginal(JSON.parse(JSON.stringify(p)))
      })
      .catch((e) => {
        console.error('[FloorPlanEditor] 加载平面图失败:', e)
        showToast(e.message || t('floorPlan_loadFail'), 'error')
        // 加载失败也给出默认平面图，避免 plan 为 null 导致渲染崩溃白屏
        const p = ensurePlan(null)
        if (mounted) {
          setPlan(p)
          setOriginal(JSON.parse(JSON.stringify(p)))
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [locationId, t, showToast])

  // 组件卸载时关闭二维码上传服务
  useEffect(() => {
    return () => {
      if (qrUnsubscribe.current) {
        qrUnsubscribe.current()
        qrUnsubscribe.current = null
      }
      stopQRUpload().catch(() => {})
    }
  }, [])

  // 选中子区域时监听全局粘贴（图片 / 图片链接）
  useEffect(() => {
    if (!selectedElement || selectedElement.isRoom) return
    const handler = (e) => handleImagePaste(e)
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElement?.id])

  const hasChanges = useMemo(() => {
    if (!plan || !original) return false
    return JSON.stringify(plan) !== JSON.stringify(original)
  }, [plan, original])

  const handleSave = async () => {
    if (!plan) return
    setSaving(true)
    try {
      await saveFloorPlan(locationId, plan)
      setOriginal(JSON.parse(JSON.stringify(plan)))
      showToast(t('floorPlan_saved'))
    } catch (e) {
      showToast(e.message || t('floorPlan_saveFail'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePlan = () => {
    setConfirm({
      open: true,
      title: t('floorPlan_deleteTitle'),
      message: t('floorPlan_deleteMsg', { name: locationName }),
      onConfirm: async () => {
        setConfirm((c) => ({ ...c, open: false }))
        try {
          await deleteFloorPlan(locationId)
          showToast(t('floorPlan_deleted'))
          setTimeout(onBack, 300)
        } catch (e) {
          showToast(e.message || t('floorPlan_deleteFail'), 'error')
        }
      }
    })
  }

  const addArea = (rect, thenSelect = true, override = {}) => {
    if (!plan) return
    const maxZ = plan.areas.length ? Math.max(...plan.areas.map((a) => a.zIndex || 0)) : 0
    const newArea = {
      id: uid(),
      x: round2(rect.x),
      y: round2(rect.y),
      w: round2(rect.w),
      h: round2(rect.h),
      colorIndex: nextAreaColor(plan.areas),
      label: '',
      bindLocationId: '',
      zIndex: maxZ + 1,
      ...override
    }
    setPlan((p) => ({ ...p, areas: [...p.areas, newArea] }))
    if (thenSelect) {
      setSelectedId(newArea.id)
      setCreateDialog({ open: true, name: '', bindLocationId: '', mode: 'visual' })
    }
  }

  const addCenterArea = () => {
    if (!plan) return
    const rect = { x: 50 - DEFAULT_AREA_SIZE / 2, y: 50 - DEFAULT_AREA_SIZE / 2, w: DEFAULT_AREA_SIZE, h: DEFAULT_AREA_SIZE }
    addArea(rect)
  }

  const autoAddUnboundSubLocations = () => {
    if (!plan) return
    const targets = unboundSubLocations
    if (targets.length === 0) {
      showToast(t('floorPlan_noUnboundSubLocations'))
      return
    }

    const room = plan.room
    const size = DEFAULT_AREA_SIZE
    const gap = 2
    const cols = Math.max(1, Math.floor((room.w - gap) / (size + gap)))
    const allExisting = [...plan.areas]
    const newAreas = []
    let nextZ = allExisting.length ? Math.max(...allExisting.map((a) => a.zIndex || 0)) : 0

    const overlaps = (rect) => {
      return allExisting.some((a) => !(rect.x + rect.w <= a.x || a.x + a.w <= rect.x || rect.y + rect.h <= a.y || a.y + a.h <= rect.y))
    }

    for (let i = 0; i < targets.length; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      let x = room.x + gap + col * (size + gap)
      let y = room.y + gap + row * (size + gap)
      x = clamp(x, room.x, room.x + room.w - size)
      y = clamp(y, room.y, room.y + room.h - size)

      let rect = { x: round2(x), y: round2(y), w: size, h: size }
      if (overlaps(rect)) {
        rect = findNonOverlappingPosition(allExisting, size)
        rect.x = clamp(rect.x, room.x, room.x + room.w - size)
        rect.y = clamp(rect.y, room.y, room.y + room.h - size)
      }

      const newArea = {
        id: uid(),
        x: round2(rect.x),
        y: round2(rect.y),
        w: round2(rect.w),
        h: round2(rect.h),
        colorIndex: nextAreaColor(allExisting),
        label: targets[i].name,
        bindLocationId: targets[i].id,
        zIndex: ++nextZ
      }
      allExisting.push(newArea)
      newAreas.push(newArea)
    }

    if (newAreas.length > 0) {
      setPlan((p) => ({ ...p, areas: [...p.areas, ...newAreas] }))
      showToast(t('floorPlan_autoAdded', { n: newAreas.length }))
    }
  }

  const updateArea = (id, patch) => {
    setPlan((p) => ({
      ...p,
      areas: p.areas.map((a) => (a.id === id ? { ...a, ...patch } : a))
    }))
  }

  const updateRoom = (patch) => {
    setPlan((p) => ({ ...p, room: { ...p.room, ...patch } }))
  }

  const deleteSelected = () => {
    if (selectedId === 'room') return
    setPlan((p) => ({ ...p, areas: p.areas.filter((a) => a.id !== selectedId) }))
    setSelectedId('room')
  }

  // 重新按 areas 数组顺序分配 zIndex，保证渲染顺序稳定
  const reassignZIndex = (areas) => {
    return areas.map((a, i) => ({ ...a, zIndex: i + 1 }))
  }

  const sortedAreas = useMemo(() => {
    if (!plan) return []
    return [...plan.areas].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
  }, [plan])

  const reorderArea = (fromId, toId) => {
    if (fromId === toId) return
    setPlan((p) => {
      const order = [...p.areas].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
      const fromIdx = order.findIndex((a) => a.id === fromId)
      const toIdx = order.findIndex((a) => a.id === toId)
      if (fromIdx === -1 || toIdx === -1) return p
      const [moved] = order.splice(fromIdx, 1)
      order.splice(toIdx, 0, moved)
      return { ...p, areas: reassignZIndex(order) }
    })
  }

  const bringToFront = (id) => {
    setPlan((p) => {
      const target = p.areas.find((a) => a.id === id)
      if (!target) return p
      const maxZ = Math.max(0, ...p.areas.map((a) => a.zIndex || 0))
      return { ...p, areas: p.areas.map((a) => (a.id === id ? { ...a, zIndex: maxZ + 1 } : a)) }
    })
  }

  const sendToBack = (id) => {
    setPlan((p) => {
      const target = p.areas.find((a) => a.id === id)
      if (!target) return p
      const minZ = Math.min(...p.areas.map((a) => a.zIndex || 0))
      return { ...p, areas: p.areas.map((a) => (a.id === id ? { ...a, zIndex: minZ - 1 } : a)) }
    })
  }

  const bringForward = (id) => {
    setPlan((p) => {
      const order = [...p.areas].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
      const idx = order.findIndex((a) => a.id === id)
      if (idx === -1 || idx >= order.length - 1) return p
      ;[order[idx], order[idx + 1]] = [order[idx + 1], order[idx]]
      return { ...p, areas: reassignZIndex(order) }
    })
  }

  const sendBackward = (id) => {
    setPlan((p) => {
      const order = [...p.areas].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
      const idx = order.findIndex((a) => a.id === id)
      if (idx <= 0) return p
      ;[order[idx], order[idx - 1]] = [order[idx - 1], order[idx]]
      return { ...p, areas: reassignZIndex(order) }
    })
  }

  const handleCreateDialogConfirm = async () => {
    const { mode, name, bindLocationId } = createDialog
    let finalName = name.trim()
    let finalBindId = bindLocationId

    if (mode === 'create') {
      if (!finalName) {
        showToast(t('floorPlan_nameRequired'), 'error')
        return
      }
      try {
        const created = await createFloorPlanSubLocation(locationId, finalName)
        finalBindId = created.id
      } catch (e) {
        showToast(e.message || t('floorPlan_createSubFail'), 'error')
        return
      }
    } else if (mode === 'bind' && finalBindId) {
      const loc = subLocations.find((l) => l.id === finalBindId)
      if (loc && !finalName) finalName = loc.name
    }

    if (selectedId && selectedId !== 'room') {
      updateArea(selectedId, { label: finalName, bindLocationId: finalBindId })
    }
    setCreateDialog({ open: false, name: '', bindLocationId: '', mode: 'visual' })
  }

  // ===== 子区域实景图上传 =====
  const cleanupQR = async () => {
    if (qrUnsubscribe.current) {
      qrUnsubscribe.current()
      qrUnsubscribe.current = null
    }
    await stopQRUpload().catch(() => {})
    setQrDialog({ open: false, url: '', status: 'idle' })
  }

  const openQRDialog = async () => {
    setImageHint('')
    setQrDialog({ open: true, url: '', status: 'starting' })
    try {
      if (qrUnsubscribe.current) {
        qrUnsubscribe.current()
        qrUnsubscribe.current = null
      }
      const info = await startQRUpload()
      setQrDialog({ open: true, url: info.url, status: 'waiting' })
      const unsub = onQRUploadImage(async ({ image }) => {
        setImageHint(t('qrUpload_success') + '…')
        const result = await compressImageToBase64(image)
        if (selectedId && selectedId !== 'room') {
          updateArea(selectedId, { image: result.ok ? result.data : image })
        }
        setImageHint(result.ok ? t('floorPlan_imageSize', { n: result.sizeKB }) : result.error)
        setQrDialog((d) => ({ ...d, status: 'success' }))
      })
      qrUnsubscribe.current = unsub
    } catch (e) {
      setImageHint(e.message || t('floorPlan_imageLoadFail'))
      setQrDialog((d) => ({ ...d, status: 'error' }))
    }
  }

  const handleBrowseImage = async () => {
    setImageHint('')
    try {
      const res = await pickImage()
      if (res.canceled || !res.path) return
      setImageHint(t('floorPlan_imageCompressing') || '图片压缩中…')
      const result = await compressImageToBase64(res.path)
      if (selectedId && selectedId !== 'room') {
        updateArea(selectedId, { image: result.ok ? result.data : res.path })
      }
      setImageHint(result.ok ? t('floorPlan_imageSize', { n: result.sizeKB }) : result.error)
    } catch (e) {
      setImageHint(e.message || t('floorPlan_imageLoadFail'))
    }
  }

  const handleImagePaste = async (e) => {
    const target = e.target
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

    const file = getImageFromClipboard(e)
    if (file) {
      e.preventDefault()
      setImageHint(t('floorPlan_imageCompressing') || '图片压缩中…')
      const result = await compressImageToBase64(file)
      if (selectedId && selectedId !== 'room') {
        updateArea(selectedId, { image: result.ok ? result.data : '' })
      }
      setImageHint(result.ok ? t('floorPlan_imageSize', { n: result.sizeKB }) : result.error)
      return
    }

    const text = e.clipboardData?.getData('text/plain')?.trim()
    if (text && /^(https?:|file:)/i.test(text)) {
      e.preventDefault()
      if (selectedId && selectedId !== 'room') {
        updateArea(selectedId, { image: text })
      }
      setImageHint('')
    }
  }

  const handleImageDrop = async (e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file && file.type && file.type.startsWith('image/')) {
      setImageHint(t('floorPlan_imageCompressing') || '图片压缩中…')
      const result = await compressImageToBase64(file)
      if (selectedId && selectedId !== 'room') {
        updateArea(selectedId, { image: result.ok ? result.data : '' })
      }
      setImageHint(result.ok ? t('floorPlan_imageSize', { n: result.sizeKB }) : result.error)
      return
    }
    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain')
    if (url?.trim()) {
      if (selectedId && selectedId !== 'room') {
        updateArea(selectedId, { image: url.trim() })
      }
      setImageHint('')
    }
  }

  const toPercent = (clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100)
    }
  }

  const onMouseDown = (e) => {
    if (e.button !== 0 || !plan) return
    const target = e.target
    if (target.closest('[data-resize-handle]')) return
    const id = target.closest('[data-element-id]')?.dataset.elementId
    if (id) {
      setSelectedId(id)
      // 只有在「绘制」模式下才允许拖拽移动元素；「选择」模式仅用于查看和修改属性
      if (drawMode) {
        const el = id === 'room' ? plan.room : plan.areas.find((a) => a.id === id)
        if (!el) return
        const pos = toPercent(e.clientX, e.clientY)
        actionRef.current = { type: 'move', id, startX: pos.x, startY: pos.y, origX: el.x, origY: el.y }
      }
      e.preventDefault()
      return
    }
    if (drawMode) {
      const pos = toPercent(e.clientX, e.clientY)
      actionRef.current = { type: 'draw', startX: pos.x, startY: pos.y, x: pos.x, y: pos.y }
      setSelectedId(null)
      e.preventDefault()
    } else {
      setSelectedId(null)
    }
  }

  const onResizeStart = (e, id, handle) => {
    e.stopPropagation()
    e.preventDefault()
    if (!plan) return
    const el = id === 'room' ? plan.room : plan.areas.find((a) => a.id === id)
    if (!el) return
    actionRef.current = { type: 'resize', id, handle, orig: { ...el } }
    setSelectedId(id)
  }

  const onMouseMove = (e) => {
    if (!actionRef.current || !plan) return
    const pos = toPercent(e.clientX, e.clientY)
    const action = actionRef.current

    if (action.type === 'move') {
      const dx = pos.x - action.startX
      const dy = pos.y - action.startY
      const targetEl = action.id === 'room' ? plan.room : plan.areas.find((a) => a.id === action.id)
      if (!targetEl) return
      const nx = clamp(action.origX + dx, 0, 100 - targetEl.w)
      const ny = clamp(action.origY + dy, 0, 100 - targetEl.h)
      if (action.id === 'room') {
        updateRoom({ x: round2(nx), y: round2(ny) })
      } else {
        updateArea(action.id, { x: round2(nx), y: round2(ny) })
      }
    } else if (action.type === 'resize') {
      const { id, handle, orig } = action
      let { x, y, w, h } = orig
      if (handle.includes('e')) w = clamp(pos.x - x, MIN_SIZE_PCT, 100 - x)
      if (handle.includes('s')) h = clamp(pos.y - y, MIN_SIZE_PCT, 100 - y)
      if (handle.includes('w')) {
        const nx = clamp(pos.x, 0, x + w - MIN_SIZE_PCT)
        w = round2(x + w - nx)
        x = round2(nx)
      }
      if (handle.includes('n')) {
        const ny = clamp(pos.y, 0, y + h - MIN_SIZE_PCT)
        h = round2(y + h - ny)
        y = round2(ny)
      }
      if (id === 'room') {
        updateRoom({ x, y, w, h })
      } else {
        updateArea(id, { x, y, w, h })
      }
    } else if (action.type === 'draw') {
      actionRef.current = { ...action, x: pos.x, y: pos.y }
      // 绘制预览通过 rerender 实现
      forceUpdate({})
    }
  }

  const [, forceUpdate] = useState({})

  const onMouseUp = () => {
    const action = actionRef.current
    if (!action) return
    if (action.type === 'draw') {
      const x1 = Math.min(action.startX, action.x)
      const y1 = Math.min(action.startY, action.y)
      const w = Math.abs(action.x - action.startX)
      const h = Math.abs(action.y - action.startY)
      if (w >= MIN_SIZE_PCT && h >= MIN_SIZE_PCT) {
        addArea({ x: x1, y: y1, w: clamp(w, MIN_SIZE_PCT, 100 - x1), h: clamp(h, MIN_SIZE_PCT, 100 - y1) })
      }
    }
    actionRef.current = null
    forceUpdate({})
  }



  const selectedElement = useMemo(() => {
    if (!plan) return null
    if (selectedId === 'room') return { ...plan.room, id: 'room', isRoom: true }
    return plan.areas.find((a) => a.id === selectedId) || null
  }, [plan, selectedId])

  const selectedItemCount = useMemo(() => {
    if (!selectedElement || selectedElement.isRoom || !selectedElement.bindLocationId) return 0
    const loc = locations.find((l) => l.id === selectedElement.bindLocationId)
    if (!loc) return 0
    const parts = locationParts(locations, loc.id)
    return items.filter((it) => itemLocationPath(it).join(' > ') === parts.location).length
  }, [selectedElement, locations, items])

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg">
        <div className="text-sm text-text-tertiary">{t('floorPlan_loading')}…</div>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
        <p className="text-sm text-text-secondary">{t('floorPlan_loadFail')}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            fetchFloorPlan(locationId)
              .then((data) => {
                const p = ensurePlan(data)
                setPlan(p)
                setOriginal(JSON.parse(JSON.stringify(p)))
              })
              .catch((e) => showToast(e.message || t('floorPlan_loadFail'), 'error'))
              .finally(() => setLoading(false))
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
        >
          {t('btn_retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg">
      {/* 顶部工具栏 */}
      <header className="drag-region flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (hasChanges) {
                setConfirm({
                  open: true,
                  title: t('floorPlan_unsavedTitle'),
                  message: t('floorPlan_unsavedMsg'),
                  onConfirm: () => {
                    setConfirm((c) => ({ ...c, open: false }))
                    onBack()
                  }
                })
              } else {
                onBack()
              }
            }}
            className="no-drag flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-text-primary">{locationName}</h1>
            <p className="text-[11px] text-text-tertiary">{t('floorPlan_subtitle')}</p>
          </div>
        </div>

        <div className="no-drag flex items-center gap-2">
          <ToolbarButton
            active={!drawMode}
            onClick={() => setDrawMode(false)}
            icon={MousePointer2}
            label={t('floorPlan_select')}
          />
          <ToolbarButton
            active={drawMode}
            onClick={() => setDrawMode(true)}
            icon={Square}
            label={t('floorPlan_draw')}
          />
          <div className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton onClick={addCenterArea} icon={Plus} label={t('floorPlan_addCenter')} />
          <ToolbarButton onClick={autoAddUnboundSubLocations} icon={Boxes} label={t('floorPlan_addOffset')} />
          <ToolbarButton
            onClick={deleteSelected}
            disabled={selectedId === 'room' || !selectedId}
            icon={Trash2}
            label={t('floorPlan_delete')}
            danger
          />
          <div className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton onClick={handleDeletePlan} icon={X} label={t('floorPlan_reset')} danger />
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-smooth',
              saving || !hasChanges ? 'bg-primary/60' : 'bg-primary hover:bg-primary-hover shadow-sm'
            )}
          >
            <Save size={14} />
            {saving ? t('floorPlan_saving') : t('floorPlan_save')}
          </button>
        </div>
      </header>

      {/* 主体 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 画布 */}
        <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-bg p-6">
          <div
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            className={cn(
              'relative aspect-square h-full max-h-full w-auto max-w-full rounded-2xl shadow-card',
              drawMode ? 'cursor-crosshair' : 'cursor-default'
            )}
            style={{ aspectRatio: '1 / 1' }}
          >
            {/* 房间边界 */}
            <PlanElement
              element={plan.room}
              id="room"
              selected={selectedId === 'room'}
              style={ROOM_STYLE}
              label={locationName}
              drawMode={drawMode}
              onResizeStart={onResizeStart}
            />

            {/* 子区域：按 zIndex 从小到大渲染，zIndex 大的后渲染，盖住前面的 */}
            {sortedAreas.map((area) => (
              <PlanElement
                key={area.id}
                element={area}
                id={area.id}
                selected={selectedId === area.id}
                style={AREA_PALETTE[(area.colorIndex || 1) % AREA_PALETTE.length]}
                label={area.label || unboundSubLocations.find((l) => l.id === area.bindLocationId)?.name || t('floorPlan_unnamed')}
                drawMode={drawMode}
                onResizeStart={onResizeStart}
                onDoubleClick={() => {
                  if (area.bindLocationId) {
                    const loc = locations.find((l) => l.id === area.bindLocationId)
                    if (loc) {
                      const parts = locationParts(locations, loc.id)
                      onSelectSubLocation(parts.location.split(' > '))
                    }
                  }
                }}
              />
            ))}

            {/* 拖拽绘制预览 */}
            {(() => {
              if (!actionRef.current || actionRef.current.type !== 'draw') return null
              const { startX, startY, x, y } = actionRef.current
              const px = Math.min(startX, x)
              const py = Math.min(startY, y)
              const pw = Math.abs(x - startX)
              const ph = Math.abs(y - startY)
              if (pw < 1 || ph < 1) return null
              return (
                <div
                  className="absolute border-2 border-dashed border-primary bg-primary/10"
                  style={{
                    left: `${px}%`,
                    top: `${py}%`,
                    width: `${pw}%`,
                    height: `${ph}%`
                  }}
                />
              )
            })()}
          </div>
        </main>

        {/* 属性面板 */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-surface">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold text-text-primary">{t('floorPlan_properties')}</h2>
          </div>

          {!selectedElement && (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-xs text-text-tertiary">
              <MousePointer2 size={32} className="mb-3 opacity-40" />
              <p>{t('floorPlan_selectHint')}</p>
            </div>
          )}

          {selectedElement?.isRoom && (
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <PropertyRow icon={MapPin} label={t('floorPlan_roomName')}>
                <span className="text-sm text-text-primary">{locationName}</span>
              </PropertyRow>
              <PropertyRow icon={Move} label={t('floorPlan_position')}>
                <span className="text-xs text-text-secondary">x {plan.room.x}% · y {plan.room.y}%</span>
              </PropertyRow>
              <PropertyRow icon={Maximize2} label={t('floorPlan_size')}>
                <span className="text-xs text-text-secondary">{plan.room.w}% × {plan.room.h}%</span>
              </PropertyRow>
              <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                {t('floorPlan_roomHint')}
              </p>
            </div>
          )}

          {selectedElement && !selectedElement.isRoom && (
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <PropertyRow icon={Type} label={t('floorPlan_areaName')}>
                <input
                  type="text"
                  value={selectedElement.label || ''}
                  onChange={(e) => updateArea(selectedElement.id, { label: e.target.value })}
                  placeholder={t('floorPlan_areaNamePlaceholder')}
                  className="input h-8 w-full text-xs"
                />
              </PropertyRow>

              <PropertyRow icon={Link2} label={t('floorPlan_bindSubLocation')}>
                <select
                  value={selectedElement.bindLocationId || ''}
                  onChange={(e) => {
                    const id = e.target.value
                    const loc = id ? locations.find((l) => l.id === id) : null
                    updateArea(selectedElement.id, {
                      bindLocationId: id,
                      label: loc && !selectedElement.label ? loc.name : selectedElement.label
                    })
                  }}
                  className="input h-8 w-full text-xs"
                >
                  <option value="">{t('floorPlan_noBind')}</option>
                  {subLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </PropertyRow>

              <PropertyRow icon={Palette} label={t('floorPlan_color')}>
                <div className="flex flex-wrap gap-1.5">
                  {AREA_PALETTE.map((pal, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => updateArea(selectedElement.id, { colorIndex: idx })}
                      className={cn(
                        'h-6 w-6 rounded-full border-2 transition-smooth',
                        pal.bg,
                        pal.border,
                        selectedElement.colorIndex === idx ? 'ring-2 ring-primary ring-offset-1' : ''
                      )}
                    />
                  ))}
                </div>
              </PropertyRow>

              <PropertyRow icon={Move} label={t('floorPlan_position')}>
                <span className="text-xs text-text-secondary">x {selectedElement.x}% · y {selectedElement.y}%</span>
              </PropertyRow>

              <PropertyRow icon={Maximize2} label={t('floorPlan_size')}>
                <span className="text-xs text-text-secondary">{selectedElement.w}% × {selectedElement.h}%</span>
              </PropertyRow>

              {/* 子区域实景图 */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-text-tertiary">
                  <ImageIcon size={12} />
                  {t('floorPlan_areaImage')}
                </label>
                <div
                  tabIndex={0}
                  onPaste={handleImagePaste}
                  onDrop={handleImageDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className={cn(
                    'rounded-xl border border-border bg-bg p-3 outline-none transition-smooth focus-within:border-primary/60',
                    imageHint && (imageHint.includes('失败') || imageHint.includes('超过')) && 'border-danger'
                  )}
                >
                  {selectedElement.image ? (
                    <div className="relative mb-2">
                      <img
                        src={toPhotoSrc(selectedElement.image)}
                        alt="area"
                        className="h-32 w-full rounded-lg object-cover ring-1 ring-border"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => updateArea(selectedElement.id, { image: '' })}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white transition-smooth hover:bg-danger"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="mb-2 flex h-24 w-full items-center justify-center rounded-lg bg-surface text-text-tertiary">
                      <ImageIcon size={28} />
                    </div>
                  )}

                  <input
                    type="text"
                    value={selectedElement.image || ''}
                    onChange={(e) => updateArea(selectedElement.id, { image: e.target.value })}
                    placeholder={t('floorPlan_imageUrlPlaceholder')}
                    className="input mb-2 h-8 w-full text-xs"
                  />

                  {imageHint && (
                    <p className={cn('mb-2 text-[11px]', imageHint.includes('失败') || imageHint.includes('超过') ? 'text-danger' : 'text-text-tertiary')}>
                      {imageHint}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleBrowseImage}
                      className="flex items-center gap-1 rounded-md bg-surface-hover px-2 py-1 text-[11px] font-medium text-text-secondary transition-smooth hover:bg-surface-active hover:text-text-primary"
                    >
                      <FolderOpen size={12} />
                      {t('f_photo_browse')}
                    </button>
                    <button
                      type="button"
                      onClick={openQRDialog}
                      className="flex items-center gap-1 rounded-md bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary transition-smooth hover:bg-primary-soft/80"
                    >
                      <Smartphone size={12} />
                      {t('qrUpload_start')}
                    </button>
                    {selectedElement.image && (
                      <button
                        type="button"
                        onClick={() => updateArea(selectedElement.id, { image: '' })}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-tertiary transition-smooth hover:text-danger"
                      >
                        <X size={12} />
                        {t('btn_delete')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {selectedElement.bindLocationId && (
                <button
                  onClick={() => {
                    const loc = locations.find((l) => l.id === selectedElement.bindLocationId)
                    if (loc) {
                      const parts = locationParts(locations, loc.id)
                      onSelectSubLocation(parts.location.split(' > '))
                    }
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
                >
                  <Boxes size={13} />
                  {t('floorPlan_viewItems', { n: selectedItemCount })}
                </button>
              )}

              <PropertyRow icon={Layers} label={t('floorPlan_layer')}>
                <div className="flex flex-wrap gap-1">
                  <LayerBtn icon={ArrowUpToLine} onClick={() => bringToFront(selectedElement.id)} title={t('floorPlan_bringToFront')} />
                  <LayerBtn icon={ArrowDownToLine} onClick={() => sendToBack(selectedElement.id)} title={t('floorPlan_sendToBack')} />
                  <LayerBtn icon={ChevronUp} onClick={() => bringForward(selectedElement.id)} title={t('floorPlan_bringForward')} />
                  <LayerBtn icon={ChevronDown} onClick={() => sendBackward(selectedElement.id)} title={t('floorPlan_sendBackward')} />
                </div>
              </PropertyRow>

              <button
                onClick={() => setCreateDialog({ open: true, name: selectedElement.label || '', bindLocationId: selectedElement.bindLocationId || '', mode: 'visual' })}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
              >
                {t('floorPlan_rebind')}
              </button>
            </div>
          )}

          {/* 图层列表：始终显示，可拖拽排序 / 点选 */}
          {plan.areas.length > 0 && (
            <div className="shrink-0 max-h-48 overflow-y-auto border-t border-border p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                <Layers size={14} />
                {t('floorPlan_layers')}
              </h3>
              <p className="mb-2 text-[11px] text-text-tertiary">{t('floorPlan_layerHint')}</p>
              <div className="space-y-1">
                {[...sortedAreas].reverse().map((area) => {
                  const pal = AREA_PALETTE[(area.colorIndex || 1) % AREA_PALETTE.length]
                  const label = area.label || unboundSubLocations.find((l) => l.id === area.bindLocationId)?.name || t('floorPlan_unnamed')
                  return (
                    <div
                      key={area.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/floorplan-area', area.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        const fromId = e.dataTransfer.getData('text/floorplan-area')
                        if (fromId && fromId !== area.id) reorderArea(fromId, area.id)
                      }}
                      onClick={() => setSelectedId(area.id)}
                      className={cn(
                        'flex cursor-grab items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-smooth active:cursor-grabbing',
                        selectedId === area.id
                          ? 'border-primary bg-primary-soft'
                          : 'border-border bg-bg hover:bg-surface-hover'
                      )}
                    >
                      <span className={cn('h-3 w-3 rounded-sm border', pal.bg, pal.border)} />
                      <span className="flex-1 truncate">{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* 新建区域弹窗 */}
      {createDialog.open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-float"
          >
            <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('floorPlan_newAreaTitle')}</h3>
            <div className="mb-4 space-y-2">
              {[
                { key: 'visual', label: t('floorPlan_mode_visual'), desc: t('floorPlan_mode_visual_desc') },
                { key: 'bind', label: t('floorPlan_mode_bind'), desc: t('floorPlan_mode_bind_desc') },
                { key: 'create', label: t('floorPlan_mode_create'), desc: t('floorPlan_mode_create_desc') }
              ].map((m) => (
                <label
                  key={m.key}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-smooth',
                    createDialog.mode === m.key
                      ? 'border-primary bg-primary-soft'
                      : 'border-border bg-bg hover:bg-surface-hover'
                  )}
                >
                  <input
                    type="radio"
                    name="areaMode"
                    value={m.key}
                    checked={createDialog.mode === m.key}
                    onChange={(e) => setCreateDialog((d) => ({ ...d, mode: e.target.value }))}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-xs font-medium text-text-primary">{m.label}</p>
                    <p className="text-[11px] text-text-tertiary">{m.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {(createDialog.mode === 'create' || createDialog.mode === 'visual') && (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-text-tertiary">{t('floorPlan_areaName')}</label>
                <input
                  type="text"
                  value={createDialog.name}
                  onChange={(e) => setCreateDialog((d) => ({ ...d, name: e.target.value }))}
                  placeholder={t('floorPlan_areaNamePlaceholder')}
                  className="input w-full text-xs"
                />
              </div>
            )}

            {createDialog.mode === 'bind' && (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-text-tertiary">{t('floorPlan_bindSubLocation')}</label>
                <select
                  value={createDialog.bindLocationId}
                  onChange={(e) => setCreateDialog((d) => ({ ...d, bindLocationId: e.target.value }))}
                  className="input w-full text-xs"
                >
                  <option value="">{t('floorPlan_selectSubLocation')}</option>
                  {unboundSubLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreateDialog({ open: false, name: '', bindLocationId: '', mode: 'visual' })}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
              >
                {t('btn_cancel')}
              </button>
              <button
                onClick={handleCreateDialogConfirm}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
              >
                {t('btn_confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 二维码上传弹窗 */}
      {qrDialog.open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-float"
          >
            <h3 className="mb-1 text-sm font-semibold text-text-primary">{t('qrUpload_title')}</h3>
            <p className="mb-4 text-[11px] text-text-tertiary">{t('qrUpload_desc')}</p>

            {qrDialog.url ? (
              <div className="flex items-center gap-4 rounded-xl bg-bg p-3">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrDialog.url)}`}
                  alt="QR"
                  className="h-28 w-28 rounded-lg ring-1 ring-border"
                />
                <div className="flex-1">
                  <p className={cn('text-xs font-medium', qrDialog.status === 'success' ? 'text-primary' : 'text-text-secondary')}>
                    {qrDialog.status === 'success' ? t('qrUpload_success') : t('qrUpload_waiting')}
                  </p>
                  <p className="mt-1 text-[10px] text-text-tertiary/70">{t('qrUpload_tip')}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-bg p-6 text-center text-xs text-text-tertiary">
                {qrDialog.status === 'error' ? t('floorPlan_imageLoadFail') : t('loading')}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={cleanupQR}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
              >
                {t('btn_cancel')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        onConfirm={() => {
          if (confirm.onConfirm) confirm.onConfirm()
        }}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}

function ToolbarButton({ onClick, icon: Icon, label, active, disabled, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-smooth',
        disabled && 'cursor-not-allowed opacity-50',
        active
          ? 'bg-primary-soft text-primary'
          : danger
            ? 'text-danger hover:bg-danger-soft'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      )}
    >
      <Icon size={14} />
      <span className="hidden lg:inline">{label}</span>
    </button>
  )
}

function PropertyRow({ icon: Icon, label, children }) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-text-tertiary">
        <Icon size={12} />
        {label}
      </label>
      {children}
    </div>
  )
}

function PlanElement({ element, id, selected, style, label, drawMode, onResizeStart, onDoubleClick }) {
  const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  const showHandles = selected && drawMode
  return (
    <div
      data-element-id={id}
      onDoubleClick={onDoubleClick}
      className={cn(
        'absolute select-none transition-shadow',
        style.bg,
        selected ? `ring-2 ring-primary ${style.border}` : `ring-1 ring-transparent hover:ring-primary/40 ${style.border}`
      )}
      style={{
        left: `${element.x}%`,
        top: `${element.y}%`,
        width: `${element.w}%`,
        height: `${element.h}%`,
        borderWidth: '1px',
        borderStyle: 'solid'
      }}
    >
      <div className={cn('pointer-events-none flex h-full w-full items-center justify-center p-1 text-center text-[10px] font-medium', style.text)}>
        <span className="line-clamp-2">{label}</span>
      </div>
      {showHandles &&
        handles.map((h) => (
          <div
            key={h}
            data-resize-handle={h}
            onMouseDown={(e) => onResizeStart(e, id, h)}
            className={cn(
              'absolute z-10 h-2.5 w-2.5 rounded-full border border-white bg-primary shadow-sm',
              h.includes('n') ? '-top-1.5' : h.includes('s') ? '-bottom-1.5' : 'top-1/2 -translate-y-1/2',
              h.includes('w') ? '-left-1.5' : h.includes('e') ? '-right-1.5' : 'left-1/2 -translate-x-1/2'
            )}
          />
        ))}
    </div>
  )
}
