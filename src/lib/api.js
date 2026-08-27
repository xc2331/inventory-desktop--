// 前端数据访问层：封装 window.lingguang preload API
// 延迟取值：模块加载时 preload 可能尚未注入，用递归 Proxy 包装，
// 实际调用时才读取 window.lingguang，避免顶层引用导致白屏崩溃
function buildProxy(basePath) {
  return new Proxy({}, {
    get(_, prop) {
      if (!window.lingguang) return undefined
      const obj = basePath.reduce((o, p) => (o?.[p] ?? null), window.lingguang)
      if (!obj) return undefined
      const v = obj[prop]
      if (typeof v === 'undefined') return undefined
      if (typeof v === 'function') return (...args) => v.apply(obj, args)
      if (v === null || typeof v !== 'object') return v
      if (v instanceof Array || v instanceof Date || v instanceof RegExp || v instanceof Error) return v
      return buildProxy([...basePath, prop])
    }
  })
}

const api = buildProxy([])

// SQL 统一单入口（P3-3）：所有 SELECT/INSERT/UPDATE/DELETE 走 core/db/query.js
import { query as dbQuery, execute as dbExecute } from '../core/db/query.js'

// Memoized regex used by normalizeCategoryKey to convert whitespace
// sequences to underscores without re-compiling on every call.
const CATEGORY_KEY_RE = /[\s\u00A0]+/g

export function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2)
}

// ===== 物品 =====
// SQL 语句常量化：所有发往主进程的 SQL 必须是下列字面量之一（主进程按精确匹配校验，
// 见 electron/sql-whitelist.json + main.js normalizeSql）。禁止在调用点动态拼接 SQL ——
// 动态拼接会绕过白名单被拒绝。SQL_STATEMENTS 供测试交叉校验白名单覆盖。
const OB = 'ORDER BY CASE WHEN sort_order > 0 THEN 0 ELSE 1 END, sort_order ASC, updated_at DESC'

export const SQL_STATEMENTS = [
  `SELECT * FROM items ${OB}`,
  `SELECT id, name, item_no, room, position, location, quantity, min_quantity, category, expiry_date, consume_unit, photo_meta, created_at, updated_at FROM items ${OB}`,
  `SELECT * FROM items WHERE name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ? ${OB}`,
  `SELECT * FROM items WHERE category = ? ${OB}`,
  `SELECT * FROM items WHERE category = ? AND (name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?) ${OB}`,
  `SELECT * FROM items ${OB} LIMIT ? OFFSET ?`,
  `SELECT * FROM items WHERE category = ? ${OB} LIMIT ? OFFSET ?`,
  `SELECT * FROM items WHERE name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ? ${OB} LIMIT ? OFFSET ?`,
  `SELECT * FROM items WHERE category = ? AND (name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?) ${OB} LIMIT ? OFFSET ?`,
  'SELECT COUNT(*) AS cnt FROM items',
  'SELECT COUNT(*) AS cnt FROM items WHERE category = ?',
  'SELECT COUNT(*) AS cnt FROM items WHERE name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?',
  'SELECT COUNT(*) AS cnt FROM items WHERE category = ? AND (name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?)',
  'SELECT category, COUNT(*) as count FROM items GROUP BY category',
  "SELECT position as name, COUNT(*) as count FROM items WHERE position != '' GROUP BY position",
  'UPDATE items SET quantity = MAX(0, CAST(quantity AS INTEGER) + ?), updated_at = ? WHERE id = ?',
  'DELETE FROM items WHERE id = ?',
  'DELETE FROM items WHERE id IN (?)',
  'UPDATE items SET category = ?, updated_at = ? WHERE id IN (?)',
  'SELECT id, name, quantity, item_no, category, consume_rate, min_quantity, expiry_date, notes, location FROM items WHERE id IN (?)',
  'SELECT id, name, quantity FROM items WHERE id IN (?)'
]

