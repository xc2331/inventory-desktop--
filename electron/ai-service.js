// AI 视觉识别服务：调用用户配置的 OpenAI 兼容多模态大模型，识别图片中的物品信息
// v1.2.15 起支持多供应商配置：settings.aiProviders[] + settings.aiSelectedId
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { URL } = require('url')
// 分类归一化统一复用 data-utils（主进程唯一实现，避免与 main/api-server 行为漂移）：
// 未命中时保留原始输入（可能是自定义分类名），由 ensureCategoriesFromItems 决定是否新建
const { normalizeCategoryKey } = require('./data-utils')

// 把任意形态的 image 输入归一化为 data URL
// 背景：v1.5+ 起 items.photo 改为存相对路径（dataDir/photos/xxx.webp），但
// v1.7.2 之前的 recognizeText 直接把 ensureImageUrl(image) 喂给 image_url.url
// 当 image 是相对路径时 ensureImageUrl 会拼成 'file:///2024-01/xxx.webp' 这种
// 残缺 URL，opencode zen / OpenAI 不认，导致 messages[1].content[1].type 1214。
// 修法：所有非 data: / http(s): 的输入都先在主进程读文件转 data URL，
// 保证 image_url.url 永远是一个合法的 base64 data URL。
// v1.9.3 兜底候选：扫盘符 + 常见位置找 dataDir/photos
// 背景：用户的数据可能在 D:/family-inventory 或 E:/family-inventory，
// 而 %APPDATA% 默认是 C:/Users/.../AppData/Roaming，找不到。
function findPhotoFallback(relOrAbsPath) {
  const candidates = []
  // 1. 显式 env 优先
  if (process.env.INVENTORY_DATA_DIR) {
    candidates.push(path.join(process.env.INVENTORY_DATA_DIR, 'photos'))
  }
  // 2. APPDATA 下两个 app 目录
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'family-inventory', 'photos'))
    candidates.push(path.join(process.env.APPDATA, 'inventory-desktop', 'photos'))
  }
  // 3. 盘符根目录的常见数据目录（用户最常用 D:/E:）
  for (const drive of ['D', 'E', 'F', 'G']) {
    candidates.push(`${drive}:\\family-inventory\\photos`)
    candidates.push(`${drive}:\\inventory-desktop\\photos`)
    candidates.push(`${drive}:\\家庭物资管家\\photos`)
  }
  // 4. 用户主目录下的常见位置
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, 'family-inventory', 'photos'))
    candidates.push(path.join(process.env.USERPROFILE, 'Documents', 'family-inventory', 'photos'))
    candidates.push(path.join(process.env.USERPROFILE, 'Desktop', 'family-inventory', 'photos'))
  }
  // 5. cwd
  candidates.push(path.join(process.cwd(), 'photos'))

  for (const dir of candidates) {
    const full = path.isAbsolute(relOrAbsPath) ? relOrAbsPath : path.join(dir, relOrAbsPath)
    if (fs.existsSync(full)) return full
  }
  // v1.9.3: 最后兜底 — 扫所有候选 dir 看 photos 子目录里有没有同名/相似文件
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) continue
      const photoDir = dir
      const basename = path.basename(relOrAbsPath)
      // 先尝试同名
      const sameName = path.join(photoDir, basename)
      if (fs.existsSync(sameName)) return sameName
      // 再尝试扫所有子目录
      const subs = fs.readdirSync(photoDir, { withFileTypes: true })
      for (const s of subs) {
        if (s.isDirectory()) {
          const try1 = path.join(photoDir, s.name, basename)
          if (fs.existsSync(try1)) return try1
        }
      }
    } catch (_) { /* 单个目录失败继续 */ }
  }
  return null
}

// v1.9.4: 不再依赖 settings.dataDir 传参，直接问 Electron 拿到 userData 目录
// 用户日志显示 baseDir=undefined 始终是 undefined，说明 api-server
// 透传 settings 时漏了 dataDir；用 app.getPath('userData') 绕过这条链路
function tryAppGetPath() {
  try {
    const { app } = require('electron')
    if (app && typeof app.getPath === 'function') {
      const p = app.getPath('userData')
      if (p) return p
    }
  } catch (_) { /* 可能在非 Electron 上下文跑（如脚本 require） */ }
  return null
}

