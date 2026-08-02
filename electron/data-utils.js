// 数据一致性工具：分类/位置归一化与自动创建
// 供 main.js / api-server.js / ai-service.js 共享，避免三处重复实现
const crypto = require('crypto')

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

function parseItemLocationPath(item) {
  // 优先使用 location 字段，支持 > / → 以及中文箭头作为层级分隔符
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

function ensureCategoriesFromItems(db, items) {
  const categories = db.prepare('SELECT * FROM categories').all()
  const existing = new Set(categories.map((r) => r.key))
  const now = Date.now()
  let maxOrder = db.prepare('SELECT MAX(sort_order) m FROM categories').get().m || 0
  const ins = db.prepare(
    'INSERT INTO categories (id,key,name,name_en,icon,sort_order,created_at,updated_at) VALUES (@id,@key,@name,@name_en,@icon,@sort_order,@created_at,@updated_at)'
  )
  let created = 0
  for (const r of items) {
    const key = normalizeCategoryKey(r.category, categories)
    if (!key || existing.has(key)) continue
    existing.add(key)
    // name 优先保留原始输入中的中文/英文显示名；如果原始值已被归一成 key，再用 key
    const rawCat = String(r.category || '').trim()
    const displayName =
      rawCat && rawCat.toLowerCase() !== key.toLowerCase() ? rawCat : key
    categories.push({ key, name: displayName, name_en: '' })
    maxOrder += 1
    ins.run({
      id: crypto.randomUUID(),
      key,
      name: displayName,
      name_en: '',
      icon: '📦',
      sort_order: maxOrder,
      created_at: now,
      updated_at: now
    })
    created += 1
  }
  return created
}

function ensureLocationsFromItems(db, items) {
  const now = Date.now()
  const rows = db.prepare('SELECT * FROM locations').all()
  const existing = new Map()
  rows.forEach((r) => existing.set(`${r.parent_id || ''}|${r.name}`, r))

  const createNode = (name, parentId) => {
    const id = crypto.randomUUID()
    const cleanName = String(name).trim()
    const siblings =
      db
        .prepare('SELECT MAX(sort_order) m FROM locations WHERE parent_id IS ? OR parent_id = ?')
        .get(parentId || null, parentId || '').m || 0
    db.prepare(
      'INSERT INTO locations (id,name,parent_id,sort_order,created_at,updated_at) VALUES (@id,@name,@parent_id,@sort_order,@created_at,@updated_at)'
    ).run({
      id,
      name: cleanName,
      parent_id: parentId || '',
      sort_order: siblings + 1,
      created_at: now,
      updated_at: now
    })
    return { id, name: cleanName, parent_id: parentId || '' }
  }

  let created = 0
  for (const item of items) {
    const path = parseItemLocationPath(item)
    if (!path.length) {
      console.log('[ensureLocationsFromItems] skip item, no location path:', item.id || item.name)
      continue
    }
    let parentId = ''
    for (const name of path) {
      const cleanName = String(name).trim()
      const key = `${parentId}|${cleanName}`
      let node = existing.get(key)
      if (!node) {
        node = createNode(cleanName, parentId)
        existing.set(key, node)
        created += 1
        console.log('[ensureLocationsFromItems] created location:', cleanName, 'parent=', parentId || '(root)')
      }
      parentId = node.id
    }
  }
  return created
}

module.exports = {
  CATEGORY_ALIASES,
  normalizeCategoryKey,
  parseItemLocationPath,
  ensureCategoriesFromItems,
  ensureLocationsFromItems
}
