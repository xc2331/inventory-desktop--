import { useState, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import { X, CheckSquare, Square, Trash2, FolderInput, ChevronDown, AlertTriangle, Calculator, GripVertical, LayoutGrid } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'
import { getCategoryIcon } from '../lib/categoryIcons'
import { EASE } from '../lib/motion'

export default function BulkEditBar({
  selectedCount,
  total,
  selectedItems = [],
  categories,
  lang,
  onSelectAll,
  onClear,
  onChangeCategory,
  onDelete,
  onClose,
  onBulkUpdateQuantity,
  onBulkPreview,
  onReorder
}) {
  const { t } = useI18n()
  const [showCat, setShowCat] = useState(false)
  const [showQty, setShowQty] = useState(false)
  const [qtyOp, setQtyOp] = useState('+')
  const [qtyVal, setQtyVal] = useState('1')
  const allSelected = selectedCount > 0 && selectedCount === total
  const catBtnRef = useRef(null)
  const qtyBtnRef = useRef(null)

  const [catPos, setCatPos] = useState({ x: 0, y: 0, width: 192, align: 'left' })
  const [qtyPos, setQtyPos] = useState({ x: 0, y: 0, width: 288, align: 'left' })

  useLayoutEffect(() => {
    if (!showCat) return
    const r = catBtnRef.current?.getBoundingClientRect?.()
    if (r) {
      const w = Math.max(r.width, 192)
      const vw = window.innerWidth
      const x = r.left + w > vw ? vw - w - 8 : r.left
      setCatPos({ x, y: r.top + r.height, width: w, align: x !== r.left ? 'right' : 'left' })
    }
  }, [showCat])

  useLayoutEffect(() => {
    if (!showQty) return
    const r = qtyBtnRef.current?.getBoundingClientRect?.()
    if (r) {
      const w = 288
      const vw = window.innerWidth
      const x = r.left + w > vw ? vw - w - 8 : r.left
      setQtyPos({ x, y: r.top + r.height, width: w, align: x !== r.left ? 'right' : 'left' })
    }
  }, [showQty])

  const handleQtySubmit = () => {
    const v = Math.max(0, Number(qtyVal) || 0)
    if (v <= 0 && (qtyOp === '+' || qtyOp === '-')) return
    onBulkUpdateQuantity?.({ op: qtyOp, value: v })
    setShowQty(false)
  }

  const [previewItems, setPreviewItems] = useState(
    (selectedItems || []).map((it) => ({ id: it.id, name: it.name, category: it.category, position: it.position }))
  )

  const portalRoot = typeof document !== 'undefined' ? document.body : null

  // --- 分类弹窗 ---
  const catDropdown = showCat && portalRoot && categories.length > 0
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            left: `${catPos.x}px`,
            top: `${catPos.y + 6}px`,
            width: `${catPos.width}px`,
            zIndex: 9999,
            opacity: showCat ? 1 : 0,
            transform: showCat ? 'translateY(0)' : 'translateY(-6px)',
            transition: 'opacity 0.18s ease, transform 0.18s ease',
            pointerEvents: showCat ? 'auto' : 'none',
          }}
          className="overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-float"
        >
          {categories.map((c) => {
            const CatIcon = getCategoryIcon(c)
            return (
              <button
                key={c.id}
                onClick={() => { onChangeCategory(c.key); setShowCat(false); setShowQty(false) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary transition-smooth hover:bg-surface-hover"
              >
                <CatIcon size={15} className="text-text-tertiary" />
                {categoryDisplayName(c, lang)}
              </button>
            )
          })}
        </div>,
        portalRoot
      )
    : null

  // --- 数量弹窗 ---
  const qtyDropdown = showQty && portalRoot
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            left: `${qtyPos.x}px`,
            top: `${qtyPos.y + 6}px`,
            width: `${qtyPos.width}px`,
            zIndex: 9999,
            opacity: showQty ? 1 : 0,
            transform: showQty ? 'translateY(0)' : 'translateY(-6px)',
            transition: 'opacity 0.18s ease, transform 0.18s ease',
            pointerEvents: showQty ? 'auto' : 'none',
          }}
          className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-float"
        >
          <select
            value={qtyOp}
            onChange={(e) => setQtyOp(e.target.value)}
            className="w-16 rounded-lg border border-border bg-surface px-1.5 text-xs font-bold text-text-primary outline-none"
          >
            <option value="+">{t('bulk_qtyAdd')}</option>
            <option value="-">{t('bulk_qtySub')}</option>
            <option value="=">{t('bulk_qtySet')}</option>
          </select>
          <input
            type="number"
            min="1"
            max="999"
            value={qtyVal}
            onChange={(e) => setQtyVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQtySubmit()}
            className="flex-1 rounded-lg border border-border bg-surface px-2 text-sm font-medium text-text-primary outline-none"
          />
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleQtySubmit}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover"
          >
            <CheckSquare size={12} />
            {t('save')}
          </motion.button>
        </div>,
        portalRoot
      )
    : null

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="glass flex flex-col gap-2 rounded-2xl border border-primary/30 px-4 py-3 shadow-card"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              title={t('close')}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-primary transition-smooth hover:bg-primary-soft"
            >
              <X size={16} />
            </motion.button>
            <span className="text-sm font-semibold text-primary">
              {t('bulk_selected', { n: selectedCount })}
            </span>
            <button
              onClick={onSelectAll}
              className="flex cursor-pointer items-center gap-1.5 text-sm text-primary transition-smooth hover:opacity-80"
            >
              {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
              {t('bulk_selectAll')}
            </button>
            <button
              onClick={onClear}
              className="text-sm text-primary underline-offset-2 transition-smooth hover:underline"
            >
              {t('bulk_clear')}
            </button>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-1.5 rounded-lg bg-primary-soft/60 px-2.5 py-1 text-xs font-medium text-primary"
            >
              <GripVertical size={13} />
              <span>{t('bulk_dragReorder')}</span>
            </motion.div>
          </div>

          <div className="flex items-center gap-2">
            <div>
              <motion.button
                ref={catBtnRef}
                whileTap={{ scale: 0.96 }}
                onClick={() => { setShowCat((v) => !v); setShowQty(false) }}
                className="flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-medium text-primary shadow-sm transition-smooth hover:bg-primary-soft"
              >
                <FolderInput size={15} />
                {t('bulk_changeCategory')}
                <ChevronDown size={13} className={`transition-transform ${showCat ? 'rotate-180' : ''}`} />
              </motion.button>
            </div>

            <div>
              <motion.button
                ref={qtyBtnRef}
                whileTap={{ scale: 0.96 }}
                onClick={() => { setShowQty((v) => !v); setShowCat(false) }}
                className="flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-medium text-primary shadow-sm transition-smooth hover:bg-primary-soft"
                title={t('bulk_changeQty')}
              >
                <Calculator size={15} />
                {t('bulk_changeQty')}
                <ChevronDown size={13} className={`transition-transform ${showQty ? 'rotate-180' : ''}`} />
              </motion.button>
            </div>

            {onBulkPreview && (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={onBulkPreview}
                className="flex items-center gap-1.5 rounded-xl border border-warn px-3 py-2 text-sm font-medium text-warn shadow-sm hover:bg-warn-soft"
              >
                <AlertTriangle size={15} />
                {t('bulk_preview')}
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-xl border border-danger px-3 py-2 text-sm font-medium text-danger shadow-sm hover:bg-danger-soft"
            >
              <Trash2 size={15} />
              {t('bulk_delete')}
            </motion.button>
          </div>
        </div>

        <AnimatePresence>
          {selectedItems && selectedItems.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, delay: 0.15, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 border-t border-border/40 pt-2">
                <span className="text-xs font-medium text-text-tertiary whitespace-nowrap">
                  <LayoutGrid size={12} className="inline-block mr-1" />
                  {t('bulk_order')}
                </span>
                <div className="flex-1 overflow-x-auto overflow-y-hidden pb-1">
                  <Reorder.Group
                    axis="x"
                    values={previewItems}
                    onReorder={(newOrder) => {
                      setPreviewItems(newOrder)
                      onReorder?.(newOrder.map((o) => o.id))
                    }}
                    className="flex gap-2 min-w-max"
                  >
                    {previewItems.map((item, i) => {
                      const CatIcon = getCategoryIcon(item.category)
                      return (
                        <Reorder.Item
                          key={item.id}
                          value={item}
                          whileDrag={{ scale: 1.05, rotate: 1, boxShadow: '0 8px 20px -4px rgba(15,23,42,0.25)', cursor: 'grabbing' }}
                          className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 min-w-[64px] max-w-[96px] shadow-sm cursor-grab active:cursor-grabbing"
                        >
                          <span className="flex items-center justify-center text-[10px] font-bold text-text-tertiary">
                            #{i + 1}
                          </span>
                          <div className="flex items-center gap-1">
                            <CatIcon size={14} className="text-text-tertiary shrink-0" />
                            <span className="text-xs font-medium text-text-primary truncate max-w-[60px]">
                              {item.name}
                            </span>
                          </div>
                          <GripVertical size={10} className="text-text-tertiary/50" />
                        </Reorder.Item>
                      )
                    })}
                  </Reorder.Group>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {catDropdown}
      {qtyDropdown}
    </>
  )
}