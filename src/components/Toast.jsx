import { useEffect, useState, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import { EASE_SPRING, EASE } from '../lib/motion'

export default function Toast({ toast, onDone, progress }) {
  const timerRef = useRef(null)
  const [localProgress, setLocalProgress] = useState(0)
  const duration = 2600

  useEffect(() => {
    if (!toast) {
      setLocalProgress(0)
      return
    }
    // 重置
    setLocalProgress(0)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(onDone, duration)

    // 进度条动画（每 40ms 更新一次）
    const steps = 50
    const stepMs = duration / steps
    let step = 0
    const pTimer = setInterval(() => {
      step += 1
      setLocalProgress(step / steps)
      if (step >= steps) clearInterval(pTimer)
    }, stepMs)
    return () => {
      clearTimeout(timerRef.current)
      clearInterval(pTimer)
    }
  }, [toast, onDone])

  // 若外部注入 progress（如下载进度），优先使用外部值
  const progressValue = progress != null ? progress : (toast ? localProgress : 0)
  const isError = toast?.type === 'error'
  const showProgress = !!toast
  const hasTarget = !!toast?.targetId
  const cursor = hasTarget ? 'cursor-pointer' : ''

  const handleClick = (e) => {
    // 如果点击的是关闭按钮，不处理
    if (e.target.closest('[data-close-btn]')) return
    if (hasTarget) {
      window.dispatchEvent(new CustomEvent('locateItem', { detail: { id: toast.targetId } }))
      onDone()
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 w-[92vw] max-w-md">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.34, ease: EASE_SPRING }}
            className="pointer-events-auto relative"
            onClick={handleClick}
            role={hasTarget ? 'button' : undefined}
            aria-label={hasTarget ? '点击定位到对应条目' : undefined}
          >
            <div
              className={`glass flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-medium shadow-float ${
                isError
                  ? 'border-danger/30 text-danger'
                  : hasTarget
                  ? 'border-border text-text-primary hover:border-primary/50 transition-smooth'
                  : 'border-border text-text-primary'
              } ${cursor}`}
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.12, type: 'spring', stiffness: 500, damping: 18 }}
              >
                {isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} className="text-primary" />}
              </motion.span>
              <span className="flex-1">{toast.message}</span>
              {/* U-19 关闭按钮 */}
              <motion.button
                data-close-btn
                whileTap={{ scale: 0.85 }}
                onClick={(e) => { e.stopPropagation(); onDone() }}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-bg/60 text-text-tertiary transition-smooth hover:bg-bg hover:text-text-primary"
                aria-label="关闭"
              >
                <X size={13} />
              </motion.button>
            </div>

            {/* U-19 进度条 */}
            {showProgress && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-2 h-1 overflow-hidden rounded-full bg-bg/80"
              >
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progressValue * 100}%` }}
                  transition={{ duration: 0.05, ease: EASE }}
                />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}