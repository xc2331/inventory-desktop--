// Electron 主进程：窗口、数据库（含分类/位置树/设置）、IPC、文件对话框、中文菜单
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const Database = require('better-sqlite3')

let mainWindow = null
let db = null

const DB_FILENAME = 'inventory.db'
const SETTINGS_FILE = 'settings.json' // 应用级设置（语言、数据目录），独立于数据库存放

// ===== 应用级设置（语言、数据目录），存于 userData/settings.json =====
function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

function readAppSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8')
    return JSON.parse(raw)
  } catch (e) {
    return {}
  }
}

function writeAppSettings(obj) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(obj, null, 2), 'utf-8')
}

// 数据库路径：优先使用设置中的 dataDir，否则使用默认 userData
function resolveDbPath() {
  const s = readAppSettings()
  if (s.dataDir && fs.existsSync(s.dataDir)) {
    return path.join(s.dataDir, DB_FILENAME)
  }
  return path.join(app.getPath('userData'), DB_FILENAME)
}

function getBackupPath(dbPath) {
  return dbPath + '.backup'
}

// 启动时自动备份数据库文件（.db.backup）
function backupDatabase() {
  const dbPath = resolveDbPath()
  const backupPath = getBackupPath(dbPath)
  try {
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath)
      console.log('[backup] 已备份数据库到', backupPath)
    }
  } catch (e) {
    console.error('[backup] 备份失败:', e)
  }
}

// 默认分类（key 与手机端一致，如 electronic）
const DEFAULT_CATEGORIES = [
  { key: 'electronic', name: '电子产品', name_en: 'Electronics', icon: '🔌' },
  { key: 'food', name: '食品', name_en: 'Food', icon: '🍱' },
  { key: 'beverage', name: '饮料', name_en: 'Beverage', icon: '🥤' },
  { key: 'daily', name: '日用品', name_en: 'Daily', icon: '🧴' },
  { key: 'kitchen', name: '厨房用品', name_en: 'Kitchen', icon: '🍳' },
  { key: 'cleaning', name: '清洁用品', name_en: 'Cleaning', icon: '🧹' },
  { key: 'medical', name: '医药', name_en: 'Medical', icon: '💊' },
  { key: 'stationery', name: '文具', name_en: 'Stationery', icon: '✏️' },
  { key: 'tools', name: '工具', name_en: 'Tools', icon: '🔧' },
  { key: 'other', name: '其他', name_en: 'Other', icon: '📦' }
]

