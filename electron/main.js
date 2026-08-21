// Electron 主进程：窗口、数据库（含分类/位置树/设置）、IPC、文件对话框、中文菜单
const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const os = require('os')
const { normalizeCategoryKey, ensureCategoriesFromItems, ensureLocationsFromItems } = require('./data-utils')
const { ApiServer } = require('./api-server')
const { QRUploadServer } = require('./qr-upload')
const { Updater } = require('./updater')
const {
  testConnection,
  fetchModels,
  recognizeImage,
  migrateAIConfig,
  getActiveProvider,
  sanitizeProvider
} = require('./ai-service')
const { generateItemNo } = require('./item-no')

process.on('uncaughtException', (e) => console.error('[main] UNCAUGHT:', e))
process.on('unhandledRejection', (e) => console.error('[main] UNHANDLED_REJECT:', e && e.message || e))

let Database;
Database = require('better-sqlite3');

// 确保 Windows 任务栏正确显示应用图标与分组
app.setAppUserModelId(app.getName())

// 单实例：点击 exe/快捷方式时，如果已有实例在托盘运行，则直接唤回而不是再开一个
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
      createTray()
    }
  })
}

// ===== 渲染进程错误转发：写入临时文件，便于排查白屏
ipcMain.handle('diag:log', async (_event, msg) => {
  try {
    const logPath = path.join(os.tmpdir(), 'lingguang-render.log')
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
  } catch (_) {}
  return { ok: true }
})

const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar', 'build', 'icon.ico')
  : path.join(__dirname, '..', 'build', 'icon.ico')

let mainWindow = null
let db = null
let apiServer = null
let qrUploadServer = null
let tray = null
let updater = null
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

function resolveDataDir() {
  const s = readAppSettings()
  if (s.dataDir && fs.existsSync(s.dataDir)) {
    return s.dataDir
  }
  return app.getPath('userData')
}

const FLOOR_PLANS_FILE = 'floor-plans.json'

function getFloorPlansPath() {
  return path.join(resolveDataDir(), FLOOR_PLANS_FILE)
}

function readFloorPlans() {
  try {
    const raw = fs.readFileSync(getFloorPlansPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.plans) return parsed
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[floorPlans] read error:', e)
  }
  return { version: 1, plans: {} }
}

function writeFloorPlans(data) {
  try {
    fs.writeFileSync(getFloorPlansPath(), JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error('[floorPlans] write error:', e)
    throw e
  }
}

function getDefaultFloorPlan() {
  return {
    room: { x: 10, y: 10, w: 80, h: 80, colorIndex: 0, label: '' },
    areas: []
  }
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
    }
  } catch (e) {
    console.error('[backup] 备份失败:', e)
  }
}

// 备份目录：<dataDir>/backups/
function resolveBackupDir() {
  return path.join(resolveDataDir(), 'backups')
}

// 查找备份目录下最新的 *.bak 文件（按 mtime 排序）
function findLatestBackup() {
  const dir = resolveBackupDir()
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.bak'))
  if (files.length === 0) return null
  try {
    let best = null
    for (const f of files) {
      const fullPath = path.join(dir, f)
      const st = fs.statSync(fullPath)
      if (!best || st.mtimeMs > best.mtimeMs) best = { file: fullPath, mtimeMs: st.mtimeMs }
    }
    return best?.file || null
  } catch (e) {
    console.error('[backup] 查找最新备份失败:', e)
    return null
  }
}

// 判断错误是否为"数据库损坏"信号
function isCorruptError(err) {
  if (!err || !err.message) return false
  const msg = err.message.toLowerCase()
  return msg.includes('corrupt') ||
    msg.includes('unable to open') ||
    msg.includes('database disk image') ||
    msg.includes('malformed')
}

