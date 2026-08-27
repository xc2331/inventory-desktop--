import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Loader2, AlertTriangle, RefreshCw, Check,
  ImageOff, FileImage, Wifi, Camera
} from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { categoryDisplayName } from '../lib/api'

/**
 * AI 视觉识别面板：根据外部传入的 aiState 渲染识别结果与错误引导。
 * 错误态下展示：带图标的错误信息、3 条可操作建议、重试按钮，并配有入场动画。
 */
export function AIRecognitionPanel({
  aiState,
  categories,
  onRetry,
  onApply,
  onCancel,
  lang
}) {
  const { t } = useI18n()

  if (aiState.status !== 'done' && aiState.status !== 'error' && aiState.status !== 'loading') {
    return null
  }

  // 按 key 查找分类对象，用于 categoryDisplayName
  const catMap = Array.isArray(categories)
    ? Object.fromEntries(categories.map((c) => [c.key || c.id, c]))
    : {}

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="border-t border-border bg-surface p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{t('ai_recognize_suggestions')}</h3>
        <button
          type="button"
          onClick={onCancel || (() => {})}
          className="text-[11px] text-text-tertiary hover:text-text-primary"
        >
          {t('ai_recognize_close')}
        </button>
      </div>

      {/* 加载态 — v1.8.6: 批量识别显示 spinner + 最终统计（无 SSE，结果一次性返回）*/}
      {aiState.status === 'loading' && (
        <div className="flex flex-col gap-3 rounded-xl bg-surface p-5">
          <div className="flex items-center gap-2">
            <Loader2 size={18} className="animate-spin text-primary" />
            <p className="text-sm font-medium text-text-secondary">
              {t('ai_recognize_loading')}
              {aiState.photoCount > 1 && (
                <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                  {aiState.photoCount} 张
                </span>
              )}
            </p>
          </div>
          {/* 进度条 — 当前接口一次性返回，显示最终 done/total；如未来加 SSE，可逐张递增 done */}
          {aiState.photoCount > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: aiState.total > 0
                  ? `${Math.min(100, Math.round(((aiState.done || 0) / aiState.total) * 100))}%`
                  : '0%' }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
          )}
          {aiState.photoCount > 1 && aiState.total > 0 && (
            <p className="text-[11px] text-text-tertiary">
              完成 {aiState.done || 0}/{aiState.total} · 并发 {aiState.concurrency || 3} · 用时 {(aiState.elapsedMs / 1000).toFixed(1)}s
            </p>
          )}
        </div>
      )}

      {/* 错误引导面板 */}
      <AnimatePresence>
        {aiState.status === 'error' && (
          <motion.div
            key="error-guide"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="mb-3 overflow-hidden rounded-xl border border-danger/30 bg-danger-soft"
          >
            <div className="flex items-start gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-danger">{t('ai_errorGuideTitle')}</p>
                <p className="mt-0.5 text-xs text-danger/80">{aiState.error || t('ai_recognize_noResult')}</p>
              </div>
            </div>

            <div className="border-t border-danger/20 bg-danger/5 p-4">
              <ul className="space-y-2.5">
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
                    <Camera size={12} />
                  </span>
                  <span className="text-xs text-text-primary">{t('ai_errorTip1')}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
                    <FileImage size={12} />
                  </span>
                  <span className="text-xs text-text-primary">{t('ai_errorTip2')}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
                    <Wifi size={12} />
                  </span>
                  <span className="text-xs text-text-primary">{t('ai_errorTip3')}</span>
                </li>
              </ul>
            </div>

            <div className="flex justify-end border-t border-danger/20 p-3">
              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition-smooth hover:bg-danger/90"
              >
                <RefreshCw size={12} />
                {t('ai_retry')}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 无结果（非错误态） */}
      {aiState.status === 'done' &&
        (!aiState.suggestions || aiState.suggestions.length === 0) &&
        !aiState.error && (
          <p className="text-xs text-text-tertiary">{t('ai_recognize_noResult')}</p>
        )}

      {/* 识别结果：按字段分组（名称 / 分类 / 位置 / 数量 / 备注）*/}
      {aiState.status === 'done' &&
        Array.isArray(aiState.suggestions) &&
        aiState.suggestions.length > 0 && (
          <div className="space-y-3">
            {/* 名称组 */}
            <FieldGroup title={t('f_name') || '名称'} icon="Name">
              {aiState.suggestions.map((s, idx) => (
                <FieldOption
                  key={`name-${idx}`}
                  value={s.name}
                  confidence={s.confidence}
                  applyLabel={t('ai_recognize_apply')}
                  onApply={() => onApply && onApply({ ...s, _field: 'name' })}
                />
              ))}
            </FieldGroup>

            {/* 分类组 */}
            {(aiState.suggestions.some((s) => s.category) || aiState.suggestions.some((s) => s.category_id)) && (
              <FieldGroup title={t('f_category') || '分类'} icon="Category">
                {[...new Set(aiState.suggestions.map((s) => s.category || s.category_id).filter(Boolean))].map(
                  (v, idx) => (
                    <FieldOption
                      key={`cat-${idx}`}
                      value={categoryDisplayName(v, categories)}
                      onApply={() => onApply && onApply({ _field: 'category', category: v })}
                    />
                  )
                )}
              </FieldGroup>
            )}

            {/* 位置组 */}
            {(aiState.suggestions.some((s) => s.location) || aiState.suggestions.some((s) => s.room) || aiState.suggestions.some((s) => s.position)) && (
              <FieldGroup title={t('f_location') || '位置'} icon="Location">
                {[...new Set(aiState.suggestions.map((s) => s.location || s.room || s.position).filter(Boolean))].map(
                  (v, idx) => (
                    <FieldOption
                      key={`loc-${idx}`}
                      value={v}
                      onApply={() => onApply && onApply({ _field: 'location', location: v })}
                    />
                  )
                )}
              </FieldGroup>
            )}

            {/* 数量组 */}
            {aiState.suggestions.some((s) => s.quantity > 0) && (
              <FieldGroup title={t('f_quantity') || '数量'} icon="Quantity">
                {[...new Set(aiState.suggestions.map((s) => s.quantity).filter((v) => v > 0))].map(
                  (v, idx) => (
                    <FieldOption
                      key={`qty-${idx}`}
                      value={String(v)}
                      onApply={() => onApply && onApply({ _field: 'quantity', quantity: v })}
                    />
                  )
                )}
              </FieldGroup>
            )}

            {/* 备注组 */}
            {aiState.suggestions.some((s) => s.note || s.notes) && (
              <FieldGroup title={t('f_notes') || '备注'} icon="Notes">
                {[...new Set(aiState.suggestions.map((s) => s.note || s.notes).filter(Boolean))].map(
                  (v, idx) => (
                    <FieldOption
                      key={`note-${idx}`}
                      value={v}
                      onApply={() => onApply && onApply({ _field: 'notes', notes: v })}
                    />
                  )
                )}
              </FieldGroup>
            )}

            {/* 一键应用全部 */}
            <button
              type="button"
              onClick={() => onApply && onApply(aiState.suggestions[0])}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-smooth hover:bg-primary/90"
            >
              <Check size={14} />
              {t('ai_recognize_apply')} {aiState.suggestions[0].name}
            </button>
          </div>
        )}
    </motion.div>
  )
}

function FieldGroup({ title, children }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        <span>{title}</span>
      </div>
      <div className="space-y-1.5">
        {children}
      </div>
    </div>
  )
}

function FieldOption({ value, confidence, onApply, applyLabel }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-text-primary">{value}</span>
        {confidence > 0 && (
          <span className="ml-1.5 rounded-full bg-surface px-1.5 py-0 text-[9px] text-text-tertiary">
            {(confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onApply}
        className="flex shrink-0 items-center gap-1 rounded-md bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary hover:text-primary-foreground"
      >
        <Check size={11} />
        {applyLabel || '应用'}
      </button>
    </div>
  )
}

export default AIRecognitionPanel