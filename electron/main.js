// Electron 主进程：窗口、数据库（含分类/位置树/设置）、IPC、文件对话框、中文菜单
const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const os = require('os')
const { normalizeCategoryKey, ensureCategoriesFromItems, ensureLocationsFromItems } = require('./data-utils')
const { ApiServer } = require('./api-server')
const { QRUploadServer } = require('./qr-upload')
const { normalizeTags } = require('./tags')
const { Updater } = require('./updater')
const {
  testConnection,
  fetchModels,
  recognizeImage,
  recognizeText,
  migrateAIConfig,
  getActiveProvider,
  sanitizeProvider,
  // v2.0.1: OCR 自学习持久化
  setPersistSettings,
  loadLearnedFormat
} = require('./ai-service')
const { generateItemNo } = require('./item-no')
// 物品写入 service：UI IPC 与外部 Agent HTTP API 共用的唯一写入路径（消除双写漂移）
const itemsService = require('./services/items')

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

// ===== 同步获取数据目录（preload photo.url 快速路径使用）=====
// sendSync 必须同步返回；resolveDataDir 仅读 settings.json，开销可忽略
ipcMain.on('app:getDataDirSync', (event) => {
  try {
    event.returnValue = resolveDataDir()
  } catch (e) {
    event.returnValue = ''
  }
})

const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'icon.ico')
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

// 旧版单文件备份（兼容保留，仅作为恢复链的最后回退来源）
function backupDatabase() {
  const dbPath = resolveDbPath()
  const backupPath = getBackupPath(dbPath)
  try {
    if (!fs.existsSync(dbPath)) return
    // 杀毒软件/旧进程可能短暂持有 .db.backup 句柄：先尝试 unlink（容忍 ENOENT），再 copy。
    // 整个过程都用 try/catch 包裹，备份失败不影响后续数据库打开。
    try { fs.unlinkSync(backupPath) } catch (_) { /* ignore */ }
    fs.copyFileSync(dbPath, backupPath)
  } catch (e) {
    console.error('[backup] 备份失败（已忽略，不影响启动）:', e?.message || e)
  }
}

// 备份目录：<dataDir>/backups/
function resolveBackupDir() {
  return path.join(resolveDataDir(), 'backups')
}

const ROLLING_BACKUP_KEEP = 7

// 启动时写滚动备份：用 better-sqlite3 的 backup API（自带 WAL 一致性快照），
// 写入 backups/inventory-<时间戳>.bak，并按 mtime 滚动保留最近 N 份。
function writeRollingBackup() {
  if (!db) return
  const dir = resolveBackupDir()
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (e) {
    console.error('[backup] 创建备份目录失败:', e?.message || e)
    return
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = path.join(dir, `inventory-${stamp}.bak`)
  db.backup(dest)
    .then(() => pruneRollingBackups())
    .catch((e) => console.error('[backup] 滚动备份失败:', e?.message || e))
}

// 同步滚动备份：checkpoint 后直接复制主文件。
// 供导入等"必须先备份完成再继续"的路径使用（writeRollingBackup 是异步的，不保证时序）。
// 单实例单线程主进程下 checkpoint 后无并发写入，快照一致。
function writeRollingBackupSync() {
  if (!db) return false
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
    const dir = resolveBackupDir()
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(resolveDbPath(), path.join(dir, `inventory-${stamp}.bak`))
    pruneRollingBackups()
    return true
  } catch (e) {
    console.error('[backup] 同步滚动备份失败:', e?.message || e)
    return false
  }
}

// 删除超出保留数量的旧备份（按 mtime 降序保留前 ROLLING_BACKUP_KEEP 份）
function pruneRollingBackups() {
  try {
    const dir = resolveBackupDir()
    if (!fs.existsSync(dir)) return
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('inventory-') && f.endsWith('.bak'))
      .map((f) => {
        const fullPath = path.join(dir, f)
        return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
    for (const stale of files.slice(ROLLING_BACKUP_KEEP)) {
      try { fs.unlinkSync(stale.fullPath) } catch (_) { /* ignore */ }
    }
  } catch (e) {
    console.error('[backup] 清理旧备份失败:', e?.message || e)
  }
}

// 查找可用的最新备份：优先 backups/*.bak，其次回退旧版 inventory.db.backup
function findLatestBackup() {
  try {
    const dir = resolveBackupDir()
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.bak'))
      let best = null
      for (const f of files) {
        const fullPath = path.join(dir, f)
        const st = fs.statSync(fullPath)
        if (st.size === 0) continue
        if (!best || st.mtimeMs > best.mtimeMs) best = { file: fullPath, mtimeMs: st.mtimeMs }
      }
      if (best?.file) return best.file
    }
  } catch (e) {
    console.error('[backup] 查找最新备份失败:', e)
  }
  // 回退：旧版单文件备份
  try {
    const legacy = getBackupPath(resolveDbPath())
    if (fs.existsSync(legacy) && fs.statSync(legacy).size > 0) {
      console.log('[db-recovery] 无滚动备份，回退旧版备份:', legacy)
      return legacy
    }
  } catch (_) { /* ignore */ }
  return null
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
  initDatabaseAfterRecovery(mainWindow, { recoveredFrom, corruptedPath })
}

