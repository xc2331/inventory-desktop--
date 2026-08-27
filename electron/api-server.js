// 外部 Agent HTTP API：供其它程序/Agent 管理家庭物资数据
const http = require('http')
const crypto = require('crypto')
const itemsService = require('./services/items')
const { recognizeImage, recognizeText, recognizeBatch } = require('./ai-service')
const { parseTags, normalizeTags } = require('./tags')
const {
  normalizeCategoryKey,
  ensureCategoriesFromItems,
  ensureLocationsFromItems
} = require('./data-utils')

const DEFAULT_PORT = 3001
// 请求体大小上限（字节）：防止局域网模式下大 body 耗尽内存
const MAX_BODY_BYTES = 25 * 1024 * 1024

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
    const declared = Number(req.headers['content-length'] || 0)
    if (declared > MAX_BODY_BYTES) {
      reject(new Error('payload too large'))
      req.destroy()
      return
    }
    let body = ''
    let total = 0
    let aborted = false
    req.on('data', (chunk) => {
      if (aborted) return
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        aborted = true
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      body += chunk
    })
    req.on('end', () => {
      if (aborted) return
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

const pkg = require('../package.json')
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
    title: '【电子材料】' + (row.title || ''),
    content: row.content || '',
    url: row.url || '',
    tags: parseTags(row.tags),
    hasPhoto: !!row.photo,
    meta: row.meta || '',
    eventStartDate: row.event_start_date || '',
    eventEndDate: row.event_end_date || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  }
}

function toPhoneMaterialFull(row) {
  const m = toPhoneMaterial(row)
  m.photo = row.photo || ''
  return m
}

