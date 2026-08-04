// 外部 Agent HTTP API：供其它程序/Agent 管理家庭物资数据
const http = require('http')
const crypto = require('crypto')
const { generateItemNo } = require('./item-no')
const { recognizeImage } = require('./ai-service')
const {
  normalizeCategoryKey,
  ensureCategoriesFromItems,
  ensureLocationsFromItems
} = require('./data-utils')

const DEFAULT_PORT = 3001

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function nowMs() {
  return Date.now()
}

// 精简格式：不含 base64 图片，仅返回 hasPhoto 布尔值，避免 Agent 上下文膨胀
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
    hasPhoto: !!row.photo,
    category: row.category,
    expiryDate: row.expiry_date || 0,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  }
}

// 完整格式：包含 base64 图片（仅 ?includePhoto=true 时使用）
function toPhoneItemFull(row) {
  const item = toPhoneItem(row)
  item.photo = row.photo || ''
  return item
}

function toPhoneMaterial(row) {
  return {
    id: row.id,
    type: row.type || 'note',
    title: row.title || '',
    content: row.content || '',
    url: row.url || '',
    tags: row.tags || '',
    hasPhoto: !!row.photo,
    meta: row.meta || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  }
}

function toPhoneMaterialFull(row) {
  const m = toPhoneMaterial(row)
  m.photo = row.photo || ''
  return m
}

// 根据 ?includePhoto=true 选择精简或完整映射
function itemMapper(url) {
  return url && url.searchParams.get('includePhoto') === 'true' ? toPhoneItemFull : toPhoneItem
}
function materialMapper(url) {
  return url && url.searchParams.get('includePhoto') === 'true' ? toPhoneMaterialFull : toPhoneMaterial
}

function fromInputItem(data, db) {
  const id = data.id || crypto.randomUUID()
  const t = nowMs()
  const categories = db ? db.prepare('SELECT * FROM categories').all() : []
  const rawItemNo = String(data.itemNo ?? data.item_no ?? '').trim()
  const itemNo = rawItemNo || (db ? generateItemNo(db) : '')
  return {
    id,
    name: String(data.name || ''),
    item_no: itemNo,
    room: String(data.room ?? ''),
    position: String(data.position ?? ''),
    location: String(data.location ?? ''),
    quantity: Number(data.quantity) || 0,
    min_quantity: Number(data.minQuantity ?? data.min_quantity) || 0,
    photo: String(data.photo ?? ''),
    category: normalizeCategoryKey(data.category, categories),
    expiry_date: Number(data.expiryDate ?? data.expiry_date) || 0,
    created_at: t,
    updated_at: t
  }
}

// ===== 位置推断辅助函数 =====

function segmentRawLocation(raw, existingNames = []) {
  if (!raw) return []
  const s = String(raw).trim()
  if (!s) return []

  // 如果用户已使用常见分隔符，直接拆分
  if (/[>\/→]/.test(s)) {
    return s.split(/\s*[>\/→]\s*/).map((p) => p.trim()).filter(Boolean)
  }

  // 无分隔符时，用已有位置名做贪心最长匹配
  const tokens = Array.from(new Set(existingNames))
    .filter((n) => n && String(n).trim().length > 0)
    .map((n) => String(n).trim())
    .sort((a, b) => b.length - a.length || a.localeCompare(b))

  const result = []
  let i = 0
  while (i < s.length) {
    let matched = false
    for (const t of tokens) {
      if (s.startsWith(t, i)) {
        result.push(t)
        i += t.length
        matched = true
        break
      }
    }
    if (!matched) {
      result.push(s[i])
      i += 1
    }
  }

  // 合并连续未匹配的单个字符为一个片段
  const merged = []
  result.forEach((r) => {
    const last = merged[merged.length - 1]
    if (last && r.length === 1 && last.length === 1) {
      merged[merged.length - 1] = last + r
    } else {
      merged.push(r)
    }
  })
  return merged
}

function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, (_, i) => i)
  for (let j = 1; j <= n; j++) {
    let prev = dp[0]
    dp[0] = j
    for (let i = 1; i <= m; i++) {
      const temp = dp[i]
      if (a[i - 1] === b[j - 1]) {
        dp[i] = prev
      } else {
        dp[i] = Math.min(prev + 1, dp[i] + 1, dp[i - 1] + 1)
      }
      prev = temp
    }
  }
  return dp[m]
}