// 数据库损坏后重新初始化：建表、索引、种子数据
// opts.recoveredFrom / opts.corruptedPath 用于通知前端恢复来源
function initDatabaseAfterRecovery(mainWindow, opts) {
  const doInit = () => {
    db = new Database(resolveDbPath())
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 30000')
    db.pragma('mmap_size = 0')

    // 建表 + 索引（OCR 结果放在独立表，避免 ALTER 主表被杀软锁）
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
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
      CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
      CREATE INDEX IF NOT EXISTS idx_items_room ON items(room);
      CREATE INDEX IF NOT EXISTS idx_items_position ON items(position);
      CREATE INDEX IF NOT EXISTS idx_items_expiry_date ON items(expiry_date);
      CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);

      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'note',
        title TEXT NOT NULL DEFAULT '',
        content TEXT DEFAULT '',
        url TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        photo TEXT DEFAULT '',
        meta TEXT DEFAULT '',
        event_start_date TEXT DEFAULT '',
        event_end_date TEXT DEFAULT '',
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
      CREATE INDEX IF NOT EXISTS idx_materials_title ON materials(title);
      CREATE INDEX IF NOT EXISTS idx_materials_event_start ON materials(event_start_date);
      CREATE INDEX IF NOT EXISTS idx_materials_event_end ON materials(event_end_date);
      CREATE INDEX IF NOT EXISTS idx_materials_updated_at ON materials(updated_at);

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

      
      -- 全文搜索 v1.8.0：FTS5 虚表 + 触发器自动同步（OCR 文本从 item_ocr/material_ocr 子查询投影）
      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        id UNINDEXED,
        name,
        item_no,
        room,
        position,
        location,
        notes,
        tags,
        ocr_text,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS materials_fts USING fts5(
        id UNINDEXED,
        title,
        content,
        tags,
        ocr_text,
        tokenize = 'unicode61 remove_diacritics 2'
      );

      -- items -> items_fts
      CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
        INSERT INTO items_fts(id, name, item_no, room, position, location, notes, tags, ocr_text)
        VALUES (new.id, new.name, new.item_no, new.room, new.position, new.location, new.notes, new.tags,
          COALESCE((SELECT ocr_text FROM item_ocr WHERE item_id = new.id), ''));
      END;
      CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
        DELETE FROM items_fts WHERE id = old.id;
      END;
      CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
        DELETE FROM items_fts WHERE id = old.id;
        INSERT INTO items_fts(id, name, item_no, room, position, location, notes, tags, ocr_text)
        VALUES (new.id, new.name, new.item_no, new.room, new.position, new.location, new.notes, new.tags,
          COALESCE((SELECT ocr_text FROM item_ocr WHERE item_id = new.id), ''));
      END;

      -- item_ocr -> items_fts (OCR 文本写入时同步到虚表)
      CREATE TRIGGER IF NOT EXISTS item_ocr_ai AFTER INSERT ON item_ocr BEGIN
        UPDATE items_fts SET ocr_text = new.ocr_text WHERE id = new.item_id;
      END;
      CREATE TRIGGER IF NOT EXISTS item_ocr_au AFTER UPDATE ON item_ocr BEGIN
        UPDATE items_fts SET ocr_text = new.ocr_text WHERE id = new.item_id;
      END;
      CREATE TRIGGER IF NOT EXISTS item_ocr_ad AFTER DELETE ON item_ocr BEGIN
        UPDATE items_fts SET ocr_text = '' WHERE id = old.item_id;
      END;

      -- materials -> materials_fts
      CREATE TRIGGER IF NOT EXISTS materials_ai AFTER INSERT ON materials BEGIN
        INSERT INTO materials_fts(id, title, content, tags, ocr_text)
        VALUES (new.id, new.title, new.content, new.tags,
          COALESCE((SELECT ocr_text FROM material_ocr WHERE material_id = new.id), ''));
      END;
      CREATE TRIGGER IF NOT EXISTS materials_ad AFTER DELETE ON materials BEGIN
        DELETE FROM materials_fts WHERE id = old.id;
      END;
      CREATE TRIGGER IF NOT EXISTS materials_au AFTER UPDATE ON materials BEGIN
        DELETE FROM materials_fts WHERE id = old.id;
        INSERT INTO materials_fts(id, title, content, tags, ocr_text)
        VALUES (new.id, new.title, new.content, new.tags,
          COALESCE((SELECT ocr_text FROM material_ocr WHERE material_id = new.id), ''));
      END;

      -- material_ocr -> materials_fts
      CREATE TRIGGER IF NOT EXISTS material_ocr_ai AFTER INSERT ON material_ocr BEGIN
        UPDATE materials_fts SET ocr_text = new.ocr_text WHERE id = new.material_id;
      END;
      CREATE TRIGGER IF NOT EXISTS material_ocr_au AFTER UPDATE ON material_ocr BEGIN
        UPDATE materials_fts SET ocr_text = new.ocr_text WHERE id = new.material_id;
      END;
      CREATE TRIGGER IF NOT EXISTS material_ocr_ad AFTER DELETE ON material_ocr BEGIN
        UPDATE materials_fts SET ocr_text = '' WHERE id = old.material_id;
      END;

      CREATE TABLE IF NOT EXISTS item_ocr (
        item_id TEXT PRIMARY KEY,
        ocr_text TEXT DEFAULT '',
        ocr_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_item_ocr_text ON item_ocr(ocr_text);

      CREATE TABLE IF NOT EXISTS material_ocr (
        material_id TEXT PRIMARY KEY,
        ocr_text TEXT DEFAULT '',
        ocr_at INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT 0,
        FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_material_ocr_text ON material_ocr(ocr_text);
    `)

    ensureItemColumns(db)
    ensureMaterialColumns(db)
    migrateIndexes(db)
    // FTS5 v1.8.0：老库升级时把 items / materials 已有数据全量回填到 items_fts / materials_fts
    // 幂等：每条 FTS5 记录的 id 是 UNINDEXED 主键，重复 insert 会被忽略
    // FTS5 v1.8.0 修复：SQL 字符串外层换反引号（避免 JS 单引号字符串里写 '' 提前结束）
    // FTS5 v1.8.2 增强：tx(rows) 失败时退避重试 3 次（间隔 200ms），规避杀软扫描瞬间持锁
    // FTS5 v1.8.3 增强：backfill 完成后跑 INSERT INTO ..._fts(..._fts) VALUES('optimize') 整理碎片
    function sleepSync(ms) {
      const end = Date.now() + ms
      while (Date.now() < end) { /* yield */ }
    }
    function runTxWithRetry(label, txFn) {
      let lastErr = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          txFn()
          if (attempt > 0) console.log('[fts5] ' + label + ' 第 ' + (attempt + 1) + ' 次重试成功')
          return true
        } catch (e) {
          lastErr = e
          console.error('[fts5] ' + label + ' 第 ' + (attempt + 1) + '/3 次失败: ' + (e && e.message))
          if (attempt < 2) sleepSync(200)
        }
      }
      console.error('[fts5] ' + label + ' 最终失败，已重试 3 次')
      return false
    }
    function backfillFtsFromMainTables(database) {
      try {
        const itemsCount = database.prepare('SELECT COUNT(*) c FROM items').get().c
        if (itemsCount > 0) {
          const ftsCount = database.prepare('SELECT COUNT(*) c FROM items_fts').get().c
          if (ftsCount === 0) {
            const rows = database.prepare(`SELECT i.id, i.name, i.item_no, i.room, i.position, i.location, i.notes, i.tags, COALESCE(o.ocr_text, '') AS ocr_text FROM items i LEFT JOIN item_ocr o ON i.id = o.item_id`).all()
            const ins = database.prepare('INSERT INTO items_fts(id, name, item_no, room, position, location, notes, tags, ocr_text) VALUES (?,?,?,?,?,?,?,?,?)')
            const ok = runTxWithRetry('backfill items_fts', () => {
              const tx = database.transaction((arr) => { for (const r of arr) ins.run(r.id, r.name, r.item_no, r.room, r.position, r.location, r.notes, r.tags, r.ocr_text) })
              tx(rows)
            })
            if (ok) console.log('[fts5] backfilled items_fts rows=' + rows.length)
          }
        }
        const matsCount = database.prepare('SELECT COUNT(*) c FROM materials').get().c
        if (matsCount > 0) {
          const ftsCount = database.prepare('SELECT COUNT(*) c FROM materials_fts').get().c
          if (ftsCount === 0) {
            const rows = database.prepare(`SELECT m.id, m.title, m.content, m.tags, COALESCE(o.ocr_text, '') AS ocr_text FROM materials m LEFT JOIN material_ocr o ON m.id = o.material_id`).all()
            const ins = database.prepare('INSERT INTO materials_fts(id, title, content, tags, ocr_text) VALUES (?,?,?,?,?)')
            const ok = runTxWithRetry('backfill materials_fts', () => {
              const tx = database.transaction((arr) => { for (const r of arr) ins.run(r.id, r.title, r.content, r.tags, r.ocr_text) })
              tx(rows)
            })
            if (ok) console.log('[fts5] backfilled materials_fts rows=' + rows.length)
          }
        }
        // FTS5 v1.8.3：backfill 完成后跑一次 optimize，整理虚表倒排索引碎片
        // 命令是 FTS5 内部 "INSERT INTO fts(fts) VALUES('optimize')"，无副作用
        try {
          database.prepare("INSERT INTO items_fts(items_fts) VALUES('optimize')").run()
          database.prepare("INSERT INTO materials_fts(materials_fts) VALUES('optimize')").run()
          console.log('[fts5] optimize done (items_fts, materials_fts)')
        } catch (e) {
          console.warn('[fts5] optimize failed (non-fatal):', e && e.message)
        }
      } catch (e) {
        console.error('[fts5] backfill failed:', e && e.message)
      }
    }
    backfillFtsFromMainTables(db)
    // FTS5 v1.8.3：启动期跑 FTS5 内部 integrity-check 命令体检虚表内部结构
    // 命令 "INSERT INTO fts(fts) VALUES('integrity-check')" 是无返回行控制命令，
    // better-sqlite3 用 run() 验证不抛错即视为 OK；损坏时会抛 SQLITE_CORRUPT_VTAB
    try {
      db.prepare("INSERT INTO items_fts(items_fts) VALUES('integrity-check')").run()
      db.prepare("INSERT INTO materials_fts(materials_fts) VALUES('integrity-check')").run()
      console.log('[fts5] integrity-check ok (items_fts, materials_fts)')
      global.__ftsHealth = { items_fts_check: 'ok', materials_fts_check: 'ok' }
    } catch (e) {
      console.warn('[fts5] integrity-check 异常（虚表内部结构损坏）:', e && e.message)
      global.__ftsHealth = { items_fts_check: 'error', materials_fts_check: 'error' }
    }


    // 暴露给 IPC（renderer / Agent 用）
    global.__dbHealthCheck = () => checkDatabaseHealth(db)

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
// 关键：disk I/O 错误后 db 句柄可能不可用，reopen 失败会让 process 直接死
// → 不在 ensureItemColumns 里 reopen db，也不自己重试；失败直接抛出让 initDatabase 大循环重试
function ensureItemColumns(database) {
  const cols = database.prepare("PRAGMA table_info(items)").all()
  const existing = new Set(cols.map((c) => c.name))
  const needed = [
    { name: 'notes', def: "TEXT DEFAULT ''" },
    { name: 'consume_rate', def: "REAL DEFAULT 0" },
    { name: 'consume_unit', def: "TEXT DEFAULT 'day'" },
    { name: 'consume_start_at', def: "INTEGER DEFAULT 0" },
    { name: 'photo_meta', def: "TEXT DEFAULT ''" },
    // 标签：JSON 字符串数组，渲染端 parseTags/normalizeTags 处理
    { name: 'tags', def: "TEXT DEFAULT '[]'" },
    // 手动排序：0 = 从未手动排序（按 updated_at 排在其后），>0 = 用户拖拽确定的顺序
    { name: 'sort_order', def: "INTEGER NOT NULL DEFAULT 0" }
  ]
  const _migLog = (s) => { try { require('fs').appendFileSync(require('path').join(require('os').homedir(),'AppData','Roaming','family-inventory','startup-error.log'), `[migrate] ${s}\n`) } catch(_){} }
  for (const col of needed) {
    if (!existing.has(col.name)) {
      database.exec(`ALTER TABLE items ADD COLUMN ${col.name} ${col.def}`)
      _migLog(`已添加列 items.${col.name}`)
    }
  }
}

// 兼容旧数据库：检查并添加 materials 表新增字段
// 失败直接抛出让 initDatabase 大循环重试
function ensureMaterialColumns(database) {
  const cols = database.prepare("PRAGMA table_info(materials)").all()
  const existing = new Set(cols.map((c) => c.name))
  const needed = [
    { name: 'event_start_date', def: "TEXT DEFAULT ''" },
    { name: 'event_end_date', def: "TEXT DEFAULT ''" }
  ]
  const _migLog = (s) => { try { require('fs').appendFileSync(require('path').join(require('os').homedir(),'AppData','Roaming','family-inventory','startup-error.log'), `[migrate] ${s}\n`) } catch(_){} }
  for (const col of needed) {
    if (!existing.has(col.name)) {
      database.exec(`ALTER TABLE materials ADD COLUMN ${col.name} ${col.def}`)
      _migLog(`已添加列 materials.${col.name}`)
    }
  }
}

// 兼容旧数据库：补齐缺失索引（幂等，CREATE INDEX IF NOT EXISTS 天然幂等）
function migrateIndexes(database) {
  // 先拿到实际列名，避免旧表没有 ocr_text/event_start_date/event_end_date 时 CREATE INDEX 失败
  const itemCols = new Set(database.prepare("PRAGMA table_info(items)").all().map((c) => c.name))
  const materialCols = new Set(database.prepare("PRAGMA table_info(materials)").all().map((c) => c.name))
  const _migLog = (s) => { try { require('fs').appendFileSync(require('path').join(require('os').homedir(),'AppData','Roaming','family-inventory','startup-error.log'), `[migrate] ${s}\n`) } catch(_){} }

  try {
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_items_room ON items(room);
      CREATE INDEX IF NOT EXISTS idx_items_position ON items(position);
      CREATE INDEX IF NOT EXISTS idx_items_expiry_date ON items(expiry_date);
      CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);
      CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
      CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
      CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
      CREATE INDEX IF NOT EXISTS idx_materials_title ON materials(title);
      CREATE INDEX IF NOT EXISTS idx_materials_updated_at ON materials(updated_at);
      CREATE INDEX IF NOT EXISTS idx_categories_key ON categories(key);
      CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);
    `)

    // 仅当列存在时才建索引（老库先由 ensureItemColumns/ensureMaterialColumns 加列）
    if (materialCols.has('event_start_date')) {
      database.exec(`CREATE INDEX IF NOT EXISTS idx_materials_event_start ON materials(event_start_date)`)
    }
    if (materialCols.has('event_end_date')) {
      database.exec(`CREATE INDEX IF NOT EXISTS idx_materials_event_end ON materials(event_end_date)`)
    }

    console.log('[migrate] 索引检查完成')
  } catch (e) {
    _migLog(`索引迁移失败: ${e.message}`)
    console.error('[migrate] 索引迁移失败:', e.message)
    throw e
  }
}

