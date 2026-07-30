// Electron 主进程：窗口、数据库（含分类/位置树/设置）、IPC、文件对话框、中文菜单
const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const { ApiServer } = require('./api-server')
const { generateItemNo } = require('./item-no')

// 确保 Windows 任务栏正确显示应用图标与分组
app.setAppUserModelId(app.getName())

const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar', 'build', 'icon.ico')
  : path.join(__dirname, '..', 'build', 'icon.ico')

let mainWindow = null
let db = null
let apiServer = null
let tray = null
let isQuitting = false

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

// 分类别名表（与前端 src/lib/api.js 保持一致）
const CATEGORY_ALIASES = {
  electronic: ['electronics', '电子', '电子产品', '電子', '電子產品'],
  food: ['foods', '食品', '食物'],
  beverage: ['beverages', '饮料', '飲料', 'drink', 'drinks'],
  daily: ['dailies', '日用品', 'daily necessities'],
  kitchen: ['kitchens', '厨房用品', '廚房用品', 'kitchenware'],
  cleaning: ['cleanings', '清洁用品', '清潔用品', 'cleaning supplies'],
  medical: ['medicals', '医药', '醫藥', 'medicine', 'medicines', 'drug', 'drugs'],
  stationery: ['stationeries', '文具', 'office supplies'],
  tools: ['tool', '工具', 'hand tools', 'power tools'],
  other: ['others', '其他', '其它', 'misc', 'miscellaneous']
}

function normalizeCategoryKey(raw, categories = []) {
  if (!raw) return ''
  const key = String(raw).trim().toLowerCase()
  if (!key) return ''

  const direct = categories.find((c) => c.key && c.key.toLowerCase() === key)
  if (direct) return direct.key

  for (const [canonical, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (canonical.toLowerCase() === key) return canonical
    if (aliases.includes(key)) return canonical
  }

  const byName = categories.find(
    (c) =>
      (c.name && c.name.toLowerCase() === key) ||
      (c.name_en && c.name_en.toLowerCase() === key)
  )
  if (byName) return byName.key

  return raw
}

// 启动时一次性把历史数据的 category 归一化（幂等）
function migrateCategoryKeys() {
  try {
    const categories = db.prepare('SELECT * FROM categories').all()
    const items = db.prepare('SELECT id, category FROM items').all()
    const stmt = db.prepare('UPDATE items SET category = ?, updated_at = ? WHERE id = ?')
    let changed = 0
    for (const it of items) {
      const normalized = normalizeCategoryKey(it.category, categories)
      if (normalized !== it.category) {
        stmt.run(normalized, Date.now(), it.id)
        changed += 1
      }
    }
    if (changed) console.log(`[migrate] 归一化 ${changed} 条物品分类`)
  } catch (e) {
    console.error('[migrate] 分类归一化失败:', e)
  }
}

// 合并重复分类条目：按规范 key 分组，保留一条（必要时改名为规范 key），其余删除
function deduplicateCategories() {
  try {
    const categories = db.prepare('SELECT * FROM categories').all()
    if (categories.length === 0) return

    // 每个分类 key -> 规范 key
    const groups = new Map() // canonical -> [cat, ...]
    for (const cat of categories) {
      const canonical = normalizeCategoryKey(cat.key, categories)
      if (!groups.has(canonical)) groups.set(canonical, [])
      groups.get(canonical).push(cat)
    }

    const plans = [] // { keeperId, canonicalKey, keeperOldKey, dropKeys:[] }
    for (const [canonical, cats] of groups) {
      if (cats.length === 0) continue
      // 优先选 key 已等于规范 key 的条目作为 keeper，避免改名触发 UNIQUE 冲突
      const exactMatch = cats.find((c) => c.key === canonical)
      const keeper = exactMatch || cats[0]
      const drops = cats.filter((c) => c.id !== keeper.id)
      if (drops.length === 0 && keeper.key === canonical) continue
      plans.push({
        keeperId: keeper.id,
        canonicalKey: canonical,
        keeperOldKey: keeper.key,
        dropKeys: drops.map((d) => d.key)
      })
    }

    if (plans.length === 0) return

    const tx = db.transaction(() => {
      for (const p of plans) {
        // 1. 先把被合并分类下的物品迁到规范 key
        for (const dk of p.dropKeys) {
          db.prepare('UPDATE items SET category = ?, updated_at = ? WHERE category = ?').run(
            p.canonicalKey, Date.now(), dk
          )
        }
        // 2. 删除冗余分类条目（此时规范 key 已无冲突）
        for (const dk of p.dropKeys) {
          db.prepare('DELETE FROM categories WHERE key = ?').run(dk)
        }
        // 3. 最后把 keeper 的 key 改为规范 key（若不同），同时迁移其旧 key 下的物品
        if (p.keeperOldKey !== p.canonicalKey) {
          db.prepare('UPDATE items SET category = ?, updated_at = ? WHERE category = ?').run(
            p.canonicalKey, Date.now(), p.keeperOldKey
          )
          db.prepare('UPDATE categories SET key = ?, updated_at = ? WHERE id = ?').run(
            p.canonicalKey, Date.now(), p.keeperId
          )
        }
      }
    })
    tx()
    console.log(
      `[dedup] 处理 ${plans.length} 组分类:`,
      plans
        .map((p) => `${p.keeperOldKey}${p.dropKeys.length ? '+' + p.dropKeys.join('/') : ''}→${p.canonicalKey}`)
        .join(', ')
    )
  } catch (e) {
    console.error('[dedup] 分类去重失败:', e)
  }
}

// 自动生成物品编号：委托给 item-no.js（参考已有数据规则生成「前缀-YYYYMMDD-序号」）
// generateItemNo(db) 由 ./item-no 提供

// 导入行（兼容 camelCase 手机端 与 snake_case 旧桌面端）
function fromImportItem(r, now) {
  const categories = db.prepare('SELECT * FROM categories').all()
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
    category: normalizeCategoryKey(r.category, categories),
    expiry_date: toMs(r.expiryDate ?? r.expiry_date),
    created_at: toMs(r.createdAt ?? r.created_at) || now,
    updated_at: toMs(r.updatedAt ?? r.updated_at) || now
  }
}