// v1.9.4: 下载远程 URL 图片转 data URL。5 秒超时，30KB 头限制保护
// 之前 URL 直接 passthrough 给 opencode zen，opencode zen 不收 URL → 1214
// 现在本地先下载成 buffer，再走 data: URL 流程
function downloadUrlToDataUrl(urlStr, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let parsed
    try { parsed = new URL(urlStr) } catch (_) { resolve(null); return }
    const lib = parsed.protocol === 'https:' ? https : http
    const req = lib.get(urlStr, { timeout: timeoutMs }, (resp) => {
      if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        // 跟随一次重定向
        resolve(downloadUrlToDataUrl(resp.headers.location, timeoutMs))
        return
      }
      if (resp.statusCode !== 200) { resolve(null); return }
      const chunks = []
      let total = 0
      const max = 8 * 1024 * 1024 // 8MB 上限，避免巨图把内存吃光
      resp.on('data', (c) => {
        total += c.length
        if (total > max) { req.destroy(); resolve(null); return }
        chunks.push(c)
      })
      resp.on('end', () => {
        const buf = Buffer.concat(chunks)
        const ct = String(resp.headers['content-type'] || '').split(';')[0].trim() || 'image/jpeg'
        resolve(`data:${ct};base64,${buf.toString('base64')}`)
      })
      resp.on('error', () => resolve(null))
    })
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
  })
}

function _logResolveDecision(input, resolved, baseDir, extra) {
  // v1.9.3 诊断日志：写到 userData/ai-image-resolve.log
  // 用户跑一次后把这段贴回来，定位是 baseDir 没拿到，还是 file:// 解析错，还是真的缺文件
  try {
    const logPath = path.join(process.env.APPDATA || process.cwd(), 'family-inventory', 'ai-image-resolve.log')
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    let tag
    if (extra && extra.noDataDir) tag = 'NO_DATA_DIR'
    else if (resolved.startsWith('data:')) tag = 'OK_DATA_URL'
    else if (resolved === input) tag = 'PASSTHROUGH'
    else tag = 'OTHER'
    const ex = extra ? ` extra=${JSON.stringify(extra)}` : ''
    const line = `[${new Date().toISOString()}] ${tag} baseDir=${JSON.stringify(baseDir)} input=${JSON.stringify(input).slice(0, 200)} -> ${JSON.stringify(resolved).slice(0, 120)}${ex}\n`
    fs.appendFileSync(logPath, line)
  } catch (_) { /* 日志失败不影响主流程 */ }
}