// 启动期数据库健康检查：损坏早暴露，不等到查询时才发现
// 返回 { ok, integrity, items, materials, message }
function checkDatabaseHealth(database) {
  const result = {
    ok: true,
    integrity: 'ok',
    items: 0,
    materials: 0,
    message: ''
  }
  try {
    const rows = database.pragma('integrity_check', { simple: true })
    if (rows !== 'ok') {
      result.ok = false
      result.integrity = String(rows).split('\n')[0] || 'unknown'
      result.message = `数据库完整性异常: ${result.integrity}`
    }
    const itemsCount = database.prepare('SELECT COUNT(*) AS c FROM items').get()
    const materialsCount = database.prepare('SELECT COUNT(*) AS c FROM materials').get()
    result.items = itemsCount.c
    result.materials = materialsCount.c
    if (result.ok) {
      result.message = `数据库健康（items=${result.items}, materials=${result.materials}）`
    }
  } catch (e) {
    result.ok = false
    result.message = `健康检查失败: ${e.message}`
  }
  return result
}

// 初始化数据库：建表、索引、种子数据
// 杀软/索引服务扫描 .db 后可能短暂持锁 → open 重试 5 次（每次 sleep 5s）
function initDatabase() {
  backupDatabase()
  const dbPath = resolveDbPath()
  const _migLog = (s) => { try { require('fs').appendFileSync(require('path').join(require('os').homedir(),'AppData','Roaming','family-inventory','startup-error.log'), `[migrate] ${s}\n`) } catch(_){} }
  let lastErr = null
  let dbReady = false

  for (let attempt = 0; attempt < 5; attempt++) {
    let attemptDb = null
    try {
      attemptDb = new Database(dbPath)
      attemptDb.pragma('journal_mode = WAL')
      attemptDb.pragma('busy_timeout = 30000')
      attemptDb.pragma('mmap_size = 0')

      // 建表 + 索引（OCR 结果放在独立表，避免 ALTER 主表被杀软锁）
      attemptDb.exec(`
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
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
        CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
        CREATE INDEX IF NOT EXISTS idx_items_room ON items(room);
        CREATE INDEX IF NOT EXISTS idx_items_position ON items(position);
        CREATE INDEX IF NOT EXISTS idx_items_expiry_date ON items(expiry_date);
        CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);

        CREATE TABLE IF NOT EXISTS materials (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL DEFAULT 'note',
          title TEXT NOT NULL DEFAULT '',
          content TEXT DEFAULT '',
          url TEXT DEFAULT '',
          tags TEXT DEFAULT '',
          photo TEXT DEFAULT '',
          meta TEXT DEFAULT '',
          event_start_date TEXT DEFAULT '',
          event_end_date TEXT DEFAULT '',
          created_at INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
        CREATE INDEX IF NOT EXISTS idx_materials_title ON materials(title);
        CREATE INDEX IF NOT EXISTS idx_materials_event_start ON materials(event_start_date);
        CREATE INDEX IF NOT EXISTS idx_materials_event_end ON materials(event_end_date);
        CREATE INDEX IF NOT EXISTS idx_materials_updated_at ON materials(updated_at);

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

        CREATE TABLE IF NOT EXISTS item_ocr (
          item_id TEXT PRIMARY KEY,
          ocr_text TEXT DEFAULT '',
          ocr_at INTEGER DEFAULT 0,
          updated_at INTEGER DEFAULT 0,
          FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_item_ocr_text ON item_ocr(ocr_text);

        CREATE TABLE IF NOT EXISTS material_ocr (
          material_id TEXT PRIMARY KEY,
          ocr_text TEXT DEFAULT '',
          ocr_at INTEGER DEFAULT 0,
          updated_at INTEGER DEFAULT 0,
          FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_material_ocr_text ON material_ocr(ocr_text);
      `)

      // 兼容旧数据库：确保 items/materials 表包含 v1.2.0/v1.7.4 新增字段
      ensureItemColumns(attemptDb)
      ensureMaterialColumns(attemptDb)

      // 补齐缺失索引（幂等）
      migrateIndexes(attemptDb)

      // 健康检查（只记日志，不 fatal）
      const health = checkDatabaseHealth(attemptDb)
      if (health.ok) {
        console.log(`[health] ${health.message}`)
      } else {
        console.error(`[health] ❌ ${health.message}`)
      }

      // DEBUG: dump 实际列名
      dumpSchema(attemptDb)

      // 种子默认分类（仅在表为空时）
      const catCount = attemptDb.prepare('SELECT COUNT(*) c FROM categories').get().c
      if (catCount === 0) {
        const now = Date.now()
        const ins = attemptDb.prepare(
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

      // 一切成功，赋值全局 db 并退出重试循环
      db = attemptDb
      dbReady = true
      lastErr = null
      _migLog(`数据库初始化成功（第 ${attempt + 1}/5 次）`)
      break
    } catch (e) {
      lastErr = e
      _migLog(`数据库初始化第 ${attempt + 1}/5 次失败: ${e.message}`)
      console.error(`[startup] db init attempt ${attempt + 1} failed: ${e.message}`)
      try { if (attemptDb) attemptDb.close() } catch (_) {}
      if (attempt < 4) {
        const end = Date.now() + 5000
        while (Date.now() < end) { /* busy wait to yield to AV/indexer */ }
      }
    }
  }

  if (!dbReady) {
    throw lastErr || new Error('db init failed after retries')
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
    minWidth: 1280,
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
      // 生产环境保持同源策略开启（安全默认）。仅开发模式（页面来自 http://localhost:5173
      // 而图片是 file:// URL）需要放宽；生产页面本身是 file:// 协议，file:// 图片不受影响。
      webSecurity: process.env.DEV === 'true' ? false : true
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

// ===== SQL 精确白名单：通用通道仅允许白名单中的字面语句（参数走 binds）=====
// 旧实现的"包含表名即通过"等于没有白名单（DROP TABLE items 照样通过）。
// 白名单与 src/lib/api.js 的 SQL_STATEMENTS 常量一一对应（有 Vitest 交叉校验测试）。
// 规范化：折叠连续空白；把 IN (?, ?, ...) 折叠为 IN (?)，因此同形语句任意个绑定参数都匹配。
function normalizeSql(sql) {
  return String(sql)
    .replace(/(\?,\s*)+\?/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
}

const ALLOWED_SQL = (() => {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(__dirname, 'sql-whitelist.json'), 'utf8'))
    return new Set(list.map(normalizeSql))
  } catch (e) {
    console.error('[db] SQL 白名单加载失败，通用通道将全部拒绝:', e?.message || e)
    return new Set()
  }
})()

function sqlAllowed(sql) {
  if (!sql || typeof sql !== 'string') return false
  return ALLOWED_SQL.has(normalizeSql(sql))
}

// ===== IPC：通用数据库查询/执行（仅白名单语句 + 参数化绑定）=====
ipcMain.handle('db:query', (_event, { sql, binds }) => {
  if (!sqlAllowed(sql)) {
    console.warn('[db] query rejected (whitelist):', sql?.slice(0, 120))
    return null
  }
  const stmt = db.prepare(sql)
  if (binds == null) return stmt.all()
  if (Array.isArray(binds)) return stmt.all(...binds)
  return stmt.all(binds)
})

ipcMain.handle('db:execute', (_event, { sql, binds }) => {
  if (!sqlAllowed(sql)) {
    console.warn('[db] execute rejected (whitelist):', sql?.slice(0, 120))
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
  const prevDataDir = readAppSettings().dataDir
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
    // 更新设置（此后 resolveDataDir/resolveDbPath 指向新目录）
    const s = readAppSettings()
    s.dataDir = newDir
    writeAppSettings(s)
    // 重新打开并补齐 schema（新目录为空库时需要建表/种子）
    initDatabase(mainWindow)
    // 关键：同步外部 Agent API 服务持有的 db 引用，否则其后续读写仍落在旧库造成数据分裂
    if (apiServer) apiServer.db = db
    writeRollingBackup()
    return { ok: true, dataDir: newDir }
  } catch (e) {
    // 失败回滚：恢复旧 dataDir 设置并重开原库，避免停在"设置已改但库打不开"的中间态
    try {
      const s = readAppSettings()
      if (prevDataDir) s.dataDir = prevDataDir
      else delete s.dataDir
      writeAppSettings(s)
    } catch (_) { /* ignore */ }
    try {
      initDatabase(mainWindow)
      if (apiServer) apiServer.db = db
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
    selectedId: s.aiSelectedId || '',
    lastTest: s.aiLastTest || null
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
    selectedId: s.aiSelectedId || '',
    lastTest: s.aiLastTest || null
  }
})

ipcMain.handle('ai:recognize', async (_event, { image }) => {
  const settings = readAppSettings()
  try { loadLearnedFormat(settings, getActiveProvider(settings)) } catch (_) {}
  return recognizeImage({ image, db, settings })
})

// ===== OCR：图片识别文字（v1.7.9+）=====
// 与外部 Agent API 共用 recognizeText，结果写入 item_ocr / material_ocr 独立表
ipcMain.handle('ai:ocrItem', async (_event, { id, image } = {}) => {
  if (!id) return { ok: false, error: 'id is required' }
  const row = db.prepare('SELECT id, photo FROM items WHERE id = ?').get(id)
  if (!row) return { ok: false, error: 'item not found' }
  const settings = readAppSettings()
  const result = await recognizeText({ image: image || row.photo || '', settings })
  if (!result.ok) return { ok: false, error: result.error }
  const now = Date.now()
  db.prepare(
    `INSERT INTO item_ocr (item_id, ocr_text, ocr_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       ocr_text = excluded.ocr_text,
       ocr_at = excluded.ocr_at,
       updated_at = excluded.updated_at`
  ).run(id, result.text, now, now)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('api:dataChanged', { type: 'items' })
  }
  return { ok: true, id, ocr_text: result.text, ocr_at: now }
})

ipcMain.handle('ai:ocrMaterial', async (_event, { id, image } = {}) => {
  if (!id) return { ok: false, error: 'id is required' }
  const row = db.prepare('SELECT id, photo FROM materials WHERE id = ?').get(id)
  if (!row) return { ok: false, error: 'material not found' }
  const settings = readAppSettings()
  try { loadLearnedFormat(settings, getActiveProvider(settings)) } catch (_) {}
  const result = await recognizeText({ image: image || row.photo || '', settings })
  if (!result.ok) return { ok: false, error: result.error }
  const now = Date.now()
  db.prepare(
    `INSERT INTO material_ocr (material_id, ocr_text, ocr_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(material_id) DO UPDATE SET
       ocr_text = excluded.ocr_text,
       ocr_at = excluded.ocr_at,
       updated_at = excluded.updated_at`
  ).run(id, result.text, now, now)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('api:dataChanged', { type: 'materials' })
  }
  return { ok: true, id, ocr_text: result.text, ocr_at: now }
})

ipcMain.handle('ai:testConnection', async (_event, { providerId } = {}) => {
  const settings = readAppSettings()
  migrateAIConfig(settings)
  const provider = providerId
    ? settings.aiProviders.find((p) => p.id === providerId)
    : getActiveProvider(settings)
  if (!provider) return { ok: false, error: '未配置 AI 服务' }
  const result = await testConnection({ settings, provider })
  // v2.0.1: 成功后落盘 lastTest（每个 provider 独立记时间戳和 model）
  if (result && result.ok && provider.id) {
    settings.aiLastTest = settings.aiLastTest || {}
    settings.aiLastTest[provider.id] = {
      ok: true,
      at: Date.now(),
      model: provider.model || ''
    }
    writeAppSettings(settings)
  }
  return result
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

// ===== 文件选择批准列表：dialog:pickImage/pickFile 选中的路径才允许被 photo:saveFile 复制 =====
// 防止渲染进程被攻破后通过 photo:saveFile + photo:read 外泄任意本地文件
const approvedPickPaths = new Set()
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'])

function approvePickPath(p) {
  if (typeof p === 'string' && p) {
    approvedPickPaths.add(path.normalize(p))
    // 防止集合无限增长
    if (approvedPickPaths.size > 64) {
      const first = approvedPickPaths.values().next().value
      approvedPickPaths.delete(first)
    }
  }
}

// 选择图片文件对话框（返回路径，不读取内容）
ipcMain.handle('dialog:pickImage', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'] }]
  })
  if (res.canceled || res.filePaths.length === 0) return { canceled: true }
  const path = res.filePaths[0]
  approvePickPath(path)
  let size = 0
  try {
    const stat = fs.statSync(path)
    size = stat.size
  } catch { /* ignore */ }
  return { canceled: false, path, size }
})

