import { useState, useEffect, useCallback, useRef, useMemo, Component } from 'react'
import { useDebounce } from '../lib/useDebounce'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft, Plus, Search, X, FileText, Link, Image as ImageIcon, ChefHat, GraduationCap,
  FolderOpen, MoreHorizontal, Smartphone, Trash2, Edit2, ExternalLink, Tags, Sparkles,
  CheckSquare, Square, Folder, Globe, Check, Monitor, LayoutGrid, Grid3x3, ChevronRight,
  ChevronDown, SlidersHorizontal, PanelRightClose, GripVertical, File, FileImage,
  FileVideo2, FileAudio2, FileArchive, FileCode, FileType, ListFilter, Type, Clock,
  Calendar, BookOpen, Bookmark, Camera, Music, Video, Mail, MapPin, Phone, ShoppingBag,
  Star, Heart, Lightbulb, Coffee, Plane, Car, Home, Briefcase, Clipboard, Database,
  Code, PenTool, Shield, Award, Flag, Gift, Key, Lock, Save, Search as SearchIcon,
  Settings2, User, Users, Zap, Palette, Layers, Briefcase as BriefcaseIcon, Hash,
  Radio, Receipt, ScrollText, Server, Store, Watch, Wrench, FileQuestion, FileCheck,
  FileClock, FileCog, FileX, FileWarning, FileHeart, FileKey, FileLock, FilePlus,
  FileSearch, FileStack, FileMinus, FileDigit, FileSpreadsheet, FileBadge, FileBox,
  FileBarChart, Landmark, Leaf, Map as MapIcon, Megaphone, MessageSquare, Moon, Package,
  Paperclip, Percent, PiggyBank, Pill, Puzzle, Repeat, Rocket, Ruler, Scale, School,
  Scissors, Skull, Snowflake, Soup, Stethoscope, Sun as SunIcon, Sword, Syringe, Table,
  Tablet, Tag, Target, Tent, Ticket, Timer, Train, TreeDeciduous, Trophy, Truck,
  Tv, Umbrella, Vault, Wallet, Wind, Wine, Workflow, XCircle, Copy, CheckCircle2
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
  pickFile,
  pickFolder,
  openPath,
  openExternal,
  showItemInFolder,
  getSettings,
  setSettings
} from '../lib/api'
import { compressImageToBase64 } from '../lib/imageCompress'
import ConfirmDialog from './ConfirmDialog'
import Toast from './Toast'
import Lightbox from './Lightbox'
import TypeManager from './TypeManager'
import DoubleClickPrefDialog from './DoubleClickPrefDialog'
import SearchHighlight from './SearchHighlight'
import SearchBar from './MaterialLibrary/SearchBar'

const SIZE_STEPS = [130, 166, 202, 238, 274, 310]

const DEFAULT_MATERIAL_TYPES = [
  { id: 'note', name: { zh: '备忘', en: 'Note' }, icon: 'FileText', color: 'blue' },
  { id: 'url', name: { zh: '网址', en: 'Link' }, icon: 'Globe', color: 'indigo' },
  { id: 'photo', name: { zh: '证件/照片', en: 'Photo' }, icon: 'ImageIcon', color: 'rose' },
  { id: 'recipe', name: { zh: '菜谱', en: 'Recipe' }, icon: 'ChefHat', color: 'orange' },
  { id: 'tutorial', name: { zh: '教程', en: 'Tutorial' }, icon: 'GraduationCap', color: 'teal' },
  { id: 'doc', name: { zh: '文档', en: 'Document' }, icon: 'FolderOpen', color: 'slate' },
  { id: 'other', name: { zh: '其他', en: 'Other' }, icon: 'Tags', color: 'stone' }
]

const ICON_MAP = {
  ArrowLeft, Plus, Search, X, FileText, Link, ImageIcon, ChefHat, GraduationCap,
  FolderOpen, MoreHorizontal, Smartphone, Trash2, Edit2, ExternalLink, Tags, Sparkles,
  CheckSquare, Square, Folder, Globe, Check, Monitor, LayoutGrid, Grid3x3, ChevronRight,
  ChevronDown, SlidersHorizontal, PanelRightClose, GripVertical, File, FileImage,
  FileVideo2, FileAudio2, FileArchive, FileCode, FileType, ListFilter, Type, Clock,
  Calendar, BookOpen, Bookmark, Camera, Music, Video, Mail, MapPin, Phone, ShoppingBag,
  Star, Heart, Lightbulb, Coffee, Plane, Car, Home, Briefcase, Clipboard, Database,
  Code, PenTool, Shield, Award, Flag, Gift, Key, Lock, Save, SearchIcon,
  Settings2, User, Users, Zap, Palette, Layers, BriefcaseIcon, Hash,
  Radio, Receipt, ScrollText, Server, Store, Watch, Wrench, FileQuestion, FileCheck,
  FileClock, FileCog, FileX, FileWarning, FileHeart, FileKey, FileLock, FilePlus,
  FileSearch, FileStack, FileMinus, FileDigit, FileSpreadsheet, FileBadge, FileBox,
  FileBarChart, Landmark, Leaf, MapIcon, Megaphone, MessageSquare, Moon, Package,
  Paperclip, Percent, PiggyBank, Pill, Puzzle, Repeat, Rocket, Ruler, Scale, School,
  Scissors, Skull, Snowflake, Soup, Stethoscope, SunIcon, Sword, Syringe, Table,
  Tablet, Tag, Target, Tent, Ticket, Timer, Train, TreeDeciduous, Trophy, Truck,
  Tv, Umbrella, Vault, Wallet, Wind, Wine, Workflow, XCircle, Copy, CheckCircle2
}

