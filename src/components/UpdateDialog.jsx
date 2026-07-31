import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Loader2, RefreshCw, CheckCircle2, AlertCircle, ArrowUpCircle } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { EASE, EASE_SPRING } from '../lib/motion'
import { cn } from '../lib/cn'

export default function UpdateDialog({
  open,
  status, // 'idle' | 'checking' | 'downloading' | 'installing' | 'error' | 'notAvailable'
  info,
  progress,
  onCheck,
  onDownload,
  onClose
}) {
  const { t } = useI18n()

  useEffect(() => {
    if (!open && status !== 'idle') {
      // 由外部控制关闭，不自动重置
    }
  }, [open, status])

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
            className="w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-float"
          >
            <div className="p-6">
              <Header status={status} info={info} />

              {status === 'available' && (
                <div className="mt-4 space-y-3">
                  {info.releaseNotes && (
                    <div className="max-h-32 overflow-y-auto rounded-xl bg-bg p-3 text-sm leading-relaxed text-text-secondary">
                      {info.releaseNotes}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-text-tertiary">
                    <ArrowUpCircle size={14} />
                    <span>{t('update_current')} {info.currentVersion}</span>
                    <span className="text-border">→</span>
                    <span className="font-medium text-primary">{info.latestVersion}</span>
                  </div>
                  {info.releaseDate && (
                    <p className="text-xs text-text-tertiary">
                      {t('update_releaseDate')}: {info.releaseDate}
                    </p>
                  )}
                </div>
              )}

              {status === 'downloading' && (
                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-text-tertiary">
                    <span>{t('update_downloading')}</span>
                    <span>{progress.percent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-bg">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress.percent}%` }}
                      transition={{ duration: 0.3, ease: EASE }}
                    />
                  </div>
                  <p className="text-xs text-text-tertiary">
                    {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
                  </p>
                </div>
              )}

              {status === 'installing' && (
                <div className="mt-5 flex flex-col items-center gap-3 text-text-secondary">
                  <Loader2 size={28} className="animate-spin text-primary" />
                  <p className="text-sm">{t('update_installing')}</p>
                </div>
              )}

              {status === 'error' && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{info?.message || t('update_error')}</span>
                </div>
              )}

              {status === 'notAvailable' && (
                <div className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
                  <CheckCircle2 size={16} className="text-primary" />
                  <span>{t('update_noUpdate')} ({info.currentVersion})</span>
                </div>
              )}
            </div>

            <Footer
              status={status}
              onCheck={onCheck}
              onDownload={onDownload}
              onClose={onClose}
              t={t}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Header({ status, info }) {
  const { t } = useI18n()
  const map = {
    idle: { icon: <RefreshCw size={22} />, title: t('update_title') },
    checking: { icon: <Loader2 size={22} className="animate-spin" />, title: t('update_checking') },
    available: { icon: <ArrowUpCircle size={22} className="text-primary" />, title: t('update_available') },
    downloading: { icon: <Download size={22} className="text-primary" />, title: t('update_downloading') },
    installing: { icon: <Loader2 size={22} className="animate-spin text-primary" />, title: t('update_installing') },
    error: { icon: <AlertCircle size={22} className="text-danger" />, title: t('update_title') },
    notAvailable: { icon: <CheckCircle2 size={22} className="text-primary" />, title: t('update_upToDate') }
  }
  const m = map[status] || map.idle
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        {m.icon}
      </div>
      <div>
        <h3 className="text-base font-semibold text-text-primary">{m.title}</h3>
        {status === 'idle' && (
          <p className="mt-0.5 text-sm text-text-tertiary">{t('update_desc')}</p>
        )}
      </div>
    </div>
  )
}

function Footer({ status, onCheck, onDownload, onClose, t }) {
  const buttons = []
  if (status === 'idle' || status === 'error' || status === 'notAvailable') {
    buttons.push(
      <motion.button
        key="check"
        whileTap={{ scale: 0.96 }}
        onClick={onCheck}
        className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
      >
        <RefreshCw size={15} />
        {t('update_btn_check')}
      </motion.button>
    )
  }
  if (status === 'available') {
    buttons.push(
      <motion.button
        key="download"
        whileTap={{ scale: 0.96 }}
        onClick={onDownload}
        className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
      >
        <Download size={15} />
        {t('update_btn_download')}
      </motion.button>
    )
  }
  if (status === 'downloading') {
    buttons.push(
      <motion.button
        key="downloading"
        disabled
        className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-tertiary opacity-60"
      >
        <Loader2 size={15} className="animate-spin" />
        {t('update_downloading')}
      </motion.button>
    )
  }
  if (status === 'installing') {
    buttons.push(
      <motion.button
        key="installing"
        disabled
        className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-tertiary opacity-60"
      >
        <Loader2 size={15} className="animate-spin" />
        {t('update_installing')}
      </motion.button>
    )
  }

  return (
    <div className="flex justify-end gap-2 border-t border-border bg-bg/50 px-6 py-3.5">
      {status !== 'installing' && (
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onClose}
          className={cn(
            'rounded-xl border border-border px-4 py-2 text-sm font-medium transition-smooth',
            status === 'downloading' ? 'opacity-50' : 'bg-surface text-text-secondary hover:bg-surface-hover'
          )}
          disabled={status === 'downloading'}
        >
          {t('btn_cancel')}
        </motion.button>
      )}
      {buttons}
    </div>
  )
}

function formatBytes(n) {
  if (!n || isNaN(n)) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}