// 数据库损坏恢复链：备份原文件 → 找最新 .bak → 有则恢复，无则空库重建
function recoverFromCorrupt(error, mainWindow) {
  const dbPath = resolveDbPath()
  const corruptedPath = dbPath + '.corrupted.' + Date.now()
  console.error('[db-recovery] 数据库损坏，尝试恢复。错误:', error?.message)

  // 1. 备份损坏文件
  try {
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, corruptedPath)
      console.log(`[db-recovery] 损坏文件已备份到: ${corruptedPath}`)
    }
  } catch (e) {
    console.error('[db-recovery] 备份损坏文件失败:', e)
  }

  // 2. 查找最新备份
  const latest = findLatestBackup()
  let recoveredFrom = null

  if (latest) {
    try {
      // 清除原文件及相关 WAL/SHM，用备份替换
      for (const suffix of ['', '-wal', '-shm']) {
        const p = dbPath + suffix
        if (fs.existsSync(p)) fs.unlinkSync(p)
      }
      fs.copyFileSync(latest, dbPath)
      recoveredFrom = latest
      console.log(`[db-recovery] 已从备份恢复: ${latest}`)
    } catch (e) {
      console.error('[db-recovery] 从备份恢复失败:', e)
    }
  } else {
    console.log('[db-recovery] 未找到可用备份，将创建空数据库')
  }

  // 3. 重新初始化数据库（建表/索引/种子）
  initDatabase(mainWindow, { recoveredFrom, corruptedPath })
}

