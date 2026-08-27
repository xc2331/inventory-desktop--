// AI 视觉识别服务：调用用户配置的 OpenAI 兼容多模态大模型，识别图片中的物品信息
// v1.2.15 起支持多供应商配置：settings.aiProviders[] + settings.aiSelectedId
const crypto = require('crypto')
// 分类归一化统一复用 data-utils（主进程唯一实现，避免与 main/api-server 行为漂移）：
// 未命中时保留原始输入（可能是自定义分类名），由 ensureCategoriesFromItems 决定是否新建
const { normalizeCategoryKey } = require('./data-utils')

function extractJson(text) {
  if (!text) return null
  text = String(text).trim()
  if (text.startsWith('{') || text.startsWith('[')) {
    try { return JSON.parse(text) } catch { /* ignore */ }
  }
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) {
    try { return JSON.parse(match[1].trim()) } catch { /* ignore */ }
  }
  const inline = text.match(/\{[\s\S]*?\}/)
  if (inline) {
    try { return JSON.parse(inline[0]) } catch { /* ignore */ }
  }
  return null
}

// 把图片按 provider 配置的 imageFormat 拼成多模态消息 part
// imageFormat:
//   'auto'         — data URL（OpenAI 默认，向后兼容）
//   'data_url'     — data URL
//   'image_url'    — OpenAI 风格但只发裸 base64（剥掉 data: 前缀）
//   'image_base64' — Qwen/GLM 风格 { type: 'image', image: 'XXX' }
function buildImagePart(image, imageFormat) {
  const raw = ensureImageUrl(image)
  if (!raw) return { type: 'image_url', image_url: { url: '' } }
  const fmt = (imageFormat || 'auto').toLowerCase()
  if (fmt === 'image_base64') {
    const b64 = raw.replace(/^data:[^;]+;base64,/, '')
    return { type: 'image', image: b64 }
  }
  if (fmt === 'image_url') {
    const b64 = raw.replace(/^data:[^;]+;base64,/, '')
    return { type: 'image_url', image_url: { url: b64 } }
  }
  // 'auto' / 'data_url' — 默认
  return { type: 'image_url', image_url: { url: raw } }
}

function ensureImageUrl(image) {
  if (!image) return ''
  const s = String(image).trim()
  if (!s) return ''
  if (/^(data:|https?:|file:)/i.test(s)) return s
  if (/^[a-z]:[\\/]/i.test(s) || s.startsWith('/')) {
    const withSlash = s.replace(/\\/g, '/')
    return withSlash.startsWith('/') ? 'file://' + withSlash : 'file:///' + withSlash
  }
  return 'file:///' + s.replace(/\\/g, '/')
}

function buildPrompt(categories) {
  const categoryHint = categories
    .map((c) => `${c.key}(${c.name}${c.name_en ? '/' + c.name_en : ''})`)
    .join('、')
  return `你是一名家庭物品整理助手。用户会上传一张照片，请识别照片中的物品，并给出每个物品的名称、分类、存放位置、数量、置信度和简短说明。

要求：
1. 分类请优先从以下列表中选择最接近的一项：${categoryHint}。如果都不符合，请使用 "other"。
2. 位置请用 "房间 > 子位置" 的格式返回，例如 "厨房 > 冰箱 > 冷藏室"。
3. 数量请返回整数；如果无法判断，返回 1。
4. 请严格返回 JSON 格式，不要包含任何额外说明。JSON 结构如下：
{
  "items": [
    { "name": "物品名称", "category": "分类 key", "location": "房间 > 子位置", "quantity": 1, "confidence": 0.9, "note": "简短说明" }
  ]
}
如果照片中没有任何可识别的家庭物品，返回 {"items": []}。`
}

function sanitizeSuggestion(item, categories) {
  return {
    name: String(item.name || '').trim() || '未识别物品',
    // 共享版 normalizeCategoryKey 对空输入返回 ''，AI 建议兜底到 other
    category: normalizeCategoryKey(item.category, categories) || 'other',
    location: String(item.location || '').trim(),
    quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
    confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0)),
    note: String(item.note || '').trim()
  }
}

// ===== 多供应商配置迁移与选择 =====

function migrateAIConfig(settings) {
  if (!settings) settings = {}
  const hasOld =
    settings.aiBaseUrl !== undefined ||
    settings.aiKey !== undefined ||
    settings.aiModel !== undefined
  if (!Array.isArray(settings.aiProviders) || settings.aiProviders.length === 0 || hasOld) {
    const providers = Array.isArray(settings.aiProviders) ? [...settings.aiProviders] : []
    if (hasOld) {
      providers.push({
        id: crypto.randomUUID(),
        name: '默认',
        baseUrl: String(settings.aiBaseUrl || '').trim(),
        key: String(settings.aiKey || '').trim(),
        model: String(settings.aiModel || '').trim() || 'gpt-4o-mini',
        selected: true
      })
      delete settings.aiBaseUrl
      delete settings.aiKey
      delete settings.aiModel
    }
    settings.aiProviders = providers
  }
  // 确保 selectedId 有效
  const selected =
    settings.aiProviders.find((p) => p.id === settings.aiSelectedId) ||
    settings.aiProviders.find((p) => p.selected) ||
    settings.aiProviders[0]
  settings.aiSelectedId = selected?.id || ''
  return settings
}

