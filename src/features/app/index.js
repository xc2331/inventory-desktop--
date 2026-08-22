// ===== features/app =====
// 应用级能力（窗口控制、更新、语言）重导出
export {
  winControl,
  getUpdaterInfo,
  checkUpdate,
  setUpdateSource,
  setAutoCheckUpdate,
  downloadUpdate,
  cancelDownloadUpdate,
  installDownloadedUpdate,
  showUpdateInFolder,
  getUpdateDownloadDir,
  pickUpdateDownloadDir,
  openUpdateExternal,
  onUpdateAvailable,
  onUpdateNotAvailable,
  onUpdateDownloadStart,
  onUpdateProgress,
  onUpdateDownloaded,
  onUpdateInstalling,
  onUpdateError
} from '../../lib/api'

export { default as UpdateDialog } from '../../components/UpdateDialog'
export { default as ShortcutPanel } from '../../components/ShortcutPanel'
export { default as CloseActionDialog } from '../../components/CloseActionDialog'
export { default as FloorPlanEditor } from '../../components/FloorPlanEditor'