// preload：通过 contextBridge 安全暴露 window.lingguang API
// 注意：preload 环境下 require('electron') 不包含 app（app 仅主进程可用），
// 数据目录必须通过主进程同步 IPC 获取（app:getDataDirSync，懒加载缓存一次）
const { contextBridge, ipcRenderer } = require('electron')
const path = require('path')

let cachedDataDir = null

// 从主进程同步获取 dataDir（结果缓存；失败返回空串，由调用方走 IPC 兜底链）
function resolveDataDir() {
  if (cachedDataDir !== null) return cachedDataDir
  try {
    const dir = ipcRenderer.sendSync('app:getDataDirSync')
    cachedDataDir = typeof dir === 'string' ? dir : ''
  } catch (e) {
    console.warn('[photo.url] sendSync getDataDir failed:', e?.message)
    cachedDataDir = ''
  }
  return cachedDataDir
}

contextBridge.exposeInMainWorld('lingguang', {
  invoke: async (channel, data) => ipcRenderer.invoke(channel, data),
  diag: {
    log: async (msg) => ipcRenderer.invoke('diag:log', msg),
    invoke: async (channel, data) => ipcRenderer.invoke(channel, data)
  },
  db: {
    query: ({ sql, binds }) => ipcRenderer.invoke('db:query', { sql, binds }),
    execute: ({ sql, binds }) => ipcRenderer.invoke('db:execute', { sql, binds })
  },
  sync: {
    exportData: () => ipcRenderer.invoke('sync:exportData'),
    exportByIds: (ids) => ipcRenderer.invoke('sync:exportByIds', ids),
    exportCSV: () => ipcRenderer.invoke('sync:exportCSV'),
    exportExpiringReport: () => ipcRenderer.invoke('sync:exportExpiringReport'),
    importData: (jsonString, mode) => ipcRenderer.invoke('sync:importData', { jsonString, mode }),
    rebuildCategories: () => ipcRenderer.invoke('sync:rebuildCategories'),
    rebuildLocations: () => ipcRenderer.invoke('sync:rebuildLocations'),
    stats: () => ipcRenderer.invoke('sync:stats')
  },
  file: {
    save: ({ content, defaultName, filters }) =>
      ipcRenderer.invoke('file:save', { content, defaultName, filters }),
    open: ({ filters }) => ipcRenderer.invoke('file:open', { filters })
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    openPath: (target) => ipcRenderer.invoke('shell:openPath', target),
    showItemInFolder: (target) => ipcRenderer.invoke('shell:showItemInFolder', target)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    setDataDir: (dir) => ipcRenderer.invoke('settings:setDataDir', dir),
    resetDataDir: () => ipcRenderer.invoke('settings:resetDataDir'),
    getApiToken: () => ipcRenderer.invoke('settings:getApiToken'),
    resetApiToken: () => ipcRenderer.invoke('settings:resetApiToken'),
    setApiConfig: (patch) => ipcRenderer.invoke('settings:setApiConfig', patch),
    getMaterialTypes: () => ipcRenderer.invoke('settings:getMaterialTypes'),
    setMaterialTypes: (types) => ipcRenderer.invoke('settings:setMaterialTypes', types)
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
    pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
    pickFile: () => ipcRenderer.invoke('dialog:pickFile')
  },
  items: {
    generateItemNo: () => ipcRenderer.invoke('items:generateItemNo'),
    // 语义化写入：与外部 Agent API 共用主进程 services/items 实现
    create: (data) => ipcRenderer.invoke('items:create', data),
    update: (id, patch) => ipcRenderer.invoke('items:update', { id, patch }),
    setOrder: (orderedIds) => ipcRenderer.invoke('items:setOrder', orderedIds),
    batchDelete: (ids) => ipcRenderer.invoke('items:batchDelete', { ids }),
    batchUpdate: (field, value, ids) => ipcRenderer.invoke('items:batchUpdate', { field, value, ids }),
    batchChangeQty: (ids, type, value) => ipcRenderer.invoke('items:batchChangeQty', { ids, type, value })
  },
  photo: {
    save: async (base64, filename) => ipcRenderer.invoke('photo:save', { base64, filename }),
    saveFile: async (filePath, extension) => ipcRenderer.invoke('photo:saveFile', { filePath, extension }),
    read: async (relPath) => ipcRenderer.invoke('photo:read', relPath),
    delete: async (relPath) => ipcRenderer.invoke('photo:delete', relPath),
    // 同步：将相对路径转为 file:// URL（供 <img src> 直接引用）
    // 策略：能拼出绝对路径就返回 file:// URL；dataDir 未就绪或路径异常时返回相对路径
    // （触发 <img onError> → readPhoto IPC base64 兜底）
    url: (relPath) => {
      if (!relPath || typeof relPath !== 'string') return ''
      const trimmed = relPath.trim()
      if (!trimmed) return ''
      // data: / https: / file: 直接透传
      if (/^(data:|https?:|file:)/i.test(trimmed)) return trimmed
      try {
        const dataDir = resolveDataDir()
        if (!dataDir) {
          // 主进程同步通道不可用，走相对路径 → onError → IPC 兜底
          return trimmed
        }
        const normalized = path.normalize(path.join(dataDir, trimmed))
        if (!normalized.startsWith(dataDir)) {
          console.warn('[photo.url] path escape rejected:', trimmed, 'dataDir:', dataDir)
          return ''
        }
        return 'file:///' + normalized.replace(/\\/g, '/').replace(/^\/+/, '')
      } catch (e) {
        console.warn('[photo.url] error:', e?.message, '| relPath:', trimmed)
        // 返回相对路径触发兜底
        return trimmed
      }
    }
  },
  materials: {
    list: (opts) => ipcRenderer.invoke('materials:list', opts),
    get: (id) => ipcRenderer.invoke('materials:get', id),
    create: (data) => ipcRenderer.invoke('materials:create', data),
    update: (id, patch) => ipcRenderer.invoke('materials:update', { id, patch }),
    delete: (id) => ipcRenderer.invoke('materials:delete', id),
    bulkDelete: (ids) => ipcRenderer.invoke('materials:bulkDelete', ids),
    bulkUpdateType: (ids, type) => ipcRenderer.invoke('materials:bulkUpdateType', { ids, type })
  },
  qrUpload: {
    start: () => ipcRenderer.invoke('qrUpload:start'),
    stop: () => ipcRenderer.invoke('qrUpload:stop'),
    getImage: () => ipcRenderer.invoke('qrUpload:getImage'),
    onImage: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('qrUpload:image', handler)
      return () => ipcRenderer.removeListener('qrUpload:image', handler)
    }
  },
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    setConfig: (patch) => ipcRenderer.invoke('ai:setConfig', patch),
    recognize: (image) => ipcRenderer.invoke('ai:recognize', { image }),
    fetchModels: (opts) => ipcRenderer.invoke('ai:fetchModels', opts || {}),
    testConnection: (opts) => ipcRenderer.invoke('ai:testConnection', opts || {}),
    // OCR：识别图片中所有文字，写入 item_ocr / material_ocr 独立表
    // image 可选；不传则用对应记录已存的 photo
    ocrItem: ({ id, image } = {}) => ipcRenderer.invoke('ai:ocrItem', { id, image }),
    ocrMaterial: ({ id, image } = {}) => ipcRenderer.invoke('ai:ocrMaterial', { id, image })
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb) => {
      ipcRenderer.on('window:maximizeChanged', (_e, isMax) => cb(isMax))
    },
    onRequestCloseAction: (cb) => {
      const handler = (_e) => cb()
      ipcRenderer.on('window:requestCloseAction', handler)
      return () => ipcRenderer.removeListener('window:requestCloseAction', handler)
    },
    resolveCloseAction: (payload) => ipcRenderer.invoke('window:resolveCloseAction', payload)
  },
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    create: ({ key, name, name_en, icon }) =>
      ipcRenderer.invoke('categories:create', { key, name, name_en, icon }),
    update: (id, patch) => ipcRenderer.invoke('categories:update', { id, patch }),
    delete: (id) => ipcRenderer.invoke('categories:delete', { id }),
    reorder: (ids) => ipcRenderer.invoke('categories:reorder', { ids }),
    merge: (fromKey, toKey) => ipcRenderer.invoke('categories:merge', { fromKey, toKey })
  },
  locations: {
    list: () => ipcRenderer.invoke('locations:list'),
    create: ({ name, parentId }) => ipcRenderer.invoke('locations:create', { name, parentId }),
    update: (id, patch) => ipcRenderer.invoke('locations:update', { id, patch }),
    delete: (id) => ipcRenderer.invoke('locations:delete', { id })
  },
  floorPlans: {
    get: (locationId) => ipcRenderer.invoke('floorPlans:get', { locationId }),
    set: (locationId, plan) => ipcRenderer.invoke('floorPlans:set', { locationId, plan }),
    delete: (locationId) => ipcRenderer.invoke('floorPlans:delete', { locationId }),
    createSubLocation: (parentId, name) => ipcRenderer.invoke('floorPlans:createSubLocation', { parentId, name })
  },
  menu: {
    onImport: (cb) => ipcRenderer.on('menu:import', cb),
    onExportJson: (cb) => ipcRenderer.on('menu:export-json', cb),
    onExportCsv: (cb) => ipcRenderer.on('menu:export-csv', cb)
  },
  agent: {
    onDataChanged: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('api:dataChanged', handler)
      return () => ipcRenderer.removeListener('api:dataChanged', handler)
    },
    onRecovered: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('main:dbRecovered', handler)
      return () => ipcRenderer.removeListener('main:dbRecovered', handler)
    }
  },
  updater: {
    info: () => ipcRenderer.invoke('updater:info'),
    check: (opts) => ipcRenderer.invoke('updater:check', opts),
    setSource: (sourceId) => ipcRenderer.invoke('updater:setSource', sourceId),
    setMirror: (url) => ipcRenderer.invoke('updater:setMirror', url),
    setAutoCheck: (enabled) => ipcRenderer.invoke('updater:setAutoCheck', enabled),
    getDownloadDir: () => ipcRenderer.invoke('updater:getDownloadDir'),
    setDownloadDir: (dir) => ipcRenderer.invoke('updater:setDownloadDir', dir),
    pickDownloadDir: () => ipcRenderer.invoke('updater:pickDownloadDir'),
    download: () => ipcRenderer.invoke('updater:download'),
    cancelDownload: () => ipcRenderer.invoke('updater:cancelDownload'),
    installDownloaded: () => ipcRenderer.invoke('updater:installDownloaded'),
    showDownloadInFolder: () => ipcRenderer.invoke('updater:showDownloadInFolder'),
    openExternal: (url) => ipcRenderer.invoke('updater:openExternal', url),
    onAvailable: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('updater:available', handler)
      return () => ipcRenderer.removeListener('updater:available', handler)
    },
    onNotAvailable: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('updater:notAvailable', handler)
      return () => ipcRenderer.removeListener('updater:notAvailable', handler)
    },
    onDownloadStart: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('updater:downloadStart', handler)
      return () => ipcRenderer.removeListener('updater:downloadStart', handler)
    },
    onProgress: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('updater:progress', handler)
      return () => ipcRenderer.removeListener('updater:progress', handler)
    },
    onDownloaded: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('updater:downloaded', handler)
      return () => ipcRenderer.removeListener('updater:downloaded', handler)
    },
    onInstalling: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('updater:installing', handler)
      return () => ipcRenderer.removeListener('updater:installing', handler)
    },
    onError: (cb) => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('updater:error', handler)
      return () => ipcRenderer.removeListener('updater:error', handler)
    }
  }
})