function findSimilarNode(name, candidates) {
  const n = String(name).trim().toLowerCase()
  if (!n) return null

  // 1. 完全匹配（忽略大小写和前后空格）
  const exact = candidates.find((c) => String(c.name).trim().toLowerCase() === n)
  if (exact) return exact

  // 2. 互相包含（例如 "xx小区" 与 "XX小区" 已由大小写覆盖，此处处理 "厨房" 与 "厨房里"）
  const incl = candidates.find((c) => {
    const cn = String(c.name).trim().toLowerCase()
    return cn.includes(n) || n.includes(cn)
  })
  if (incl) return incl

  // 3. 编辑距离 ≤1 且长度差 ≤1（处理 typo，如 "水槽下" vs "水糟下"）
  for (const c of candidates) {
    const cn = String(c.name).trim().toLowerCase()
    if (Math.abs(cn.length - n.length) <= 1 && levenshtein(n, cn) <= 1) return c
  }

  return null
}

class ApiServer {
  constructor({ db, getSettings, writeAppSettings, resolveDbPath, app, getMainWindow }) {
    this.db = db
    this.getSettings = getSettings
    this.writeAppSettings = writeAppSettings
    this.resolveDbPath = resolveDbPath
    this.app = app
    this.getMainWindow = getMainWindow
    this.server = null
    this.port = DEFAULT_PORT
  }

  notifyRenderer(type = 'data') {
    try {
      const win = this.getMainWindow ? this.getMainWindow() : null
      if (win && !win.isDestroyed()) {
        win.webContents.send('api:dataChanged', { type, source: 'agent' })
      }
    } catch (e) {
      console.error('[api-server] notify renderer failed:', e.message)
    }
  }

  getSettingsObj() {
    return this.getSettings()
  }

  getApiConfig(settings) {
    const port = Number(settings.apiPort) || DEFAULT_PORT
    const host = settings.apiHost === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1'
    const lanMode = settings.apiLanMode === true
    const effectiveHost = lanMode ? '0.0.0.0' : host
    let token = settings.apiToken
    if (!token || typeof token !== 'string' || token.trim() === '') {
      token = crypto.randomBytes(24).toString('hex')
      settings.apiToken = token
      this.writeAppSettings(settings)
    }
    return { port, host: effectiveHost, token }
  }

  checkAuth(req, settings) {
    const auth = req.headers['authorization'] || ''
    const { token } = this.getApiConfig(settings)
    return auth.replace(/^Bearer\s+/i, '') === token
  }