// v1.8.6: 多选图片（用于 OCR 批量识别）
ipcMain.handle('dialog:pickImages', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '选择多张图片',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'] }]
  })
  if (res.canceled || res.filePaths.length === 0) return { canceled: true, files: [] }
  const files = []
  for (const p of res.filePaths) {
    approvePickPath(p)
    let size = 0
    try { size = fs.statSync(p).size } catch { /* ignore */ }
    files.push({ path: p, size })
  }
  return { canceled: false, files }
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

// ===== IPC：物品语义化写入（UI 保存路径，与 Agent API 共用 services/items）=====
// 返回 { row, sync }；UI 保存后自行 reload，不走 api:dataChanged 通知避免双重刷新
ipcMain.handle('items:create', (_event, data) => {
  if (!data || typeof data !== 'object' || !String(data.name || '').trim()) {
    throw new Error('name is required')
  }
  return itemsService.createItem(db, data)
})

ipcMain.handle('items:update', (_event, { id, patch }) => {
  if (!id) throw new Error('id is required')
  const result = itemsService.updateItem(db, id, patch || {})
  if (!result) throw new Error('item not found')
  return result
})

// 手动排序持久化：orderedIds 为当前视图的完整顺序
ipcMain.handle('items:setOrder', (_event, orderedIds) => {
  return itemsService.setOrder(db, orderedIds)
})

