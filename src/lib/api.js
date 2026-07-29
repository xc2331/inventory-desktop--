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

export async function createItem(item) {
  const now = Date.now()
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
    category: item.category || '',
    expiry_date: Number(item.expiry_date) || 0,
    created_at: item.created_at || now,
    updated_at: now
  }
  await api.db.execute({
    sql: `INSERT INTO items
      (id, name, item_no, room, position, location, quantity, min_quantity, photo, category, expiry_date, created_at, updated_at)
      VALUES (@id, @name, @item_no, @room, @position, @location, @quantity, @min_quantity, @photo, @category, @expiry_date, @created_at, @updated_at)`,
    binds: row
  })
  return row
}

export async function updateItem(id, patch) {
  const now = Date.now()
  const rows = await api.db.query({ sql: 'SELECT * FROM items WHERE id = ?', binds: [id] })
  const cur = rows[0]
  if (!cur) return null
  const next = {
    ...cur,
    ...patch,
    quantity: Number(patch.quantity ?? cur.quantity) || 0,
    min_quantity: Number(patch.min_quantity ?? cur.min_quantity) || 0,
    expiry_date: Number(patch.expiry_date ?? cur.expiry_date) || 0,
    updated_at: now
  }
  await api.db.execute({
    sql: `UPDATE items SET
      name=@name, item_no=@item_no, room=@room, position=@position, location=@location,
      quantity=@quantity, min_quantity=@min_quantity, photo=@photo, category=@category,
      expiry_date=@expiry_date, updated_at=@updated_at WHERE id=@id`,
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

// 根据语言取分类显示名
export function categoryDisplayName(cat, lang) {
  if (!cat) return ''
  if (lang === 'en' && cat.name_en) return cat.name_en
  return cat.name || cat.name_en || cat.key
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

// 每个位置下的物品计数
export function fetchLocationItemCounts() {
  return api.db.query({
    sql: "SELECT position as name, COUNT(*) as count FROM items WHERE position != '' GROUP BY position"
  })
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