function getActiveProvider(settings) {
  const s = migrateAIConfig(settings)
  if (!s.aiProviders || s.aiProviders.length === 0) return null
  return (
    s.aiProviders.find((p) => p.id === s.aiSelectedId) ||
    s.aiProviders.find((p) => p.selected) ||
    s.aiProviders[0]
  )
}

function sanitizeProvider(p) {
  return {
    id: p.id || crypto.randomUUID(),
    name: String(p.name || '').trim() || '未命名',
    baseUrl: String(p.baseUrl || '').trim(),
    key: String(p.key || '').trim(),
    model: String(p.model || '').trim() || 'gpt-4o-mini',
    selected: p.selected === true
  }
}

/**
 * 调用外部视觉模型识别图片
 * @param {Object} options
 * @param {string} options.image 图片 data URL / URL / 本地路径
 * @param {object} options.db 数据库实例（用于读取分类）
 * @param {object} options.settings 应用设置对象
 * @param {object} [options.provider] 指定使用的供应商（否则取当前选中供应商）
 * @returns {Promise<{ok:boolean, items?:object[], error?:string}>}
 */
async function recognizeImage({ image, db, settings, provider }) {
  const cfg = provider || getActiveProvider(settings)
  if (!cfg) return { ok: false, error: '未配置 AI 供应商' }

  const baseUrl = cfg.baseUrl
  const key = cfg.key
  const model = cfg.model || 'gpt-4o-mini'

  if (!baseUrl) return { ok: false, error: '未配置 AI 接口地址（Base URL）' }
  if (!key) return { ok: false, error: '未配置 AI 接口密钥（API Key）' }
  if (!image) return { ok: false, error: '缺少图片' }

  const categories = db ? db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC').all() : []
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  const body = {
    model,
    temperature: 0.3,
    messages: [
      { role: 'system', content: buildPrompt(categories) },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请识别这张照片中的物品，并返回 JSON 建议。' },
          buildImagePart(image, cfg.imageFormat)
        ]
      }
    ]
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `AI 接口返回 ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    const parsed = extractJson(content)

    if (!parsed) {
      return { ok: false, error: 'AI 返回无法解析为 JSON', raw: content }
    }

    const rawItems = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : []
    const items = rawItems.map((it) => sanitizeSuggestion(it, categories))

    return { ok: true, items }
  } catch (e) {
    console.error('[ai-service] recognize error:', e)
    return { ok: false, error: e.message || 'AI 识别请求失败' }
  }
}

async function fetchModels({ settings, provider } = {}) {
  const cfg = provider || getActiveProvider(settings)
  if (!cfg) {
    return { ok: false, error: '未配置 AI 供应商' }
  }
  const baseUrl = String(cfg.baseUrl || '').trim()
  const authKey = String(cfg.key || '').trim()
  const url = `${baseUrl.replace(/\/$/, '')}/models`
  if (!baseUrl || url === '/models') {
    return { ok: false, error: '未配置 AI 接口地址（Base URL）' }
  }
  if (!authKey) {
    return { ok: false, error: '未配置 AI 接口密钥（API Key）' }
  }
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authKey}`,
        'Content-Type': 'application/json'
      }
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `AI 接口返回 ${res.status}: ${text.slice(0, 200)}` }
    }
    const data = await res.json()
    const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []
    const models = list
      .map((m) => (typeof m === 'string' ? m : m.id))
      .filter(Boolean)
      .sort()
    return { ok: true, models }
  } catch (e) {
    console.error('[ai-service] fetchModels error:', e)
    return { ok: false, error: e.message || '获取模型列表失败' }
  }
}

/**
 * OCR 识别图片中的所有文字（票据/保单/说明书/保质期等）
 * 复用多模态视觉大模型，但换 prompt 让它返回纯文本（不解析 JSON）
 * @param {Object} options
 * @param {string} options.image 图片 data URL / URL / 本地路径
 * @param {object} options.settings 应用设置对象
 * @param {object} [options.provider] 指定供应商
 * @returns {Promise<{ok:boolean, text?:string, error?:string}>}
 */
