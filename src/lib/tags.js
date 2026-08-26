/**
 * 标签解析工具（renderer 端）
 *
 * 必须与 electron/tags.js 保持行为一致（main/renderer 物理隔离）。
 */

/**
 * 把数据库里的 tags 字段解析为字符串数组。
 * 兼容：JSON 数组、逗号/空格/中文逗号分隔的旧格式、空值。
 */
export function parseTags(raw) {
  if (Array.isArray(raw)) {
    return raw.filter(Boolean).map((t) => String(t).trim())
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map((t) => String(t).trim())
      }
    } catch {
      // 不是 JSON 字符串，走旧格式拆分
    }
    return raw.split(/[,，\s]+/).filter(Boolean).map((t) => t.trim())
  }
  return []
}

/**
 * 把任意入参（数组/字符串）归一化为存库的 JSON 字符串 '["a","b"]'。
 */
export function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return JSON.stringify(tags.filter(Boolean).map((t) => String(t).trim()))
  }
  if (typeof tags === 'string' && tags.trim()) {
    const arr = tags.split(/[,，\s]+/).filter(Boolean).map((t) => t.trim())
    return JSON.stringify(arr)
  }
  return '[]'
}
