import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, Check, X, FileText, Link, Image as ImageIcon, ChefHat, GraduationCap,
  FolderOpen, Tags, Globe, Monitor, Smartphone, BookOpen, Bookmark, Camera, Music, Video, Mail,
  MapPin, Phone, ShoppingBag, Star, Heart, Lightbulb, Coffee, Plane, Car, Home, Briefcase,
  Clipboard, Database, Code, PenTool, Shield, Award, Flag, Gift, Key, Lock, Save, Settings2,
  User, Users, Zap, Palette, Layers, Hash, Radio, Receipt, ScrollText, Server, Store, Watch,
  Wrench, FileQuestion, FileCheck, FileClock, FileCog, FileX, FileWarning, FileHeart, FileKey,
  FileLock, FilePlus, FileSearch, FileStack, FileMinus, FileDigit, FileSpreadsheet, FileBadge,
  FileBox, FileBarChart, Landmark, Leaf, Map as MapIcon, Megaphone, MessageSquare, Moon, Package,
  Paperclip, Percent, PiggyBank, Pill, Puzzle, Repeat, Rocket, Ruler, Scale, School, Scissors,
  Skull, Snowflake, Soup, Stethoscope, Sun as SunIcon, Sword, Syringe, Table, Tablet, Tag,
  Target, Tent, Ticket, Timer, Train, TreeDeciduous, Trophy, Truck, Tv, Umbrella, Vault,
  Wallet, Wind, Wine, Workflow, XCircle, Copy, CheckCircle2
} from 'lucide-react'
import { uid } from '../lib/api'
import { cn } from '../lib/cn'
import { EASE, EASE_SPRING } from '../lib/motion'
import ConfirmDialog from './ConfirmDialog'

const DEFAULT_TYPE_IDS = new Set(['note', 'url', 'photo', 'recipe', 'tutorial', 'doc', 'other'])