async function recognizeText({ image, settings, provider }) {
  const cfg = provider || getActiveProvider(settings)
  if (!cfg) return { ok: false, error: '未配置 AI 供应商' }

  const baseUrl = cfg.baseUrl
  const key = cfg.key
  const model = cfg.model || 'gpt-4o-mini'

  if (!baseUrl) return { ok: false, error: '未配置 AI 接口地址（Base URL）' }
  if (!key) return { ok: false, error: '未配置 AI 接口密钥（API Key）' }
  if (!image) return { ok: false, error: '缺少图片' }

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  // OCR 专用 prompt：要求逐字识别保留原始排版，不要解释，不要补全
  const body = {
    model,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          '你是一名高精度 OCR 引擎。请逐字识别图片中的所有文字（包括印刷体与清晰手写体），' +
          '保留原始换行和段落结构，不要解释、不要补全、不要翻译、不要总结。' +
          '如果图片中没有任何可识别的文字，仅返回 <EMPTY>。'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请识别这张图片里的所有文字，按原样输出。' },
          buildImagePart(image, cfg.imageFormat)
        ]
      }
    ]
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `AI 接口返回 ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = await res.json()
    const content = (data.choices?.[0]?.message?.content || '').trim()

    if (!content || content === '<EMPTY>') {
      return { ok: true, text: '' }
    }

    return { ok: true, text: content }
  } catch (e) {
    console.error('[ai-service] recognizeText error:', e)
    return { ok: false, error: e.message || 'OCR 识别请求失败' }
  }
}

/**
 * 批量并发限流工具：限制同时执行的最大 Promise 数
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, idx: number) => Promise<any>} worker
 * @param {(opts: {done: number, total: number, current: T, result: any, error: any}) => void} [onProgress]
 * @returns {Promise<Array<{ok: boolean, value?: any, error?: string}>>}
 */
async function runLimited(items, limit, worker, onProgress) {
  const results = new Array(items.length)
  let cursor = 0
  let done = 0
  const total = items.length
  const isCanceled = { flag: false }
  const cancel = () => { isCanceled.flag = true }
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!isCanceled.flag) {
      const idx = cursor++
      if (idx >= total) return
      const item = items[idx]
      try {
        const value = await worker(item, idx)
        results[idx] = { ok: true, value }
      } catch (e) {
        results[idx] = { ok: false, error: e?.message || String(e) }
      }
      done++
      if (onProgress) {
        try { onProgress({ done, total, current: item, result: results[idx] }) } catch { /* swallow */ }
      }
    }
  })
  await Promise.all(workers)
  return { results, cancel }
}

/**
 * 批量识别多张图片：每张独立调 recognizeImage，结果合并返回
 * 限流默认 3 路并发（可调），单张失败不影响其他张
 * @param {Object} options
 * @param {string[]} options.images 图片 data URL 数组
 * @param {object} options.db 数据库实例
 * @param {object} options.settings 应用设置
 * @param {object} [options.provider] 指定供应商
 * @param {number} [options.concurrency=3] 并发数
 * @param {(p: {done: number, total: number, current: string, result: any}) => void} [options.onProgress] 进度回调
 * @returns {Promise<{ok: boolean, items?: object[], errors?: Array<{index: number, error: string}>, canceled?: boolean, total: number, done: number}>}
 */
async function recognizeBatch({ images, db, settings, provider, concurrency = 3, onProgress } = {}) {
  if (!Array.isArray(images) || images.length === 0) {
    return { ok: false, error: 'images 必须是非空数组', total: 0, done: 0 }
  }
  const allItems = []
  const errors = []
  let canceled = false
  const cancel = () => { canceled = true }

  const { results } = await runLimited(
    images,
    concurrency,
    async (img, idx) => {
      if (canceled) throw new Error('canceled')
      const r = await recognizeImage({ image: img, db, settings, provider })
      if (!r.ok) throw new Error(r.error || '识别失败')
      return r
    },
    (p) => {
      if (onProgress) onProgress(p)
    }
  )

  let doneCount = 0
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.ok && r.value?.ok) {
      if (Array.isArray(r.value.items)) {
        for (const it of r.value.items) allItems.push({ ...it, _source: i })
      }
      doneCount++
    } else if (r.error === 'canceled') {
      canceled = true
    } else {
      errors.push({ index: i, error: r.error || 'unknown' })
    }
  }

  return {
    ok: errors.length === 0 && !canceled,
    items: allItems,
    errors: errors.length ? errors : undefined,
    canceled,
    total: images.length,
    done: doneCount
  }
}

async function testConnection({ settings, provider } = {}) {
  const cfg = provider || getActiveProvider(settings)
  if (!cfg) {
    return { ok: false, error: '未配置 AI 供应商' }
  }
  const baseUrl = String(cfg.baseUrl || '').trim().replace(/\/$/, '')
  const authKey = String(cfg.key || '').trim()
  if (!baseUrl) {
    return { ok: false, error: 'AI 服务地址未配置' }
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: authKey ? { Authorization: `Bearer ${authKey}` } : {},
      signal: controller.signal
    })
    clearTimeout(timer)
    if (!res.ok) {
      return { ok: false, error: `服务返回 ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message || '连接失败' }
  }
}

module.exports = {
  recognizeImage,
  recognizeText,
  recognizeBatch,
  runLimited,
  fetchModels,
  testConnection,
  migrateAIConfig,
  getActiveProvider,
  sanitizeProvider
}