// 按下标取用，避免调用点出现任何字符串拼接
const [
  SQL_ITEMS_ALL,
  SQL_ITEMS_META,
  SQL_ITEMS_SEARCH,
  SQL_ITEMS_BY_CATEGORY,
  SQL_ITEMS_BY_CATEGORY_KEYWORD,
  SQL_ITEMS_PAGED_ALL,
  SQL_ITEMS_PAGED_CATEGORY,
  SQL_ITEMS_PAGED_KEYWORD,
  SQL_ITEMS_PAGED_CATEGORY_KEYWORD,
  SQL_COUNT_ALL,
  SQL_COUNT_CATEGORY,
  SQL_COUNT_KEYWORD,
  SQL_COUNT_CATEGORY_KEYWORD,
  SQL_CATEGORY_COUNTS,
  SQL_LOCATION_COUNTS,
  SQL_ADJUST_QTY,
  SQL_DELETE_ITEM,
  SQL_BULK_DELETE,
  SQL_BULK_UPDATE_CATEGORY,
  SQL_BULK_PREVIEW,
  SQL_QTY_BY_IDS
] = SQL_STATEMENTS

export function fetchAllItems() {
  return dbQuery(SQL_ITEMS_ALL)
}

// 轻量元数据查询：排除 photo/notes 等大字段，用于通知轮询、过期预警、统计预热等
// 不需要展示图片的场景，避免每次全量序列化几百 KB 的 base64
export function fetchItemsMeta() {
  return dbQuery(SQL_ITEMS_META)
}

export function searchItems(keyword) {
  const like = `%${keyword}%`
  return dbQuery(SQL_ITEMS_SEARCH, [like, like, like, like, like])
}

export function fetchByCategory(category) {
  return dbQuery(SQL_ITEMS_BY_CATEGORY, [category])
}

export function fetchByCategoryAndKeyword(category, keyword) {
  const like = `%${keyword}%`
  return dbQuery(SQL_ITEMS_BY_CATEGORY_KEYWORD, [category, like, like, like, like, like])
}

// Pagination helpers (P-02)：分页查询与 COUNT 成对，SQL 从常量中按筛选分支选取
export function fetchItemsPaged(offset, limit, opts = {}) {
  const { category, keyword } = opts
  if (category && keyword) {
    const like = `%${keyword}%`
    return dbQuery(SQL_ITEMS_PAGED_CATEGORY_KEYWORD, [category, like, like, like, like, like, limit, offset])
  }
  if (category) {
    return dbQuery(SQL_ITEMS_PAGED_CATEGORY, [category, limit, offset])
  }
  if (keyword) {
    const like = `%${keyword}%`
    return dbQuery(SQL_ITEMS_PAGED_KEYWORD, [like, like, like, like, like, limit, offset])
  }
  return dbQuery(SQL_ITEMS_PAGED_ALL, [limit, offset])
}

export function fetchItemsTotal(opts = {}) {
  const { category, keyword } = opts
  if (category && keyword) {
    const like = `%${keyword}%`
    return dbQuery(SQL_COUNT_CATEGORY_KEYWORD, [category, like, like, like, like, like])
  }
  if (category) {
    return dbQuery(SQL_COUNT_CATEGORY, [category])
  }
  if (keyword) {
    const like = `%${keyword}%`
    return dbQuery(SQL_COUNT_KEYWORD, [like, like, like, like, like])
  }
  return dbQuery(SQL_COUNT_ALL)
}

export function fetchCategoryCounts() {
  return dbQuery(SQL_CATEGORY_COUNTS)
}

export function fetchLocationItemCounts() {
  return dbQuery(SQL_LOCATION_COUNTS)
}

// 批量改数量前的现值查询（hooks 使用；SQL 收敛在 api 层）
export function fetchQtyByIds(ids) {
  if (!ids || ids.length === 0) return []
  return dbQuery(SQL_QTY_BY_IDS, ids)
}

// ===== 统计页数据（P-03：聚合逻辑已移至后端 sync:stats，仅转发）=====
export async function fetchStatistics() {
  return api.sync.stats()
}

// 创建/更新物品：走主进程语义化 IPC（items:create / items:update），
// 与外部 Agent API 共用同一 service 实现（electron/services/items.js），
// 不再由渲染进程拼 SQL + 全表 rebuild（消除双写入路径漂移）
export async function createItem(item) {
  const res = await api.items.create(item)
  return res?.row || item
}