const COLOR_OPTIONS = [
  { key: 'blue', label: 'Blue', text: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', cover: 'from-blue-50 to-indigo-50', ring: 'ring-blue-500' },
  { key: 'indigo', label: 'Indigo', text: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20', cover: 'from-indigo-50 to-violet-50', ring: 'ring-indigo-500' },
  { key: 'violet', label: 'Violet', text: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20', cover: 'from-violet-50 to-purple-50', ring: 'ring-violet-500' },
  { key: 'purple', label: 'Purple', text: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', cover: 'from-purple-50 to-fuchsia-50', ring: 'ring-purple-500' },
  { key: 'rose', label: 'Rose', text: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20', cover: 'from-rose-50 to-orange-50', ring: 'ring-rose-500' },
  { key: 'orange', label: 'Orange', text: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', cover: 'from-orange-50 to-amber-50', ring: 'ring-orange-500' },
  { key: 'amber', label: 'Amber', text: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', cover: 'from-amber-50 to-yellow-50', ring: 'ring-amber-500' },
  { key: 'yellow', label: 'Yellow', text: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20', cover: 'from-yellow-50 to-lime-50', ring: 'ring-yellow-500' },
  { key: 'lime', label: 'Lime', text: 'text-lime-500', bg: 'bg-lime-50 dark:bg-lime-900/20', cover: 'from-lime-50 to-green-50', ring: 'ring-lime-500' },
  { key: 'green', label: 'Green', text: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', cover: 'from-green-50 to-emerald-50', ring: 'ring-green-500' },
  { key: 'emerald', label: 'Emerald', text: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', cover: 'from-emerald-50 to-teal-50', ring: 'ring-emerald-500' },
  { key: 'teal', label: 'Teal', text: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-900/20', cover: 'from-teal-50 to-cyan-50', ring: 'ring-teal-500' },
  { key: 'cyan', label: 'Cyan', text: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-900/20', cover: 'from-cyan-50 to-sky-50', ring: 'ring-cyan-500' },
  { key: 'sky', label: 'Sky', text: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-900/20', cover: 'from-sky-50 to-blue-50', ring: 'ring-sky-500' },
  { key: 'slate', label: 'Slate', text: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-900/20', cover: 'from-slate-50 to-zinc-50', ring: 'ring-slate-500' },
  { key: 'zinc', label: 'Zinc', text: 'text-zinc-500', bg: 'bg-zinc-50 dark:bg-zinc-900/20', cover: 'from-zinc-50 to-neutral-50', ring: 'ring-zinc-500' },
  { key: 'stone', label: 'Stone', text: 'text-stone-500', bg: 'bg-stone-50 dark:bg-stone-900/20', cover: 'from-stone-50 to-neutral-50', ring: 'ring-stone-500' },
  { key: 'neutral', label: 'Neutral', text: 'text-neutral-500', bg: 'bg-neutral-50 dark:bg-neutral-900/20', cover: 'from-neutral-50 to-gray-50', ring: 'ring-neutral-500' },
  { key: 'gray', label: 'Gray', text: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-900/20', cover: 'from-gray-50 to-slate-50', ring: 'ring-gray-500' },
  { key: 'red', label: 'Red', text: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', cover: 'from-red-50 to-rose-50', ring: 'ring-red-500' }
]

const FILE_TYPE_GROUPS = [
  {
    key: 'image',
    labelKey: 'fileType_image',
    icon: FileImage,
    color: 'text-rose-500',
    match: (item) => item.type === 'photo' || isImageResource(item.photo) || isImageResource(item.url)
  },
  {
    key: 'doc',
    labelKey: 'fileType_doc',
    icon: FileText,
    color: 'text-blue-500',
    match: (item) => {
      if (item.type === 'note') return true
      if (item.type !== 'doc' && item.type !== 'other') return false
      const path = getFilePath(item)
      return /\.(docx?|pdf|txt|md|xlsx?|pptx?)$/i.test(path)
    }
  },
  {
    key: 'link',
    labelKey: 'fileType_link',
    icon: Link,
    color: 'text-indigo-500',
    match: (item) => item.type === 'url' || isUrl(item.url)
  },
  {
    key: 'video',
    labelKey: 'fileType_video',
    icon: FileVideo2,
    color: 'text-purple-500',
    match: (item) => /\.(mp4|mov|avi|mkv|webm)$/i.test(getFilePath(item))
  },
  {
    key: 'audio',
    labelKey: 'fileType_audio',
    icon: FileAudio2,
    color: 'text-amber-500',
    match: (item) => /\.(mp3|wav|flac|aac|ogg)$/i.test(getFilePath(item))
  },
  {
    key: 'archive',
    labelKey: 'fileType_archive',
    icon: FileArchive,
    color: 'text-orange-500',
    match: (item) => /\.(zip|rar|7z|tar|gz)$/i.test(getFilePath(item))
  },
  {
    key: 'folder',
    labelKey: 'fileType_folder',
    icon: Folder,
    color: 'text-amber-600',
    match: (item) => isFolderPath(getFilePath(item))
  },
  {
    key: 'other',
    labelKey: 'fileType_other',
    icon: File,
    color: 'text-stone-500',
    match: () => true
  }
]

function getFilePath(item) {
  return (item.photo || item.url || '').replace(/^file:\/+/i, '')
}

function getTypeMeta(types, typeId) {
  const type = types?.find((t) => t.id === typeId)
  const fallback = COLOR_OPTIONS.find((c) => c.key === 'stone')
  if (!type) return { icon: Tags, ...fallback }
  const color = COLOR_OPTIONS.find((c) => c.key === type.color) || fallback
  const Icon = ICON_MAP[type.icon] || Tags
  return { icon: Icon, ...color }
}

function getTypeLabel(typeObj, lang) {
  if (!typeObj) return ''
  return typeObj.name?.[lang] || typeObj.name?.zh || typeObj.name?.en || typeObj.id
}

function TypeIcon({ type, types, size = 16 }) {
  const meta = getTypeMeta(types, type)
  const Icon = meta.icon
  return (
    <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', meta.bg)}>
      <Icon size={size} className={meta.text} />
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

function getFileType(item) {
  for (const g of FILE_TYPE_GROUPS) {
    if (g.match(item) && g.key !== 'other') return g.key
  }
  return 'other'
}

function fileTypeIcon(key) {
  const g = FILE_TYPE_GROUPS.find((x) => x.key === key)
  return g || FILE_TYPE_GROUPS[FILE_TYPE_GROUPS.length - 1]
}

function formatDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return '-'
  }
}

class MaterialLibraryErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
          <XCircle size={36} className="text-red-500" />
          <h2 className="text-lg font-bold text-text-primary">MaterialLibrary 渲染崩溃</h2>
          <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-xs font-mono text-red-700 dark:bg-red-950 dark:text-red-300">
            <p className="font-semibold mb-2">错误信息（请复制到聊天记录）：</p>
            <p>{this.state.error.message}</p>
            <p className="mt-3 pt-2 border-t border-red-200 dark:border-red-800">{this.state.error.stack}</p>
          </div>
          <button onClick={this.props.onBack} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
            返回上一页
          </button>
        </div>
      )
    }
    return <MaterialLibraryInner onBack={this.props.onBack} />
  }
}

function MaterialLibraryInner({ onBack }) {
  const { t, lang } = useI18n()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword, 280)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '', bulk: false, ids: [] })
  const [toast, setToast] = useState(null)

  const [view, setView] = useState('category')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [fileTypeFilters, setFileTypeFilters] = useState(new Set())
  const [cardSize, setCardSize] = useState(4)
  const [fileCardMode, setFileCardMode] = useState('compact')
  const [detailItem, setDetailItem] = useState(null)

  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [lightbox, setLightbox] = useState({ src: '', alt: '' })

  const [materialTypes, setMaterialTypes] = useState(DEFAULT_MATERIAL_TYPES)
  const [doubleClickAction, setDoubleClickAction] = useState('ask')
  const [askedDoubleClickPref, setAskedDoubleClickPref] = useState(false)
  const [typeManagerOpen, setTypeManagerOpen] = useState(false)
  const [pendingDoubleClickItem, setPendingDoubleClickItem] = useState(null)
  const [linkConfirm, setLinkConfirm] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() })
  }, [])

  useEffect(() => {
    getSettings().then((s) => {
      if (!s) return
      const savedTypes = s.materialTypes
      if (Array.isArray(savedTypes) && savedTypes.length > 0) {
        setMaterialTypes(savedTypes)
      }
      const action = s.materialDoubleClickAction
      if (action === 'openFile' || action === 'openFolder' || action === 'ask') {
        setDoubleClickAction(action)
      }
      setAskedDoubleClickPref(!!s.materialDoubleClickPrefAsked)
      if (typeof s.materialCardSize === 'number' && s.materialCardSize >= 1 && s.materialCardSize <= 6) {
        setCardSize(s.materialCardSize)
      }
      if (s.materialFileCardMode === 'rich' || s.materialFileCardMode === 'compact') {
        setFileCardMode(s.materialFileCardMode)
      }
      if (s.materialView === 'category' || s.materialView === 'file') {
        setView(s.materialView)
      }
    }).catch((e) => {
      console.error('[MaterialLibrary] getSettings failed:', e && e.message || e)
    })
  }, [])

  const saveLayout = async (patch) => {
    try {
      // 防御性：先读全量 settings 再合并，防止并发写盘时丢失其他字段
      const cur = await getSettings()
      await setSettings({ ...cur, ...patch })
    } catch (e) {
      showToast(t('toast_saveFail', { msg: e.message }), 'error')
    }
  }

  const setCardSizePersisted = (v) => {
    setCardSize(v)
    saveLayout({ materialCardSize: v })
  }

  const setFileCardModePersisted = (next) => {
    const resolved = typeof next === 'function' ? next(fileCardMode) : next
    setFileCardMode(resolved)
    saveLayout({ materialFileCardMode: resolved })
  }

  const setViewPersisted = (v) => {
    setView(v)
    saveLayout({ materialView: v })
  }

  const saveDoubleClickPref = async (action) => {
    setDoubleClickAction(action)
    setAskedDoubleClickPref(true)
    try {
      await setSettings({ materialDoubleClickAction: action, materialDoubleClickPrefAsked: true })
    } catch (e) {
      showToast(t('toast_saveFail', { msg: e.message }), 'error')
    }
  }

  const saveMaterialTypes = async (nextTypes) => {
    setMaterialTypes(nextTypes)
    try {
      await setSettings({ materialTypes: nextTypes })
    } catch (e) {
      showToast(t('toast_saveFail', { msg: e.message }), 'error')
    }
  }

  const openResource = async (item) => {
    const resource = item.photo || item.url || ''
    if (!resource) return false
    if (isImageResource(resource)) {
      const src = toPhotoSrc(resource)
      if (src) setLightbox({ src, alt: item.title })
      return true
    }
    if (isUrl(resource)) {
      await openExternal(resource)
      return true
    }
    await openPath(resource.replace(/^file:\/+/i, ''))
    return true
  }

  const handleItemDoubleClick = async (item) => {
    if (doubleClickAction === 'openFile') {
      await openResource(item)
      return
    }
    if (doubleClickAction === 'openFolder') {
      const resource = item.photo || item.url || ''
      if (resource && isUrl(resource)) {
        setLinkConfirm({ item, resource })
        return
      }
      await openContainingFolder(item)
      return
    }
    setPendingDoubleClickItem(item)
  }

  const handleLinkConfirm = async (choice) => {
    const { item, resource } = linkConfirm
    setLinkConfirm(null)
    if (choice === 'openLink') {
      await openResource(item)
    } else if (choice === 'openFolder' && item.path) {
      try {
        await openPath(item.path)
      } catch {
        showToast(t('toast_openFail'), 'error')
      }
    }
  }

  const resolveLocalPath = (resource) => {
    if (isUrl(resource)) return null
    let p = resource.replace(/^file:\/{0,3}/i, '')
    p = p.replace(/^\//, '')
    return p || null
  }

  const resolveParentFolder = (resource) => {
    const localPath = resolveLocalPath(resource)
    if (!localPath) return null
    const idxB = localPath.lastIndexOf('\\')
    const idxF = localPath.lastIndexOf('/')
    const idx = idxB >= 0 ? Math.max(idxB, idxF) : idxF
    return idx > 0 ? localPath.substring(0, idx) : null
  }

  const openContainingFolder = async (item) => {
    const resource = item.photo || item.url || ''
    if (!resource) return
    try {
      const localPath = resolveLocalPath(resource)
      const parentDir = resolveParentFolder(resource)
      if (localPath) {
        await showItemInFolder(localPath)
        return
      }
      if (parentDir) {
        await openPath(parentDir)
        return
      }
    } catch {
      try {
        await openPath(item.path || '')
      } catch {
        /* ignore */
      }
    }
  }

  const handleOpenFileFolder = async (item, action) => {
    if (action === 'openFile') {
      await openResource(item)
    } else {
      await openContainingFolder(item)
    }
  }

  const resolveDoubleClickPref = async (action) => {
    const item = pendingDoubleClickItem
    setPendingDoubleClickItem(null)
    await saveDoubleClickPref(action)
    if (!item) return
    if (action === 'edit') {
      openEdit(item)
    } else {
      const opened = await openResource(item)
      if (!opened) openEdit(item)
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchMaterials({ keyword: debouncedKeyword.trim() || undefined })
      setItems(rows)
    } catch (e) {
      showToast(t('toast_loadFail', { msg: e.message }), 'error')
    } finally {
      setLoading(false)
    }
  }, [debouncedKeyword, t, showToast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const remove = window.lingguang.agent.onDataChanged((payload) => {
      if (payload.type === 'materials') {
        load()
      }
    })
    return remove
  }, [load])

  useEffect(() => {
    if (!bulkMode) setSelectedIds(new Set())
  }, [bulkMode])

  const stats = useMemo(() => {
    const total = items.length
    const categoryCount = new Set(items.map((it) => it.type).filter(Boolean)).size
    const tagSet = new Set()
    items.forEach((it) => {
      if (it.tags) {
        it.tags.split(/[,，\s]+/).forEach((tag) => {
          if (tag.trim()) tagSet.add(tag.trim())
        })
      }
    })
    const now = Date.now()
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    const recent = items.filter((it) => it.updated_at && now - new Date(it.updated_at).getTime() <= sevenDays).length
    return { total, categoryCount, tagCount: tagSet.size, recent }
  }, [items])

  const filteredItems = useMemo(() => {
    let rows = items
    if (view === 'file') {
      if (categoryFilter) {
        rows = rows.filter((it) => it.type === categoryFilter)
      }
      if (fileTypeFilters.size > 0) {
        rows = rows.filter((it) => fileTypeFilters.has(getFileType(it)))
      }
    }
    return rows
  }, [items, view, categoryFilter, fileTypeFilters])

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
      if (detailItem && (bulk ? ids.includes(detailItem.id) : detailItem.id === id)) {
        setDetailItem(null)
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
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredItems.map((it) => it.id)))
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


  const onCategoryCardClick = (type) => {
    setCategoryFilter(type)
    setViewPersisted('file')
  }

  const onSwitchView = (nextView) => {
    if (nextView === view) return
    setViewPersisted(nextView)
    setDetailItem(null)
    if (nextView === 'category') {
      setCategoryFilter('')
      setFileTypeFilters(new Set())
    }
  }

  const toggleFileType = (key) => {
    setFileTypeFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
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
          <ViewSwitcher view={view} onChange={onSwitchView} t={t} />
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
        <Sidebar
          view={view}
          categoryFilter={categoryFilter}
          fileTypeFilters={fileTypeFilters}
          onCategoryClick={(type) => setCategoryFilter(type)}
          onFileTypeToggle={toggleFileType}
          onManageTypes={() => setTypeManagerOpen(true)}
          t={t}
        />

        <main className="flex flex-1 flex-col overflow-hidden">
          {view === 'category' && <StatsCards stats={stats} t={t} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} />}

          <SearchBar
            keyword={keyword}
            setKeyword={setKeyword}
            cardSize={cardSize}
            setCardSize={setCardSizePersisted}
            fileCardMode={fileCardMode}
            setFileCardMode={setFileCardModePersisted}
            view={view}
            t={t}
          />

          {bulkMode && (
            <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-2">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <button
                  type="button"
                  onClick={selectAll}
                  className="flex items-center gap-1 rounded-md px-2 py-1 transition-smooth hover:bg-surface-hover"
                >
                  {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
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
                    {materialTypes.map((type) => (
                      <option key={type.id} value={type.id}>{getTypeLabel(type, lang)}</option>
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

          <div className="relative flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5">
              {loading && items.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-text-tertiary">{t('loading')}</div>
              ) : filteredItems.length === 0 ? (
                <EmptyState onAdd={openAdd} t={t} />
              ) : view === 'category' ? (
                <CategoryView
                  items={items}
                  materialTypes={materialTypes}
                  cardWidth={SIZE_STEPS[cardSize - 1]}
                  onCardClick={onCategoryCardClick}
                  t={t}
                  lang={lang}
                />
              ) : (
                <FileGridView
                  items={filteredItems}
                  materialTypes={materialTypes}
                  cardWidth={SIZE_STEPS[cardSize - 1]}
                  cardMode={fileCardMode}
                  selectedIds={selectedIds}
                  bulkMode={bulkMode}
                  onToggleSelect={toggleSelect}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onOpenLightbox={(src, alt) => setLightbox({ src, alt })}
                  onOpenDetail={setDetailItem}
                  onDoubleClick={handleItemDoubleClick}
                  t={t}
                  lang={lang}
                />
              )}
            </div>

            <AnimatePresence>
              {view === 'file' && detailItem && (
                <DetailPanel
                  item={detailItem}
                  materialTypes={materialTypes}
                  onClose={() => setDetailItem(null)}
                  onEdit={() => openEdit(detailItem)}
                  onDelete={() => handleDelete(detailItem)}
                  t={t}
                  lang={lang}
                />
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      <AnimatePresence>
        {formOpen && (
          <MaterialForm
            initial={editing}
            materialTypes={materialTypes}
            lang={lang}
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
      <TypeManager
        open={typeManagerOpen}
        materialTypes={materialTypes}
        lang={lang}
        onClose={() => setTypeManagerOpen(false)}
        onChange={saveMaterialTypes}
        t={t}
      />
      <DoubleClickPrefDialog
        open={!!pendingDoubleClickItem}
        onClose={() => setPendingDoubleClickItem(null)}
        onChoose={resolveDoubleClickPref}
        t={t}
      />
      <AnimatePresence>
        {linkConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setLinkConfirm(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 6 }}
              transition={{ duration: 0.25, ease: EASE_SPRING }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm overflow-hidden rounded-2xl bg-surface shadow-float"
            >
              <div className="flex items-start gap-3.5 p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <ExternalLink size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-text-primary">{t('materials_nonLocalTitle')}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-tertiary">
                    {t('materials_nonLocalMessage', { name: linkConfirm.item.name || '' })}
                  </p>
                  <p className="mt-2 rounded-lg bg-bg/60 px-3 py-2 text-xs text-text-secondary break-all">
                    {linkConfirm.resource}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 border-t border-border bg-bg/50 px-6 py-3.5">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setLinkConfirm(null)}
                  className="flex-1 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
                >
                  {t('btn_cancel')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleLinkConfirm('openFolder')}
                  className="flex-1 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
                >
                  {t('materials_openFolderOnly')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleLinkConfirm('openLink')}
                  className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:brightness-110"
                >
                  {t('materials_openLinkDirectly')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}

function ViewSwitcher({ view, onChange, t }) {
  return (
    <div className="no-drag relative flex items-center rounded-lg border border-border bg-surface p-0.5">
      <motion.div
        layoutId="view-switcher"
        className="absolute inset-y-0.5 rounded-md bg-primary-soft"
        initial={false}
        animate={{
          left: view === 'category' ? '2px' : 'calc(50% - 2px)',
          width: 'calc(50% - 2px)'
        }}
        transition={{ duration: 0.25, ease: EASE }}
      />
      <button
        type="button"
        onClick={() => onChange('category')}
        className={cn(
          'relative z-10 flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors',
          view === 'category' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
        )}
      >
        <LayoutGrid size={13} />
        {t('view_category')}
      </button>
      <button
        type="button"
        onClick={() => onChange('file')}
        className={cn(
          'relative z-10 flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors',
          view === 'file' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
        )}
      >
        <Grid3x3 size={13} />
        {t('view_file')}
      </button>
    </div>
  )
}

function SizeSlider({ value, onChange, t }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1">
      <SlidersHorizontal size={13} className="text-text-tertiary" />
      <input
        type="range"
        min={1}
        max={6}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-border accent-primary"
        title={t('materials_sizeSlider')}
      />
      <span className="w-5 text-center text-[10px] text-text-tertiary">{value}</span>
    </div>
  )
}

function StatsCards({ stats, t, categoryFilter, setCategoryFilter }) {
  const cards = [
    { key: 'total', icon: FolderOpen, label: t('stats_total'), value: stats.total },
    { key: 'categories', icon: Tags, label: t('stats_categories'), value: stats.categoryCount },
    { key: 'tags', icon: Type, label: t('stats_tags'), value: stats.tagCount },
    { key: 'recent', icon: Clock, label: t('stats_recent'), value: stats.recent }
  ]
  return (
    <div className="grid grid-cols-2 gap-3 border-b border-border bg-surface/50 px-5 py-3 md:grid-cols-4">
      {cards.map((card, i) => (
        <motion.button
          type="button"
          key={card.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.28, delay: i * 0.05, ease: EASE }}
          onClick={() => {
            if (card.key === 'total' || card.key === 'categories') {
              setCategoryFilter(null)
            }
          }}
          className={cn(
            'group flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm cursor-pointer',
            'transition-all duration-150 ease-out',
            'hover:border-border-strong hover:bg-surface-hover hover:shadow-md'
          )}
        >
          <span className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary transition-colors',
            'group-hover:bg-primary/20'
          )}>
            <card.icon size={18} />
          </span>
          <div>
            <div className="text-lg font-semibold leading-none text-text-primary">{card.value}</div>
            <div className="mt-1 text-[11px] text-text-tertiary group-hover:text-text-secondary transition-colors">{card.label}</div>
          </div>
        </motion.button>
      ))}
    </div>
  )
}

function Sidebar({ view, fileTypeFilters, onFileTypeToggle, onManageTypes, t }) {
  const [expanded, setExpanded] = useState(() => new Set(['file-tree']))

  const toggle = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <aside className="w-52 shrink-0 overflow-y-auto border-r border-border bg-surface p-3">
      {view === 'category' ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-bg p-3">
            <h4 className="mb-1 text-xs font-semibold text-text-primary">{t('materials_manageTypes')}</h4>
            <p className="mb-3 text-[11px] leading-relaxed text-text-tertiary">{t('materials_manageTypes_desc')}</p>
            <button
              type="button"
              onClick={onManageTypes}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-hover hover:text-text-primary"
            >
              <Settings2 size={14} />
              {t('materials_manageTypes')}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => toggle('file-tree')}
            className="mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary hover:bg-surface-hover"
          >
            <span>{t('fileType_filter')}</span>
            {expanded.has('file-tree') ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <AnimatePresence initial={false}>
            {expanded.has('file-tree') && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="overflow-hidden"
              >
                {FILE_TYPE_GROUPS.map((group) => {
                  const Icon = group.icon
                  const checked = fileTypeFilters.has(group.key)
                  return (
                    <label
                      key={group.key}
                      className={cn(
                        'mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-smooth',
                        checked ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-surface-hover'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border transition-smooth',
                          checked ? 'border-primary bg-primary text-white' : 'border-border bg-surface'
                        )}
                      >
                        {checked && <Check size={10} strokeWidth={3} />}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => onFileTypeToggle(group.key)}
                      />
                      <Icon size={14} className={group.color} />
                      {t(group.labelKey)}
                    </label>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </aside>
  )
}



function CategoryView({ items, materialTypes, cardWidth, onCardClick, t, lang }) {
  const counts = useMemo(() => {
    const map = {}
    materialTypes.forEach((type) => (map[type.id] = 0))
    items.forEach((it) => {
      if (map[it.type] !== undefined) map[it.type] += 1
      else map.other = (map.other || 0) + 1
    })
    return map
  }, [items, materialTypes])

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.04 } }
      }}
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))` }}
    >
      {materialTypes.map((type, i) => {
        const meta = getTypeMeta(materialTypes, type.id)
        const Icon = meta.icon
        return (
          <motion.div
            key={type.id}
            variants={{
              hidden: { opacity: 0, y: 14, scale: 0.97 },
              visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.28 + i * 0.02, ease: EASE } }
            }}
            onClick={() => onCardClick(type.id)}
            className="group card-hover relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-smooth hover:border-border-strong hover:shadow-float"
          >
            <div className={cn('relative h-28 w-full overflow-hidden bg-gradient-to-br', meta.cover)}>
              <div className="absolute inset-0 flex items-center justify-center opacity-30">
                <Icon size={64} className={meta.text} />
              </div>
              <div className="absolute left-3 top-3">
                <TypeIcon type={type.id} types={materialTypes} size={18} />
              </div>
              <div className="absolute bottom-3 right-3 text-2xl font-bold text-text-primary/80">{counts[type.id] || 0}</div>
            </div>
            <div className="p-3">
              <h3 className="text-sm font-semibold text-text-primary">{getTypeLabel(type, lang)}</h3>
              <p className="mt-0.5 text-[11px] text-text-tertiary">{t('materials_typeCount', { n: counts[type.id] || 0 })}</p>
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}

function FileGridView({ items, materialTypes, cardWidth, cardMode, selectedIds, bulkMode, onToggleSelect, onEdit, onDelete, onOpenLightbox, onOpenDetail, onDoubleClick, t, lang }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.02 } }
      }}
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))` }}
    >
      {items.map((item, i) =>
        cardMode === 'rich' ? (
          <MaterialCard
            key={item.id}
            item={item}
            materialTypes={materialTypes}
            selected={selectedIds.has(item.id)}
            bulkMode={bulkMode}
            onToggleSelect={() => onToggleSelect(item.id)}
            onEdit={() => onEdit(item)}
            onDelete={() => onDelete(item)}
            onOpenLightbox={onOpenLightbox}
            onClick={() => !bulkMode && onOpenDetail(item)}
            onDoubleClick={() => !bulkMode && onDoubleClick(item)}
            index={i}
            lang={lang}
          />
        ) : (
          <CompactFileCard
            key={item.id}
            item={item}
            materialTypes={materialTypes}
            selected={selectedIds.has(item.id)}
            bulkMode={bulkMode}
            onToggleSelect={() => onToggleSelect(item.id)}
            onClick={() => !bulkMode && onOpenDetail(item)}
            onEdit={() => onEdit(item)}
            onDoubleClick={() => !bulkMode && onDoubleClick(item)}
            index={i}
            lang={lang}
          />
        )
      )}
    </motion.div>
  )
}

function MaterialCard({ item, materialTypes, keyword, selected, bulkMode, onToggleSelect, onEdit, onDelete, onOpenLightbox, onClick, onDoubleClick, index, lang }) {
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [imgErr, setImgErr] = useState(false)
  const tags = item.tags ? item.tags.split(/[,，\s]+/).filter(Boolean) : []
  const resource = item.photo || item.url || ''
  const resourceIsImage = isImageResource(resource)
  const photoSrc = resourceIsImage ? toPhotoSrc(resource) : ''

  useEffect(() => {
    setImgErr(false)
  }, [photoSrc])

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
    } else {
      await openPath(resource.replace(/^file:\/+/i, ''))
    }
  }

  return (
    <motion.div
      layout
      variants={{
        hidden: { opacity: 0, y: 12, scale: 0.98 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, delay: (index % 8) * 0.02, ease: EASE } }
      }}
      onClick={() => {
        if (bulkMode) onToggleSelect()
        else onClick()
      }}
      onDoubleClick={() => {
        if (bulkMode) return
        onDoubleClick()
      }}
      onContextMenu={(e) => { e.preventDefault(); onEdit?.() }}
      className={cn(
        'card-hover group relative flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-card transition-all duration-300',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-border-strong hover:shadow-float',
        bulkMode && 'cursor-pointer'
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-bg">
        {resourceIsImage && photoSrc && !imgErr ? (
          <>
            <img
              src={photoSrc}
              alt={item.title || ''}
              className="img-zoom h-full w-full object-cover"
              onError={() => setImgErr(true)}
              draggable={false}
            />
            <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-full bg-black/25 p-1.5 text-white backdrop-blur-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <ImageIcon size={14} />
            </span>
          </>
        ) : (
          <div className="img-zoom flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-surface-hover to-bg text-text-tertiary/70">
            <TypeIcon type={item.type} types={materialTypes} size={40} />
          </div>
        )}

        {bulkMode && (
          <div
            className={cn(
              'absolute left-2.5 top-2.5 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm transition-smooth',
              selected
                ? 'border-primary bg-primary text-white'
                : 'border-white/80 bg-surface/80 text-transparent backdrop-blur group-hover:border-primary'
            )}
          >
            <Check size={13} strokeWidth={3} />
          </div>
        )}

        <span className="absolute left-2.5 top-2.5 z-10 inline-flex max-w-[70%] items-center gap-1 truncate rounded-full bg-surface/92 px-2 py-1 text-[11px] font-medium text-text-secondary shadow-sm backdrop-blur-md transition-smooth group-hover:bg-surface">
          <TypeIcon type={item.type} types={materialTypes} size={12} />
          <span className="truncate">{getTypeLabel(materialTypes.find((t) => t.id === item.type), lang)}</span>
        </span>

        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-surface/88 p-1 shadow-sm backdrop-blur-md transition-smooth group-hover:bg-surface">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            title={t('materials_edit')}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary transition-smooth hover:bg-primary-soft hover:text-primary"
          >
            <Edit2 size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title={t('materials_delete')}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary transition-smooth hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="truncate text-[15px] font-semibold leading-tight text-text-primary" title={item.title || ''}>
            {item.title || t('materials_title')}
          </h3>
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

        {resource && !resourceIsImage && (
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
          <div className="mb-1 mt-auto flex flex-wrap gap-1 pt-1">
            {tags.map((tag, i) => (
              <span key={i} className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] text-text-tertiary">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2 text-[10px] text-text-tertiary/70">
          {t('materials_updated')}: {formatDate(item.updated_at)}
        </div>
      </div>
    </motion.div>
  )
}

function CompactFileCard({ item, materialTypes, selected, bulkMode, onToggleSelect, onClick, onEdit, onDoubleClick, index, lang }) {
  const { t } = useI18n()
  const group = fileTypeIcon(getFileType(item))
  const Icon = group.icon
  const tags = item.tags ? item.tags.split(/[,，\s]+/).filter(Boolean) : []
  const typeObj = materialTypes.find((t) => t.id === item.type)

  return (
    <motion.div
      layout
      variants={{
        hidden: { opacity: 0, y: 10, scale: 0.98 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, delay: (index % 8) * 0.02, ease: EASE } }
      }}
      onClick={() => {
        if (bulkMode) onToggleSelect()
        else onClick()
      }}
      onDoubleClick={() => {
        if (bulkMode) return
        onDoubleClick()
      }}
      onContextMenu={(e) => { e.preventDefault(); onEdit() }}
      className={cn(
        'group relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border bg-surface p-3 shadow-sm transition-all duration-300',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-border-strong hover:shadow-card'
      )}
    >
      {bulkMode && (
        <div
          className={cn(
            'absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-smooth',
            selected ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-transparent group-hover:border-primary'
          )}
        >
          <Check size={10} strokeWidth={3} />
        </div>
      )}
      <div className={cn('flex h-16 w-16 items-center justify-center rounded-2xl', group.color.replace('text-', 'bg-').replace('500', '50'))}>
        <Icon size={32} className={group.color} />
      </div>
      <div className="w-full text-center">
        <h4 className="truncate text-xs font-medium text-text-primary" title={item.title}><SearchHighlight text={item.title || t('materials_title')} keyword={keyword} /></h4>
        {tags.length > 0 && (
          <p className="mt-1 truncate text-[10px] text-text-tertiary">{tags.slice(0, 2).join(', ')}</p>
        )}
      </div>
    </motion.div>
  )
}

function DetailPanel({ item, materialTypes, onClose, onEdit, onDelete, lang }) {
  const { t } = useI18n()
  const tags = item.tags ? item.tags.split(/[,，\s]+/).filter(Boolean) : []
  const group = fileTypeIcon(getFileType(item))
  const Icon = group.icon

  return (
    <motion.div
      initial={{ x: 340, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 340, opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="z-20 flex w-80 shrink-0 flex-col border-l border-border bg-surface shadow-float"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.18, duration: 0.22 }}
        className="flex items-center justify-between border-b border-border px-4 py-3"
      >
        <h3 className="text-sm font-semibold text-text-primary">{t('detail_title')}</h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
        >
          <PanelRightClose size={16} />
        </button>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.22, duration: 0.28, ease: EASE }}
        className="flex-1 overflow-y-auto p-4"
      >
        <div className="mb-4 flex flex-col items-center gap-2">
          <div className={cn('flex h-16 w-16 items-center justify-center rounded-2xl', group.color.replace('text-', 'bg-').replace('500', '50'))}>
            <Icon size={32} className={group.color} />
          </div>
          <h4 className="text-center text-sm font-semibold text-text-primary" title={item.title}>{item.title}</h4>
        </div>

        <DetailField label={t('detail_description')} value={item.content || '-'} />
        <DetailField label={t('detail_path')} value={item.photo || item.url || '-'} monospace copy />
        <DetailField label={t('detail_category')} value={getTypeLabel(materialTypes.find((t) => t.id === item.type), lang)} />
        <DetailField label={t('detail_tags')}>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag, i) => (
                <span key={i} className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] text-text-tertiary">{tag}</span>
              ))}
            </div>
          ) : (
            '-'
          )}
        </DetailField>
        <DetailField label={t('detail_updated')} value={formatDate(item.updated_at)} />
        <DetailField label={t('detail_fileType')} value={t(fileTypeIcon(getFileType(item)).labelKey)} />
      </motion.div>
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-hover hover:text-text-primary"
        >
          <Edit2 size={13} />
          {t('materials_edit')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger transition-smooth hover:bg-danger/10"
        >
          <Trash2 size={13} />
          {t('materials_delete')}
        </button>
      </div>
    </motion.div>
  )
}

function DetailField({ label, value, children, monospace, copy }) {
  const handleCopy = () => {
    if (value && value !== '-') navigator.clipboard.writeText(value).catch(() => {})
  }
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-medium text-text-tertiary">{label}</div>
      {children || (
        <div className={cn('flex items-start gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-secondary', monospace && 'font-mono')}>
          <span className="min-w-0 flex-1 break-all">{value}</span>
          {copy && value && value !== '-' && (
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 text-text-tertiary transition-smooth hover:text-primary"
              title="复制"
            >
              <Check size={13} />
            </button>
          )}
        </div>
      )}
    </div>
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

function MaterialForm({ initial, materialTypes, onSave, onClose }) {
  const { t } = useI18n()
  const safeTypes = materialTypes || DEFAULT_MATERIAL_TYPES
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

  const handleBrowseImage = async () => {
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

  const handleBrowseFile = async () => {
    try {
      setPhotoHint('')
      const res = await pickFile()
      if (res.canceled || !res.path) return
      set('photo', res.path)
      setPhotoHint('已选择文件')
    } catch (e) {
      setPhotoHint(e.message || '文件读取失败')
    }
  }

  const handleBrowseFolder = async () => {
    try {
      setPhotoHint('')
      const res = await pickFolder()
      if (res.canceled || !res.path) return
      set('photo', res.path)
      setPhotoHint('已选择文件夹')
    } catch (e) {
      setPhotoHint(e.message || '文件夹读取失败')
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
                {safeTypes.map((type) => (
                  <option key={type.id} value={type.id}>{t(`materials_type_${type.id}`)}</option>
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

            <Field label={t('materials_source')} className="col-span-2">
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
                  placeholder={t('materials_sourcePlaceholder')}
                  className="input h-8 text-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBrowseImage}
                    className="flex items-center gap-1 rounded-md bg-surface-hover px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-active hover:text-text-primary"
                  >
                    <ImageIcon size={12} />
                    {t('f_photo_browse')}
                  </button>
                  <button
                    type="button"
                    onClick={handleBrowseFile}
                    className="flex items-center gap-1 rounded-md bg-surface-hover px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-active hover:text-text-primary"
                  >
                    <FileText size={12} />
                    {t('materials_browseFile')}
                  </button>
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    className="flex items-center gap-1 rounded-md bg-surface-hover px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-smooth hover:bg-surface-active hover:text-text-primary"
                  >
                    <Folder size={12} />
                    {t('materials_browseFolder')}
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

function EmptyState({ onAdd, t }) {
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

// Named exports for MaterialLibrary sub-component re-exports
export default MaterialLibraryErrorBoundary
export { ViewSwitcher, StatsCards, MaterialCard, DetailPanel, CompactFileCard }