// 与 items 表实际存在的列保持一致（unit/supplier/purchase_* 列不存在，调用必报 SQL 错误）
const ALLOWED_BULK_FIELDS = [
  'category', 'name', 'quantity', 'min_quantity', 'location',
  'expiry_date', 'notes'
]

ipcMain.handle('items:batchDelete', (_event, { ids }) => {
  if (!ids || ids.length === 0) return { deleted: 0 }
  // 用无编号的 ? 占位符：?N 是 named placeholder，不能用 .run(...arr) 位置绑定，
  // 否则 better-sqlite3 会报 "Too many parameter values were provided"。
  const ph = ids.map(() => '?').join(',')
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
  // 同上：全部用无编号 ?，避免 better-sqlite3 报 "Too many parameter values were provided"
  const ph = ids.map(() => '?').join(',')
  const upd = db.prepare(
    `UPDATE items SET "${safe}" = ?, updated_at = ? WHERE id IN (${ph})`
  )
  const tx = db.transaction((arr) => {
    upd.run(...arr)
    return arr.length
  })
  return { updated: tx([value ?? '', now, ...ids]) }
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

ipcMain.handle('system:health', () => {
  const fn = global.__dbHealthCheck
  if (typeof fn === 'function') {
    const h = fn()
    return { ...h, version: app.getVersion() }
  }
  return { ok: false, message: '健康检查未初始化', version: app.getVersion() }
})

ipcMain.handle('materials:create', (_event, data) => {
  const now = Date.now()
  const id = crypto.randomUUID()
  db.prepare(
    'INSERT INTO materials (id,type,title,content,url,tags,photo,meta,event_start_date,event_end_date,created_at,updated_at) VALUES (@id,@type,@title,@content,@url,@tags,@photo,@meta,@event_start_date,@event_end_date,@created_at,@updated_at)'
  ).run({
    id,
    type: data.type || 'note',
    title: data.title || '',
    content: data.content || '',
    url: data.url || '',
    tags: normalizeTags(data.tags),
    photo: data.photo || '',
    meta: data.meta || '',
    event_start_date: data.event_start_date || '',
    event_end_date: data.event_end_date || '',
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
    tags: patch.tags !== undefined ? normalizeTags(patch.tags) : cur.tags,
    updated_at: Date.now()
  }
  db.prepare(
    'UPDATE materials SET type=@type,title=@title,content=@content,url=@url,tags=@tags,photo=@photo,meta=@meta,event_start_date=@event_start_date,event_end_date=@event_end_date,updated_at=@updated_at WHERE id=@id'
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
    let sanitized = filename ? String(filename).replace(/[^a-zA-Z0-9._-]/g, '_') : (crypto.randomUUID() + '.webp')
    // 防覆盖兜底：同名文件已存在时追加随机后缀而非静默覆盖——
    // 任何调用方传固定文件名都不会再破坏已有物品的图片
    if (fs.existsSync(path.join(dir, sanitized))) {
      const ext = path.extname(sanitized)
      const stem = ext ? sanitized.slice(0, -ext.length) : sanitized
      sanitized = `${stem}-${crypto.randomBytes(4).toString('hex')}${ext}`
    }
    const filePath = safePath(sanitized, dir)
    const data = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    fs.writeFileSync(filePath, data)
    return { ok: true, relPath: 'photos/' + sanitized }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// 从绝对文件路径直接复制图片到 photos 目录（避免大 base64 截断）
// 安全约束：只接受 dialog:pickImage 选中过的路径（approvedPickPaths），且扩展名必须是图片，
// 防止被攻破的渲染进程复制磁盘任意文件进 photos 再经 photo:read 外泄
ipcMain.handle('photo:saveFile', async (_event, { filePath, extension }) => {
  if (!filePath || typeof filePath !== 'string') return { ok: false, error: 'invalid path' }
  const normalized = path.normalize(filePath)
  if (!approvedPickPaths.has(normalized)) {
    console.warn('[photo:saveFile] rejected (not from dialog pick):', normalized)
    return { ok: false, error: 'path not approved' }
  }
  try {
    const dir = path.join(resolveDataDir(), 'photos')
    fs.mkdirSync(dir, { recursive: true })
    const rawExt = (extension && /^\.[a-zA-Z0-9]+$/.test(extension))
      ? extension.toLowerCase()
      : (path.extname(normalized) || '.webp').toLowerCase()
    if (!IMAGE_EXTENSIONS.has(rawExt)) return { ok: false, error: 'unsupported image type' }
    const sanitized = crypto.randomUUID() + rawExt
    const target = safePath(sanitized, dir)
    fs.copyFileSync(normalized, target)
    // 一次性使用，复制完成即移出批准列表
    approvedPickPaths.delete(normalized)
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

// 导入 JSON：mode = 'replace'（默认，清空重灌）| 'merge'（按 id 更新/新增，保留未涉及数据）
ipcMain.handle('sync:importData', (_event, payload) => {
  // 兼容旧签名（直接传字符串）
  const jsonString = typeof payload === 'string' ? payload : payload?.jsonString
  const mode = (typeof payload === 'object' && payload?.mode) || 'replace'
  const parsed = JSON.parse(jsonString)
  const items = Array.isArray(parsed) ? parsed : parsed.items || []
  const now = Date.now()

  if (mode === 'merge') {
    // 合并模式：导入前先写滚动备份；已存在 id 覆盖更新，不存在则新增，其余数据原样保留
    writeRollingBackupSync()
    const tx = db.transaction((rows) => {
      ensureCategoriesFromItems(db, rows)
      ensureLocationsFromItems(db, rows)
      let updated = 0
      let inserted = 0
      for (const r of rows) {
        const row = fromImportItem(r, now)
        const exists = db.prepare('SELECT id FROM items WHERE id = ?').get(row.id)
        if (exists) {
          db.prepare(
            `UPDATE items SET name=@name, item_no=@item_no, room=@room, position=@position, location=@location,
             quantity=@quantity, min_quantity=@min_quantity, photo=@photo, category=@category, expiry_date=@expiry_date,
             updated_at=@updated_at WHERE id=@id`
          ).run(row)
          updated += 1
        } else {
          db.prepare(
            `INSERT INTO items
              (id, name, item_no, room, position, location, quantity, min_quantity, photo, category, expiry_date, created_at, updated_at)
             VALUES (@id, @name, @item_no, @room, @position, @location, @quantity, @min_quantity, @photo, @category, @expiry_date, @created_at, @updated_at)`
          ).run(row)
          inserted += 1
        }
      }
      return { updated, inserted }
    })
    const { updated, inserted } = tx(items)
    return { imported: items.length, mode, updated, inserted }
  }

  // 覆盖模式（默认，旧行为）：同样先备份再清空重灌，坏文件可从 backups/ 恢复
  writeRollingBackupSync()
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
  return { imported: items.length, mode }
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
// v2.0.1: 立即注入 OCR 自学习持久化（必须在 IPC 注册之前完成）
// ai-service.js 通过 setPersistSettings(fn) 注册一个会触发 settings 落盘的回调
// OCR 每次命中 200 时会调这个回调写回 settings.json
let __appSettingsDirty = false
let __appSettingsTimer = null
function __schedulePersistSettings() {
  __appSettingsDirty = true
  if (__appSettingsTimer) return
  __appSettingsTimer = setTimeout(() => {
    __appSettingsTimer = null
    if (!__appSettingsDirty) return
    __appSettingsDirty = false
    try {
      // 简单读-改-写：先读当前 settings（已被 ai-service 改过内存对象），再写盘
      const s = readAppSettings()
      writeAppSettings(s)
    } catch (e) {
      console.error('[main] schedulePersistSettings error:', e)
    }
  }, 500)
}
setPersistSettings(__schedulePersistSettings)

app.whenReady().then(() => {
  // 启动期错误日志写入文件，便于无 console 环境排查
  const logPath = path.join(app.getPath('userData'), 'startup-error.log')
  const log = (msg) => {
    try {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
    } catch (_) { /* ignore */ }
  }
  // v2.0.4: asar 自检 — 防止装错版本导致白屏
  try {
    const asarPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar')
      : null
    if (asarPath && fs.existsSync(asarPath)) {
      const { listHeader } = require('@electron/asar') // 仅拿 header，不解大文件
      // 简单读 asar 头部 JSON 找 dist/assets/App-*.js
      const fd = fs.openSync(asarPath, 'r')
      const headerBuf = Buffer.alloc(8)
      fs.readSync(fd, headerBuf, 0, 8, 0)
      const pickleSize = headerBuf.readUInt32LE(4)
      const pickleStr = Buffer.alloc(pickleSize)
      fs.readSync(fd, pickleStr, 0, pickleSize, 8)
      const header = JSON.parse(pickleStr.toString('utf8'))
      fs.closeSync(fd)
      // asar header.files 是平铺，键是相对路径（可能以/或\开头）
      const appFileKey = Object.keys(header.files || {}).find(k => /App-.*\.js$/.test(k))
      if (appFileKey) {
        const fileInfo = header.files[appFileKey]
        if (fileInfo && fileInfo.offset != null) {
          const fd2 = fs.openSync(asarPath, 'r')
          const total = 8 + pickleSize + fileInfo.offset + fileInfo.size
          // 我们只取前 4KB 看看有没有 safeHame
          const sample = Math.min(4 * 1024 * 1024, fileInfo.size)
          const chunk = Buffer.alloc(sample)
          fs.readSync(fd2, chunk, 0, sample, 8 + pickleSize + fileInfo.offset)
          fs.closeSync(fd2)
          // 用 split 简单匹配，避开 433KB 字符串构造
          if (chunk.indexOf('safeHame') >= 0) {
            log(`[startup] FATAL asar contains safeHame in ${appFileKey}`)
            dialog.showErrorBox(
              '安装包有误',
              `检测到 v2.0.4 之前版本的安装残留（app.asar 仍含错误变量）。\n\n请：\n1) 控制面板 → 卸载 "Family Inventory"\n2) 删除残留目录: ${app.getPath('userData')}\n3) 重新安装 v2.0.4\n\n受影响文件: ${appFileKey}`
            )
            app.quit()
            return
          }
          log(`[startup] asar self-check passed (${appFileKey}, no safeHame)`)
        }
      }
    }
  } catch (e) {
    log(`[startup] asar self-check skipped: ${e && e.message || e}`)
  }
  try {
    log(`[startup] whenReady begin, version=${app.getVersion()}`)
    // createWindow() 在 initDatabase 之后调用，因为 initDatabase 需要 mainWindow 来通知恢复
    createWindow()
    log('[startup] createWindow ok')
    initDatabase(mainWindow)
    log('[startup] initDatabase ok')
    migrateCategoryKeys()
    log('[startup] migrateCategoryKeys ok')
    deduplicateCategories()
    log('[startup] deduplicateCategories ok')
    // 初始化成功后写滚动备份（异步、WAL 一致性快照），供损坏恢复链使用
    writeRollingBackup()
    const settings = readAppSettings()
    buildMenu(settings.language || 'zh')
    createTray()
    log('[startup] tray/menu ok')

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
    log('[startup] apiServer started')
  } catch (e) {
    log(`[startup] FATAL: ${e.stack || e.message || e}`)
    console.error('[startup] FATAL:', e)
    // 即使 db 初始化失败，也尝试启动 API（降级模式），方便诊断
    if (!apiServer) {
      try {
        apiServer = new ApiServer({
          db: null,
          getSettings: readAppSettings,
          writeAppSettings,
          resolveDbPath,
          app,
          getMainWindow: () => mainWindow
        })
        apiServer.start()
        log('[startup] apiServer started in degraded mode (no db)')
      } catch (e2) {
        log(`[startup] apiServer degraded start failed: ${e2.message}`)
      }
    }
  }

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
  // 兼容：try 块里 db 初始化失败 → 跳进 catch → settings 未定义 → 这里用 try/catch + 默认值保护
  try {
    if (settings && settings.autoCheckUpdate !== false) {
      setTimeout(() => {
        try { updater.checkForUpdates(true) } catch (e) { /* ignore */ }
      }, 8000)
    }
  } catch (e) {
    /* settings 未定义时静默忽略，自动检查更新跳过即可 */
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

// DEBUG SCHEMA DUMP
function dumpSchema(database) {
  const fs = require('fs');
  const path = require('path');
  const log = (s) => { try { fs.appendFileSync(path.join(require('os').homedir(),'AppData','Roaming','family-inventory','startup-error.log'), '[schema] '+s+'\n') } catch(_){} };
  try { log('items: '+database.prepare('PRAGMA table_info(items)').all().map(c=>c.name).join(',')); } catch(e){log('items err: '+e.message);}
  try { log('materials: '+database.prepare('PRAGMA table_info(materials)').all().map(c=>c.name).join(',')); } catch(e){log('materials err: '+e.message);}
}
