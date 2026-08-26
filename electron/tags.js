/**
 * 标签解析/归一化工具
 *
 * 数据库存的是 JSON 字符串（例如 '["a","b"]'），但历史数据可能是
 * 逗号/空格/中文逗号分隔的旧格式（"a, b / c,d"）。以下两个函数
 * 在读端/写端统一处理这些兼容场景。
 *
 * 注意：main process 和 renderer process 物理隔离（preload 边界），
 * 不能直接 import 同一份 .js。这里是 main 端实现；renderer 端
 * 见 src/lib/tags.js，两份必须保持行为一致。
 */

/**
 * 把数据库里的 tags 字段解析为字符串数组。
 * 兼容：JSON 数组、逗号/空格/中文逗号分隔的旧格式、空值。
 */
function parseTags(tags) {
  if (Array.isArray(tags)) {
    return tags.filter(Boolean).map((t) => String(t).trim())
  }
  if (typeof tags === 'string' && tags.trim()) {
    try {
      const parsed = JSON.parse(tags)
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map((t) => String(t).trim())
      }
    } catch {
      // 不是 JSON 字符串，走旧格式拆分
    }
    return tags.split(/[,，\s]+/).filter(Boolean).map((t) => t.trim())
  }
  return []
}

/**
 * 把任意入参（数组/字符串）归一化为存库的 JSON 字符串 '["a","b"]'。
 * 数组 → trim 过滤 → JSON.stringify
 * 字符串 → 拆分旧格式 → JSON.stringify
 * 空 → '[]'
 */
function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return JSON.stringify(tags.filter(Boolean).map((t) => String(t).trim()))
  }
  if (typeof tags === 'string' && tags.trim()) {
    const arr = tags.split(/[,，\s]+/).filter(Boolean).map((t) => t.trim())
    return JSON.stringify(arr)
  }
  return '[]'
}

module.exports = { parseTags, normalizeTags }
