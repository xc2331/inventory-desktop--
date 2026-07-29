// 前端数据访问层：封装 window.lingguang preload API
const api = window.lingguang

export function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2)
}

// 查询全部物品（按更新时间倒序）
export function fetchAllItems() {
  return api.db.query({ sql: 'SELECT * FROM items ORDER BY updated_at DESC' })
}

// 关键词搜索（名称/编号/房间/位置）
export function searchItems(keyword) {
  const like = `%${keyword}%`
  return api.db.query({
    sql: `SELECT * FROM items
          WHERE name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?
          ORDER BY updated_at DESC`,
    binds: [like, like, like, like, like]
  })
}

// 按分类查询
export function fetchByCategory(category) {
  return api.db.query({
    sql: 'SELECT * FROM items WHERE category = ? ORDER BY updated_at DESC',
    binds: [category]
  })
}

// 分类 + 关键词组合查询
export function fetchByCategoryAndKeyword(category, keyword) {
  const like = `%${keyword}%`
  return api.db.query({
    sql: `SELECT * FROM items
          WHERE category = ? AND (name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?)
          ORDER BY updated_at DESC`,
    binds: [category, like, like, like, like, like]
  })
}

// 各分类计数
export function fetchCategoryCounts() {
  return api.db.query({
    sql: 'SELECT category, COUNT(*) as count FROM items GROUP BY category'
  })
}

// 新增物品
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

// 更新物品
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

// 数量快速增减（delta 为正负整数）
export async function adjustQuantity(id, delta) {
  await api.db.execute({
    sql: 'UPDATE items SET quantity = quantity + ?, updated_at = ? WHERE id = ?',
    binds: [delta, Date.now(), id]
  })
}

// 删除物品
export async function deleteItem(id) {
  await api.db.execute({ sql: 'DELETE FROM items WHERE id = ?', binds: [id] })
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

// 文件保存对话框
export async function saveFile({ content, defaultName, filters }) {
  return api.file.save({ content, defaultName, filters })
}

// 文件打开对话框
export async function openFile({ filters }) {
  return api.file.open({ filters })
}