// FTS5 v1.8.0：把 keyword 变成 FTS5 MATCH 表达式，返回命中的 id 列表。
// 行为：
//   1) trim + 去控制字符；
//   2) 多关键字按空格分词，每个词加前缀通配符（term*）— 支持"发票 保单"等组合；
//   3) FTS5 操作符错误捕获后返回空（让上层走 LIKE）；
//   4) LIMIT 200 防爆。
function ftsKeywordSearch(db, table, keyword) {
  const cleaned = String(keyword || '').replace(/[\x00-\x1F]/g, ' ').trim()
  if (!cleaned) return []
  const terms = cleaned.split(/\s+/).filter(Boolean).map((t) => t.replace(/"/g, ''))
  if (terms.length === 0) return []
  const expr = terms.map((t) => '"' + t + '"*').join(' ')
  try {
    const rows = db.prepare('SELECT id FROM ' + table + ' WHERE ' + table + ' MATCH ? LIMIT 200').all(expr)
    return rows.map((r) => r.id)
  } catch (_) {
    return []
  }
}

// FTS5 v1.8.2：FTS5 命中 ∪ LIKE 命中 求并集（不是整段切换）。
// 目的：unicode61 停用词（"菜"、"第" 等单字常见汉字被 tokenize 干掉）走 FTS5 是零命中，
//       整段切换会让单字/含停用词的合法搜索变成"无结果"。并集保证两边都进结果。
// 入参：
//   db        - better-sqlite3 实例
//   ftsTable  - 虚表名（items_fts / materials_fts）
//   mainTable - 主表名（items / materials）
//   ocrAlias  - OCR 子表别名（item_ocr/material_ocr 在主查询里的别名，如 "o"，无 OCR 时传 null）
//   keyword   - 原始 keyword
//   mainCols  - 主表 LIKE 命中列数组（items: name/item_no/room/position/location/notes，materials: title/content/tags）
// 返回：去重后的 id 数组
function ftsUnionLikeSearch(db, ftsTable, mainTable, ocrAlias, keyword, mainCols) {
  const ftsIds = ftsKeywordSearch(db, ftsTable, keyword)
  const like = '%' + String(keyword).replace(/[%_]/g, (m) => '\\' + m) + '%'
  const likeParts = mainCols.map((c) => mainTable + '.' + c + ' LIKE ? ESCAPE \'\\\'')
  if (ocrAlias) likeParts.push(ocrAlias + '.ocr_text LIKE ? ESCAPE \'\\\'')
  const likeRows = db.prepare('SELECT DISTINCT ' + mainTable + '.id AS id FROM ' + mainTable +
    (ocrAlias ? ' LEFT JOIN ' + (ocrAlias === 'o' && mainTable === 'items' ? 'item_ocr' : ocrAlias === 'o' ? 'material_ocr' : '') + ' ' + ocrAlias + ' ON ' + mainTable + '.id = ' + ocrAlias + '.' + (mainTable === 'items' ? 'item_id' : 'material_id') : '') +
    ' WHERE ' + likeParts.join(' OR ')).all(...Array(likeParts.length).fill(like))
  const likeIds = likeRows.map((r) => r.id)
  const set = new Set()
  for (const id of ftsIds) set.add(id)
  for (const id of likeIds) set.add(id)
  return Array.from(set)
}

// 根据 ?includePhoto=true 选择精简或完整映射
function itemMapper(url) {
  return url && url.searchParams.get('includePhoto') === 'true' ? toPhoneItemFull : toPhoneItem
}
function materialMapper(url) {
  return url && url.searchParams.get('includePhoto') === 'true' ? toPhoneMaterialFull : toPhoneMaterial
}

// 注：物品行构造已收敛至 services/items.js 的 buildItemRow（与 UI IPC 共用）

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
    const provided = auth.replace(/^Bearer\s+/i, '')
    const { token } = this.getApiConfig(settings)
    // 常量时间比较（经 sha256 等长化），防止局域网模式下的计时侧信道
    try {
      const a = crypto.createHash('sha256').update(String(provided)).digest()
      const b = crypto.createHash('sha256').update(String(token)).digest()
      return crypto.timingSafeEqual(a, b)
    } catch (e) {
      return false
    }
  }

  // 分页参数解析：page/limit 都没传时返回 null（保持原行为不破坏老客户端）
  // 传了任一参数就启用分页，limit 默认 100、上限 500（防单请求爆内存）
  _parsePagination(url) {
    const pageRaw = url.searchParams.get('page')
    const limitRaw = url.searchParams.get('limit')
    if (pageRaw === null && limitRaw === null) return null
    let page = parseInt(pageRaw || '1', 10)
    let limit = parseInt(limitRaw || '100', 10)
    if (!Number.isFinite(page) || page < 1) page = 1
    if (!Number.isFinite(limit) || limit < 1) limit = 100
    if (limit > 500) limit = 500
    return { page, limit, offset: (page - 1) * limit }
  }

  _buildPagination(total, p) {
    const totalPages = Math.max(1, Math.ceil(total / p.limit))
    return {
      page: p.page,
      limit: p.limit,
      total,
      totalPages,
      hasMore: p.page < totalPages
    }
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
      } else if (path.startsWith('/api/items/') && path.endsWith('/ocr') && req.method === 'POST') {
        this.ocrItem(req, res, path)
      } else if (path.startsWith('/api/items/') && path.endsWith('/ocr') && req.method === 'GET') {
        this.getItemOcr(req, res, path)
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
      } else if (path === '/api/e-materials/types' && req.method === 'GET') {
        this.listMaterialTypes(req, res)
      } else if (path === '/api/e-materials/types' && req.method === 'PATCH') {
        this.updateMaterialTypes(req, res)
      } else if (path === '/api/e-materials' && req.method === 'GET') {
        this.listMaterials(req, res, url)
      } else if (path === '/api/e-materials' && req.method === 'POST') {
        this.createMaterial(req, res)
      } else if (path.startsWith('/api/e-materials/') && path.endsWith('/photo') && req.method === 'GET') {
        this.getMaterialPhoto(req, res, path)
      } else if (path.startsWith('/api/e-materials/') && path.endsWith('/ocr') && req.method === 'POST') {
        this.ocrMaterial(req, res, path)
      } else if (path.startsWith('/api/e-materials/') && path.endsWith('/ocr') && req.method === 'GET') {
        this.getMaterialOcr(req, res, path)
      } else if (path.startsWith('/api/e-materials/') && req.method === 'GET') {
        this.getMaterial(req, res, path, url)
      } else if (path.startsWith('/api/e-materials/') && req.method === 'PATCH') {
        this.updateMaterial(req, res, path)
      } else if (path.startsWith('/api/e-materials/') && req.method === 'DELETE') {
        this.deleteMaterial(req, res, path)
      } else if (path === '/api/settings' && req.method === 'GET') {
        this.getSettingsEndpoint(req, res)
      } else if (path === '/api/ai/recognize' && req.method === 'POST') {
        this.recognize(req, res)
      } else if (path === '/api/ai/recognize-batch' && req.method === 'POST') {
        this.recognizeBatch(req, res)
      } else if (path === '/api/fts-health' && req.method === 'GET') {
        this.ftsHealth(req, res)
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
    let health = { ok: false, message: 'unknown' }
    try {
      if (this.db) {
        // 直接基于 this.db 计算健康状态，不依赖 main.js 设置的 global
        const raw = this.db.pragma('integrity_check')
        // better-sqlite3 pragma('integrity_check') 返回 [{integrity_check: 'ok'}] 数组
        let integrity = 'unknown'
        if (Array.isArray(raw) && raw.length > 0 && raw[0]) {
          integrity = String(raw[0].integrity_check || 'unknown')
        } else if (typeof raw === 'string') {
          integrity = raw
        }
        const itemsCount = this.db.prepare('SELECT COUNT(*) AS c FROM items').get().c
        const materialsCount = this.db.prepare('SELECT COUNT(*) AS c FROM materials').get().c
        const locationsCount = this.db.prepare('SELECT COUNT(*) AS c FROM locations').get().c
        const categoriesCount = this.db.prepare('SELECT COUNT(*) AS c FROM categories').get().c
        // 列出所有建好的索引（按表+名），用于排查日期范围索引是否真的建了
        const indexes = this.db.prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).all().map(r => r.name)
        const ok = integrity === 'ok'
        health = {
          ok,
          integrity,
          items: itemsCount,
          materials: materialsCount,
          locations: locationsCount,
          categories: categoriesCount,
          indexes,
          message: ok ? `数据库健康（items=${itemsCount}, materials=${materialsCount}, locations=${locationsCount}, categories=${categoriesCount}）` : `数据库完整性异常: ${integrity}`
        }
      } else {
        health = { ok: false, message: 'db not ready' }
      }
    } catch (e) {
      health = { ok: false, message: e.message }
    }
    json(res, 200, {
      app: 'Family Inventory Agent API',
      version: pkg.version,
      dbPath: this.resolveDbPath(),
      dataDir: settings.dataDir || this.app.getPath('userData'),
      timestamp: nowMs(),
      health
    })
  }

  listItems(req, res, url) {
    const keyword = (url.searchParams.get('keyword') || '').trim()
    const category = (url.searchParams.get('category') || '').trim()
    const page = this._parsePagination(url)
    // 构造 WHERE 子句（LEFT JOIN item_ocr，keyword 也能命中照片文字）
    const where = []
    const params = []
    if (category) {
      where.push('i.category = ?')
      params.push(category)
    }
    if (keyword) {
      // FTS5 v1.8.2：FTS5 命中 ∪ LIKE 命中 并集（含 OCR 子表）
      // 旧版（v1.8.0/v1.8.1）：FTS5 零命中整段切换到 LIKE，unicode61 停用词单字搜索体验差
      const unionIds = ftsUnionLikeSearch(this.db, 'items_fts', 'items', 'o', keyword,
        ['name', 'item_no', 'room', 'position', 'location', 'notes'])
      if (unionIds.length > 0) {
        where.push('i.id IN (' + unionIds.map(() => '?').join(',') + ')')
        params.push(...unionIds)
      } else {
        // 极小概率：FTS5/LIKE 双零命中（keyword 全是 %/_ 转义后的怪字符），兜底单 LIKE
        where.push('(i.name LIKE ? OR i.item_no LIKE ? OR i.room LIKE ? OR i.position LIKE ? OR i.location LIKE ? OR i.notes LIKE ? OR o.ocr_text LIKE ?)')
        const like = `%${keyword}%`
        params.push(like, like, like, like, like, like, like)
      }
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const joinSql = 'LEFT JOIN item_ocr o ON i.id = o.item_id'
    const fromSql = `items i ${joinSql}`
    // 分页时先取总数（去重，避免 JOIN 后重复计数）
    if (page) {
      const total = this.db.prepare(`SELECT COUNT(DISTINCT i.id) AS c FROM ${fromSql} ${whereSql}`).get(...params).c
      const rows = this.db
        .prepare(`SELECT i.* FROM ${fromSql} ${whereSql} ORDER BY i.updated_at DESC LIMIT ? OFFSET ?`)
        .all(...params, page.limit, page.offset)
      json(res, 200, {
        items: rows.map(itemMapper(url)),
        pagination: this._buildPagination(total, page)
      })
    } else {
      const rows = this.db.prepare(`SELECT i.* FROM ${fromSql} ${whereSql} ORDER BY i.updated_at DESC`).all(...params)
      json(res, 200, { items: rows.map(itemMapper(url)) })
    }
  }

  async createItem(req, res) {
    const data = await readBody(req)
    if (!data.name) {
      json(res, 400, { error: 'Bad request', message: 'name is required' })
      return
    }
    // 与 UI IPC 共用 services/items（同一事务、同一同步逻辑，消除双写漂移）
    const { row, sync } = itemsService.createItem(this.db, data)
    if (sync.categories) this.notifyRenderer('categories')
    if (sync.locations) this.notifyRenderer('locations')
    this.notifyRenderer('items')
    json(res, 201, { item: toPhoneItem(row), sync })
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
    const cur = this.db.prepare('SELECT id FROM items WHERE id = ?').get(id)
    if (!cur) {
      json(res, 404, { error: 'Not found' })
      return
    }
    const data = await readBody(req)
    // 与 UI IPC 共用 services/items（同一合并与同步逻辑）
    const { row, sync } = itemsService.updateItem(this.db, id, data)
    if (sync.categories) this.notifyRenderer('categories')
    if (sync.locations) this.notifyRenderer('locations')
    this.notifyRenderer('items')
    json(res, 200, { item: toPhoneItem(row), sync })
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
    const url = new URL(req.url, `http://localhost:${this.port}`)
    const page = this._parsePagination(url)
    if (page) {
      const total = this.db.prepare('SELECT COUNT(*) AS c FROM categories').get().c
      const rows = this.db
        .prepare('SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC LIMIT ? OFFSET ?')
        .all(page.limit, page.offset)
      json(res, 200, { categories: rows, pagination: this._buildPagination(total, page) })
    } else {
      const rows = this.db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC').all()
      json(res, 200, { categories: rows })
    }
  }

  listLocations(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`)
    const page = this._parsePagination(url)
    if (page) {
      const total = this.db.prepare('SELECT COUNT(*) AS c FROM locations').get().c
      const rows = this.db
        .prepare('SELECT * FROM locations ORDER BY sort_order ASC, created_at ASC LIMIT ? OFFSET ?')
        .all(page.limit, page.offset)
      json(res, 200, { locations: rows, pagination: this._buildPagination(total, page) })
    } else {
      const rows = this.db.prepare('SELECT * FROM locations ORDER BY sort_order ASC, created_at ASC').all()
      json(res, 200, { locations: rows })
    }
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
    const startDate = (url.searchParams.get('startDate') || url.searchParams.get('start_date') || '').trim()
    const endDate = (url.searchParams.get('endDate') || url.searchParams.get('end_date') || '').trim()
    const tag = (url.searchParams.get('tag') || '').trim()
    const page = this._parsePagination(url)
    // 构造 WHERE 子句（LEFT JOIN material_ocr，keyword 也能命中照片文字）
    const where = ['1=1']
    const params = []
    if (type) {
      where.push('m.type = ?')
      params.push(type)
    }
    if (keyword) {
      // FTS5 v1.8.2：FTS5 命中 ∪ LIKE 命中 并集（含 OCR 子表）
      const unionIds = ftsUnionLikeSearch(this.db, 'materials_fts', 'materials', 'o', keyword,
        ['title', 'content', 'tags'])
      if (unionIds.length > 0) {
        where.push('m.id IN (' + unionIds.map(() => '?').join(',') + ')')
        params.push(...unionIds)
      } else {
        // 极小概率：FTS5/LIKE 双零命中，兜底单 LIKE
        where.push('(m.title LIKE ? OR m.content LIKE ? OR m.tags LIKE ? OR o.ocr_text LIKE ?)')
        const like = `%${keyword}%`
        params.push(like, like, like, like)
      }
    }
    if (startDate) {
      where.push('m.event_start_date >= ?')
      params.push(startDate)
    }
    if (endDate) {
      where.push('m.event_end_date <= ?')
      params.push(endDate)
    }
    if (tag) {
      where.push('m.tags LIKE ?')
      params.push(`%${tag}%`)
    }
    const whereSql = `WHERE ${where.join(' AND ')}`
    const joinSql = 'LEFT JOIN material_ocr o ON m.id = o.material_id'
    const fromSql = `materials m ${joinSql}`
    if (page) {
      const total = this.db.prepare(`SELECT COUNT(DISTINCT m.id) AS c FROM ${fromSql} ${whereSql}`).get(...params).c
      const rows = this.db
        .prepare(`SELECT m.* FROM ${fromSql} ${whereSql} ORDER BY m.updated_at DESC LIMIT ? OFFSET ?`)
        .all(...params, page.limit, page.offset)
      json(res, 200, {
        materials: rows.map(materialMapper(url)),
        pagination: this._buildPagination(total, page)
      })
    } else {
      const rows = this.db
        .prepare(`SELECT m.* FROM ${fromSql} ${whereSql} ORDER BY m.updated_at DESC`)
        .all(...params)
      json(res, 200, { materials: rows.map(materialMapper(url)) })
    }
  }

  // ===== 电子材料类型管理 =====
  listMaterialTypes(req, res) {
    const settings = this.getSettingsObj()
    json(res, 200, { materialTypes: settings.materialTypes || [] })
  }

  async updateMaterialTypes(req, res) {
    const data = await readBody(req)
    let types = data.types || data
    if (typeof types === 'string') types = [types]
    if (!Array.isArray(types)) {
      json(res, 400, { error: 'Bad request', message: 'types must be an array or string' })
      return
    }
    types = types.map((t) => String(t).trim()).filter(Boolean)
    const settings = this.getSettingsObj()
    settings.materialTypes = types
    this.writeAppSettings(settings)
    json(res, 200, { materialTypes: types })
  }

  getMaterial(req, res, path, url) {
    const id = decodeURIComponent(path.slice('/api/e-materials/'.length))
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
    const row = {
      id,
      type: data.type || 'note',
      title: data.title || '',
      content: data.content || '',
      url: data.url || '',
      tags: normalizeTags(data.tags),
      photo: data.photo || '',
      meta: data.meta || '',
      event_start_date: data.eventStartDate || data.event_start_date || '',
      event_end_date: data.eventEndDate || data.event_end_date || '',
      created_at: now,
      updated_at: now
    }
    this.db.prepare(
      'INSERT INTO materials (id,type,title,content,url,tags,photo,meta,event_start_date,event_end_date,created_at,updated_at) VALUES (@id,@type,@title,@content,@url,@tags,@photo,@meta,@event_start_date,@event_end_date,@created_at,@updated_at)'
    ).run(row)
    const created = this.db.prepare('SELECT * FROM materials WHERE id = ?').get(id)
    this.notifyRenderer('materials')
    json(res, 201, { material: toPhoneMaterial(created) })
  }

  async updateMaterial(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/e-materials/'.length))
    const cur = this.db.prepare('SELECT * FROM materials WHERE id = ?').get(id)
    if (!cur) {
      json(res, 404, { error: 'Not found' })
      return
    }
    const data = await readBody(req)
    const next = {
      ...cur,
      type: data.type !== undefined ? data.type : cur.type,
      title: data.title !== undefined ? data.title : cur.title,
      content: data.content !== undefined ? data.content : cur.content,
      url: data.url !== undefined ? data.url : cur.url,
      tags: data.tags !== undefined ? normalizeTags(data.tags) : cur.tags,
      photo: data.photo !== undefined ? data.photo : cur.photo,
      meta: data.meta !== undefined ? data.meta : cur.meta,
      event_start_date: data.eventStartDate !== undefined ? (data.eventStartDate || '') : (data.event_start_date !== undefined ? (data.event_start_date || '') : cur.event_start_date),
      event_end_date: data.eventEndDate !== undefined ? (data.eventEndDate || '') : (data.event_end_date !== undefined ? (data.event_end_date || '') : cur.event_end_date),
      updated_at: nowMs()
    }
    this.db.prepare(
      'UPDATE materials SET type=@type,title=@title,content=@content,url=@url,tags=@tags,photo=@photo,meta=@meta,event_start_date=@event_start_date,event_end_date=@event_end_date,updated_at=@updated_at WHERE id=@id'
    ).run(next)
    this.notifyRenderer('materials')
    json(res, 200, { material: toPhoneMaterial(next) })
  }

  deleteMaterial(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/e-materials/'.length))
    const info = this.db.prepare('DELETE FROM materials WHERE id = ?').run(id)
    this.notifyRenderer('materials')
    json(res, 200, { deleted: info.changes })
  }

  // 独立获取材料图片 base64，避免列表接口返回超长数据
  getMaterialPhoto(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/e-materials/'.length, path.lastIndexOf('/photo')))
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

  /**
   * 批量识别：并发处理多张图片，返回合并的物品建议
   * POST /api/ai/recognize-batch
   * body: { images: string[], concurrency?: number }
   * - images: 图片 data URL 数组
   * - concurrency: 并发数（默认 3，最大 10）
   * 响应：{ ok, suggestions: [...], errors?, total, done, canceled }
   */
  async recognizeBatch(req, res) {
    const data = await readBody(req)
    const images = Array.isArray(data.images) ? data.images : []
    if (images.length === 0) {
      json(res, 400, { error: 'Bad request', message: 'images 必须是非空数组' })
      return
    }
    if (images.length > 50) {
      json(res, 400, { error: 'Bad request', message: '单次最多 50 张图片' })
      return
    }
    const rawConcurrency = Number(data.concurrency) || 3
    const concurrency = Math.max(1, Math.min(10, Math.floor(rawConcurrency)))
    const settings = this.getSettingsObj()
    const startedAt = Date.now()
    const result = await recognizeBatch({
      images,
      db: this.db,
      settings,
      concurrency
    })
    const elapsed = Date.now() - startedAt
    json(res, 200, {
      ok: result.ok,
      suggestions: result.items || [],
      errors: result.errors,
      canceled: result.canceled || false,
      total: result.total,
      done: result.done,
      elapsedMs: elapsed,
      concurrency
    })
  }

  /**
   * 物品 OCR：识别物品照片中所有文字，存到 item_ocr 独立表
   * POST /api/items/:id/ocr
   * body: { image?: string }  // 可选；不传则用 items.photo 已存的照片
   */
  async ocrItem(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/items/'.length, -'/ocr'.length))
    const row = this.db.prepare('SELECT id, photo FROM items WHERE id = ?').get(id)
    if (!row) {
      json(res, 404, { error: 'Not found', id })
      return
    }
    const data = await readBody(req).catch(() => ({}))
    const image = data.image || row.photo || ''
    if (!image) {
      json(res, 400, { error: 'Bad request', message: '该物品没有照片，且请求未提供 image' })
      return
    }
    const settings = this.getSettingsObj()
    const result = await recognizeText({ image, settings })
    if (!result.ok) {
      json(res, 502, { error: 'OCR failed', message: result.error })
      return
    }
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO item_ocr (item_id, ocr_text, ocr_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET
           ocr_text = excluded.ocr_text,
           ocr_at = excluded.ocr_at,
           updated_at = excluded.updated_at`
      )
      .run(id, result.text, now, now)
    this.notifyRenderer('items')
    json(res, 200, { id, ocr_text: result.text, ocr_at: now })
  }

  getItemOcr(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/items/'.length, -'/ocr'.length))
    const row = this.db.prepare('SELECT item_id, ocr_text, ocr_at FROM item_ocr WHERE item_id = ?').get(id)
    if (!row) {
      json(res, 200, { id, ocr_text: '', ocr_at: 0 })
      return
    }
    json(res, 200, { id: row.item_id, ocr_text: row.ocr_text || '', ocr_at: row.ocr_at || 0 })
  }

  /**
   * 材料 OCR：识别材料照片中所有文字，存到 material_ocr 独立表
   * POST /api/e-materials/:id/ocr
   */
  async ocrMaterial(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/e-materials/'.length, -'/ocr'.length))
    const row = this.db.prepare('SELECT id, photo FROM materials WHERE id = ?').get(id)
    if (!row) {
      json(res, 404, { error: 'Not found', id })
      return
    }
    const data = await readBody(req).catch(() => ({}))
    const image = data.image || row.photo || ''
    if (!image) {
      json(res, 400, { error: 'Bad request', message: '该材料没有照片，且请求未提供 image' })
      return
    }
    const settings = this.getSettingsObj()
    const result = await recognizeText({ image, settings })
    if (!result.ok) {
      json(res, 502, { error: 'OCR failed', message: result.error })
      return
    }
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO material_ocr (material_id, ocr_text, ocr_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(material_id) DO UPDATE SET
           ocr_text = excluded.ocr_text,
           ocr_at = excluded.ocr_at,
           updated_at = excluded.updated_at`
      )
      .run(id, result.text, now, now)
    this.notifyRenderer('materials')
    json(res, 200, { id, ocr_text: result.text, ocr_at: now })
  }

  getMaterialOcr(req, res, path) {
    const id = decodeURIComponent(path.slice('/api/e-materials/'.length, -'/ocr'.length))
    const row = this.db.prepare('SELECT material_id, ocr_text, ocr_at FROM material_ocr WHERE material_id = ?').get(id)
    if (!row) {
      json(res, 200, { id, ocr_text: '', ocr_at: 0 })
      return
    }
    json(res, 200, { id: row.material_id, ocr_text: row.ocr_text || '', ocr_at: row.ocr_at || 0 })
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

  // FTS5 健康端点：返回 items_fts / materials_fts 内部体检结果
  // 1) 优先用 main.js 启动期写入的 global.__ftsHealth 缓存
  // 2) 缓存缺失时现场跑一次 FTS5 integrity-check，把结果回写缓存并返回
  // 两者都为 'ok' → 200 healthy；任一为 'error' → 503 unhealthy
  ftsHealth(req, res) {
    let h = global.__ftsHealth
    let source = 'cache'
    if (!h || (h.items_fts_check == null && h.materials_fts_check == null)) {
      // 兜底：主动跑一次 FTS5 integrity-check（无返回行命令，run() 不抛即 OK）
      const result = { items_fts_check: 'unknown', materials_fts_check: 'unknown' }
      try {
        if (this.db) {
          this.db.prepare("INSERT INTO items_fts(items_fts) VALUES('integrity-check')").run()
          result.items_fts_check = 'ok'
        }
      } catch (e) {
        result.items_fts_check = 'error'
      }
      try {
        if (this.db) {
          this.db.prepare("INSERT INTO materials_fts(materials_fts) VALUES('integrity-check')").run()
          result.materials_fts_check = 'ok'
        }
      } catch (e) {
        result.materials_fts_check = 'error'
      }
      global.__ftsHealth = result
      h = result
      source = 'live'
    }
    const items = h.items_fts_check
    const materials = h.materials_fts_check
    const itemsOk = items === 'ok'
    const materialsOk = materials === 'ok'
    const healthy = itemsOk && materialsOk
    json(res, healthy ? 200 : 503, {
      healthy,
      source,
      items_fts: { status: items || 'unknown', ok: itemsOk },
      materials_fts: { status: materials || 'unknown', ok: materialsOk },
      hint: healthy
        ? 'FTS5 内部结构正常'
        : (!items || !materials) && (items === 'error' || materials === 'error')
          ? 'FTS5 内部结构损坏，建议从备份恢复或重置库'
          : 'FTS5 虚表未就绪（db 句柄不可用）'
    })
  }
}

module.exports = { ApiServer, DEFAULT_PORT }