const ICON_POOL = [
  { key: 'FileText', Icon: FileText },
  { key: 'Link', Icon: Link },
  { key: 'ImageIcon', Icon: ImageIcon },
  { key: 'ChefHat', Icon: ChefHat },
  { key: 'GraduationCap', Icon: GraduationCap },
  { key: 'FolderOpen', Icon: FolderOpen },
  { key: 'Tags', Icon: Tags },
  { key: 'Globe', Icon: Globe },
  { key: 'Monitor', Icon: Monitor },
  { key: 'Smartphone', Icon: Smartphone },
  { key: 'BookOpen', Icon: BookOpen },
  { key: 'Bookmark', Icon: Bookmark },
  { key: 'Camera', Icon: Camera },
  { key: 'Music', Icon: Music },
  { key: 'Video', Icon: Video },
  { key: 'Mail', Icon: Mail },
  { key: 'MapPin', Icon: MapPin },
  { key: 'Phone', Icon: Phone },
  { key: 'ShoppingBag', Icon: ShoppingBag },
  { key: 'Star', Icon: Star },
  { key: 'Heart', Icon: Heart },
  { key: 'Lightbulb', Icon: Lightbulb },
  { key: 'Coffee', Icon: Coffee },
  { key: 'Plane', Icon: Plane },
  { key: 'Car', Icon: Car },
  { key: 'Home', Icon: Home },
  { key: 'Briefcase', Icon: Briefcase },
  { key: 'Clipboard', Icon: Clipboard },
  { key: 'Database', Icon: Database },
  { key: 'Code', Icon: Code },
  { key: 'PenTool', Icon: PenTool },
  { key: 'Shield', Icon: Shield },
  { key: 'Award', Icon: Award },
  { key: 'Flag', Icon: Flag },
  { key: 'Gift', Icon: Gift },
  { key: 'Key', Icon: Key },
  { key: 'Lock', Icon: Lock },
  { key: 'Save', Icon: Save },
  { key: 'Settings2', Icon: Settings2 },
  { key: 'User', Icon: User },
  { key: 'Users', Icon: Users },
  { key: 'Zap', Icon: Zap },
  { key: 'Palette', Icon: Palette },
  { key: 'Layers', Icon: Layers },
  { key: 'Hash', Icon: Hash },
  { key: 'Radio', Icon: Radio },
  { key: 'Receipt', Icon: Receipt },
  { key: 'ScrollText', Icon: ScrollText },
  { key: 'Server', Icon: Server },
  { key: 'Store', Icon: Store },
  { key: 'Watch', Icon: Watch },
  { key: 'Wrench', Icon: Wrench },
  { key: 'FileQuestion', Icon: FileQuestion },
  { key: 'FileCheck', Icon: FileCheck },
  { key: 'FileClock', Icon: FileClock },
  { key: 'FileCog', Icon: FileCog },
  { key: 'FileX', Icon: FileX },
  { key: 'FileWarning', Icon: FileWarning },
  { key: 'FileHeart', Icon: FileHeart },
  { key: 'FileKey', Icon: FileKey },
  { key: 'FileLock', Icon: FileLock },
  { key: 'FilePlus', Icon: FilePlus },
  { key: 'FileSearch', Icon: FileSearch },
  { key: 'FileStack', Icon: FileStack },
  { key: 'FileMinus', Icon: FileMinus },
  { key: 'FileDigit', Icon: FileDigit },
  { key: 'FileSpreadsheet', Icon: FileSpreadsheet },
  { key: 'FileBadge', Icon: FileBadge },
  { key: 'FileBox', Icon: FileBox },
  { key: 'FileBarChart', Icon: FileBarChart },
  { key: 'Landmark', Icon: Landmark },
  { key: 'Leaf', Icon: Leaf },
  { key: 'MapIcon', Icon: MapIcon },
  { key: 'Megaphone', Icon: Megaphone },
  { key: 'MessageSquare', Icon: MessageSquare },
  { key: 'Moon', Icon: Moon },
  { key: 'Package', Icon: Package },
  { key: 'Paperclip', Icon: Paperclip },
  { key: 'Percent', Icon: Percent },
  { key: 'PiggyBank', Icon: PiggyBank },
  { key: 'Pill', Icon: Pill },
  { key: 'Puzzle', Icon: Puzzle },
  { key: 'Repeat', Icon: Repeat },
  { key: 'Rocket', Icon: Rocket },
  { key: 'Ruler', Icon: Ruler },
  { key: 'Scale', Icon: Scale },
  { key: 'School', Icon: School },
  { key: 'Scissors', Icon: Scissors },
  { key: 'Skull', Icon: Skull },
  { key: 'Snowflake', Icon: Snowflake },
  { key: 'Soup', Icon: Soup },
  { key: 'Stethoscope', Icon: Stethoscope },
  { key: 'SunIcon', Icon: SunIcon },
  { key: 'Sword', Icon: Sword },
  { key: 'Syringe', Icon: Syringe },
  { key: 'Table', Icon: Table },
  { key: 'Tablet', Icon: Tablet },
  { key: 'Tag', Icon: Tag },
  { key: 'Target', Icon: Target },
  { key: 'Tent', Icon: Tent },
  { key: 'Ticket', Icon: Ticket },
  { key: 'Timer', Icon: Timer },
  { key: 'Train', Icon: Train },
  { key: 'TreeDeciduous', Icon: TreeDeciduous },
  { key: 'Trophy', Icon: Trophy },
  { key: 'Truck', Icon: Truck },
  { key: 'Tv', Icon: Tv },
  { key: 'Umbrella', Icon: Umbrella },
  { key: 'Vault', Icon: Vault },
  { key: 'Wallet', Icon: Wallet },
  { key: 'Wind', Icon: Wind },
  { key: 'Wine', Icon: Wine },
  { key: 'Workflow', Icon: Workflow },
  { key: 'XCircle', Icon: XCircle },
  { key: 'Copy', Icon: Copy },
  { key: 'CheckCircle2', Icon: CheckCircle2 }
]