export async function updateItem(id, patch) {
  const res = await api.items.update(id, patch)
  return res?.row || null
}

// 手动排序持久化：把当前可见顺序物化为 items.sort_order（主进程事务写入）
export async function setItemsOrder(orderedIds) {
  return api.items.setOrder(orderedIds)
}

export async function adjustQuantity(id, delta) {
  // MAX(0, ...) 下限保护：与批量修改（items:batchChangeQty）行为一致，
  // 防止 UI 之外的调用路径（Agent API / 快捷操作竞态）把库存刷成负数
  await dbExecute(SQL_ADJUST_QTY, [delta, Date.now(), id])
}

export async function deleteItem(id) {
  await dbExecute(SQL_DELETE_ITEM, [id])
}

export async function bulkDeleteItems(ids) {
  if (!ids || ids.length === 0) return { deleted: 0 }
  const res = await dbExecute(SQL_BULK_DELETE, ids)
  return { deleted: res.changes || 0 }
}

export async function bulkUpdateCategory(ids, category) {
  if (!ids || ids.length === 0) return { updated: 0 }
  const res = await dbExecute(SQL_BULK_UPDATE_CATEGORY, [category, Date.now(), ...ids])
  return { updated: res.changes || 0 }
}

// U-08 批量操作预览：返回各字段变更前的 diff，供前端预览
// 仅 SELECT items 表实际存在的列（unit 列不存在，混入会直接 SQL 报错）
export async function bulkPreview(ids, patch) {
  if (!ids || ids.length === 0) return []
  const rows = await dbQuery(SQL_BULK_PREVIEW, ids)
  const changed = []
  for (const r of rows) {
    const before = {}
    const after = {}
    for (const [k, v] of Object.entries(patch)) {
      if (r[k] === undefined) continue
      before[k] = r[k]
      after[k] = v
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.push({ id: r.id, name: r.name, before, after })
    }
  }
  return changed
}

// U-08 批量字段更新（category/quantity/unit/item_no/consume_rate/min_quantity 等）
// Uses IPC batch handler to wrap in a single transaction
export async function bulkUpdateField(ids, field, value) {
  if (!ids || ids.length === 0) return { updated: 0 }
  const res = await api.items.batchUpdate(field, value, ids)
  return { updated: res.updated || 0 }
}

// ===== 分类（动态）=====
export async function fetchCategories() {
  return api.categories.list()
}

export async function createCategory({ key, name, name_en, icon }) {
  return api.categories.create({ key, name, name_en, icon })
}

export async function updateCategory(id, patch) {
  return api.categories.update(id, patch)
}

export async function deleteCategory(id) {
  return api.categories.delete(id)
}

export async function reorderCategories(ids) {
  return api.categories.reorder(ids)
}

export async function mergeCategories(fromKey, toKey) {
  return api.categories.merge(fromKey, toKey)
}

// 根据语言取分类显示名
export function categoryDisplayName(cat, lang) {
  if (!cat) return ''
  if (lang === 'en' && cat.name_en) return cat.name_en
  return cat.name || cat.name_en || cat.key
}

