// 图片存储层：将压缩后的 base64 存到 <dataDir>/photos/，避免把大字符串塞进 SQLite。
// 前端通过 window.api.photo 间接调用；本模块提供 Promise 包装，便于与现有 api.js 风格保持一致。

function buildProxy(basePath) {
  return new Proxy({}, {
    get(_, prop) {
      if (!window.lingguang) return undefined
      const obj = basePath.reduce((o, p) => (o?.[p] ?? null), window.lingguang)
      if (!obj) return undefined
      const v = obj[prop]
      if (typeof v === 'undefined') return undefined
      if (typeof v === 'function') return (...args) => v.apply(obj, args)
      if (v === null || typeof v !== 'object') return v
      if (v instanceof Array || v instanceof Date || v instanceof RegExp || v instanceof Error) return v
      return buildProxy([...basePath, prop])
    }
  })
}

const api = buildProxy([])

export async function savePhoto(base64, filename) {
  const result = await api.photo.save(base64, filename)
  if (result && result.ok) return result.relPath
  throw new Error(result?.error || '照片保存失败')
}

export async function readPhoto(relPath) {
  const result = await api.photo.read(relPath)
  if (result && result.ok) return result.data
  throw new Error(result?.error || '照片读取失败')
}

export async function deletePhoto(relPath) {
  const result = await api.photo.delete(relPath)
  if (!result?.ok) throw new Error(result?.error || '照片删除失败')
  return result
}

// 返回 <img src> 可直接使用的文件 URL
export function photoPath(relPath) {
  if (!relPath) return ''
  if (/^(data:|https?:|file:)/i.test(relPath)) return relPath
  return relPath
}