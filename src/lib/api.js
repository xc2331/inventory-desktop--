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

// Memoized regex used by normalizeCategoryKey to convert whitespace
// sequences to underscores without re-compiling on every call.
const CATEGORY_KEY_RE = /[\s\u00A0]+/g

export function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2)
}

// ===== 物品 =====
export function fetchAllItems() {
  return api.db.query({ sql: 'SELECT * FROM items ORDER BY updated_at DESC' })
}

export function searchItems(keyword) {
  const like = `%${keyword}%`
  return api.db.query({
    sql: `SELECT * FROM items
          WHERE name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?
          ORDER BY updated_at DESC`,
    binds: [like, like, like, like, like]
  })
}

export function fetchByCategory(category) {
  return api.db.query({
    sql: 'SELECT * FROM items WHERE category = ? ORDER BY updated_at DESC',
    binds: [category]
  })
}

export function fetchByCategoryAndKeyword(category, keyword) {
  const like = `%${keyword}%`
  return api.db.query({
    sql: `SELECT * FROM items
          WHERE category = ? AND (name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?)
          ORDER BY updated_at DESC`,
    binds: [category, like, like, like, like, like]
  })
}

// Pagination helpers (P-02): fetch a slice of items and total count
// Each function pairs a paginated query (offset + limit) with a matching COUNT(*) query
export function fetchItemsPaged(offset, limit, opts = {}) {
  const { category, keyword, showExpired } = opts
  let sql = 'SELECT * FROM items'
  const binds = []
  if (showExpired) {
    // Client-side filtering is still used in useItems, but keep pagination intact
    // by applying the base filter and returning up to `limit` rows for filtering
    sql = 'SELECT * FROM items'
  } else if (category && keyword) {
    const like = `%${keyword}%`
    sql += ' WHERE category = ? AND (name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?)'
    binds.push(category, like, like, like, like, like)
  } else if (category) {
    sql += ' WHERE category = ?'
    binds.push(category)
  } else if (keyword) {
    const like = `%${keyword}%`
    sql += ' WHERE name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?'
    binds.push(like, like, like, like, like)
  }
  sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?'
  binds.push(limit, offset)
  return api.db.query({ sql, binds })
}

export function fetchItemsTotal(opts = {}) {
  const { category, keyword } = opts
  let sql = 'SELECT COUNT(*) AS cnt FROM items'
  const binds = []
  if (category && keyword) {
    const like = `%${keyword}%`
    sql += ' WHERE category = ? AND (name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?)'
    binds.push(category, like, like, like, like, like)
  } else if (category) {
    sql += ' WHERE category = ?'
    binds.push(category)
  } else if (keyword) {
    const like = `%${keyword}%`
    sql += ' WHERE name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?'
    binds.push(like, like, like, like, like)
  }
  return api.db.query({ sql, binds })
}

export function fetchCategoryCounts() {
  return api.db.query({
    sql: 'SELECT category, COUNT(*) as count FROM items GROUP BY category'
  })
}

// ===== 统计页数据（P-03：聚合逻辑已移至后端 sync:stats，仅转发）=====
export async function fetchStatistics() {
  return api.sync.stats()
}

export async function createItem(item) {
  const now = Date.now()
  const categories = await fetchCategories()
  const row = {
    id: item.id || uid(),
    name: item.name || '',
    item_no: item.item_no || '',
    room: item.room || '',
    position: item.position || '',
    location: item.location || '',
    quantity: Number(item.quantity) || 0,
    min_quantity: Number(item.min_quantity) || 0,
    photo: item.photo || '',
    category: normalizeCategoryKey(item.category, categories),
    expiry_date: Number(item.expiry_date) || 0,
    notes: item.notes || '',
    consume_rate: Number(item.consume_rate) || 0,
    consume_unit: item.consume_unit || 'day',
    consume_start_at: Number(item.consume_start_at) || 0,
    photo_meta: item.photo_meta || '',
    created_at: item.created_at || now,
    updated_at: now
  }
  await api.db.execute({
    sql: `INSERT INTO items
      (id, name, item_no, room, position, location, quantity, min_quantity, photo, category, expiry_date,
       notes, consume_rate, consume_unit, consume_start_at, photo_meta, created_at, updated_at)
      VALUES (@id, @name, @item_no, @room, @position, @location, @quantity, @min_quantity, @photo, @category, @expiry_date,
              @notes, @consume_rate, @consume_unit, @consume_start_at, @photo_meta, @created_at, @updated_at)`,
    binds: row
  })
  // 自动把新物品的分类/位置同步到分类表和位置树
  await Promise.all([api.sync.rebuildCategories(), api.sync.rebuildLocations()])
  return row
}

