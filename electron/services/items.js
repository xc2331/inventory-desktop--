// 物品写入服务层：UI（IPC）与外部 Agent（HTTP API）共用的唯一写入路径。
// 之前两套实现各自漂移（UI 全表 rebuild vs Agent 单行 ensure），
// v1.2.13~v1.2.15 连续三个版本修的"同步不生效"正是该分裂的症状。
const crypto = require('crypto')
const { generateItemNo } = require('../item-no')
const {
  normalizeCategoryKey,
  ensureCategoriesFromItems,
  ensureLocationsFromItems
} = require('../data-utils')
const { normalizeTags } = require('../tags')

// 兼容多入口：data.tags 可能是 JSON 字符串、数组、undefined、null
// 行为：undefined 视为"未提供"（caller 在 buildItemRow 已不传，updateItem 用 cur.tags 兜底）；
//       null / '' / 非数组视为清空 → '[]'；
//       数组 → normalizeTags；
//       JSON 字符串 → 解析为数组再 normalize；
//       纯字符串（旧值） → 包成单元素数组。
function pickTags(data) {
  if (data === undefined) return undefined // 不写库
  if (data === null) return '[]'
  if (Array.isArray(data)) return normalizeTags(data)
  if (typeof data === 'string') {
    const t = data.trim()
    if (!t) return '[]'
    try {
      const parsed = JSON.parse(t)
      if (Array.isArray(parsed)) return normalizeTags(parsed)
      if (parsed && typeof parsed === 'object') {
        return normalizeTags(Object.values(parsed))
      }
      return '[]'
    } catch (_) {
      // 旧库残留的纯字符串（如"发票"）也允许：转成 ["发票"]
      return normalizeTags([t])
    }
  }
  return '[]'
}

function nowMs() {
  return Date.now()
}

// 由外部输入构造 items 行。
// keepTimestamps：撤销删除等恢复场景传入原 created_at/updated_at 原样保留
function buildItemRow(data, db, { keepTimestamps = false } = {}) {
  const t = nowMs()
  const categories = db ? db.prepare('SELECT * FROM categories').all() : []
  const rawItemNo = String(data.itemNo ?? data.item_no ?? '').trim()
  const itemNo = rawItemNo || (db ? generateItemNo(db) : '')
  const tagsValue = pickTags(data.tags ?? data.tagsJson)
  return {
    id: data.id || crypto.randomUUID(),
    name: String(data.name || ''),
    item_no: itemNo,
    room: String(data.room ?? ''),
    position: String(data.position ?? ''),
    location: String(data.location ?? ''),
    quantity: Math.max(0, Number(data.quantity) || 0),
    min_quantity: Math.max(0, Number(data.minQuantity ?? data.min_quantity) || 0),
    photo: String(data.photo ?? ''),
    category: normalizeCategoryKey(data.category, categories),
    expiry_date: Number(data.expiryDate ?? data.expiry_date) || 0,
    notes: String(data.notes ?? ''),
    consume_rate: Number(data.consume_rate) || 0,
    consume_unit: String(data.consume_unit || 'day'),
    consume_start_at: Number(data.consume_start_at) || 0,
    photo_meta: String(data.photo_meta ?? ''),
    // tags 写入：undefined 表示"调用方没提供 tags 字段"，则用占位 '[]'，由 service 层负责覆盖
    tags: tagsValue === undefined ? '[]' : tagsValue,
    created_at: keepTimestamps && Number(data.created_at) ? Number(data.created_at) : t,
    updated_at: keepTimestamps && Number(data.updated_at) ? Number(data.updated_at) : t
  }
}