// 初始化数据库：建表、索引、种子数据
// opts.recoveredFrom / opts.corruptedPath 用于通知前端恢复来源
function initDatabase(mainWindow, opts) {
  const doInit = () => {
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
        notes TEXT DEFAULT '',
        consume_rate REAL DEFAULT 0,
        consume_unit TEXT DEFAULT 'day',
        consume_start_at INTEGER DEFAULT 0,
        photo_meta TEXT DEFAULT '',
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
      CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);

      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'note',
        title TEXT NOT NULL DEFAULT '',
        content TEXT DEFAULT '',
        url TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        photo TEXT DEFAULT '',
        meta TEXT DEFAULT '',
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
      CREATE INDEX IF NOT EXISTS idx_materials_title ON materials(title);

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
      CREATE INDEX IF NOT EXISTS idx_categories_key ON categories(key);

      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        parent_id TEXT DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);
      CREATE INDEX IF NOT EXISTS idx_items_room ON items(room);
      CREATE INDEX IF NOT EXISTS idx_items_position ON items(position);
      CREATE INDEX IF NOT EXISTS idx_items_expiry_date ON items(expiry_date);
      CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);
    `)

    ensureItemColumns(db)
    migrateIndexes(db)

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

    // 如果来自恢复流程，通知前端
    if (opts && mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('main:dbRecovered', {
        recoveredFrom: opts.recoveredFrom || null,
        corruptedPath: opts.corruptedPath || null,
        emptyRecovery: !opts.recoveredFrom
      })
    }
  }

  // 首次打开：捕获损坏错误 → 触发恢复链
  try {
    doInit()
  } catch (err) {
    if (!opts && isCorruptError(err)) {
      recoverFromCorrupt(err, mainWindow)
    } else {
      throw err
    }
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

// 兼容旧数据库：检查并添加 items 表新增字段
function ensureItemColumns(database) {
  const cols = database.prepare("PRAGMA table_info(items)").all()
  const existing = new Set(cols.map((c) => c.name))
  const needed = [
    { name: 'notes', def: "TEXT DEFAULT ''" },
    { name: 'consume_rate', def: "REAL DEFAULT 0" },
    { name: 'consume_unit', def: "TEXT DEFAULT 'day'" },
    { name: 'consume_start_at', def: "INTEGER DEFAULT 0" },
    { name: 'photo_meta', def: "TEXT DEFAULT ''" }
  ]
  for (const col of needed) {
    if (!existing.has(col.name)) {
      try {
        database.exec(`ALTER TABLE items ADD COLUMN ${col.name} ${col.def}`)
        console.log(`[migrate] 已添加列 items.${col.name}`)
      } catch (e) {
        console.error(`[migrate] 添加列 items.${col.name} 失败:`, e.message)
      }
    }
  }
}

// 兼容旧数据库：补齐缺失索引（幂等，CREATE INDEX IF NOT EXISTS 天然幂等）
function migrateIndexes(database) {
  try {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_items_room ON items(room);
      CREATE INDEX IF NOT EXISTS idx_items_position ON items(position);
      CREATE INDEX IF NOT EXISTS idx_items_expiry_date ON items(expiry_date);
      CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);
      CREATE INDEX IF NOT EXISTS idx_categories_key ON categories(key);
    `)
    console.log('[migrate] 索引检查完成')
  } catch (e) {
    console.error('[migrate] 索引迁移失败:', e.message)
  }
}

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
      notes TEXT DEFAULT '',
      consume_rate REAL DEFAULT 0,
      consume_unit TEXT DEFAULT 'day',
      consume_start_at INTEGER DEFAULT 0,
      photo_meta TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'note',
      title TEXT NOT NULL DEFAULT '',
      content TEXT DEFAULT '',
      url TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      photo TEXT DEFAULT '',
      meta TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
    CREATE INDEX IF NOT EXISTS idx_materials_title ON materials(title);

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
    CREATE INDEX IF NOT EXISTS idx_categories_key ON categories(key);

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      parent_id TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);
    CREATE INDEX IF NOT EXISTS idx_items_room ON items(room);
    CREATE INDEX IF NOT EXISTS idx_items_position ON items(position);
    CREATE INDEX IF NOT EXISTS idx_items_expiry_date ON items(expiry_date);
    CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);
  `)

  // 兼容旧数据库：确保 items 表包含 v1.2.0 新增字段
  ensureItemColumns(db)

  // 兼容旧数据库：补齐缺失索引（幂等）
  migrateIndexes(db)

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

  mainWindow.show()
  mainWindow.focus()

  // 调试：开发模式下打开 DevTools 并把渲染进程 console 转发到主进程日志
  if (isDev) {
    mainWindow.webContents.openDevTools()
    mainWindow.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
      const label = ['log', 'warning', 'error', 'debug'][level] || level
      console.warn(`[renderer:${label}]`, message)
    })
  }
}

// ===== SQL 白名单：仅允许对已知表的参数化查询 =====
// 使用 better-sqlite3 参数化查询已天然防注入；此白名单只校验表名，避免任意表访问
const ALLOWED_TABLES = new Set(['items', 'categories', 'locations', 'materials', 'settings', 'sync_state', 'item_photos'])
const SQL_SANITIZER = {
  check(sql) {
    if (!sql || typeof sql !== 'string') return false
    const lower = sql.toLowerCase()
    return Array.from(ALLOWED_TABLES).some(t => lower.includes(t))
  }
}

// ===== IPC：通用数据库查询/执行（参数化，防注入）=====
ipcMain.handle('db:query', (_event, { sql, binds }) => {
  if (!SQL_SANITIZER.check(sql)) {
    console.warn('[db] query rejected (whitelist):', sql?.slice(0, 80))
    return null
  }
  const stmt = db.prepare(sql)
  if (binds == null) return stmt.all()
  if (Array.isArray(binds)) return stmt.all(...binds)
  return stmt.all(binds)
})

ipcMain.handle('db:execute', (_event, { sql, binds }) => {
  if (!SQL_SANITIZER.check(sql)) {
    console.warn('[db] execute rejected (whitelist):', sql?.slice(0, 80))
    throw new Error('db:execute rejected by whitelist')
  }
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

// 电子材料库类型管理（独立于材料条目数据）
ipcMain.handle('settings:getMaterialTypes', () => {
  const s = readAppSettings()
  return s.materialTypes || []
})

ipcMain.handle('settings:setMaterialTypes', (_event, types) => {
  const s = readAppSettings()
  s.materialTypes = Array.isArray(types) ? types : []
  writeAppSettings(s)
  return s.materialTypes
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

// ===== IPC：AI 视觉识别配置与调用（多供应商）=====
ipcMain.handle('ai:getConfig', () => {
  const s = readAppSettings()
  migrateAIConfig(s)
  writeAppSettings(s)
  return {
    providers: s.aiProviders || [],
    selectedId: s.aiSelectedId || ''
  }
})

ipcMain.handle('ai:setConfig', (_event, patch) => {
  const s = readAppSettings()
  migrateAIConfig(s)

  if (Array.isArray(patch.providers)) {
    s.aiProviders = patch.providers.map((p) => sanitizeProvider(p))
  }
  if (patch.selectedId !== undefined) {
    s.aiSelectedId = String(patch.selectedId || '')
  }

  // 兼容旧版单供应商 patch（设置页保存当前供应商时可能仍传 baseUrl/key/model）
  if (patch.baseUrl !== undefined || patch.key !== undefined || patch.model !== undefined) {
    let provider = getActiveProvider(s)
    if (!provider && (patch.baseUrl || patch.key || patch.model)) {
      provider = sanitizeProvider({ name: '默认' })
      s.aiProviders.push(provider)
    }
    if (provider) {
      if (patch.baseUrl !== undefined) provider.baseUrl = String(patch.baseUrl || '').trim()
      if (patch.key !== undefined) provider.key = String(patch.key || '').trim()
      if (patch.model !== undefined) provider.model = String(patch.model || '').trim() || 'gpt-4o-mini'
      if (!s.aiSelectedId) s.aiSelectedId = provider.id
    }
  }

  // 再次确保 selectedId 有效
  migrateAIConfig(s)
  writeAppSettings(s)
  return {
    providers: s.aiProviders || [],
    selectedId: s.aiSelectedId || ''
  }
})

ipcMain.handle('ai:recognize', async (_event, { image }) => {
  const settings = readAppSettings()
  return recognizeImage({ image, db, settings })
})

ipcMain.handle('ai:testConnection', async (_event, { providerId } = {}) => {
  const settings = readAppSettings()
  migrateAIConfig(settings)
  const provider = providerId
    ? settings.aiProviders.find((p) => p.id === providerId)
    : getActiveProvider(settings)
  if (!provider) return { ok: false, error: '未配置 AI 服务' }
  return testConnection({ settings, provider })
})

ipcMain.handle('ai:fetchModels', async (_event, { providerId } = {}) => {
  const settings = readAppSettings()
  migrateAIConfig(settings)
  const provider = providerId
    ? settings.aiProviders.find((p) => p.id === providerId)
    : getActiveProvider(settings)
  return fetchModels({ settings, provider })
})

// 选择文件夹对话框
ipcMain.handle('dialog:pickFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || res.filePaths.length === 0) return { canceled: true }
  return { canceled: false, path: res.filePaths[0] }
})

// 打开外部链接或本地路径
ipcMain.handle('shell:openExternal', async (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url)
    return { ok: true }
  }
  return { ok: false, error: 'invalid url' }
})

ipcMain.handle('shell:openPath', async (_event, target) => {
  if (typeof target !== 'string' || !target.trim()) return { ok: false, error: 'empty path' }
  const normalized = path.normalize(target.trim())
  if (!fs.existsSync(normalized)) return { ok: false, error: 'path not found' }
  const result = await shell.openPath(normalized)
  return { ok: result === '', error: result || undefined }
})

ipcMain.handle('shell:showItemInFolder', async (_event, target) => {
  if (typeof target !== 'string' || !target.trim()) return { ok: false, error: 'empty path' }
  shell.showItemInFolder(path.normalize(target.trim()))
  return { ok: true }
})

// 选择图片文件对话框（返回路径，不读取内容）
ipcMain.handle('dialog:pickImage', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'] }]
  })
  if (res.canceled || res.filePaths.length === 0) return { canceled: true }
  const path = res.filePaths[0]
  let size = 0
  try {
    const stat = fs.statSync(path)
    size = stat.size
  } catch { /* ignore */ }
  return { canceled: false, path, size }
})

// 选择任意文件对话框（用于电子材料库附加文档/链接等）
ipcMain.handle('dialog:pickFile', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择文件',
    properties: ['openFile'],
    filters: [{ name: '所有文件', extensions: ['*'] }]
  })
  if (res.canceled || res.filePaths.length === 0) return { canceled: true }
  return { canceled: false, path: res.filePaths[0] }
})

// 自动生成物品编号
ipcMain.handle('items:generateItemNo', () => {
  return generateItemNo(db)
})

const ALLOWED_BULK_FIELDS = [
  'category', 'name', 'quantity', 'min_quantity', 'unit', 'location',
  'supplier', 'purchase_date', 'expiry_date', 'purchase_price', 'notes'
]

ipcMain.handle('items:batchDelete', (_event, { ids }) => {
  if (!ids || ids.length === 0) return { deleted: 0 }
  const ph = ids.map((_, i) => `?${i + 1}`).join(',')
  const del = db.prepare(`DELETE FROM items WHERE id IN (${ph})`)
  const tx = db.transaction((arr) => {
    del.run(...arr)
    return arr.length
  })
  return { deleted: tx(ids) }
})

ipcMain.handle('items:batchUpdate', (_event, { ids, field, value }) => {
  if (!ids || ids.length === 0 || !field) return { updated: 0 }
  const safe = ALLOWED_BULK_FIELDS.includes(field) ? field : 'notes'
  const now = Date.now()
  const ph = ids.map((_, i) => `?${i + 1}`).join(',')
  const upd = db.prepare(
    `UPDATE items SET "${safe}" = ?${ids.length + 1}, updated_at = ?${ids.length + 2} WHERE id IN (${ph})`
  )
  const tx = db.transaction((arr) => {
    upd.run(...arr)
    return arr.length
  })
  return { updated: tx([...ids, value ?? '', now]) }
})

ipcMain.handle('items:batchChangeQty', (_event, { ids, type, value }) => {
  if (!ids || ids.length === 0) return { updated: 0 }
  const now = Date.now()
  if (type === 'set') {
    const upd = db.prepare('UPDATE items SET quantity = ?1, updated_at = ?2 WHERE id = ?3')
    const tx = db.transaction((arr) => {
      let total = 0
      for (const id of arr) {
        total += upd.run(value, now, id).changes ?? 0
      }
      return total
    })
    return { updated: tx(ids) }
  }
  const upd = db.prepare('UPDATE items SET quantity = MAX(0, CAST(quantity AS INTEGER) + ?1), updated_at = ?2 WHERE id = ?3')
  const tx = db.transaction((arr) => {
    let total = 0
    for (const id of arr) {
      total += upd.run(value, now, id).changes ?? 0
    }
    return total
  })
  return { updated: tx(ids) }
})

// ===== IPC：电子材料库 CRUD =====
ipcMain.handle('materials:list', (_event, { type, keyword } = {}) => {
  let sql = 'SELECT * FROM materials WHERE 1=1'
  const params = []
  if (type) {
    sql += ' AND type = ?'
    params.push(type)
  }
  if (keyword) {
    sql += ' AND (title LIKE ? OR content LIKE ? OR tags LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like, like)
  }
  sql += ' ORDER BY updated_at DESC'
  return db.prepare(sql).all(...params)
})

ipcMain.handle('materials:get', (_event, id) => {
  return db.prepare('SELECT * FROM materials WHERE id = ?').get(id)
})

ipcMain.handle('materials:create', (_event, data) => {
  const now = Date.now()
  const id = crypto.randomUUID()
  db.prepare(
    'INSERT INTO materials (id,type,title,content,url,tags,photo,meta,created_at,updated_at) VALUES (@id,@type,@title,@content,@url,@tags,@photo,@meta,@created_at,@updated_at)'
  ).run({
    id,
    type: data.type || 'note',
    title: data.title || '',
    content: data.content || '',
    url: data.url || '',
    tags: data.tags || '',
    photo: data.photo || '',
    meta: data.meta || '',
    created_at: now,
    updated_at: now
  })
  return db.prepare('SELECT * FROM materials WHERE id = ?').get(id)
})

ipcMain.handle('materials:update', (_event, { id, patch }) => {
  const cur = db.prepare('SELECT * FROM materials WHERE id = ?').get(id)
  if (!cur) return null
  const next = {
    ...cur,
    ...patch,
    updated_at: Date.now()
  }
  db.prepare(
    'UPDATE materials SET type=@type,title=@title,content=@content,url=@url,tags=@tags,photo=@photo,meta=@meta,updated_at=@updated_at WHERE id=@id'
  ).run(next)
  return next
})

ipcMain.handle('materials:delete', (_event, id) => {
  db.prepare('DELETE FROM materials WHERE id = ?').run(id)
  return { ok: true }
})

ipcMain.handle('materials:bulkDelete', (_event, ids) => {
  if (!ids || ids.length === 0) return { deleted: 0 }
  const ph = ids.map(() => '?').join(',')
  const info = db.prepare(`DELETE FROM materials WHERE id IN (${ph})`).run(...ids)
  return { deleted: info.changes || 0 }
})

ipcMain.handle('materials:bulkUpdateType', (_event, { ids, type }) => {
  if (!ids || ids.length === 0) return { updated: 0 }
  const ph = ids.map(() => '?').join(',')
  const info = db.prepare(`UPDATE materials SET type = ?, updated_at = ? WHERE id IN (${ph})`).run(type, Date.now(), ...ids)
  return { updated: info.changes || 0 }
})

// ===== IPC：手机扫码传图 =====
ipcMain.handle('qrUpload:start', async () => {
  if (!qrUploadServer) {
    qrUploadServer = new QRUploadServer({ getMainWindow: () => mainWindow })
  }
  return qrUploadServer.start()
})

ipcMain.handle('qrUpload:stop', () => {
  if (qrUploadServer) {
    qrUploadServer.stop()
    qrUploadServer = null
  }
  return { ok: true }
})

ipcMain.handle('qrUpload:getImage', () => {
  if (!qrUploadServer) return { image: null }
  return { image: qrUploadServer.receivedImage }
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

// ===== IPC：平面图 CRUD =====
ipcMain.handle('floorPlans:get', (_event, { locationId }) => {
  const data = readFloorPlans()
  return data.plans[locationId] || getDefaultFloorPlan()
})

ipcMain.handle('floorPlans:set', (_event, { locationId, plan }) => {
  const data = readFloorPlans()
  data.plans[locationId] = plan
  writeFloorPlans(data)
  return { ok: true }
})

ipcMain.handle('floorPlans:delete', (_event, { locationId }) => {
  const data = readFloorPlans()
  delete data.plans[locationId]
  writeFloorPlans(data)
  return { ok: true }
})

ipcMain.handle('floorPlans:createSubLocation', (_event, { parentId, name }) => {
  if (!name || !name.trim()) throw new Error('名称不能为空')
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
    name: name.trim(),
    parent_id: parentId || '',
    sort_order: maxOrder + 1,
    created_at: now,
    updated_at: now
  })
  return db.prepare('SELECT * FROM locations WHERE id = ?').get(id)
})

// ===== 文件路径白名单：所有 IPC 文件操作限制在 dataDir 内 =====
function safePath(reqPath, baseDir) {
  if (!reqPath || typeof reqPath !== 'string') {
    throw new Error('invalid path')
  }
  const target = path.resolve(baseDir, reqPath)
  if (!target.startsWith(baseDir + path.sep) && target !== baseDir) {
    throw new Error('path traversal rejected')
  }
  return target
}

// ===== IPC：照片文件读写 =====
ipcMain.handle('photo:read', async (_event, relPath) => {
  if (!relPath || typeof relPath !== 'string') return { ok: false, error: 'invalid path' }
  let filePath
  try { filePath = safePath(relPath, resolveDataDir()) }
  catch (e) { return { ok: false, error: e.message } }
  try {
    const data = fs.readFileSync(filePath)
    // 根据文件扩展名返回正确的 MIME 类型，避免浏览器因类型不匹配拒绝渲染
    const ext = path.extname(filePath).toLowerCase()
    const mimeMap = {
      '.webp': 'image/webp',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif':  'image/gif',
      '.svg':  'image/svg+xml',
      '.bmp':  'image/bmp'
    }
    const mime = mimeMap[ext] || 'image/png'
    return { ok: true, data: `data:${mime};base64,` + data.toString('base64') }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('photo:save', async (_event, { base64, filename }) => {
  if (!base64 || typeof base64 !== 'string') return { ok: false, error: 'invalid data' }
  try {
    const dir = path.join(resolveDataDir(), 'photos')
    fs.mkdirSync(dir, { recursive: true })
    const sanitized = filename ? String(filename).replace(/[^a-zA-Z0-9._-]/g, '_') : (crypto.randomUUID() + '.webp')
    const filePath = safePath(sanitized, dir)
    const data = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    fs.writeFileSync(filePath, data)
    return { ok: true, relPath: 'photos/' + sanitized }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// 从绝对文件路径直接复制/移动图片到 photos 目录（避免大 base64 截断）
ipcMain.handle('photo:saveFile', async (_event, { filePath, extension }) => {
  if (!filePath || typeof filePath !== 'string') return { ok: false, error: 'invalid path' }
  try {
    const dir = path.join(resolveDataDir(), 'photos')
    fs.mkdirSync(dir, { recursive: true })
    const ext = extension && /^\.[a-zA-Z0-9]+$/.test(extension) ? extension : path.extname(filePath) || '.webp'
    const sanitized = crypto.randomUUID() + ext
    const target = safePath(sanitized, dir)
    fs.copyFileSync(filePath, target)
    return { ok: true, relPath: 'photos/' + sanitized }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('photo:delete', async (_event, relPath) => {
  if (!relPath || typeof relPath !== 'string') return { ok: false, error: 'invalid path' }
  let filePath
  try { filePath = safePath(relPath, resolveDataDir()) }
  catch (e) { return { ok: false, error: e.message } }
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// 将相对路径转为 file:// 绝对 URL（供 <img src> 直接引用）
ipcMain.handle('photo:url', async (_event, relPath) => {
  if (!relPath || typeof relPath !== 'string') return ''
  try {
    const filePath = safePath(relPath, resolveDataDir())
    if (!fs.existsSync(filePath)) return ''
    return `file:///${filePath.replace(/\\/g, '/')}`
  } catch (e) {
    return ''
  }
})

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
    ensureCategoriesFromItems(db, rows)
    ensureLocationsFromItems(db, rows)
    delStmt.run()
    for (const r of rows) {
      insStmt.run(fromImportItem(r, now))
    }
  })
  tx(items)
  return { imported: items.length }
})

