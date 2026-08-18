/* Shared helpers extracted from MaterialLibrary.jsx */
import {
  FolderOpen, Globe, Tags, Check,
  FileImage, FileText, FileVideo2, FileAudio2, FileArchive,
  Folder, ImageIcon
} from 'lucide-react'
import { cn } from '../lib/cn'

export function getFilePath(item) {
  if (item) return (item.photo || item.url || '').replace(/^file:\/+/i, '')
  if (typeof item === 'string') return item.replace(/^file:\/+/i, '')
  return ''
}

export function isFolderPath(s) {
  const raw = typeof s === 'string' ? s : getFilePath(s)
  if (!raw) return false
  const normalized = raw.replace(/^file:\/+/i, '').replace(/\\/g, '/')
  if (/\.[a-zA-Z0-9]{2,8}$/.test(normalized)) return false
  if (normalized === '/') return false
  if (normalized.includes(':') && normalized.indexOf(':') === 1) return true
  if (/^[A-Za-z]:\\/.test(normalized)) return true
  if (/\.\.(\/|\\)/.test(normalized)) return true
  return true
}

export function isUrl(s) {
  if (!s) return false
  return /^(https?:\/\/|www\.)/i.test(s) ||
    /^(file:\/+|ftp:\/+)/i.test(s) ||
    /^(mailto:|tel:)/i.test(s)
}

export function isImageResource(s) {
  if (!s) return false
  if (s.startsWith('data:image/')) return true
  const path = getFilePath(s)
  return /\.(jpe?g|png|gif|webp|bmp|svg|ico|heic|avif)$/i.test(path)
}

export function toPhotoSrc(photo) {
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

export const FILE_TYPE_GROUPS = [
  { key: 'image', labelKey: 'fileType_image', icon: FileImage, color: 'text-rose-500' },
  { key: 'doc', labelKey: 'fileType_doc', icon: FileText, color: 'text-blue-500' },
  { key: 'link', labelKey: 'fileType_link', icon: Globe, color: 'text-indigo-500' },
  { key: 'video', labelKey: 'fileType_video', icon: FileVideo2, color: 'text-purple-500' },
  { key: 'audio', labelKey: 'fileType_audio', icon: FileAudio2, color: 'text-amber-500' },
  { key: 'archive', labelKey: 'fileType_archive', icon: FileArchive, color: 'text-orange-500' },
  { key: 'folder', labelKey: 'fileType_folder', icon: FolderOpen, color: 'text-amber-600' },
  { key: 'other', labelKey: 'fileType_other', icon: Tags, color: 'text-stone-500' }
]

export function getFileType(item) {
  const path = getFilePath(item)
  const typed = typeof item === 'object' && item !== null ? item : null
  if (typed && (typed.type === 'photo' || isImageResource(typed.photo) || isImageResource(typed.url))) return 'image'
  if (typed && typed.type === 'note') return 'doc'
  if (typed && (typed.type === 'doc' || typed.type === 'other')) {
    if (/\.(docx?|pdf|txt|md|xlsx?|pptx?)$/i.test(path)) return 'doc'
  }
  if (typed && typed.type === 'url' || (typed && isUrl(typed.url))) return 'link'
  if (/\.(mp4|mov|avi|mkv|webm)$/i.test(path)) return 'video'
  if (/\.(mp3|wav|flac|aac|ogg)$/i.test(path)) return 'audio'
  if (/\.(zip|rar|7z|tar|gz)$/i.test(path)) return 'archive'
  if (isFolderPath(path)) return 'folder'
  return 'other'
}

export function fileTypeIcon(key) {
  return FILE_TYPE_GROUPS.find((g) => g.key === key) || FILE_TYPE_GROUPS[FILE_TYPE_GROUPS.length - 1]
}

export function getTypeLabel(typeObj, lang) {
  if (!typeObj) return ''
  return typeObj.name?.[lang] || typeObj.name?.zh || typeObj.name?.en || typeObj.id
}

export function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export const COLOR_OPTIONS = [
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

export const ICON_MAP_DEFAULT = {
  FolderOpen, Globe, Tags, Check, FileImage, FileText, FileVideo2, FileAudio2, FileArchive,
  Folder, ImageIcon
}

export function getTypeMeta(types, typeId) {
  const type = types?.find((t) => t.id === typeId)
  const fallback = COLOR_OPTIONS.find((c) => c.key === 'stone')
  if (!type) return { icon: Tags, ...fallback }
  const color = COLOR_OPTIONS.find((c) => c.key === type.color) || fallback
  const Icon = ICON_MAP_DEFAULT[type.icon] || Tags
  return { icon: Icon, ...color }
}

export {
  COLOR_OPTIONS as COLOR_OPTIONS_ALIAS,
  ICON_MAP_DEFAULT as ICON_MAP_ALIAS
}