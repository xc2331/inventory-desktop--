// preload：通过 contextBridge 安全暴露 window.lingguang API
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('lingguang', {
  db: {
    query: ({ sql, binds }) => ipcRenderer.invoke('db:query', { sql, binds }),
    execute: ({ sql, binds }) => ipcRenderer.invoke('db:execute', { sql, binds })
  },
  sync: {
    exportData: () => ipcRenderer.invoke('sync:exportData'),
    importData: (jsonString) => ipcRenderer.invoke('sync:importData', jsonString),
    exportCSV: () => ipcRenderer.invoke('sync:exportCSV')
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
    setApiConfig: (patch) => ipcRenderer.invoke('settings:setApiConfig', patch)
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
    pickImage: () => ipcRenderer.invoke('dialog:pickImage')
  },
  items: {
    generateItemNo: () => ipcRenderer.invoke('items:generateItemNo')
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
    }
  },
  updater: {
    info: () => ipcRenderer.invoke('updater:info'),
    check: (opts) => ipcRenderer.invoke('updater:check', opts),
    setSource: (sourceId) => ipcRenderer.invoke('updater:setSource', sourceId),
    setMirror: (url) => ipcRenderer.invoke('updater:setMirror', url),
    setAutoCheck: (enabled) => ipcRenderer.invoke('updater:setAutoCheck', enabled),
    download: () => ipcRenderer.invoke('updater:download'),
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
