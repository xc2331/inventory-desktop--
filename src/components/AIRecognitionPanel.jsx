import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Loader2, AlertTriangle, RefreshCw, Check,
  ImageOff, FileImage, Wifi, Camera
} from 'lucide-react'
import { useI18n } from '../lib/i18n'

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

  if (aiState.status !== 'done' && aiState.status !== 'error') {
    return null
  }

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

      {/* 加载态 */}
      {aiState.status === 'loading' && (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-surface p-6">
          <Loader2 size={28} className="animate-spin text-primary" />
          <p className="text-sm font-medium text-text-secondary">{t('ai_recognize_loading')}</p>
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

      {/* 识别结果 */}
      {aiState.status === 'done' &&
        Array.isArray(aiState.suggestions) &&
        aiState.suggestions.length > 0 && (
          <div className="space-y-2">
            {aiState.suggestions.map((s, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08 }}
                className="flex items-start gap-3 rounded-xl border border-border bg-bg p-3"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Sparkles size={14} />
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
                    {s.category && <span>{t('f_category')}: {s.category}</span>}
                    {s.location && <span>{t('f_location')}: {s.location}</span>}
                    {s.quantity > 0 && <span>{t('f_quantity')}: {s.quantity}</span>}
                  </div>
                  {s.note && <p className="mt-1 text-[11px] text-text-tertiary">{s.note}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => onApply && onApply(s)}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Check size={12} />
                  {t('ai_recognize_apply')}
                </button>
              </motion.div>
            ))}
          </div>
        )}
    </motion.div>
  )
}

export default AIRecognitionPanel