export async function updateItem(id, patch) {
  const now = Date.now()
  const rows = await api.db.query({ sql: 'SELECT * FROM items WHERE id = ?', binds: [id] })
  const cur = rows[0]
  if (!cur) return null
  const categories = await fetchCategories()
  const next = {
    ...cur,
    ...patch,
    quantity: Number(patch.quantity ?? cur.quantity) || 0,
    min_quantity: Number(patch.min_quantity ?? cur.min_quantity) || 0,
    expiry_date: Number(patch.expiry_date ?? cur.expiry_date) || 0,
    category: patch.category !== undefined ? normalizeCategoryKey(patch.category, categories) : cur.category,
    notes: patch.notes !== undefined ? patch.notes : cur.notes,
    consume_rate: Number(patch.consume_rate ?? cur.consume_rate) || 0,
    consume_unit: patch.consume_unit || cur.consume_unit || 'day',
    consume_start_at: Number(patch.consume_start_at ?? cur.consume_start_at) || 0,
    photo_meta: patch.photo_meta !== undefined ? patch.photo_meta : cur.photo_meta,
    updated_at: now
  }
  await api.db.execute({
    sql: `UPDATE items SET
      name=@name, item_no=@item_no, room=@room, position=@position, location=@location,
      quantity=@quantity, min_quantity=@min_quantity, photo=@photo, category=@category,
      expiry_date=@expiry_date, notes=@notes, consume_rate=@consume_rate, consume_unit=@consume_unit,
      consume_start_at=@consume_start_at, photo_meta=@photo_meta, updated_at=@updated_at WHERE id=@id`,
    binds: next
  })
  // 自动把更新后的分类/位置同步到分类表和位置树
  await Promise.all([api.sync.rebuildCategories(), api.sync.rebuildLocations()])
  return next
}

export async function adjustQuantity(id, delta) {
  await api.db.execute({
    sql: 'UPDATE items SET quantity = quantity + ?, updated_at = ? WHERE id = ?',
    binds: [delta, Date.now(), id]
  })
}

export async function deleteItem(id) {
  await api.db.execute({ sql: 'DELETE FROM items WHERE id = ?', binds: [id] })
}

export async function bulkDeleteItems(ids) {
  if (!ids || ids.length === 0) return { deleted: 0 }
  const ph = ids.map(() => '?').join(',')
  const res = await api.db.execute({
    sql: `DELETE FROM items WHERE id IN (${ph})`,
    binds: ids
  })
  return { deleted: res.changes || 0 }
}

export async function bulkUpdateCategory(ids, category) {
  if (!ids || ids.length === 0) return { updated: 0 }
  const ph = ids.map(() => '?').join(',')
  const res = await api.db.execute({
    sql: `UPDATE items SET category = ?, updated_at = ? WHERE id IN (${ph})`,
    binds: [category, Date.now(), ...ids]
  })
  return { updated: res.changes || 0 }
}

// U-08 批量操作预览：返回各字段变更前的 diff，供前端预览
export async function bulkPreview(ids, patch) {
  if (!ids || ids.length === 0) return []
  const ph = ids.map(() => '?').join(',')
  const rows = await api.db.query({
    sql: `SELECT id, name, quantity, unit, item_no, category, consume_rate, min_quantity FROM items WHERE id IN (${ph})`,
    binds: ids
  })
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
export function fetchLocationItemCounts() {
  return api.db.query({
    sql: "SELECT position as name, COUNT(*) as count FROM items WHERE position != '' GROUP BY position"
  })
}

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

export async function importJSON(jsonString) {
  return api.sync.importData(jsonString)
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
