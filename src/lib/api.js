// 前端数据访问层：封装 window.lingguang preload API
const api = window.lingguang

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

export function fetchCategoryCounts() {
  return api.db.query({
    sql: 'SELECT category, COUNT(*) as count FROM items GROUP BY category'
  })
}

// ===== 统计页数据 =====
export async function fetchStatistics() {
  const [items, categories, locations] = await Promise.all([
    api.db.query({ sql: 'SELECT * FROM items' }),
    api.categories.list(),
    api.locations.list()
  ])

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
        name: cat ? categoryDisplayName(cat, 'zh') : key,
        name_en: cat?.name_en || key,
        count
      }
    })
    .sort((a, b) => b.count - a.count)

  // 位置统计（按 location 路径）
  const locationMap = {}
  items.forEach((it) => {
    const loc = it.location?.trim() || it.room?.trim() || '未指定位置'
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

  // 时间维度：按创建月份
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

  // 数量分布
  const quantityStats = items.map((it) => ({
    name: it.name,
    quantity: it.quantity,
    min: it.min_quantity
  })).sort((a, b) => b.quantity - a.quantity).slice(0, 15)

  // 总体指标
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
  if (!id) return null
  const map = {}
  list.forEach((l) => (map[l.id] = l))
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
  if (item.location) {
    const parts = String(item.location).split(/\s*>\s*/).filter(Boolean)
    if (parts.length) return parts
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

export async function openPath(target) {
  return api.shell.openPath(target)
}

export async function openExternal(url) {
  return api.shell.openExternal(url)
}

export async function generateItemNo() {
  return api.items.generateItemNo()
}

// ===== 电子材料库 =====
export async function fetchMaterials({ type, keyword } = {}) {
  return api.materials.list({ type, keyword })
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
