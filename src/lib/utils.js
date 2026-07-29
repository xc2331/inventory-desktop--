// 时间戳与日期工具：所有时间戳为毫秒级 Unix 时间戳

// 毫秒时间戳 -> input[type=date] 字符串
export function tsToDateInput(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// input[type=date] 字符串 -> 毫秒时间戳（当日 00:00 本地时区）
export function dateInputToTs(s) {
  if (!s) return 0
  return new Date(s + 'T00:00:00').getTime()
}

// 毫秒时间戳 -> 展示用日期
export function formatDate(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 过期状态：expired / soon / ok
export function expiryStatus(ts) {
  if (!ts) return null
  const now = Date.now()
  const days = Math.ceil((ts - now) / 86400000)
  if (days < 0) return { label: '已过期', tone: 'expired', days }
  if (days <= 7) return { label: `${days} 天后过期`, tone: 'soon', days }
  return { label: formatDate(ts), tone: 'ok', days }
}

export function formatDateTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