  handle(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      })
      res.end()
      return
    }

    const settings = this.getSettingsObj()
    if (!this.checkAuth(req, settings)) {
      json(res, 401, { error: 'Unauthorized', message: '请在请求头中提供 Authorization: Bearer <token>' })
      return
    }

    const url = new URL(req.url, `http://localhost:${this.port}`)
    const path = url.pathname

    try {
      if (path === '/api/status' && req.method === 'GET') {
        this.getStatus(req, res)
      } else if (path === '/api/items' && req.method === 'GET') {
        this.listItems(req, res, url)
      } else if (path === '/api/items' && req.method === 'POST') {
        this.createItem(req, res)
      } else if (path.startsWith('/api/items/') && path.endsWith('/photo') && req.method === 'GET') {
        this.getItemPhoto(req, res, path)
      } else if (path.startsWith('/api/items/') && req.method === 'GET') {
        this.getItem(req, res, path, url)
      } else if (path.startsWith('/api/items/') && req.method === 'PATCH') {
        this.updateItem(req, res, path)
      } else if (path.startsWith('/api/items/') && req.method === 'DELETE') {
        this.deleteItem(req, res, path)
      } else if (path === '/api/categories' && req.method === 'GET') {
        this.listCategories(req, res)
      } else if (path === '/api/categories' && req.method === 'POST') {
        this.createCategory(req, res)
      } else if (path.startsWith('/api/categories/') && req.method === 'PATCH') {
        this.updateCategory(req, res, path)
      } else if (path.startsWith('/api/categories/') && req.method === 'DELETE') {
        this.deleteCategory(req, res, path)
      } else if (path === '/api/categories/merge' && req.method === 'POST') {
        this.mergeCategories(req, res)
      } else if (path === '/api/locations' && req.method === 'GET') {
        this.listLocations(req, res)
      } else if (path === '/api/locations' && req.method === 'POST') {
        this.createLocation(req, res)
      } else if (path === '/api/locations/infer' && req.method === 'POST') {
        this.inferLocations(req, res)
      } else if (path.startsWith('/api/locations/') && req.method === 'PATCH') {
        this.updateLocation(req, res, path)
      } else if (path.startsWith('/api/locations/') && req.method === 'DELETE') {
        this.deleteLocation(req, res, path)
      } else if (path === '/api/materials' && req.method === 'GET') {
        this.listMaterials(req, res, url)
      } else if (path === '/api/materials' && req.method === 'POST') {
        this.createMaterial(req, res)
      } else if (path.startsWith('/api/materials/') && path.endsWith('/photo') && req.method === 'GET') {
        this.getMaterialPhoto(req, res, path)
      } else if (path.startsWith('/api/materials/') && req.method === 'GET') {
        this.getMaterial(req, res, path, url)
      } else if (path.startsWith('/api/materials/') && req.method === 'PATCH') {
        this.updateMaterial(req, res, path)
      } else if (path.startsWith('/api/materials/') && req.method === 'DELETE') {
        this.deleteMaterial(req, res, path)
      } else if (path === '/api/settings' && req.method === 'GET') {
        this.getSettingsEndpoint(req, res)
      } else if (path === '/api/ai/recognize' && req.method === 'POST') {
        this.recognize(req, res)
      } else {
        json(res, 404, { error: 'Not found', path })
      }
    } catch (e) {
      console.error('[api-server] error:', e)
      json(res, 500, { error: 'Internal error', message: e.message })
    }
  }

  async inferLocations(req, res) {
    const data = await readBody(req)
    const raw = String(data.raw || '').trim()
    const createMissing = data.createMissing !== false
    if (!raw) {
      json(res, 400, { error: 'Bad request', message: 'raw is required' })
      return
    }

    const allLocations = this.db.prepare('SELECT * FROM locations ORDER BY sort_order ASC, created_at ASC').all()
    const existingNames = allLocations.map((l) => l.name)
    const parts = segmentRawLocation(raw, existingNames)

    // 按 parent_id 分组的子节点
    const childrenMap = new Map()
    allLocations.forEach((l) => {
      const pid = l.parent_id || ''
      if (!childrenMap.has(pid)) childrenMap.set(pid, [])
      childrenMap.get(pid).push(l)
    })

    const matched = []
    const created = []
    const path = []
    let parentId = ''

    const tx = this.db.transaction(() => {
      for (const part of parts) {
        const candidates = childrenMap.get(parentId) || []
        const similar = findSimilarNode(part, candidates)
        if (similar) {
          path.push(similar.name)
          matched.push({ input: part, matched: similar.name, id: similar.id })
          parentId = similar.id
        } else if (createMissing) {
          const id = crypto.randomUUID()
          const maxOrder =
            this.db.prepare('SELECT MAX(sort_order) m FROM locations WHERE parent_id IS ? OR parent_id = ?').get(
              parentId || null,
              parentId || ''
            ).m || 0
          this.db.prepare(
            'INSERT INTO locations (id,name,parent_id,sort_order,created_at,updated_at) VALUES (@id,@name,@parent_id,@sort_order,@created_at,@updated_at)'
          ).run({
            id,
            name: part,
            parent_id: parentId,
            sort_order: maxOrder + 1,
            created_at: nowMs(),
            updated_at: nowMs()
          })
          const row = this.db.prepare('SELECT * FROM locations WHERE id = ?').get(id)
          path.push(row.name)
          created.push({ input: part, id: row.id, name: row.name })
          // 更新内存索引
          if (!childrenMap.has(parentId)) childrenMap.set(parentId, [])
          childrenMap.get(parentId).push(row)
          parentId = row.id
        } else {
          path.push(part)
        }
      }
    })
    tx()

    // 无论是否新建节点，位置推断完成后都通知前端刷新位置树
    this.notifyRenderer('locations')
    json(res, 200, { raw, path, matched, created })
  }

  getStatus(req, res) {
    const settings = this.getSettingsObj()
    json(res, 200, {
      app: 'Family Inventory Agent API',
      version: '1.2.17',
      dbPath: this.resolveDbPath(),
      dataDir: settings.dataDir || this.app.getPath('userData'),
      timestamp: nowMs()
    })
  }

  listItems(req, res, url) {
    const keyword = (url.searchParams.get('keyword') || '').trim()
    const category = (url.searchParams.get('category') || '').trim()
    let rows
    if (keyword) {
      const like = `%${keyword}%`
      if (category) {
        rows = this.db
          .prepare(
            `SELECT * FROM items WHERE category = ? AND (name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ?) ORDER BY updated_at DESC`
          )
          .all(category, like, like, like, like, like)
      } else {
        rows = this.db
          .prepare(
            `SELECT * FROM items WHERE name LIKE ? OR item_no LIKE ? OR room LIKE ? OR position LIKE ? OR location LIKE ? ORDER BY updated_at DESC`
          )
          .all(like, like, like, like, like)
      }
    } else if (category) {
      rows = this.db.prepare('SELECT * FROM items WHERE category = ? ORDER BY updated_at DESC').all(category)
    } else {
      rows = this.db.prepare('SELECT * FROM items ORDER BY updated_at DESC').all()
    }
    json(res, 200, { items: rows.map(itemMapper(url)) })
  }

  async createItem(req, res) {
    const data = await readBody(req)
    if (!data.name) {
      json(res, 400, { error: 'Bad request', message: 'name is required' })
      return
    }
    const row = fromInputItem(data, this.db)
    let createdCategories = 0
    let createdLocations = 0
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO items (id, name, item_no, room, position, location, quantity, min_quantity, photo, category, expiry_date, created_at, updated_at)
           VALUES (@id, @name, @item_no, @room, @position, @location, @quantity, @min_quantity, @photo, @category, @expiry_date, @created_at, @updated_at)`
        )
        .run(row)
      // 自动把物品分类/位置同步到分类表和位置树，保持 UI 一致
      createdCategories = ensureCategoriesFromItems(this.db, [row])
      createdLocations = ensureLocationsFromItems(this.db, [row])
    })
    tx()
    if (createdCategories) this.notifyRenderer('categories')
    if (createdLocations) this.notifyRenderer('locations')
    this.notifyRenderer('items')
    json(res, 201, { item: toPhoneItem(row), sync: { categories: createdCategories, locations: createdLocations } })
  }

  getItem(req, res, path, url) {
    const id = decodeURIComponent(path.slice('/api/items/'.length))
    // 优先精确匹配 id
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id)
    if (row) {
      json(res, 200, { item: itemMapper(url)(row) })
      return
    }
    // 未命中则按名称/编号模糊搜索，返回候选列表供调用方判断
    const like = `%${id}%`
    const rows = this.db
      .prepare(
        `SELECT * FROM items WHERE name LIKE ? OR item_no LIKE ? ORDER BY updated_at DESC LIMIT 20`
      )
      .all(like, like)
    json(res, 200, { query: id, candidates: rows.map(itemMapper(url)) })
  }

  async updateItem(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/items/'.length))
    const cur = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id)
    if (!cur) {
      json(res, 404, { error: 'Not found' })
      return
    }
    const data = await readBody(req)
    const categories = this.db.prepare('SELECT * FROM categories').all()
    const next = {
      ...cur,
      name: data.name !== undefined ? String(data.name) : cur.name,
      item_no: data.itemNo !== undefined || data.item_no !== undefined ? String(data.itemNo ?? data.item_no) : cur.item_no,
      room: data.room !== undefined ? String(data.room) : cur.room,
      position: data.position !== undefined ? String(data.position) : cur.position,
      location: data.location !== undefined ? String(data.location) : cur.location,
      quantity: data.quantity !== undefined ? Number(data.quantity) : cur.quantity,
      min_quantity: data.minQuantity !== undefined || data.min_quantity !== undefined ? Number(data.minQuantity ?? data.min_quantity) : cur.min_quantity,
      photo: data.photo !== undefined ? String(data.photo) : cur.photo,
      category: data.category !== undefined ? normalizeCategoryKey(data.category, categories) : cur.category,
      expiry_date: data.expiryDate !== undefined || data.expiry_date !== undefined ? Number(data.expiryDate ?? data.expiry_date) : cur.expiry_date,
      updated_at: nowMs()
    }
    let createdCategories = 0
    let createdLocations = 0
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE items SET name=@name, item_no=@item_no, room=@room, position=@position, location=@location,
           quantity=@quantity, min_quantity=@min_quantity, photo=@photo, category=@category,
           expiry_date=@expiry_date, updated_at=@updated_at WHERE id=@id`
        )
        .run(next)
      // 自动把物品分类/位置同步到分类表和位置树，保持 UI 一致
      createdCategories = ensureCategoriesFromItems(this.db, [next])
      createdLocations = ensureLocationsFromItems(this.db, [next])
    })
    tx()
    if (createdCategories) this.notifyRenderer('categories')
    if (createdLocations) this.notifyRenderer('locations')
    this.notifyRenderer('items')
    json(res, 200, { item: toPhoneItem(next), sync: { categories: createdCategories, locations: createdLocations } })
  }

  deleteItem(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/items/'.length))
    const info = this.db.prepare('DELETE FROM items WHERE id = ?').run(id)
    this.notifyRenderer('items')
    json(res, 200, { deleted: info.changes })
  }

  // 独立获取物品图片 base64，避免列表接口返回超长数据
  getItemPhoto(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/items/'.length, path.lastIndexOf('/photo')))
    const row = this.db.prepare('SELECT photo FROM items WHERE id = ?').get(id)
    if (!row) {
      json(res, 404, { error: 'Not found' })
      return
    }
    json(res, 200, { id, photo: row.photo || '' })
  }

  listCategories(req, res) {
    const rows = this.db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC').all()
    json(res, 200, { categories: rows })
  }

  listLocations(req, res) {
    const rows = this.db.prepare('SELECT * FROM locations ORDER BY sort_order ASC, created_at ASC').all()
    json(res, 200, { locations: rows })
  }

  // ===== 分类 CRUD（Agent 可调用，修改时同步物品 category）=====

  async createCategory(req, res) {
    const data = await readBody(req)
    if (!data.name) {
      json(res, 400, { error: 'Bad request', message: 'name is required' })
      return
    }
    const now = nowMs()
    const id = crypto.randomUUID()
    const maxOrder = this.db.prepare('SELECT MAX(sort_order) m FROM categories').get().m || 0
    const key = (data.key || '').trim() || 'cat_' + id.slice(0, 8)
    this.db.prepare(
      'INSERT INTO categories (id,key,name,name_en,icon,sort_order,created_at,updated_at) VALUES (@id,@key,@name,@name_en,@icon,@sort_order,@created_at,@updated_at)'
    ).run({
      id,
      key,
      name: data.name || '',
      name_en: data.name_en || '',
      icon: data.icon || '',
      sort_order: maxOrder + 1,
      created_at: now,
      updated_at: now
    })
    const row = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id)
    this.notifyRenderer('categories')
    json(res, 201, { category: row })
  }

  async updateCategory(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/categories/'.length))
    const cur = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id)
    if (!cur) {
      json(res, 404, { error: 'Not found' })
      return
    }
    const data = await readBody(req)
    const next = {
      ...cur,
      key: data.key !== undefined ? String(data.key).trim() || cur.key : cur.key,
      name: data.name !== undefined ? String(data.name) : cur.name,
      name_en: data.name_en !== undefined ? String(data.name_en) : cur.name_en,
      icon: data.icon !== undefined ? String(data.icon) : cur.icon,
      updated_at: nowMs()
    }
    const tx = this.db.transaction(() => {
      // 如果 key 变了，同步更新所有物品的 category 字段
      if (next.key !== cur.key) {
        this.db.prepare('UPDATE items SET category = ?, updated_at = ? WHERE category = ?').run(
          next.key, nowMs(), cur.key
        )
      }
      this.db.prepare(
        'UPDATE categories SET key=@key,name=@name,name_en=@name_en,icon=@icon,updated_at=@updated_at WHERE id=@id'
      ).run(next)
    })
    tx()
    this.notifyRenderer('categories')
    if (next.key !== cur.key) this.notifyRenderer('items')
    json(res, 200, { category: next, itemsSynced: next.key !== cur.key })
  }

  deleteCategory(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/categories/'.length))
    const cat = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id)
    if (!cat) {
      json(res, 404, { error: 'Not found' })
      return
    }
    const tx = this.db.transaction(() => {
      // 将该分类下的物品归到 "other"
      if (cat.key !== 'other') {
        this.db.prepare('UPDATE items SET category = ?, updated_at = ? WHERE category = ?').run(
          'other', nowMs(), cat.key
        )
      }
      this.db.prepare('DELETE FROM categories WHERE id = ?').run(id)
    })
    tx()
    this.notifyRenderer('categories')
    if (cat.key !== 'other') this.notifyRenderer('items')
    json(res, 200, { deleted: true, itemsMigrated: cat.key !== 'other' })
  }

  async mergeCategories(req, res) {
    const data = await readBody(req)
    const { fromKey, toKey } = data
    if (!fromKey || !toKey || fromKey === toKey) {
      json(res, 400, { error: 'Bad request', message: 'fromKey and toKey are required and must differ' })
      return
    }
    const tx = this.db.transaction(() => {
      const info = this.db.prepare('UPDATE items SET category = ?, updated_at = ? WHERE category = ?').run(toKey, nowMs(), fromKey)
      this.db.prepare('DELETE FROM categories WHERE key = ?').run(fromKey)
      return info.changes
    })
    const migrated = tx()
    this.notifyRenderer('categories')
    this.notifyRenderer('items')
    json(res, 200, { merged: true, migrated })
  }

  // ===== 位置 CRUD（Agent 可调用，修改时同步物品 room/position/location）=====

  async createLocation(req, res) {
    const data = await readBody(req)
    if (!data.name) {
      json(res, 400, { error: 'Bad request', message: 'name is required' })
      return
    }
    const now = nowMs()
    const id = crypto.randomUUID()
    const parentId = data.parentId || ''
    const maxOrder =
      this.db.prepare('SELECT MAX(sort_order) m FROM locations WHERE parent_id IS ? OR parent_id = ?').get(
        parentId || null, parentId || ''
      ).m || 0
    this.db.prepare(
      'INSERT INTO locations (id,name,parent_id,sort_order,created_at,updated_at) VALUES (@id,@name,@parent_id,@sort_order,@created_at,@updated_at)'
    ).run({
      id,
      name: data.name || '',
      parent_id: parentId,
      sort_order: maxOrder + 1,
      created_at: now,
      updated_at: now
    })
    const row = this.db.prepare('SELECT * FROM locations WHERE id = ?').get(id)
    this.notifyRenderer('locations')
    json(res, 201, { location: row })
  }

  async updateLocation(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/locations/'.length))
    const cur = this.db.prepare('SELECT * FROM locations WHERE id = ?').get(id)
    if (!cur) {
      json(res, 404, { error: 'Not found' })
      return
    }
    const data = await readBody(req)
    const newName = data.name !== undefined ? String(data.name) : cur.name
    const newParentId = data.parentId !== undefined ? String(data.parentId) : cur.parent_id
    const now = nowMs()

    const tx = this.db.transaction(() => {
      // 如果位置名称变了，同步更新引用该位置名的物品
      if (newName !== cur.name) {
        // 更新 room 字段（根位置）
        if (!cur.parent_id) {
          this.db.prepare('UPDATE items SET room = ?, updated_at = ? WHERE room = ?').run(newName, now, cur.name)
        }
        // 更新 position 字段（叶子位置）
        this.db.prepare('UPDATE items SET position = ?, updated_at = ? WHERE position = ?').run(newName, now, cur.name)
        // 更新 location 字段中的路径片段
        const items = this.db.prepare('SELECT id, location FROM items WHERE location LIKE ?').all(`%${cur.name}%`)
        const stmt = this.db.prepare('UPDATE items SET location = ?, updated_at = ? WHERE id = ?')
        for (const it of items) {
          const newLoc = it.location.split(/\s*>\s*/).map(p => p.trim() === cur.name ? newName : p).join(' > ')
          if (newLoc !== it.location) stmt.run(newLoc, now, it.id)
        }
      }
      this.db.prepare('UPDATE locations SET name=@name,parent_id=@parent_id,updated_at=@updated_at WHERE id=@id').run({
        id,
        name: newName,
        parent_id: newParentId || '',
        updated_at: now
      })
    })
    tx()
    this.notifyRenderer('locations')
    if (newName !== cur.name) this.notifyRenderer('items')
    const row = this.db.prepare('SELECT * FROM locations WHERE id = ?').get(id)
    json(res, 200, { location: row, itemsSynced: newName !== cur.name })
  }

  deleteLocation(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/locations/'.length))
    const cur = this.db.prepare('SELECT * FROM locations WHERE id = ?').get(id)
    if (!cur) {
      json(res, 404, { error: 'Not found' })
      return
    }
    // 递归收集要删除的节点（保留 id + name，用于同步清理物品引用）
    const toDelete = [{ id: cur.id, name: cur.name }]
    let changed = true
    while (changed) {
      changed = false
      const ids = toDelete.map((n) => n.id)
      const ph = ids.map(() => '?').join(',')
      const children = this.db.prepare(`SELECT id, name FROM locations WHERE parent_id IN (${ph})`).all(...ids)
      for (const c of children) {
        if (!toDelete.find((n) => n.id === c.id)) {
          toDelete.push({ id: c.id, name: c.name })
          changed = true
        }
      }
    }

    const names = new Set(toDelete.map((n) => n.name))
    const ids = toDelete.map((n) => n.id)
    const ph = ids.map(() => '?').join(',')
    const now = nowMs()

    const tx = this.db.transaction(() => {
      // 清除物品中直接引用被删位置的 room / position
      for (const name of names) {
        this.db.prepare('UPDATE items SET room = ?, updated_at = ? WHERE room = ?').run('', now, name)
        this.db.prepare('UPDATE items SET position = ?, updated_at = ? WHERE position = ?').run('', now, name)
      }
      // 从 location 路径中移除被删的节点片段
      const items = this.db.prepare('SELECT id, location FROM items WHERE location IS NOT NULL AND location != ?').all('')
      const stmt = this.db.prepare('UPDATE items SET location = ?, updated_at = ? WHERE id = ?')
      for (const it of items) {
        const parts = it.location.split(/\s*>\s*/).map((p) => p.trim()).filter(Boolean)
        const newParts = parts.filter((p) => !names.has(p))
        if (newParts.length !== parts.length) {
          stmt.run(newParts.join(' > '), now, it.id)
        }
      }
      this.db.prepare(`DELETE FROM locations WHERE id IN (${ph})`).run(...ids)
    })
    tx()

    this.notifyRenderer('locations')
    this.notifyRenderer('items')
    json(res, 200, { deleted: toDelete.length })
  }

  // ===== 电子材料库 CRUD（Agent 可调用）=====

  listMaterials(req, res, url) {
    const type = (url.searchParams.get('type') || '').trim()
    const keyword = (url.searchParams.get('keyword') || '').trim()
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
    const rows = this.db.prepare(sql).all(...params)
    json(res, 200, { materials: rows.map(materialMapper(url)) })
  }

  getMaterial(req, res, path, url) {
    const id = decodeURIComponent(path.slice('/api/materials/'.length))
    const row = this.db.prepare('SELECT * FROM materials WHERE id = ?').get(id)
    if (!row) {
      json(res, 404, { error: 'Not found' })
      return
    }
    json(res, 200, { material: materialMapper(url)(row) })
  }

  async createMaterial(req, res) {
    const data = await readBody(req)
    if (!data.title) {
      json(res, 400, { error: 'Bad request', message: 'title is required' })
      return
    }
    const now = nowMs()
    const id = crypto.randomUUID()
    const normalizeTags = (tags) => {
      if (Array.isArray(tags)) return tags.join(',')
      return String(tags || '')
    }
    const row = {
      id,
      type: data.type || 'note',
      title: data.title || '',
      content: data.content || '',
      url: data.url || '',
      tags: normalizeTags(data.tags),
      photo: data.photo || '',
      meta: data.meta || '',
      created_at: now,
      updated_at: now
    }
    this.db.prepare(
      'INSERT INTO materials (id,type,title,content,url,tags,photo,meta,created_at,updated_at) VALUES (@id,@type,@title,@content,@url,@tags,@photo,@meta,@created_at,@updated_at)'
    ).run(row)
    const created = this.db.prepare('SELECT * FROM materials WHERE id = ?').get(id)
    this.notifyRenderer('materials')
    json(res, 201, { material: toPhoneMaterial(created) })
  }

  async updateMaterial(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/materials/'.length))
    const cur = this.db.prepare('SELECT * FROM materials WHERE id = ?').get(id)
    if (!cur) {
      json(res, 404, { error: 'Not found' })
      return
    }
    const data = await readBody(req)
    const normalizeTags = (tags) => {
      if (Array.isArray(tags)) return tags.join(',')
      return String(tags || '')
    }
    const next = {
      ...cur,
      type: data.type !== undefined ? data.type : cur.type,
      title: data.title !== undefined ? data.title : cur.title,
      content: data.content !== undefined ? data.content : cur.content,
      url: data.url !== undefined ? data.url : cur.url,
      tags: data.tags !== undefined ? normalizeTags(data.tags) : cur.tags,
      photo: data.photo !== undefined ? data.photo : cur.photo,
      meta: data.meta !== undefined ? data.meta : cur.meta,
      updated_at: nowMs()
    }
    this.db.prepare(
      'UPDATE materials SET type=@type,title=@title,content=@content,url=@url,tags=@tags,photo=@photo,meta=@meta,updated_at=@updated_at WHERE id=@id'
    ).run(next)
    this.notifyRenderer('materials')
    json(res, 200, { material: toPhoneMaterial(next) })
  }

  deleteMaterial(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/materials/'.length))
    const info = this.db.prepare('DELETE FROM materials WHERE id = ?').run(id)
    this.notifyRenderer('materials')
    json(res, 200, { deleted: info.changes })
  }

  // 独立获取材料图片 base64，避免列表接口返回超长数据
  getMaterialPhoto(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/materials/'.length, path.lastIndexOf('/photo')))
    const row = this.db.prepare('SELECT photo FROM materials WHERE id = ?').get(id)
    if (!row) {
      json(res, 404, { error: 'Not found' })
      return
    }
    json(res, 200, { id, photo: row.photo || '' })
  }

  async recognize(req, res) {
    const data = await readBody(req)
    const image = data.image || data.photo || ''
    if (!image) {
      json(res, 400, { error: 'Bad request', message: 'image or photo is required' })
      return
    }
    const settings = this.getSettingsObj()
    const result = await recognizeImage({ image, db: this.db, settings })
    if (result.ok) {
      json(res, 200, { suggestions: result.items })
    } else {
      json(res, 502, { error: 'AI recognition failed', message: result.error, raw: result.raw })
    }
  }

  getSettingsEndpoint(req, res) {
    const settings = this.getSettingsObj()
    json(res, 200, {
      language: settings.language || 'zh',
      theme: settings.theme || 'light',
      dataDir: settings.dataDir || this.app.getPath('userData'),
      defaultDataDir: this.app.getPath('userData')
    })
  }

  start() {
    if (this.server) return
    const settings = this.getSettingsObj()
    const { port, host, token } = this.getApiConfig(settings)
    this.port = port
    this.host = host
    this.token = token
    this.server = http.createServer((req, res) => this.handle(req, res))
    this.server.listen(port, host, () => {
      console.log(`[api-server] listening on http://${host}:${port}`)
    })
    this.server.on('error', (e) => {
      console.error('[api-server] failed to start:', e.message)
    })
  }

  stop() {
    if (this.server) {
      this.server.close()
      this.server = null
    }
  }

  restart() {
    this.stop()
    this.start()
  }
}

module.exports = { ApiServer, DEFAULT_PORT }
