// preload：通过 contextBridge 安全暴露 window.lingguang API
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('lingguang', {
  db: {
    // 通用查询，返回行数组
    query: ({ sql, binds }) => ipcRenderer.invoke('db:query', { sql, binds }),
    // 通用执行，返回 { changes, lastInsertRowid }
    execute: ({ sql, binds }) => ipcRenderer.invoke('db:execute', { sql, binds })
  },
  sync: {
    // 导出完整 JSON 字符串（与手机端结构兼容）
    exportData: () => ipcRenderer.invoke('sync:exportData'),
    // 导入并覆盖数据
    importData: (jsonString) => ipcRenderer.invoke('sync:importData', jsonString),
    // 导出 CSV 字符串
    exportCSV: () => ipcRenderer.invoke('sync:exportCSV')
  },
  file: {
    // 保存文件对话框（写入内容），返回 { canceled, filePath }
    save: ({ content, defaultName, filters }) =>
      ipcRenderer.invoke('file:save', { content, defaultName, filters }),
    // 打开文件对话框，返回 { canceled, filePath, content }
    open: ({ filters }) => ipcRenderer.invoke('file:open', { filters })
  }
})