// ===== 应用菜单（默认隐藏，功能入口集中到设置页） =====
function buildMenu(_lang) {
  // 隐藏顶部菜单栏以保持界面简洁；导入/导出/设置等入口已集成在渲染页内
  Menu.setApplicationMenu(null)
}

function createTray() {
  if (tray) return
  try {
    const icon = nativeImage.createFromPath(ICON_PATH)
    tray = new Tray(icon.resize({ width: 16, height: 16 }))
    tray.setToolTip('家庭物资管家')
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
    tray.setContextMenu(contextMenu)
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      }
    })
  } catch (e) {
    console.error('[tray] 创建托盘失败:', e)
  }
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
    frame: false,
    title: '家庭物资管家',
    icon: ICON_PATH,
    backgroundColor: isDarkTheme ? '#0f172a' : '#fbfaf8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  })

  // 窗口控制 IPC
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() || false)
  ipcMain.handle('window:resolveCloseAction', (_event, { action, remember }) => {
    if (!mainWindow) return
    if (remember) {
      const s = readAppSettings()
      s.closeAction = action === 'quit' ? 'quit' : 'minimize'
      writeAppSettings(s)
    }
    if (action === 'quit') {
      isQuitting = true
      mainWindow.close()
    } else {
      mainWindow.hide()
    }
  })
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximizeChanged', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximizeChanged', false))

  // 关闭行为：按设置最小化到托盘，或在未设置时询问用户
  mainWindow.on('close', (event) => {
    if (isQuitting || !mainWindow) return
    const settings = readAppSettings()
    if (settings.closeAction === 'minimize') {
      event.preventDefault()
      mainWindow.hide()
      return
    }
    if (settings.closeAction === 'quit') {
      isQuitting = true
      return
    }
    // 首次关闭或用户未选择过，弹出统一 UI 询问
    event.preventDefault()
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('window:requestCloseAction')
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
ipcMain.handle('settings:get', () => {
  const settings = readAppSettings()
  return {
    ...settings,
    defaultDataDir: app.getPath('userData')
  }
})

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

// 暴露/刷新外部 Agent API 配置
ipcMain.handle('settings:getApiToken', () => {
  const s = readAppSettings()
  if (!s.apiToken || typeof s.apiToken !== 'string' || s.apiToken.trim() === '') {
    s.apiToken = crypto.randomBytes(24).toString('hex')
    writeAppSettings(s)
  }
  return {
    token: s.apiToken,
    port: Number(s.apiPort) || 3001,
    host: s.apiHost || '127.0.0.1',
    lanMode: s.apiLanMode === true
  }
})

ipcMain.handle('settings:resetApiToken', () => {
  const s = readAppSettings()
  s.apiToken = crypto.randomBytes(24).toString('hex')
  writeAppSettings(s)
  if (apiServer) apiServer.restart()
  return {
    token: s.apiToken,
    port: Number(s.apiPort) || 3001,
    host: s.apiHost || '127.0.0.1',
    lanMode: s.apiLanMode === true
  }
})

// 设置 Agent API 端口 / 局域网模式 / 自定义 Token
ipcMain.handle('settings:setApiConfig', (_event, patch) => {
  const s = readAppSettings()
  if (patch.port !== undefined) {
    const n = Number(patch.port)
    s.apiPort = n > 0 && n < 65536 ? n : 3001
  }
  if (patch.host !== undefined) {
    s.apiHost = patch.host === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1'
  }
  if (patch.lanMode !== undefined) {
    s.apiLanMode = patch.lanMode === true
  }
  if (patch.token !== undefined && typeof patch.token === 'string' && patch.token.trim().length >= 8) {
    s.apiToken = patch.token.trim()
  }
  writeAppSettings(s)
  if (apiServer) apiServer.restart()
  return {
    token: s.apiToken,
    port: Number(s.apiPort) || 3001,
    host: s.apiHost || '127.0.0.1',
    lanMode: s.apiLanMode === true
  }
})

// 选择文件夹对话框
ipcMain.handle('dialog:pickFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || res.filePaths.length === 0) return { canceled: true }
  return { canceled: false, path: res.filePaths[0] }
})

// 选择图片文件对话框（返回路径，不读取内容）
ipcMain.handle('dialog:pickImage', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'] }]
  })
  if (res.canceled || res.filePaths.length === 0) return { canceled: true }
  return { canceled: false, path: res.filePaths[0] }
})