// 分类别名表：将常见中英文变体归一化为 canonical key
export const CATEGORY_ALIASES = {
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

/**
 * 将用户输入/导入的原始分类字符串归一化为数据库中的 canonical key。
 * 优先匹配现有分类 key/name/name_en，再匹配默认别名表。
 */
export function normalizeCategoryKey(raw, categories = []) {
  if (!raw) return ''
  const key = String(raw).trim().toLowerCase()
  if (!key) return ''

  // 1. 直接命中已有分类 key
  const direct = categories.find((c) => c.key && c.key.toLowerCase() === key)
  if (direct) return direct.key

  // 2. 命中默认别名表
  for (const [canonical, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (canonical.toLowerCase() === key) return canonical
    if (aliases.includes(key)) return canonical
  }

  // 3. 按现有分类的 name / name_en 模糊匹配（忽略大小写）
  const byName = categories.find(
    (c) =>
      (c.name && c.name.toLowerCase() === key) ||
      (c.name_en && c.name_en.toLowerCase() === key)
  )
  if (byName) return byName.key

  // 4. 未命中则原样返回（保留用户自定义可能性）
  return raw
}

// ===== 位置树 =====
export async function fetchLocations() {
  return api.locations.list()
}

export async function createLocation({ name, parentId }) {
  return api.locations.create({ name, parentId })
}

export async function updateLocation(id, patch) {
  return api.locations.update(id, patch)
}

export async function deleteLocation(id) {
  return api.locations.delete(id)
}

// 把扁平列表构建为树
export function buildLocationTree(list) {
  const map = {}
  list.forEach((l) => {
    map[l.id] = { ...l, children: [] }
  })
  const roots = []
  list.forEach((l) => {
    const node = map[l.id]
    if (l.parent_id && map[l.parent_id]) {
      map[l.parent_id].children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

// 取某节点的完整路径名（祖先 > ... > 节点）
export function locationPath(list, id) {
  if (!id || !Array.isArray(list)) return null
  const map = {}
  list.forEach((l) => {
    if (l && l.id) map[l.id] = l
  })
  const names = []
  let cur = map[id]
  let guard = 0
  while (cur && guard < 50) {
    names.unshift(cur.name)
    cur = cur.parent_id ? map[cur.parent_id] : null
    guard++
  }
  return names.length ? names : null
}

// 取路径根（房间）与叶子（位置）
export function locationParts(list, id) {
  const path = locationPath(list, id)
  if (!path) return { room: '', position: '', location: '' }
  return {
    room: path[0] || '',
    position: path[path.length - 1] || '',
    location: path.join(' > ')
  }
}

// 每个位置下的物品计数（按 position 统计，旧逻辑保留给位置管理页）
// 实现已上移至上方 SQL 常量区（fetchLocationItemCounts），此处保留导出注释占位避免误加回动态拼接。

// 把物品的 location/room/position 解析为统一路径数组
export function itemLocationPath(item) {
  if (!item || typeof item !== 'object') return []
  if (item.location) {
    const raw = String(item.location).trim()
    if (raw) {
      const parts = raw
        .split(/\s*[>\/→\\]\s*/)
        .map((p) => p.trim())
        .filter(Boolean)
      if (parts.length) return parts
    }
  }
  const path = []
  if (item.room) path.push(String(item.room).trim())
  if (item.position && item.position !== item.room) path.push(String(item.position).trim())
  return path
}

// 判断物品是否属于指定位置路径（path 为其祖先前缀）
export function locationMatchesPath(item, path) {
  if (!path || path.length === 0) return true
  const itemPath = itemLocationPath(item)
  if (itemPath.length < path.length) return false
  for (let i = 0; i < path.length; i++) {
    if (itemPath[i] !== path[i]) return false
  }
  return true
}

// 根据当前物品列表，统计每个位置路径（含子级）的物品数量
export function buildLocationCounts(items) {
  const counts = {}
  items.forEach((item) => {
    const path = itemLocationPath(item)
    let prefix = ''
    path.forEach((part) => {
      prefix = prefix ? `${prefix} > ${part}` : part
      counts[prefix] = (counts[prefix] || 0) + 1
    })
  })
  return counts
}

// ===== 导入导出 =====
export async function exportJSON() {
  return api.sync.exportData()
}

// mode: 'replace'（默认，清空重灌）| 'merge'（按 id 合并，保留现有数据）
export async function importJSON(jsonString, mode = 'replace') {
  return api.sync.importData(jsonString, mode)
}

export async function exportCSV() {
  return api.sync.exportCSV()
}

export async function exportSelectedJSON(ids) {
  return api.sync.exportByIds(ids || [])
}

export async function exportExpiringReport() {
  return api.sync.exportExpiringReport()
}

export async function rebuildCategories() {
  return api.sync.rebuildCategories()
}

export async function rebuildLocations() {
  return api.sync.rebuildLocations()
}

export async function saveFile({ content, defaultName, filters }) {
  return api.file.save({ content, defaultName, filters })
}

/** 导出文件名清洗（防 `: / \ | ? * " < >` 及 `..` 路径穿越） */
export function sanitizeFilename(name) {
  return String(name || 'file')
    .replace(/[\x00-\x1f\x7f]/g, '')   // 控制字符
    .replace(/[<>:"|?*]/g, '_')        // 文件系统非法字符
    .replace(/\.\./g, '')              // 路径穿越
    .replace(/\s+/g, ' ')              // 连续空格归一
    .trim() || 'file'
}

export async function openFile({ filters }) {
  return api.file.open({ filters })
}

// ===== 设置 =====
export async function getSettings() {
  return api.settings.get()
}

export async function setSettings(patch) {
  return api.settings.set(patch)
}

export async function setDataDir(dir) {
  return api.settings.setDataDir(dir)
}

export async function resetDataDir() {
  return api.settings.resetDataDir()
}

export async function pickFolder() {
  return api.dialog.pickFolder()
}

export async function pickImage() {
  return api.dialog.pickImage()
}

// v1.8.6: 多选图片（用于 OCR 批量识别）
export async function pickImages() {
  return api.dialog.pickImages()
}

export async function pickFile() {
  return api.dialog.pickFile()
}

export async function openPath(target) {
  return api.shell.openPath(target)
}

export async function showItemInFolder(target) {
  return api.shell.showItemInFolder(target)
}

export async function openExternal(url) {
  return api.shell.openExternal(url)
}

export async function generateItemNo() {
  return api.items.generateItemNo()
}

// ===== 电子材料库 =====
export async function fetchMaterials({ type, keyword } = {}) {
  const result = await api.materials.list({ type, keyword })
  return result
}

export async function getMaterial(id) {
  return api.materials.get(id)
}

export async function createMaterial(data) {
  return api.materials.create(data)
}

export async function updateMaterial(id, patch) {
  return api.materials.update(id, patch)
}

export async function deleteMaterial(id) {
  return api.materials.delete(id)
}

export async function bulkDeleteMaterials(ids) {
  return api.materials.bulkDelete(ids)
}

export async function bulkUpdateMaterialType(ids, type) {
  return api.materials.bulkUpdateType(ids, type)
}

// ===== 手机扫码传图 =====
export async function startQRUpload() {
  return api.qrUpload.start()
}

export async function stopQRUpload() {
  return api.qrUpload.stop()
}

export async function getQRUploadImage() {
  return api.qrUpload.getImage()
}

export function onQRUploadImage(cb) {
  return api.qrUpload.onImage(cb)
}

// ===== AI 视觉识别 =====
export async function getAIConfig() {
  return api.ai.getConfig()
}

export async function setAIConfig(patch) {
  return api.ai.setConfig(patch)
}

export async function recognizeImageWithAI(image) {
  return api.ai.recognize(image)
}

// 批量识别多张图片：并发限流，进度回调
// 返回 { ok, suggestions, errors?, canceled?, total, done, elapsedMs, concurrency }
export async function recognizeBatchWithAI(images, options = {}) {
  return api.ai.recognizeBatch(images, options || {}) || {
    ok: false,
    suggestions: [],
    total: 0,
    done: 0
  }
}

// OCR：识别图片中所有文字，写入 item_ocr / material_ocr 独立表
// 返回 { ok, text, error }
export async function ocrItem({ id, image } = {}) {
  return api.ai.ocrItem({ id, image })
}

export async function ocrMaterial({ id, image } = {}) {
  return api.ai.ocrMaterial({ id, image })
}

export async function fetchAIModels(providerId) {
  return api.ai.fetchModels(providerId ? { providerId } : {})
}

export async function testAIConnection(providerId) {
  return api.ai.testConnection(providerId ? { providerId } : {})
}

// ===== 平面图 =====
export async function fetchFloorPlan(locationId) {
  return api.floorPlans.get(locationId)
}

export async function saveFloorPlan(locationId, plan) {
  return api.floorPlans.set(locationId, plan)
}

export async function deleteFloorPlan(locationId) {
  return api.floorPlans.delete(locationId)
}

export async function createFloorPlanSubLocation(parentId, name) {
  return api.floorPlans.createSubLocation(parentId, name)
}

// ===== 窗口控制 =====
export const winControl = {
  minimize: () => api.window.minimize(),
  maximize: () => api.window.maximize(),
  close: () => api.window.close(),
  isMaximized: () => api.window.isMaximized(),
  onMaximizeChange: (cb) => api.window.onMaximizeChange(cb),
  onRequestCloseAction: (cb) => api.window.onRequestCloseAction(cb),
  resolveCloseAction: (payload) => api.window.resolveCloseAction(payload)
}

// ===== Agent 外部 API =====
export async function getApiToken() {
  return api.settings.getApiToken()
}

export async function resetApiToken() {
  return api.settings.resetApiToken()
}

export async function setApiConfig(patch) {
  return api.settings.setApiConfig(patch)
}

export async function getMaterialTypes() {
  try {
    const res = api.settings.getMaterialTypes?.() || null
    return Array.isArray(res) ? res : DEFAULT_MATERIAL_TYPES
  } catch (e) {
    return DEFAULT_MATERIAL_TYPES
  }
}

export async function setMaterialTypes(types) {
  try {
    api.settings.setMaterialTypes?.(types)
  } catch {}
  return Array.isArray(types) ? types : DEFAULT_MATERIAL_TYPES
}

// ===== 软件内更新 =====
export async function getUpdaterInfo() {
  return api.updater.info()
}

export async function checkUpdate(opts = { silent: false }) {
  return api.updater.check(opts)
}

export async function setUpdateSource(sourceId) {
  return api.updater.setSource(sourceId)
}

export async function setUpdateMirror(url) {
  return api.updater.setMirror(url)
}

export async function setAutoCheckUpdate(enabled) {
  return api.updater.setAutoCheck(enabled)
}

export async function downloadUpdate() {
  return api.updater.download()
}

export async function cancelDownloadUpdate() {
  return api.updater.cancelDownload()
}

export async function installDownloadedUpdate() {
  return api.updater.installDownloaded()
}

export async function showUpdateInFolder() {
  return api.updater.showDownloadInFolder()
}

export async function getUpdateDownloadDir() {
  return api.updater.getDownloadDir()
}

export async function setUpdateDownloadDir(dir) {
  return api.updater.setDownloadDir(dir)
}

export async function pickUpdateDownloadDir() {
  return api.updater.pickDownloadDir()
}

export async function openUpdateExternal(url) {
  return api.updater.openExternal(url)
}

export function onUpdateAvailable(cb) {
  return api.updater.onAvailable(cb)
}

export function onUpdateNotAvailable(cb) {
  return api.updater.onNotAvailable(cb)
}

export function onUpdateDownloadStart(cb) {
  return api.updater.onDownloadStart(cb)
}

export function onUpdateProgress(cb) {
  return api.updater.onProgress(cb)
}

export function onUpdateDownloaded(cb) {
  return api.updater.onDownloaded(cb)
}

export function onUpdateInstalling(cb) {
  return api.updater.onInstalling(cb)
}

export function onUpdateError(cb) {
  return api.updater.onError(cb)
}

// ===== 图片存储 =====
/** 把压缩后的 base64 存到 <dataDir>/photos/，返回相对路径。 */
export async function savePhoto(base64, filename = null) {
  const result = await api.photo.save(base64, filename)
  if (result && result.ok) return result.relPath
  throw new Error(result?.error || '照片保存失败')
}

/** 读取照片文件，返回带 data: 前缀的 base64（用于 fallback 回显）。 */
export async function readPhoto(relPath) {
  const result = await api.photo.read(relPath)
  if (result && result.ok) return result.data
  throw new Error(result?.error || '照片读取失败')
}

/** 删除照片文件。 */
export async function deletePhoto(relPath) {
  if (!relPath) return
  const result = await api.photo.delete(relPath)
  return result
}

/** 把 DB 中 photo 字段的值归一化为 <img src> 可直接使用的 URL。 */
export function photoPath(value) {
  if (!value) return ''
  if (/^(data:|https?:|file:)/i.test(value)) return value
  return value // relative path: 直接传给 <img src>，Electron 会自动解析
}