// 创建物品 + 同步分类/位置（单事务）。返回 { row, sync } 供调用方决定如何通知前端。
function createItem(db, data) {
  const row = buildItemRow(data, db, { keepTimestamps: true })
  let createdCategories = 0
  let createdLocations = 0
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO items (id, name, item_no, room, position, location, quantity, min_quantity, photo, category, expiry_date,
        notes, consume_rate, consume_unit, consume_start_at, photo_meta, tags, created_at, updated_at)
       VALUES (@id, @name, @item_no, @room, @position, @location, @quantity, @min_quantity, @photo, @category, @expiry_date,
        @notes, @consume_rate, @consume_unit, @consume_start_at, @photo_meta, @tags, @created_at, @updated_at)`
    ).run(row)
    createdCategories = ensureCategoriesFromItems(db, [row])
    createdLocations = ensureLocationsFromItems(db, [row])
  })
  tx()
  return { row, sync: { categories: createdCategories, locations: createdLocations } }
}

// 更新物品：仅合并 patch 中出现的字段 + 同步分类/位置（单事务）
function updateItem(db, id, patch) {
  const cur = db.prepare('SELECT * FROM items WHERE id = ?').get(id)
  if (!cur) return null
  const categories = db.prepare('SELECT * FROM categories').all()
  const data = patch || {}
  // tags 单独处理：仅当 patch 显式提供 tags 字段（即使为 null/''/[]）才覆盖
  let tagsValue = cur.tags || '[]'
  if (data.tags !== undefined) {
    const v = pickTags(data.tags)
    tagsValue = v === undefined ? tagsValue : v
  }
  const next = {
    ...cur,
    name: data.name !== undefined ? String(data.name) : cur.name,
    item_no: data.itemNo !== undefined || data.item_no !== undefined
      ? String(data.itemNo ?? data.item_no) : cur.item_no,
    room: data.room !== undefined ? String(data.room) : cur.room,
    position: data.position !== undefined ? String(data.position) : cur.position,
    location: data.location !== undefined ? String(data.location) : cur.location,
    quantity: data.quantity !== undefined ? Math.max(0, Number(data.quantity) || 0) : cur.quantity,
    min_quantity: data.minQuantity !== undefined || data.min_quantity !== undefined
      ? Math.max(0, Number(data.minQuantity ?? data.min_quantity) || 0) : cur.min_quantity,
    photo: data.photo !== undefined ? String(data.photo) : cur.photo,
    category: data.category !== undefined ? normalizeCategoryKey(data.category, categories) : cur.category,
    expiry_date: data.expiryDate !== undefined || data.expiry_date !== undefined
      ? Number(data.expiryDate ?? data.expiry_date) || 0 : cur.expiry_date,
    notes: data.notes !== undefined ? String(data.notes) : cur.notes,
    consume_rate: data.consume_rate !== undefined ? Number(data.consume_rate) || 0 : cur.consume_rate,
    consume_unit: data.consume_unit !== undefined ? String(data.consume_unit) : cur.consume_unit,
    consume_start_at: data.consume_start_at !== undefined ? Number(data.consume_start_at) || 0 : cur.consume_start_at,
    photo_meta: data.photo_meta !== undefined ? String(data.photo_meta) : cur.photo_meta,
    tags: tagsValue,
    updated_at: nowMs()
  }
  let createdCategories = 0
  let createdLocations = 0
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE items SET name=@name, item_no=@item_no, room=@room, position=@position, location=@location,
       quantity=@quantity, min_quantity=@min_quantity, photo=@photo, category=@category, expiry_date=@expiry_date,
       notes=@notes, consume_rate=@consume_rate, consume_unit=@consume_unit, consume_start_at=@consume_start_at,
       photo_meta=@photo_meta, tags=@tags, updated_at=@updated_at WHERE id=@id`
    ).run(next)
    createdCategories = ensureCategoriesFromItems(db, [next])
    createdLocations = ensureLocationsFromItems(db, [next])
  })
  tx()
  return { row: next, sync: { categories: createdCategories, locations: createdLocations } }
}

// 手动排序持久化：把给定 id 顺序物化为 sort_order = 1..N。
// 未包含的物品保持原值；sort_order = 0 表示"从未手动排序"，按 updated_at 排在新手动组之后。
function setOrder(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, ordered: 0 }
  const stmt = db.prepare('UPDATE items SET sort_order = ? WHERE id = ?')
  const tx = db.transaction((arr) => {
    arr.forEach((id, i) => stmt.run(i + 1, id))
    return arr.length
  })
  return { ok: true, ordered: tx(ids) }
}

module.exports = { buildItemRow, createItem, updateItem, setOrder, pickTags }
