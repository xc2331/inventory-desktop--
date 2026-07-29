// Electron 主进程：窗口、数据库、IPC、文件对话框
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const Database = require('better-sqlite3')

let mainWindow = null
let db = null

const DB_FILENAME = 'inventory.db'

function getDbPath() {
  return path.join(app.getPath('userData'), DB_FILENAME)
}

function getBackupPath() {
  return path.join(app.getPath('userData'), DB_FILENAME + '.backup')
}

// 启动时自动备份数据库文件（.db.backup）
function backupDatabase() {
  const dbPath = getDbPath()
  const backupPath = getBackupPath()
  try {
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath)
      console.log('[backup] 已备份数据库到', backupPath)
    }
  } catch (e) {
    console.error('[backup] 备份失败:', e)
  }
}

// 初始化数据库：建表、索引
function initDatabase() {
  backupDatabase()
  db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      item_no TEXT DEFAULT '',
      room TEXT DEFAULT '',
      position TEXT DEFAULT '',
      location TEXT DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      min_quantity INTEGER NOT NULL DEFAULT 0,
      photo TEXT DEFAULT '',
      category TEXT DEFAULT '',
      expiry_date INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
    CREATE INDEX IF NOT EXISTS idx_items_room ON items(room);
  `)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: '家庭物资管家',
    backgroundColor: '#fafaf9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const isDev = process.env.DEV === 'true'
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// ===== IPC：通用数据库查询/执行（参数化，防注入）=====
ipcMain.handle('db:query', (_event, { sql, binds }) => {
  const stmt = db.prepare(sql)
  return stmt.all(...(binds || []))
})

ipcMain.handle('db:execute', (_event, { sql, binds }) => {
  const stmt = db.prepare(sql)
  const info = stmt.run(...(binds || []))
  return { changes: info.changes, lastInsertRowid: info.lastInsertRowid }
})

// ===== IPC：JSON 导出/导入，CSV 导出 =====
ipcMain.handle('sync:exportData', () => {
  const items = db.prepare('SELECT * FROM items').all()
  const data = {
    version: 1,
    export_time: Date.now(),
    items
  }
  return JSON.stringify(data, null, 2)
})

ipcMain.handle('sync:importData', (_event, jsonString) => {
  // 解析手机端导出的 JSON（兼容 {items:[...]} 或纯数组）
  const parsed = JSON.parse(jsonString)
  const items = Array.isArray(parsed) ? parsed : (parsed.items || [])
  const now = Date.now()
  const insertSql = `
    INSERT INTO items
      (id, name, item_no, room, position, location, quantity, min_quantity, photo, category, expiry_date, created_at, updated_at)
    VALUES (@id, @name, @item_no, @room, @position, @location, @quantity, @min_quantity, @photo, @category, @expiry_date, @created_at, @updated_at)
  `
  const delStmt = db.prepare('DELETE FROM items')
  const insStmt = db.prepare(insertSql)
  // 覆盖式导入：事务内先清空再写入，保证原子性
  const tx = db.transaction((rows) => {
    delStmt.run()
    for (const r of rows) {
      insStmt.run({
        id: r.id || crypto.randomUUID(),
        name: r.name ?? '',
        item_no: r.item_no ?? '',
        room: r.room ?? '',
        position: r.position ?? '',
        location: r.location ?? '',
        quantity: Number(r.quantity) || 0,
        min_quantity: Number(r.min_quantity) || 0,
        photo: r.photo ?? '',
        category: r.category ?? '',
        expiry_date: Number(r.expiry_date) || 0,
        created_at: Number(r.created_at) || now,
        updated_at: Number(r.updated_at) || now
      })
    }
  })
  tx(items)
  return { imported: items.length }
})

function csvEscape(val) {
  const s = String(val ?? '')
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

ipcMain.handle('sync:exportCSV', () => {
  const items = db.prepare('SELECT * FROM items').all()
  const headers = [
    'id', 'name', 'item_no', 'category', 'room', 'position', 'location',
    'quantity', 'min_quantity', 'expiry_date', 'created_at', 'updated_at'
  ]
  const lines = [headers.join(',')]
  for (const it of items) {
    lines.push(headers.map((h) => csvEscape(it[h])).join(','))
  }
  // 加 BOM 以便 Excel 正确识别 UTF-8
  return '\uFEFF' + lines.join('\r\n')
})

// ===== IPC：文件保存/打开对话框 =====
ipcMain.handle('file:save', async (_event, { content, defaultName, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'export.json',
    filters: filters || [{ name: '所有文件', extensions: ['*'] }]
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  fs.writeFileSync(result.filePath, content, 'utf-8')
  return { canceled: false, filePath: result.filePath }
})

ipcMain.handle('file:open', async (_event, { filters }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: '所有文件', extensions: ['*'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }
  const content = fs.readFileSync(result.filePaths[0], 'utf-8')
  return { canceled: false, filePath: result.filePaths[0], content }
})

// ===== 应用生命周期 =====
app.whenReady().then(() => {
  initDatabase()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  try {
    if (db) db.close()
  } catch (e) {
    // 忽略关闭错误
  }
})
