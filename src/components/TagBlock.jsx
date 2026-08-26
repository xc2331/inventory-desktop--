import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, X, Tag as TagIcon, Hash, Palette, Search } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { cn } from '../lib/cn'
import { parseTags, normalizeTags } from '../lib/tags'
import { createCategory, fetchCategories } from '../lib/api'
import { EASE } from '../lib/motion'

/**
 * 标签块（TagBlock）
 * ------------------------------------------------------------------
 * 用途：在 ItemForm / ItemDetail / MaterialForm 中以"块状多选"形式展示标签，
 *      支持自由新建（写回 categories 表，作为新 tag 的来源）。
 *
 * 数据：
 *   - 当前物品标签：来自 `items.tags` 字段（renderer 端 parseTags/normalizeTags）
 *   - 候选标签：来自 categories 全集（前端可缓存 + 后端 fetchCategories 兜底）
 *
 * 关键修复（v1.7.9j1）：
 *   1) 用 ref 同步最新 selected，避免连续 addTag 时拿到陈旧闭包；
 *   2) 弹层内 input 使用 onKeyDownCapture，e.stopPropagation() 拦 Enter 不冒泡到
 *      外层 <form onSubmit>，防止提交整个物品表单。
 *   3) 候选点击 / 回车添加 / 搜索框输入都走统一内部状态，不依赖父级受控链路。
 */