function resolveImageInput(image, baseDir) {
  if (!image) return ''
  const s = String(image).trim()
  if (!s) return ''
  // v1.9.4: baseDir 拿不到时主动用 Electron userData 兜底
  // 用户日志显示 baseDir 始终 undefined，是 api-server 透传 settings 时漏了字段
  // 这里直接绕过 settings 链路
  if (!baseDir) {
    const userData = tryAppGetPath()
    if (userData) baseDir = userData
  }
  // 已经是 data URL — 原样返回
  if (/^data:/i.test(s)) { _logResolveDecision(s, s, baseDir); return s }
  // v1.9.4: http(s) URL — 主进程先下载转 data URL；下载失败再原样返回
  // 标记：先放个 PASSTHROUGH 占位，真正走异步在调用方处理
  if (/^https?:/i.test(s)) { _logResolveDecision(s, s, baseDir, { urlPassthrough: true }); return s }
  // file:// URL — 还原成磁盘路径
  let absPath = null
  if (/^file:\/\//i.test(s)) {
    absPath = s.replace(/^file:\/\/\/?/, '')
    // Windows 盘符：file:///C:/foo → C:/foo
    if (/^[a-z]:/i.test(absPath)) absPath = absPath
    else absPath = '/' + absPath
    absPath = path.normalize(absPath)
  } else if (path.isAbsolute(s)) {
    absPath = s
  } else if (baseDir) {
    // 相对路径：相对 dataDir 解析（photo.save 的产物存的就是相对路径）
    absPath = path.resolve(baseDir, s)
  } else {
    // v1.9.2 兜底：没 baseDir 时尝试常见候选目录
    const guessed = findPhotoFallback(s)
    if (guessed) {
      absPath = guessed
    } else {
      // 实在找不到 — 写日志并 passthrough（让上游 1214 错误暴露，方便定位）
      _logResolveDecision(s, s, baseDir)
      return s
    }
  }
  try {
    if (!fs.existsSync(absPath)) {
      // 文件不存在 — 兜底再试一次（处理 dataDir 实际是 photos 父目录或子目录的情况）
      const guessed = findPhotoFallback(s)
      if (guessed && fs.existsSync(guessed)) {
        absPath = guessed
      } else {
        _logResolveDecision(s, s, baseDir)
        return s
      }
    }
    const buf = fs.readFileSync(absPath)
    const ext = path.extname(absPath).toLowerCase()
    const mimeMap = {
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp'
    }
    const mime = mimeMap[ext] || 'image/jpeg'
    const out = `data:${mime};base64,${buf.toString('base64')}`
    _logResolveDecision(s, out, baseDir)
    return out
  } catch (e) {
    _logResolveDecision(s, s, baseDir)
    return s
  }
}

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
//   'auto'         — OpenAI 标准：{ type: 'image_url', image_url: { url: <data URL> } }（v1.7.2 行为，opencode zen / OpenAI / 自建代理全部 OK）
//   'data_url'     — 等同 auto：完整 data URL（带 data:image/...;base64, 前缀）
//   'image_url'    — 兼容旧名：行为同 data_url（不再剥前缀，因 opencode zen 会 1214）
//   'image_base64' — Qwen/DashScope 风格 { type: 'image', image: '<base64>' }
//   'image_field'  — 部分 GLM 变体 { type: 'image_base64', image_base64: '<base64>' }
function buildImagePart(image, imageFormat, provider) {
  const raw = ensureImageUrl(image)
  if (!raw) return { type: 'image_url', image_url: { url: '' } }
  const fmt = (imageFormat || 'auto').toLowerCase()
  // 'auto' / 'data_url' — OpenAI 标准：完整 data URL（绝大多数 provider 默认走这个）
  // 这覆盖了 opencode zen / openrouter / oneapi / 自建代理 / moonshot / volcengine / ark / doubao
  if (fmt === 'image_base64') {
    const b64 = raw.replace(/^data:[^;]+;base64,/, '')
    return { type: 'image', image: b64 }
  }
  if (fmt === 'image_field') {
    const b64 = raw.replace(/^data:[^;]+;base64,/, '')
    return { type: 'image_base64', image_base64: b64 }
  }
  if (fmt === 'image_url') {
    // 裸 base64（不带 data: 前缀）— 部分 OpenAI 兼容 provider 接受这种形态
    const b64 = raw.replace(/^data:[^;]+;base64,/, '')
    return { type: 'image_url', image_url: { url: b64 } }
  }
  // 'auto' / 'data_url' / 其它任何值 — 完整 data URL，OpenAI 标准
  return { type: 'image_url', image_url: { url: raw } }
}

// 显式指定 format（不走 guess），用于 400 自动重试场景
function buildImagePartWithFormat(image, fmt) {
  return buildImagePart(image, fmt, null)
}

// 根据 provider 元信息自动选图片格式（auto 模式）
// 规则：
//   - baseUrl 含 dashscope / bailian / aliyun / qwen  → image_base64
//   - baseUrl 含 bigmodel / zhipu / glm                 → image_base64
//   - baseUrl 含 volcengine / ark / doubao              → data_url (OpenAI 兼容)
//   - baseUrl 含 moonshot / kimi                        → data_url
//   - 其他（含 openai、自建代理）                       → data_url
function guessImageFormat(provider) {
  const url = String(provider?.baseUrl || '').toLowerCase()
  if (!url) return 'data_url'
  if (/dashscope|bailian|aliyun|qwen|tongyi/.test(url)) return 'image_base64'
  if (/bigmodel|zhipu|glm/.test(url)) return 'image_base64'
  if (/volcengine|ark\.|doubao/.test(url)) return 'data_url'
  if (/moonshot|kimi/.test(url)) return 'data_url'
  if (/openai|openrouter|oneapi|newapi|proxy/.test(url)) return 'data_url'
  // 兜底：国内常见 1210 错误多为 data URL 不被解析
  if (/cn$|com\.cn|\.cn/.test(url)) return 'image_url'
  return 'data_url'
}

// 返回该 provider 允许的 fallback 顺序
// OpenAI 兼容（绝大多数代理、opencode zen、openrouter、oneapi 等）只认 type='image_url'，
// 发 type='image' 或 type='image_base64' 会被 schema 校验直接打回 400/1214。
// 只有非 OpenAI schema（DashScope/Qwen/GLM 等）才把 image_base64 / image_field 列入候选。
function getFallbackOrder(provider) {
  const url = String(provider?.baseUrl || '').toLowerCase()
  // 非 OpenAI schema：保留四种
  if (/dashscope|bailian|aliyun|qwen|tongyi|bigmodel|zhipu|glm/.test(url)) {
    return ['data_url', 'image_url', 'image_base64', 'image_field']
  }
  // OpenAI 兼容（包括 opencode zen / openrouter / oneapi / volcengine / moonshot / 自建代理）
  // 只允许 image_url 系两种：data_url（带 data: 前缀）和 image_url（裸 base64）
  return ['data_url', 'image_url']
}

