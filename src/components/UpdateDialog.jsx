import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Loader2, RefreshCw, CheckCircle2, AlertCircle, ArrowUpCircle, ExternalLink, FolderOpen, Play, FolderInput } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { EASE, EASE_SPRING } from '../lib/motion'
import { cn } from '../lib/cn'

export default function UpdateDialog({
  open,
  status, // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error' | 'notAvailable'
  info,
  progress,
  downloadPath,
  onCheck,
  onDownload,
  onCancelDownload,
  onInstall,
  onShowInFolder,
  onPickDownloadDir,
  onClose,
  onOpenExternal
}) {
  const { t } = useI18n()
  const [pathCopied, setPathCopied] = useState(false)

  useEffect(() => {
    if (!open) setPathCopied(false)
  }, [open])

  const copyPath = () => {
    if (!downloadPath) return
    navigator.clipboard.writeText(downloadPath).then(() => {
      setPathCopied(true)
      setTimeout(() => setPathCopied(false), 2000)
    })
  }

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
                  {info.sourceName && (
                    <p className="text-xs text-text-tertiary">
                      更新源：{info.sourceName}
                    </p>
                  )}
                  <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    点击「立即更新」后，会先弹出窗口让你选择更新包保存位置（首次），然后开始下载。
                  </p>
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
                  <div className="flex items-center justify-between text-xs text-text-tertiary">
                    <span>{formatBytes(progress.downloaded)} / {formatBytes(progress.total)}</span>
                    {info.sourceName && <span>来源：{info.sourceName}</span>}
                  </div>
                  {info.path && (
                    <p className="truncate text-[11px] text-text-tertiary" title={info.path}>
                      保存到：{info.path}
                    </p>
                  )}
                </div>
              )}

              {status === 'downloaded' && (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <CheckCircle2 size={18} className="text-primary" />
                    <span>更新包已下载完成</span>
                  </div>
                  <div className="rounded-xl bg-bg p-3">
                    <p className="mb-1 text-xs text-text-tertiary">文件位置：</p>
                    <div className="flex items-start gap-2">
                      <p
                        className="flex-1 cursor-pointer break-all text-xs text-text-secondary hover:text-primary"
                        title="点击复制路径"
                        onClick={copyPath}
                      >
                        {downloadPath || info?.path || '—'}
                      </p>
                      {pathCopied && (
                        <span className="shrink-0 text-[11px] text-primary">已复制</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={onShowInFolder}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary transition-smooth hover:text-primary-hover"
                    >
                      <FolderOpen size={12} />
                      在文件夹中显示
                    </button>
                  </div>
                </div>
              )}

              {status === 'installing' && (
                <div className="mt-5 flex flex-col items-center gap-3 text-text-secondary">
                  <Loader2 size={28} className="animate-spin text-primary" />
                  <p className="text-sm">{t('update_installing')}</p>
                </div>
              )}

              {status === 'error' && (
                <div className="mt-4 space-y-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span className="font-medium">{info?.message || t('update_error')}</span>
                  </div>
                  {info?.solution && (
                    <p className="pl-6 text-xs leading-relaxed text-danger/80">
                      解决方案：{info.solution}
                    </p>
                  )}
                  {info?.manualUrls && onOpenExternal && (
                    <div className="pl-6 flex flex-wrap gap-2 pt-1">
                      <ManualBtn onClick={() => onOpenExternal(info.manualUrls.gitee)}>
                        Gitee 手动下载
                      </ManualBtn>
                      <ManualBtn onClick={() => onOpenExternal(info.manualUrls.github)}>
                        GitHub 手动下载
                      </ManualBtn>
                    </div>
                  )}
                </div>
              )}

              {status === 'notAvailable' && (
                <div className="mt-4 flex flex-col gap-2 text-sm text-text-secondary">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-primary" />
                    <span>{t('update_noUpdate')} ({info.currentVersion})</span>
                  </div>
                  {info.sourceName && (
                    <p className="pl-6 text-xs text-text-tertiary">检查源：{info.sourceName}</p>
                  )}
                </div>
              )}
            </div>

            <Footer
              status={status}
              info={info}
              downloadPath={downloadPath}
              onCheck={onCheck}
              onDownload={onDownload}
              onCancelDownload={onCancelDownload}
              onInstall={onInstall}
              onShowInFolder={onShowInFolder}
              onPickDownloadDir={onPickDownloadDir}
              onClose={onClose}
              onOpenExternal={onOpenExternal}
              t={t}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ManualBtn({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-danger/30 bg-surface px-2.5 py-1.5 text-xs font-medium text-danger transition-smooth hover:bg-danger/10"
    >
      <ExternalLink size={12} />
      {children}
    </button>
  )
}

function Header({ status, info }) {
  const { t } = useI18n()
  const map = {
    idle: { icon: <RefreshCw size={22} />, title: t('update_title') },
    checking: { icon: <Loader2 size={22} className="animate-spin" />, title: t('update_checking') },
    available: { icon: <ArrowUpCircle size={22} className="text-primary" />, title: t('update_available') },
    downloading: { icon: <Download size={22} className="text-primary" />, title: t('update_downloading') },
    downloaded: { icon: <CheckCircle2 size={22} className="text-primary" />, title: '下载完成' },
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

function Footer({
  status,
  info,
  downloadPath,
  onCheck,
  onDownload,
  onCancelDownload,
  onInstall,
  onShowInFolder,
  onPickDownloadDir,
  onClose,
  onOpenExternal,
  t
}) {
  const canClose = status !== 'installing'
  const isDownloading = status === 'downloading'
  const isDownloaded = status === 'downloaded'

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg/50 px-6 py-3.5">
      {/* 取消/关闭按钮 */}
      {canClose && (
        <button
          type="button"
          onClick={isDownloading ? onCancelDownload : onClose}
          className={cn(
            'rounded-xl border border-border px-4 py-2 text-sm font-medium transition-smooth',
            isDownloading
              ? 'bg-surface text-text-secondary hover:bg-danger-soft hover:text-danger hover:border-danger/30'
              : 'bg-surface text-text-secondary hover:bg-surface-hover'
          )}
        >
          {isDownloading ? '取消下载' : t('btn_cancel')}
        </button>
      )}

      {/* 下载位置设置 */}
      {(status === 'idle' || status === 'available' || status === 'notAvailable' || status === 'error') && onPickDownloadDir && (
        <button
          type="button"
          onClick={onPickDownloadDir}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
        >
          <FolderInput size={14} />
          下载位置
        </button>
      )}

      {/* 手动下载按钮 */}
      {status === 'error' && info?.manualUrls && onOpenExternal && (
        <button
          type="button"
          onClick={() => onOpenExternal(info.manualUrls.gitee)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition-smooth hover:bg-danger/10"
        >
          <ExternalLink size={14} />
          手动下载
        </button>
      )}

      {/* 检查更新 / 立即更新 / 安装 */}
      {(status === 'idle' || status === 'error' || status === 'notAvailable') && (
        <button
          type="button"
          onClick={onCheck}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
        >
          <RefreshCw size={15} />
          {t('update_btn_check')}
        </button>
      )}

      {status === 'available' && (
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
        >
          <Download size={15} />
          {t('update_btn_download')}
        </button>
      )}

      {isDownloading && (
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-tertiary opacity-60"
        >
          <Loader2 size={15} className="animate-spin" />
          {t('update_downloading')}
        </button>
      )}

      {isDownloaded && (
        <>
          <button
            type="button"
            onClick={onShowInFolder}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary transition-smooth hover:bg-surface-hover"
          >
            <FolderOpen size={15} />
            打开目录
          </button>
          <button
            type="button"
            onClick={onInstall}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-smooth hover:bg-primary-hover"
          >
            <Play size={15} />
            立即安装
          </button>
        </>
      )}

      {status === 'installing' && (
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-tertiary opacity-60"
        >
          <Loader2 size={15} className="animate-spin" />
          {t('update_installing')}
        </button>
      )}
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