// 初始化数据库：建表、索引、种子数据
function initDatabase() {
  backupDatabase()
  db = new Database(resolveDbPath())
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

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      name_en TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      parent_id TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);
  `)

  // 种子默认分类（仅在表为空时）
  const catCount = db.prepare('SELECT COUNT(*) c FROM categories').get().c
  if (catCount === 0) {
    const now = Date.now()
    const ins = db.prepare(
      'INSERT INTO categories (id,key,name,name_en,icon,sort_order,created_at,updated_at) VALUES (@id,@key,@name,@name_en,@icon,@sort_order,@created_at,@updated_at)'
    )
    DEFAULT_CATEGORIES.forEach((c, i) =>
      ins.run({
        id: crypto.randomUUID(),
        key: c.key,
        name: c.name,
        name_en: c.name_en,
        icon: c.icon,
        sort_order: i,
        created_at: now,
        updated_at: now
      })
    )
  }
}

// ===== 时间戳/格式转换：手机端用 ISO 字符串，数据库用毫秒时间戳 =====
function toMs(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  const t = Date.parse(v)
  return isNaN(t) ? Date.now() : t
}

function toIso(ms) {
  if (!ms) return new Date().toISOString()
  return new Date(ms).toISOString()
}

// 数据库行 -> 手机端格式（camelCase + ISO 时间）
function toPhoneItem(row) {
  return {
    id: row.id,
    name: row.name,
    itemNo: row.item_no,
    room: row.room,
    position: row.position,
    location: row.location,
    quantity: row.quantity,
    minQuantity: row.min_quantity,
    photo: row.photo,
    category: row.category,
    expiryDate: row.expiry_date || 0,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  }
}

// 导入行（兼容 camelCase 手机端 与 snake_case 旧桌面端）
function fromImportItem(r, now) {
  return {
    id: r.id || crypto.randomUUID(),
    name: r.name ?? '',
    item_no: r.itemNo ?? r.item_no ?? '',
    room: r.room ?? '',
    position: r.position ?? '',
    location: r.location ?? '',
    quantity: Number(r.quantity) || 0,
    min_quantity: Number(r.minQuantity ?? r.min_quantity) || 0,
    photo: r.photo ?? '',
    category: r.category ?? '',
    expiry_date: toMs(r.expiryDate ?? r.expiry_date),
    created_at: toMs(r.createdAt ?? r.created_at) || now,
    updated_at: toMs(r.updatedAt ?? r.updated_at) || now
  }
}

// ===== 中文应用菜单 =====
function buildMenu(lang) {
  const isZh = lang !== 'en'
  const t = (zh, en) => (isZh ? zh : en)
  const template = [
    {
      label: t('文件', 'File'),
      submenu: [
        {
          label: t('导入 JSON…', 'Import JSON…'),
          accelerator: 'CmdOrCtrl+I',
          click: () => mainWindow && mainWindow.webContents.send('menu:import')
        },
        {
          label: t('导出 JSON…', 'Export JSON…'),
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow && mainWindow.webContents.send('menu:export-json')
        },
        {
          label: t('导出 CSV…', 'Export CSV…'),
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => mainWindow && mainWindow.webContents.send('menu:export-csv')
        },
        { type: 'separator' },
        { label: t('退出', 'Quit'), role: 'quit' }
      ]
    },
    {
      label: t('编辑', 'Edit'),
      submenu: [
        { label: t('撤销', 'Undo'), role: 'undo' },
        { label: t('重做', 'Redo'), role: 'redo' },
        { type: 'separator' },
        { label: t('剪切', 'Cut'), role: 'cut' },
        { label: t('复制', 'Copy'), role: 'copy' },
        { label: t('粘贴', 'Paste'), role: 'paste' },
        { label: t('全选', 'Select All'), role: 'selectAll' }
      ]
    },
    {
      label: t('视图', 'View'),
      submenu: [
        { label: t('重新加载', 'Reload'), role: 'reload' },
        { label: t('强制重新加载', 'Force Reload'), role: 'forceReload' },
        { label: t('开发者工具', 'Toggle Developer Tools'), role: 'toggleDevTools' },
        { type: 'separator' },
        { label: t('放大', 'Zoom In'), role: 'zoomIn' },
        { label: t('缩小', 'Zoom Out'), role: 'zoomOut' },
        { label: t('重置缩放', 'Reset Zoom'), role: 'resetZoom' },
        { type: 'separator' },
        { label: t('全屏', 'Toggle Fullscreen'), role: 'togglefullscreen' }
      ]
    },
    {
      label: t('帮助', 'Help'),
      submenu: [
        {
          label: t('关于 家庭物资管家', 'About Family Inventory'),
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: t('关于', 'About'),
              message: '家庭物资管家 / Family Inventory',
              detail: t(
                '家庭物品本地管理工具\n数据与手机端兼容\nMIT License',
                'Local home inventory manager\nCompatible with mobile data\nMIT License'
              ),
              buttons: ['OK']
            })
          }
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const settings = readAppSettings()
  const isDarkTheme =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && require('electron').nativeTheme.shouldUseDarkColors)
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: '家庭物资管家',
    backgroundColor: isDarkTheme ? '#0f172a' : '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  })

  const isDev = process.env.DEV === 'true'
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// ===== IPC：通用数据库查询/执行（参数化，防注入）=====
ipcMain.handle('db:query', (_event, { sql, binds }) => {
  const stmt = db.prepare(sql)
  if (binds == null) return stmt.all()
  if (Array.isArray(binds)) return stmt.all(...binds)
  return stmt.all(binds)
})

ipcMain.handle('db:execute', (_event, { sql, binds }) => {
  const stmt = db.prepare(sql)
  let info
  if (binds == null) info = stmt.run()
  else if (Array.isArray(binds)) info = stmt.run(...binds)
  else info = stmt.run(binds)
  return { changes: info.changes, lastInsertRowid: info.lastInsertRowid }
})

// ===== IPC：应用设置（语言、数据目录）=====
ipcMain.handle('settings:get', () => readAppSettings())

ipcMain.handle('settings:set', (_event, patch) => {
  const cur = readAppSettings()
  const next = { ...cur, ...patch }
  writeAppSettings(next)
  if (patch.language) buildMenu(patch.language)
  return next
})

// 切换数据目录：复制现有数据库到新目录并重开
ipcMain.handle('settings:setDataDir', async (_event, newDir) => {
  if (!newDir) return { ok: false, error: 'empty dir' }
  try {
    fs.mkdirSync(newDir, { recursive: true })
    const oldPath = resolveDbPath()
    const newPath = path.join(newDir, DB_FILENAME)
    // 关闭当前数据库
    try {
      db.close()
    } catch (e) {
      /* ignore */
    }
    // 复制现有 db 及其 WAL/SHM 到新位置（若存在）
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(oldPath + suffix)) {
        fs.copyFileSync(oldPath + suffix, newPath + suffix)
      }
    }
    // 更新设置
    const s = readAppSettings()
    s.dataDir = newDir
    writeAppSettings(s)
    // 重新打开
    db = new Database(newPath)
    db.pragma('journal_mode = WAL')
    return { ok: true, dataDir: newDir }
  } catch (e) {
    // 失败时尝试恢复
    try {
      db = new Database(resolveDbPath())
    } catch (e2) {
      /* ignore */
    }
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('settings:resetDataDir', async () => {
  const s = readAppSettings()
  delete s.dataDir
  writeAppSettings(s)
  return { ok: true }
})

// 选择文件夹对话框
ipcMain.handle('dialog:pickFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || res.filePaths.length === 0) return { canceled: true }
  return { canceled: false, path: res.filePaths[0] }
})

// ===== IPC：分类 CRUD =====
ipcMain.handle('categories:list', () => {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC').all()
})

ipcMain.handle('categories:create', (_event, { key, name, name_en, icon }) => {
  const now = Date.now()
  const id = crypto.randomUUID()
  const maxOrder = db.prepare('SELECT MAX(sort_order) m FROM categories').get().m || 0
  db.prepare(
    'INSERT INTO categories (id,key,name,name_en,icon,sort_order,created_at,updated_at) VALUES (@id,@key,@name,@name_en,@icon,@sort_order,@created_at,@updated_at)'
  ).run({
    id,
    key: (key || '').trim() || 'cat_' + id.slice(0, 8),
    name: name || '',
    name_en: name_en || '',
    icon: icon || '',
    sort_order: maxOrder + 1,
    created_at: now,
    updated_at: now
  })
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id)
})

ipcMain.handle('categories:update', (_event, { id, patch }) => {
  const cur = db.prepare('SELECT * FROM categories WHERE id = ?').get(id)
  if (!cur) return null
  const next = {
    ...cur,
    ...patch,
    updated_at: Date.now()
  }
  db.prepare(
    'UPDATE categories SET key=@key,name=@name,name_en=@name_en,icon=@icon,updated_at=@updated_at WHERE id=@id'
  ).run(next)
  return next
})

ipcMain.handle('categories:delete', (_event, { id }) => {
  // 删除分类时，将该分类下的物品归到 "other"
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id)
  if (cat && cat.key !== 'other') {
    db.prepare('UPDATE items SET category = ?, updated_at = ? WHERE category = ?').run(
      'other',
      Date.now(),
      cat.key
    )
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(id)
  return { ok: true }
})

ipcMain.handle('categories:reorder', (_event, { ids }) => {
  const stmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?')
  const tx = db.transaction(() => {
    ids.forEach((id, i) => stmt.run(i, id))
  })
  tx()
  return { ok: true }
})

// ===== IPC：位置树 CRUD =====
ipcMain.handle('locations:list', () => {
  return db.prepare('SELECT * FROM locations ORDER BY sort_order ASC, created_at ASC').all()
})

ipcMain.handle('locations:create', (_event, { name, parentId }) => {
  const now = Date.now()
  const id = crypto.randomUUID()
  const maxOrder =
    db.prepare('SELECT MAX(sort_order) m FROM locations WHERE parent_id IS ? OR parent_id = ?').get(
      parentId || null,
      parentId || ''
    ).m || 0
  db.prepare(
    'INSERT INTO locations (id,name,parent_id,sort_order,created_at,updated_at) VALUES (@id,@name,@parent_id,@sort_order,@created_at,@updated_at)'
  ).run({
    id,
    name: name || '',
    parent_id: parentId || '',
    sort_order: maxOrder + 1,
    created_at: now,
    updated_at: now
  })
  return db.prepare('SELECT * FROM locations WHERE id = ?').get(id)
})

ipcMain.handle('locations:update', (_event, { id, patch }) => {
  const cur = db.prepare('SELECT * FROM locations WHERE id = ?').get(id)
  if (!cur) return null
  const next = { ...cur, ...patch, updated_at: Date.now() }
  db.prepare('UPDATE locations SET name=@name,parent_id=@parent_id,updated_at=@updated_at WHERE id=@id').run(
    {
      id,
      name: next.name,
      parent_id: next.parent_id || '',
      updated_at: next.updated_at
    }
  )
  return next
})

ipcMain.handle('locations:delete', (_event, { id }) => {
  // 递归删除子节点
  const toDelete = [id]
  let changed = true
  while (changed) {
    changed = false
    const ph = toDelete.map(() => '?').join(',')
    const children = db.prepare(`SELECT id FROM locations WHERE parent_id IN (${ph})`).all(...toDelete)
    for (const c of children) {
      if (!toDelete.includes(c.id)) {
        toDelete.push(c.id)
        changed = true
      }
    }
  }
  const ph = toDelete.map(() => '?').join(',')
  db.prepare(`DELETE FROM locations WHERE id IN (${ph})`).run(...toDelete)
  return { ok: true, deleted: toDelete.length }
})

// ===== 导入辅助：自动创建缺失分类 =====
function ensureCategoriesFromItems(items) {
  const existing = db.prepare('SELECT key FROM categories').all().map((r) => r.key)
  const seen = new Set(existing)
  const now = Date.now()
  let maxOrder = db.prepare('SELECT MAX(sort_order) m FROM categories').get().m || 0
  const ins = db.prepare(
    'INSERT INTO categories (id,key,name,name_en,icon,sort_order,created_at,updated_at) VALUES (@id,@key,@name,@name_en,@icon,@sort_order,@created_at,@updated_at)'
  )
  for (const r of items) {
    const key = String(r.category || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    maxOrder += 1
    ins.run({
      id: crypto.randomUUID(),
      key,
      name: key,
      name_en: '',
      icon: '📦',
      sort_order: maxOrder,
      created_at: now,
      updated_at: now
    })
  }
}

// 解析物品的位置层级路径
function parseItemLocationPath(item) {
  if (item.location) {
    const parts = String(item.location).split(/\s*>\s*/).filter(Boolean)
    if (parts.length) return parts
  }
  const path = []
  if (item.room) path.push(String(item.room).trim())
  if (item.position && item.position !== item.room) path.push(String(item.position).trim())
  return path
}

// ===== 导入辅助：自动根据 location 创建位置树 =====
function ensureLocationsFromItems(items) {
  const now = Date.now()
  const rows = db.prepare('SELECT * FROM locations').all()
  const existing = new Map()
  rows.forEach((r) => existing.set(`${r.parent_id || ''}|${r.name}`, r))

  const createNode = (name, parentId) => {
    const id = crypto.randomUUID()
    const siblings =
      db
        .prepare('SELECT MAX(sort_order) m FROM locations WHERE parent_id IS ? OR parent_id = ?')
        .get(parentId || null, parentId || '').m || 0
    db.prepare(
      'INSERT INTO locations (id,name,parent_id,sort_order,created_at,updated_at) VALUES (@id,@name,@parent_id,@sort_order,@created_at,@updated_at)'
    ).run({
      id,
      name,
      parent_id: parentId || '',
      sort_order: siblings + 1,
      created_at: now,
      updated_at: now
    })
    return { id, name, parent_id: parentId || '' }
  }

  for (const item of items) {
    const path = parseItemLocationPath(item)
    if (!path.length) continue
    let parentId = ''
    for (const name of path) {
      const key = `${parentId}|${name}`
      let node = existing.get(key)
      if (!node) {
        node = createNode(name, parentId)
        existing.set(key, node)
      }
      parentId = node.id
    }
  }
}

// ===== IPC：JSON 导出/导入，CSV 导出 =====
ipcMain.handle('sync:exportData', () => {
  const items = db.prepare('SELECT * FROM items').all()
  const data = {
    version: 1,
    export_time: Date.now(),
    items: items.map(toPhoneItem)
  }
  return JSON.stringify(data, null, 2)
})

ipcMain.handle('sync:importData', (_event, jsonString) => {
  const parsed = JSON.parse(jsonString)
  const items = Array.isArray(parsed) ? parsed : parsed.items || []
  const now = Date.now()
  const insertSql = `
    INSERT INTO items
      (id, name, item_no, room, position, location, quantity, min_quantity, photo, category, expiry_date, created_at, updated_at)
    VALUES (@id, @name, @item_no, @room, @position, @location, @quantity, @min_quantity, @photo, @category, @expiry_date, @created_at, @updated_at)
  `
  const delStmt = db.prepare('DELETE FROM items')
  const insStmt = db.prepare(insertSql)
  const tx = db.transaction((rows) => {
    ensureCategoriesFromItems(rows)
    ensureLocationsFromItems(rows)
    delStmt.run()
    for (const r of rows) {
      insStmt.run(fromImportItem(r, now))
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
  const settings = readAppSettings()
  buildMenu(settings.language || 'zh')
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
    /* ignore */
  }
})