// 白名单校验：fmt 是否对当前 provider 合法。用于自学习写回前检查
function isValidFmtForProvider(fmt, provider) {
  return getFallbackOrder(provider).includes(fmt)
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

  // 相对路径 / file:// / 绝对路径 → 统一转 data URL（opencode zen / OpenAI 拒收 file:// 残缺 URL，会 1214）
  // v1.9.3: 同时把 baseDir 拿不到这件事写到日志，方便定位
  if (!settings || !settings.dataDir) {
    _logResolveDecision(image, image, settings && settings.dataDir, { noDataDir: true })
  }
  let dataUrl = resolveImageInput(image, settings?.dataDir)
  // v1.9.4: 远程 URL 在 resolveImageInput 里走 passthrough（保持函数同步），
  // 这里在主进程先下载成 buffer 再拼 data URL；下载失败才用原始 URL
  if (dataUrl && /^https?:/i.test(dataUrl)) {
    const downloaded = await downloadUrlToDataUrl(dataUrl)
    if (downloaded) {
      _logResolveDecision(dataUrl, downloaded, settings && settings.dataDir, { urlDownloaded: true })
      dataUrl = downloaded
    } else {
      _logResolveDecision(dataUrl, dataUrl, settings && settings.dataDir, { urlDownloadFailed: true })
    }
  }
  // v1.9.3: 硬校验 — 不是 data URL 开头就拒绝，宁可报错也不发残缺 URL 出去触发 1214
  if (!dataUrl) {
    return { ok: false, error: `图片解析失败：输入不是 data URL 也未匹配到本地文件（${String(image).slice(0, 80)}）` }
  }
  if (!dataUrl.startsWith('data:')) {
    _logResolveDecision(image, dataUrl, settings && settings.dataDir, { rejectNonDataUrl: true })
    return { ok: false, error: `图片路径无法解析为 data URL（${String(image).slice(0, 80)}）` }
  }

  const categories = db ? db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, created_at ASC').all() : []
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  // 第一次按用户/auto 选择的格式；若 400 则按该 provider 允许的顺序自动重试
  // 关键：只把 isValidFmtForProvider(f, cfg) 为 true 的 fmt 加进 orderedFmts，
  // 避免 cfg.imageFormat 是旧值（如 image_base64）污染首次请求导致 schema 1214
  const tried = new Set()
  const orderedFmts = []
  const initial = (cfg.imageFormat || 'auto').toLowerCase()
  const initialResolved = initial === 'auto' ? guessImageFormat(cfg) : initial
  if (isValidFmtForProvider(initialResolved, cfg)) {
    orderedFmts.push(initialResolved)
  }
  for (const f of getFallbackOrder(cfg)) {
    if (!orderedFmts.includes(f)) orderedFmts.push(f)
  }

  let lastErr = ''
  for (const fmt of orderedFmts) {
    if (tried.has(fmt)) continue
    tried.add(fmt)
    const body = {
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: buildPrompt(categories) },
        {
          role: 'user',
          content: [
            { type: 'text', text: '请识别这张照片中的物品，并返回 JSON 建议。' },
            buildImagePartWithFormat(dataUrl, fmt)
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
      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (!data) {
          lastErr = `AI 接口返回 ${res.status}: 响应非 JSON`
          continue
        }
        const content = data.choices?.[0]?.message?.content || ''
        const parsed = extractJson(content)
        if (!parsed) {
          lastErr = 'AI 返回无法解析为 JSON'
          continue
        }
        const rawItems = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : []
        const items = rawItems.map((it) => sanitizeSuggestion(it, categories))
        // 成功 — 把这个 fmt 写回 cfg，供下次直接命中
        // 但要确认这个 fmt 对当前 provider 合法（避免 OpenAI 兼容 schema 错误地记下 image_base64）
        if (cfg && cfg.imageFormat !== fmt && isValidFmtForProvider(fmt, cfg)) {
          cfg.imageFormat = fmt
          cfg.__learnedFormat = true
        }
        return { ok: true, items, imageFormat: fmt }
      }
      // 4xx 时记录错误并继续尝试下一种 imageFormat（1210 等图片格式错误就靠这个重试）
        if (res.status >= 400 && res.status < 500) {
          const text = await res.text().catch(() => '')
          lastErr = `AI 接口返回 ${res.status}: ${text.slice(0, 200)}`
          // 不 return — 继续 for 循环试下一种 fmt
          continue
        }
        // 5xx 也继续
        const text = await res.text().catch(() => '')
      lastErr = `AI 接口返回 ${res.status}: ${text.slice(0, 200)}`
    } catch (e) {
      lastErr = e.message || 'AI 识别请求失败'
    }
  }
  return { ok: false, error: lastErr || 'AI 识别全部格式失败' }
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

  // 把相对路径 / file:// URL / 绝对路径都归一为 data URL，
  // 否则 opencode zen / OpenAI 不认 file:// 或残缺路径，触发 1214 schema 错误
  if (!settings || !settings.dataDir) {
    _logResolveDecision(image, image, settings && settings.dataDir, { noDataDir: true })
  }
  let dataUrl = resolveImageInput(image, settings?.dataDir)
  // v1.9.4: 远程 URL 主进程先下载转 data URL
  if (dataUrl && /^https?:/i.test(dataUrl)) {
    const downloaded = await downloadUrlToDataUrl(dataUrl)
    if (downloaded) {
      _logResolveDecision(dataUrl, downloaded, settings && settings.dataDir, { urlDownloaded: true })
      dataUrl = downloaded
    } else {
      _logResolveDecision(dataUrl, dataUrl, settings && settings.dataDir, { urlDownloadFailed: true })
    }
  }
  if (!dataUrl) {
    return { ok: false, error: `图片解析失败：输入不是 data URL 也未匹配到本地文件（${String(image).slice(0, 80)}）` }
  }
  if (!dataUrl.startsWith('data:')) {
    _logResolveDecision(image, dataUrl, settings && settings.dataDir, { rejectNonDataUrl: true })
    return { ok: false, error: `图片路径无法解析为 data URL（${String(image).slice(0, 80)}）` }
  }

  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

  // 第一次按 cfg/auto；失败按该 provider 允许的顺序重试（OpenAI 兼容只到 image_url）
  const tried = new Set()
  const orderedFmts = []
  const initial = (cfg.imageFormat || 'auto').toLowerCase()
  const initialResolved = initial === 'auto' ? guessImageFormat(cfg) : initial
  if (isValidFmtForProvider(initialResolved, cfg)) {
    orderedFmts.push(initialResolved)
  }
  for (const f of getFallbackOrder(cfg)) {
    if (!orderedFmts.includes(f)) orderedFmts.push(f)
  }

  let lastErr = ''
  for (const fmt of orderedFmts) {
    if (tried.has(fmt)) continue
    tried.add(fmt)
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
            buildImagePartWithFormat(dataUrl, fmt)
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
      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (!data) {
          lastErr = `AI 接口返回 ${res.status}: 响应非 JSON`
          continue
        }
        const content = (data.choices?.[0]?.message?.content || '').trim()
        if (cfg && cfg.imageFormat !== fmt && isValidFmtForProvider(fmt, cfg)) {
          cfg.imageFormat = fmt
          cfg.__learnedFormat = true
        }
        if (!content || content === '<EMPTY>') {
          return { ok: true, text: '', imageFormat: fmt }
        }
        return { ok: true, text: content, imageFormat: fmt }
      }
      if (res.status >= 400 && res.status < 500) {
        const text = await res.text().catch(() => '')
        lastErr = `AI 接口返回 ${res.status}: ${text.slice(0, 200)}`
        // 继续尝试下一种 imageFormat
        continue
      }
      const text = await res.text().catch(() => '')
      lastErr = `AI 接口返回 ${res.status}: ${text.slice(0, 200)}`
    } catch (e) {
      lastErr = e.message || 'OCR 识别请求失败'
    }
  }
  return { ok: false, error: lastErr || 'OCR 全部格式失败' }
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
  sanitizeProvider,
  // v1.8.9 内部 helper（单测覆盖用）
  guessImageFormat,
  getFallbackOrder,
  isValidFmtForProvider,
  buildImagePart,
  buildImagePartWithFormat,
  // v1.9.1 内部 helper（把任意图片输入归一化为 data URL）
  resolveImageInput
}
