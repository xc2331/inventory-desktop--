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
  }
})