export default function TagBlock({
  value = [],
  onChange,
  categories = [],
  lang = 'zh',
  size = 'md',
  readonly = false,
  onCreated
}) {
  const { t } = useI18n()
  const [allTags, setAllTags] = useState(categories || [])
  const [input, setInput] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef(null)

  // ---- 1) 同步最新 selected 到 ref：避免连续 addTag 闭包陈旧 ----
  const selected = useMemo(() => parseTags(value), [value])
  const selectedRef = useRef(selected)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  // ---- 拉一次 categories 兜底（父组件可能没传） ----
  useEffect(() => {
    if (categories && categories.length > 0) {
      setAllTags(categories)
      return
    }
    fetchCategories()
      .then((rows) => setAllTags(Array.isArray(rows) ? rows : []))
      .catch(() => setAllTags([]))
  }, [categories])

  // 候选标签：排除已选
  const candidates = useMemo(() => {
    const set = new Set((selectedRef.current || []).map((s) => s.toLowerCase()))
    const list = (allTags || [])
      .map((c) => ({ id: c.id, key: c.key, name: c.name, name_en: c.name_en, icon: c.icon }))
      .filter((c) => c.key && !set.has(c.key.toLowerCase()))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      return list.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.name_en && c.name_en.toLowerCase().includes(q)) ||
          (c.key && c.key.toLowerCase().includes(q))
      )
    }
    return list
  }, [allTags, search])

  const sizeClass = size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs'

  // 统一提交函数：用 ref 拿最新 selected（解决闭包陈旧）
  function commit(next) {
    const dedup = Array.from(new Set(next.filter(Boolean).map((s) => String(s).trim()))).filter(Boolean)
    selectedRef.current = dedup
    onChange && onChange(dedup)
  }

  function addTag(tag) {
    const v = String(tag || '').trim()
    if (!v) return
    const cur = selectedRef.current
    if (cur.includes(v)) return
    commit([...cur, v])
  }

  function removeTag(tag) {
    const cur = selectedRef.current
    commit(cur.filter((s) => s !== tag))
  }

  // 解析用户输入：支持 "a, b c、中文" 多分隔
  function parseInput(text) {
    return String(text || '')
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  // ---- 2) 弹层内键盘统一处理：拦 Enter / 逗号不冒泡到 form ----
  function handlePickerKeyDown(e) {
    // 拦下 Enter 和 逗号，避免外层 <form onSubmit> 被触发
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault()
      e.stopPropagation()
      const parts = parseInput(input)
      if (parts.length === 0) return
      parts.forEach(addTag)
      setInput('')
      setSearch('')
    } else if (e.key === 'Backspace' && !input && selectedRef.current.length > 0) {
      e.preventDefault()
      e.stopPropagation()
      const cur = selectedRef.current
      removeTag(cur[cur.length - 1])
    }
  }

  async function handleCreate() {
    const v = input.trim()
    if (!v) return
    setCreating(true)
    try {
      const created = await createCategory({
        key: v,
        name: v,
        name_en: v,
        icon: 'Tag'
      })
      setAllTags((prev) => {
        const exists = prev.find((c) => c.key === created?.key)
        if (exists) return prev
        return [...prev, created]
      })
      addTag(v)
      onCreated && onCreated(created)
      setInput('')
      setSearch('')
      inputRef.current?.focus()
    } catch (e) {
      // 重复 key 时也按"已存在"处理：直接选上
      addTag(v)
      setInput('')
      setSearch('')
    } finally {
      setCreating(false)
    }
  }

  // 把 categories 的 icon 当作"色卡键"映射到一个稳定的 12 色 palette
  const palette = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
    '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6', '#a855f7', '#64748b'
  ]
  function colorOf(tag) {
    if (!tag) return palette[palette.length - 1]
    let h = 0
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
    return palette[h % palette.length]
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 已选标签块 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <AnimatePresence initial={false}>
          {selected.length === 0 && (
            <motion.span
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[11px] text-text-tertiary"
            >
              {t('tag_block_empty')}
            </motion.span>
          )}
          {selected.map((tag) => {
            const color = colorOf(tag)
            return (
              <motion.span
                key={tag}
                layout
                initial={{ opacity: 0, scale: 0.85, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: -2 }}
                transition={{ duration: 0.18, ease: EASE }}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border font-medium',
                  sizeClass
                )}
                style={{
                  backgroundColor: color + '14',
                  borderColor: color + '55',
                  color
                }}
              >
                <Hash size={11} style={{ color }} />
                {tag}
                {!readonly && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      removeTag(tag)
                    }}
                    className="-mr-1 ml-0.5 flex h-4 w-4 items-center justify-center rounded-full transition-smooth hover:bg-black/10"
                    title={t('tag_remove')}
                  >
                    <X size={10} />
                  </button>
                )}
              </motion.span>
            )
          })}
        </AnimatePresence>
        {!readonly && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPickerOpen((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-surface text-text-tertiary transition-smooth hover:border-primary hover:bg-primary-soft hover:text-primary',
              sizeClass
            )}
          >
            <Plus size={12} />
            {t('tag_addBtn')}
          </button>
        )}
      </div>

      {/* 弹层：候选 + 新建 */}
      <AnimatePresence>
        {pickerOpen && !readonly && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden rounded-xl border border-border bg-surface shadow-float"
            // 关键：拦下 Enter / 逗号 / Backspace 冒泡到外层 <form onSubmit>
            onKeyDownCapture={(e) => {
              if (
                e.key === 'Enter' ||
                e.key === ',' ||
                e.key === '，' ||
                e.key === 'Backspace'
              ) {
                e.stopPropagation()
                if (e.key === 'Enter') e.preventDefault()
              }
            }}
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search size={13} className="text-text-tertiary" />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  setSearch(e.target.value)
                }}
                onKeyDown={handlePickerKeyDown}
                placeholder={t('tag_search_placeholder')}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-text-tertiary"
                autoFocus
              />
              {creating ? (
                <span className="text-[11px] text-text-tertiary">{t('tag_creating')}</span>
              ) : (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault()
                    handleCreate()
                  }}
                  disabled={!input.trim()}
                  className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-white transition-smooth hover:bg-primary-hover disabled:opacity-50"
                >
                  <Plus size={11} />
                  {t('tag_create')}
                </button>
              )}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPickerOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-smooth hover:bg-surface-hover"
              >
                <X size={12} />
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto p-2">
              {candidates.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-text-tertiary">
                  {search.trim() ? t('tag_noMatch') : t('tag_noMore')}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {candidates.map((c) => {
                    const color = colorOf(c.key)
                    return (
                      <button
                        key={c.id || c.key}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault()
                          addTag(c.key)
                        }}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-1 text-[11px] font-medium text-text-secondary transition-smooth hover:border-primary hover:bg-primary-soft hover:text-primary',
                          sizeClass
                        )}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {c.name || c.key}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border bg-bg/40 px-3 py-1.5 text-[10px] text-text-tertiary">
              <span className="flex items-center gap-1">
                <Palette size={10} />
                {t('tag_tip')}
              </span>
              <span className="flex items-center gap-1">
                <TagIcon size={10} />
                {t('tag_total', { n: allTags.length })}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * 受控友好的 helper：把 TagBlock 的 onChange 转换为兼容 items.tags JSON 字符串的形式。
 * - onChangeTagString(str) : str 即 normalizeTags 之后的 JSON 字符串，可直接写库
 */
export function useTagStringBridge(value, onChangeString) {
  const list = parseTags(value)
  return {
    list,
    onChange: (next) => onChangeString && onChangeString(normalizeTags(next))
  }
}