const COLOR_OPTIONS = [
  { key: 'blue', label: 'Blue', text: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', ring: 'ring-blue-500' },
  { key: 'indigo', label: 'Indigo', text: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20', ring: 'ring-indigo-500' },
  { key: 'violet', label: 'Violet', text: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20', ring: 'ring-violet-500' },
  { key: 'purple', label: 'Purple', text: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', ring: 'ring-purple-500' },
  { key: 'rose', label: 'Rose', text: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20', ring: 'ring-rose-500' },
  { key: 'orange', label: 'Orange', text: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', ring: 'ring-orange-500' },
  { key: 'amber', label: 'Amber', text: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', ring: 'ring-amber-500' },
  { key: 'yellow', label: 'Yellow', text: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20', ring: 'ring-yellow-500' },
  { key: 'lime', label: 'Lime', text: 'text-lime-500', bg: 'bg-lime-50 dark:bg-lime-900/20', ring: 'ring-lime-500' },
  { key: 'green', label: 'Green', text: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', ring: 'ring-green-500' },
  { key: 'emerald', label: 'Emerald', text: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', ring: 'ring-emerald-500' },
  { key: 'teal', label: 'Teal', text: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-900/20', ring: 'ring-teal-500' },
  { key: 'cyan', label: 'Cyan', text: 'text-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-900/20', ring: 'ring-cyan-500' },
  { key: 'sky', label: 'Sky', text: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-900/20', ring: 'ring-sky-500' },
  { key: 'slate', label: 'Slate', text: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-900/20', ring: 'ring-slate-500' },
  { key: 'zinc', label: 'Zinc', text: 'text-zinc-500', bg: 'bg-zinc-50 dark:bg-zinc-900/20', ring: 'ring-zinc-500' },
  { key: 'stone', label: 'Stone', text: 'text-stone-500', bg: 'bg-stone-50 dark:bg-stone-900/20', ring: 'ring-stone-500' },
  { key: 'red', label: 'Red', text: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', ring: 'ring-red-500' }
]

function getIcon(key) {
  const found = ICON_POOL.find((i) => i.key === key)
  return found ? found.Icon : FileText
}

function getColor(key) {
  return COLOR_OPTIONS.find((c) => c.key === key) || COLOR_OPTIONS[0]
}

function getTypeLabel(type, lang) {
  if (!type) return ''
  if (typeof type.name === 'string') return type.name
  return type.name?.[lang] || type.name?.zh || type.name?.en || type.id
}

export default function TypeManager({ open, materialTypes, lang, onClose, onChange, t }) {
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [adding, setAdding] = useState(false)
  const [newType, setNewType] = useState({ name_zh: '', name_en: '', icon: 'FileText', color: 'blue' })
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' })
  const [iconPicker, setIconPicker] = useState({ open: false, target: null, current: '' })

  const isDefault = (id) => DEFAULT_TYPE_IDS.has(id)

  const startEdit = (type) => {
    setEditingId(type.id)
    setEditForm({
      name_zh: type.name?.zh || '',
      name_en: type.name?.en || '',
      icon: type.icon || 'FileText',
      color: type.color || 'blue'
    })
  }

  const handleSaveEdit = async () => {
    const nameZh = editForm.name_zh.trim()
    if (!nameZh) return
    const next = materialTypes.map((type) =>
      type.id === editingId
        ? {
            ...type,
            name: { zh: nameZh, en: editForm.name_en.trim() || nameZh },
            icon: editForm.icon,
            color: editForm.color
          }
        : type
    )
    await onChange(next)
    setEditingId(null)
  }

  const handleAdd = async () => {
    const nameZh = newType.name_zh.trim()
    if (!nameZh) return
    const id = uid()
    const type = {
      id,
      name: { zh: nameZh, en: newType.name_en.trim() || nameZh },
      icon: newType.icon,
      color: newType.color
    }
    await onChange([...materialTypes, type])
    setNewType({ name_zh: '', name_en: '', icon: 'FileText', color: 'blue' })
    setAdding(false)
  }

  const requestDelete = (type) => {
    if (isDefault(type.id)) return
    setConfirm({ open: true, id: type.id, name: getTypeLabel(type, lang) })
  }

  const handleDelete = async () => {
    const { id } = confirm
    setConfirm({ open: false, id: null, name: '' })
    if (!id) return
    await onChange(materialTypes.filter((type) => type.id !== id))
  }

  const openIconPicker = (target) => {
    const current = target === 'new' ? newType.icon : editForm.icon
    setIconPicker({ open: true, target, current: current || 'FileText' })
  }

  const pickIcon = (key) => {
    if (iconPicker.target === 'new') {
      setNewType((f) => ({ ...f, icon: key }))
    } else if (iconPicker.target === 'edit') {
      setEditForm((f) => ({ ...f, icon: key }))
    }
    setIconPicker({ open: false, target: null, current: '' })
  }

  const renderForm = (form, setForm, isNew) => (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('materials_typeName')}>
          <input
            type="text"
            value={isNew ? form.name_zh : form.name_zh}
            onChange={(e) => setForm((f) => ({ ...f, name_zh: e.target.value }))}
            placeholder={lang === 'zh' ? '中文名称' : 'Chinese name'}
            className="input"
            autoFocus
          />
        </Field>
        <Field label={t('materials_typeName')}>
          <input
            type="text"
            value={isNew ? form.name_en : form.name_en}
            onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
            placeholder={lang === 'en' ? 'English name' : '英文名称（可选）'}
            className="input"
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('materials_typeIcon')}>
          <button
            type="button"
            onClick={() => openIconPicker(isNew ? 'new' : 'edit')}
            className="input flex cursor-pointer items-center gap-2 transition-smooth hover:border-primary"
          >
            {(() => {
              const Icon = getIcon(isNew ? form.icon : form.icon)
              return <Icon size={18} className={getColor(form.color).text} />
            })()}
            <span className="text-xs text-text-secondary">{isNew ? form.icon : form.icon}</span>
          </button>
        </Field>
        <Field label={t('materials_typeColor')}>
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-bg p-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setForm((f) => ({ ...f, color: c.key }))}
                title={c.label}
                className={cn(
                  'h-6 w-6 rounded-full transition-smooth',
                  c.bg,
                  form.color === c.key ? `ring-2 ${c.ring} ring-offset-1 ring-offset-surface` : 'hover:scale-110'
                )}
              />
            ))}
          </div>
        </Field>
      </div>
    </div>
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="fixed inset-0 z-[70] flex flex-col bg-bg"
        >
          <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-text-primary"
              >
                <X size={18} />
              </button>
              <div>
                <h1 className="text-sm font-semibold text-text-primary">{t('materials_manageTypes')}</h1>
                <p className="text-[11px] text-text-tertiary">{t('materials_manageTypes_desc')}</p>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setAdding((a) => !a)}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
            >
              <Plus size={16} strokeWidth={2.5} />
              {t('materials_addType')}
            </motion.button>
          </header>

          <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-5">
            <AnimatePresence>
              {adding && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="mb-4 overflow-hidden rounded-2xl border border-primary/40 bg-surface p-5 shadow-card"
                >
                  {renderForm(newType, setNewType, true)}
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(false)
                        setNewType({ name_zh: '', name_en: '', icon: 'FileText', color: 'blue' })
                      }}
                      className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
                    >
                      {t('btn_cancel')}
                    </button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={handleAdd}
                      disabled={!newType.name_zh.trim()}
                      className={cn(
                        'flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-medium text-white shadow-sm transition-smooth',
                        !newType.name_zh.trim() ? 'bg-text-tertiary' : 'bg-primary hover:bg-primary-hover'
                      )}
                    >
                      <Check size={15} />
                      {t('btn_save')}
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <AnimatePresence>
                {materialTypes.map((type, idx) => {
                  const color = getColor(type.color)
                  const Icon = getIcon(type.icon)
                  if (editingId === type.id) {
                    return (
                      <motion.div
                        key={type.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        className="rounded-2xl border border-primary/40 bg-surface p-4 shadow-card"
                      >
                        {renderForm(editForm, setEditForm, false)}
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
                          >
                            {t('btn_cancel')}
                          </button>
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={handleSaveEdit}
                            disabled={!editForm.name_zh.trim()}
                            className={cn(
                              'flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-medium text-white shadow-sm transition-smooth',
                              !editForm.name_zh.trim() ? 'bg-text-tertiary' : 'bg-primary hover:bg-primary-hover'
                            )}
                          >
                            <Check size={15} />
                            {t('btn_save')}
                          </motion.button>
                        </div>
                      </motion.div>
                    )
                  }
                  return (
                    <motion.div
                      key={type.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.3, ease: EASE, delay: Math.min(idx * 0.03, 0.2) }}
                      className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card transition-smooth hover:shadow-float"
                    >
                      <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', color.bg)}>
                        <Icon size={20} className={color.text} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-text-primary">{getTypeLabel(type, lang)}</div>
                        <div className="font-mono text-xs text-text-tertiary">{type.id}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <motion.button
                          whileTap={{ scale: 0.88 }}
                          onClick={() => startEdit(type)}
                          title={t('materials_editType')}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-smooth hover:bg-surface-hover hover:text-primary"
                        >
                          <Pencil size={15} />
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.88 }}
                          onClick={() => requestDelete(type)}
                          disabled={isDefault(type.id)}
                          title={isDefault(type.id) ? t('materials_defaultTypeCantDelete') : t('materials_deleteType')}
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-lg transition-smooth',
                            isDefault(type.id)
                              ? 'cursor-not-allowed text-text-tertiary/40'
                              : 'text-text-tertiary hover:bg-danger-soft hover:text-danger'
                          )}
                        >
                          <Trash2 size={15} />
                        </motion.button>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {materialTypes.length === 0 && !adding && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl border border-dashed border-border bg-surface px-4 py-16 text-center text-sm text-text-tertiary"
                >
                  {t('materials_addType')}…
                </motion.div>
              )}
            </div>
          </main>

          <ConfirmDialog
            open={confirm.open}
            title={t('materials_deleteType')}
            message={t('materials_deleteTypeConfirm', { name: confirm.name })}
            onConfirm={handleDelete}
            onCancel={() => setConfirm({ open: false, id: null, name: '' })}
          />

          <IconPicker
            open={iconPicker.open}
            current={iconPicker.current}
            onPick={pickIcon}
            onClose={() => setIconPicker({ open: false, target: null, current: '' })}
            t={t}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-tertiary">{label}</span>
      {children}
    </label>
  )
}

function IconPicker({ open, current, onPick, onClose, t }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.3, ease: EASE_SPRING }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-float"
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold text-text-primary">{t('materials_typeIcon')}</h3>
              <p className="mt-0.5 text-xs text-text-tertiary">{t('cat_iconPicker_desc')}</p>
            </div>
            <div className="grid grid-cols-8 gap-1 overflow-y-auto p-3" style={{ maxHeight: 320 }}>
              {ICON_POOL.map(({ key, Icon }) => (
                <motion.button
                  key={key}
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  whileHover={{ scale: 1.08 }}
                  onClick={() => onPick(key)}
                  title={key}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-lg transition-smooth hover:bg-primary-soft hover:text-primary',
                    current === key
                      ? 'bg-primary-soft text-primary ring-2 ring-primary'
                      : 'text-text-secondary'
                  )}
                >
                  <Icon size={20} />
                </motion.button>
              ))}
            </div>
            <div className="border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
              >
                {t('btn_cancel')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