ipcMain.handle('sync:rebuildCategories', () => {
  const items = db.prepare('SELECT * FROM items').all()
  const created = ensureCategoriesFromItems(db, items)
  return { ok: true, created }
})

ipcMain.handle('sync:rebuildLocations', () => {
  const items = db.prepare('SELECT * FROM items').all()
  const created = ensureLocationsFromItems(db, items)
  return { ok: true, created }
})

// ===== IPC：统计聚合（P-03：聚合逻辑移入后端，仅返回 stats 对象）=====
ipcMain.handle('sync:stats', () => {
  const items = db.prepare('SELECT * FROM items').all()
  const categories = db.prepare('SELECT * FROM categories').all()
  const now = Date.now()
  const oneDay = 86400000

  // 分类统计
  const categoryMap = {}
  items.forEach((it) => {
    const key = it.category || 'other'
    categoryMap[key] = (categoryMap[key] || 0) + 1
  })
  const categoryStats = Object.entries(categoryMap)
    .map(([key, count]) => {
      const cat = categories.find((c) => c.key === key)
      return {
        key,
        name: cat ? cat.name : key,
        name_en: cat ? cat.name_en : key,
        count
      }
    })
    .sort((a, b) => b.count - a.count)

  // 位置统计
  const locationMap = {}
  items.forEach((it) => {
    const loc = (it.location && it.location.trim()) || (it.room && it.room.trim()) || '未指定位置'
    locationMap[loc] = (locationMap[loc] || 0) + 1
  })
  const locationStats = Object.entries(locationMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  // 过期状态
  let expired = 0
  let expiring7 = 0
  let expiring30 = 0
  let normal = 0
  let noExpiry = 0
  items.forEach((it) => {
    if (!it.expiry_date) {
      noExpiry++
      return
    }
    const days = Math.ceil((it.expiry_date - now) / oneDay)
    if (days < 0) expired++
    else if (days <= 7) expiring7++
    else if (days <= 30) expiring30++
    else normal++
  })
  const expiryStats = [
    { name: '已过期', name_en: 'Expired', key: 'expired', count: expired, color: '#ef4444' },
    { name: '7天内过期', name_en: '≤7 days', key: 'expiring7', count: expiring7, color: '#f97316' },
    { name: '30天内过期', name_en: '≤30 days', key: 'expiring30', count: expiring30, color: '#fbbf24' },
    { name: '正常', name_en: 'Normal', key: 'normal', count: normal, color: '#22c55e' },
    { name: '无过期日', name_en: 'No date', key: 'noExpiry', count: noExpiry, color: '#94a3b8' }
  ]

  // 库存状态
  const lowStock = items.filter((it) => it.min_quantity > 0 && it.quantity <= it.min_quantity).length
  const stockStats = [
    { name: '库存不足', name_en: 'Low stock', key: 'low', count: lowStock, color: '#ef4444' },
    { name: '库存充足', name_en: 'Sufficient', key: 'ok', count: items.length - lowStock, color: '#22c55e' }
  ]

  // 时间维度：按创建/更新月份
  const createdMonthMap = {}
  const updatedMonthMap = {}
  const monthFormatter = (ts) => {
    const d = new Date(ts)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  items.forEach((it) => {
    if (it.created_at) {
      const m = monthFormatter(it.created_at)
      createdMonthMap[m] = (createdMonthMap[m] || 0) + 1
    }
    if (it.updated_at) {
      const m = monthFormatter(it.updated_at)
      updatedMonthMap[m] = (updatedMonthMap[m] || 0) + 1
    }
  })
  const months = Array.from(new Set([...Object.keys(createdMonthMap), ...Object.keys(updatedMonthMap)])).sort()
  const timeStats = months.map((m) => ({
    month: m,
    created: createdMonthMap[m] || 0,
    updated: updatedMonthMap[m] || 0
  }))

  // 数量分布（top 15）
  const quantityStats = items.map((it) => ({
    name: it.name,
    quantity: it.quantity,
    min: it.min_quantity
  })).sort((a, b) => b.quantity - a.quantity).slice(0, 15)

  const totalQuantity = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)

  return {
    total: items.length,
    totalQuantity,
    categoryStats,
    locationStats,
    expiryStats,
    stockStats,
    timeStats,
    quantityStats
  }
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

ipcMain.handle('sync:exportByIds', (_event, ids) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    const data = { version: 1, export_time: Date.now(), items: [] }
    return JSON.stringify(data, null, 2)
  }
  const stmt = db.prepare('SELECT * FROM items WHERE id IN (' + ids.map(() => '?').join(',') + ')')
  const items = stmt.all(...ids)
  const data = {
    version: 1,
    export_time: Date.now(),
    items: items.map(toPhoneItem)
  }
  return JSON.stringify(data, null, 2)
})

ipcMain.handle('sync:exportExpiringReport', () => {
  const now = Date.now()
  const ONE_WEEK = 7 * 86400000
  const items = db.prepare('SELECT * FROM items').all()
  const expired = []
  const expiring = []
  const lowStock = []
  for (const it of items) {
    if (it.expiry_date) {
      const days = Math.ceil((it.expiry_date - now) / 86400000)
      if (days < 0) expired.push({ ...it, daysLeft: days })
      else if (days <= 7) expiring.push({ ...it, daysLeft: days })
    }
    if (it.min_quantity > 0 && it.quantity <= it.min_quantity) {
      lowStock.push({ ...it })
    }
  }
  expired.sort((a, b) => a.expiry_date - b.expiry_date)
  expiring.sort((a, b) => a.daysLeft - b.daysLeft)
  lowStock.sort((a, b) => a.quantity - b.quantity)
  return { expired, expiring, lowStock, total: expired.length + expiring.length + lowStock.length }
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
  // createWindow() 在 initDatabase 之后调用，因为 initDatabase 需要 mainWindow 来通知恢复
  createWindow()
  initDatabase(mainWindow)
  migrateCategoryKeys()
  deduplicateCategories()
  const settings = readAppSettings()
  buildMenu(settings.language || 'zh')
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

  // 初始化软件内更新器，启动后延迟自动检查（避免影响启动速度）
  updater = new Updater(
    () => mainWindow,
    () => {
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
    }
  )
  // 启动后延迟自动检查更新（避免影响启动速度），复用上方已声明的 settings
  if (settings.autoCheckUpdate !== false) {
    setTimeout(() => {
      updater.checkForUpdates(true)
    }, 8000)
  }

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
    if (qrUploadServer) qrUploadServer.stop()
  } catch (e) {
    /* ignore */
  }
  try {
    if (db) db.close()
  } catch (e) {
    /* ignore */
  }
})