// 自动生成物品编号
ipcMain.handle('items:generateItemNo', () => {
  return generateItemNo(db)
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

// 合并分类：将 fromKey 下的物品全部迁到 toKey，然后删除 fromKey 分类
ipcMain.handle('categories:merge', (_event, { fromKey, toKey }) => {
  if (!fromKey || !toKey || fromKey === toKey) return { ok: false, migrated: 0 }
  const tx = db.transaction(() => {
    const info = db.prepare('UPDATE items SET category = ?, updated_at = ? WHERE category = ?').run(toKey, Date.now(), fromKey)
    db.prepare('DELETE FROM categories WHERE key = ?').run(fromKey)
    return info.changes
  })
  const migrated = tx()
  return { ok: true, migrated }
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
  const categories = db.prepare('SELECT * FROM categories').all()
  const existing = categories.map((r) => r.key)
  const seen = new Set(existing)
  const now = Date.now()
  let maxOrder = db.prepare('SELECT MAX(sort_order) m FROM categories').get().m || 0
  const ins = db.prepare(
    'INSERT INTO categories (id,key,name,name_en,icon,sort_order,created_at,updated_at) VALUES (@id,@key,@name,@name_en,@icon,@sort_order,@created_at,@updated_at)'
  )
  for (const r of items) {
    const key = normalizeCategoryKey(r.category, categories)
    if (!key || seen.has(key)) continue
    seen.add(key)
    categories.push({ key, name: key, name_en: '' })
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
  migrateCategoryKeys()
  deduplicateCategories()
  const settings = readAppSettings()
  buildMenu(settings.language || 'zh')
  createWindow()
  createTray()

  // 启动外部 Agent HTTP API（本地回环，带 Token 鉴权）
  apiServer = new ApiServer({
    db,
    getSettings: readAppSettings,
    writeAppSettings,
    resolveDbPath,
    app,
    getMainWindow: () => mainWindow
  })
  apiServer.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  try {
    if (apiServer) apiServer.stop()
  } catch (e) {
    /* ignore */
  }
  try {
    if (db) db.close()
  } catch (e) {
    /* ignore */
  }
})
