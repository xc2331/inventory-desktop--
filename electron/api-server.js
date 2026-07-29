// 外部 Agent HTTP API：供其它程序/Agent 管理家庭物资数据
const http = require('http')
const crypto = require('crypto')

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
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  }
}

// 分类别名表（与主进程保持一致）
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

function fromInputItem(data, db) {
  const id = data.id || crypto.randomUUID()
  const t = nowMs()
  const categories = db ? db.prepare('SELECT * FROM categories').all() : []
  return {
    id,
    name: String(data.name || ''),
    item_no: String(data.itemNo ?? data.item_no ?? ''),
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

class ApiServer {
  constructor({ db, getSettings, writeAppSettings, resolveDbPath, app }) {
    this.db = db
    this.getSettings = getSettings
    this.writeAppSettings = writeAppSettings
    this.resolveDbPath = resolveDbPath
    this.app = app
    this.server = null
    this.port = DEFAULT_PORT
  }

  getSettingsObj() {
    return this.getSettings()
  }

  ensureToken(settings) {
    if (settings.apiToken) return settings.apiToken
    const token = crypto.randomBytes(24).toString('hex')
    settings.apiToken = token
    this.writeAppSettings(settings)
    return token
  }

  checkAuth(req, settings) {
    const auth = req.headers['authorization'] || ''
    const token = this.ensureToken(settings)
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
      } else if (path.startsWith('/api/items/') && req.method === 'GET') {
        this.getItem(req, res, path)
      } else if (path.startsWith('/api/items/') && req.method === 'PATCH') {
        this.updateItem(req, res, path)
      } else if (path.startsWith('/api/items/') && req.method === 'DELETE') {
        this.deleteItem(req, res, path)
      } else if (path === '/api/categories' && req.method === 'GET') {
        this.listCategories(req, res)
      } else if (path === '/api/locations' && req.method === 'GET') {
        this.listLocations(req, res)
      } else if (path === '/api/settings' && req.method === 'GET') {
        this.getSettingsEndpoint(req, res)
      } else {
        json(res, 404, { error: 'Not found', path })
      }
    } catch (e) {
      console.error('[api-server] error:', e)
      json(res, 500, { error: 'Internal error', message: e.message })
    }
  }

  getStatus(req, res) {
    const settings = this.getSettingsObj()
    json(res, 200, {
      app: 'Family Inventory Agent API',
      version: '1.0.0',
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
    json(res, 200, { items: rows.map(toPhoneItem) })
  }

  async createItem(req, res) {
    const data = await readBody(req)
    if (!data.name) {
      json(res, 400, { error: 'Bad request', message: 'name is required' })
      return
    }
    const row = fromInputItem(data, this.db)
    this.db
      .prepare(
        `INSERT INTO items (id, name, item_no, room, position, location, quantity, min_quantity, photo, category, expiry_date, created_at, updated_at)
         VALUES (@id, @name, @item_no, @room, @position, @location, @quantity, @min_quantity, @photo, @category, @expiry_date, @created_at, @updated_at)`
      )
      .run(row)
    json(res, 201, { item: toPhoneItem(row) })
  }

  getItem(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/items/'.length))
    // 优先精确匹配 id
    const row = this.db.prepare('SELECT * FROM items WHERE id = ?').get(id)
    if (row) {
      json(res, 200, { item: toPhoneItem(row) })
      return
    }
    // 未命中则按名称/编号模糊搜索，返回候选列表供调用方判断
    const like = `%${id}%`
    const rows = this.db
      .prepare(
        `SELECT * FROM items WHERE name LIKE ? OR item_no LIKE ? ORDER BY updated_at DESC LIMIT 20`
      )
      .all(like, like)
    json(res, 200, { query: id, candidates: rows.map(toPhoneItem) })
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
    this.db
      .prepare(
        `UPDATE items SET name=@name, item_no=@item_no, room=@room, position=@position, location=@location,
         quantity=@quantity, min_quantity=@min_quantity, photo=@photo, category=@category,
         expiry_date=@expiry_date, updated_at=@updated_at WHERE id=@id`
      )
      .run(next)
    json(res, 200, { item: toPhoneItem(next) })
  }

  deleteItem(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/items/'.length))
    const info = this.db.prepare('DELETE FROM items WHERE id = ?').run(id)
    json(res, 200, { deleted: info.changes })
  }

  listCategories(req, res) {
    const rows = this.db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC').all()
    json(res, 200, { categories: rows })
  }

  listLocations(req, res) {
    const rows = this.db.prepare('SELECT * FROM locations ORDER BY sort_order ASC, created_at ASC').all()
    json(res, 200, { locations: rows })
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
    const port = settings.apiPort || DEFAULT_PORT
    this.port = port
    this.server = http.createServer((req, res) => this.handle(req, res))
    this.server.listen(port, '127.0.0.1', () => {
      console.log(`[api-server] listening on http://127.0.0.1:${port}`)
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
