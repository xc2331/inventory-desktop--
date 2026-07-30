// 智能物品编号生成：参考已有数据中的编号规则，生成下一个编号
// 规则：从现有 item_no 中检测主导前缀与序列宽度，结合当日日期生成「前缀-YYYYMMDD-序号」

/**
 * 生成下一个物品编号
 * @param {import('better-sqlite3').Database} db
 * @returns {string}
 */
function generateItemNo(db) {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const datePart = `${y}${m}${d}`

  let existing = []
  try {
    existing = db
      .prepare("SELECT item_no FROM items WHERE item_no != ''")
      .all()
      .map((r) => r.item_no)
  } catch (e) {
    /* ignore */
  }

  // 1. 检测主导前缀（取出现次数最多的 PREFIX- 前缀）
  const prefixRe = /^([A-Za-z][A-Za-z0-9_]*)-/
  const prefixCounts = {}
  for (const v of existing) {
    const mm = v.match(prefixRe)
    if (mm) prefixCounts[mm[1]] = (prefixCounts[mm[1]] || 0) + 1
  }
  let prefix = 'WP'
  let maxCount = 0
  for (const [p, c] of Object.entries(prefixCounts)) {
    if (c > maxCount) {
      maxCount = c
      prefix = p
    }
  }

  // 2. 在今日已有编号中找最大序号与宽度
  const todayRe = new RegExp(`^${prefix}-${datePart}-(\\d+)$`)
  let maxSeq = 0
  let width = 3
  for (const v of existing) {
    const mm = v.match(todayRe)
    if (mm) {
      const n = parseInt(mm[1], 10)
      if (n > maxSeq) {
        maxSeq = n
        width = mm[1].length
      }
    }
  }

  // 3. 今日无记录时，从任意「前缀-...-序号」推断序列宽度
  if (maxSeq === 0) {
    const anySeqRe = new RegExp(`^${prefix}.*-(\\d+)$`)
    for (const v of existing) {
      const mm = v.match(anySeqRe)
      if (mm) {
        width = mm[1].length
        break
      }
    }
  }

  // 4. 生成候选并确保唯一
  const make = (n) => `${prefix}-${datePart}-${String(n).padStart(width, '0')}`
  let candidate = make(maxSeq + 1)
  try {
    const exists = db.prepare('SELECT 1 FROM items WHERE item_no = ? LIMIT 1').get(candidate)
    if (exists) {
      let n = maxSeq + 2
      while (db.prepare('SELECT 1 FROM items WHERE item_no = ? LIMIT 1').get(make(n))) n++
      candidate = make(n)
    }
  } catch (e) {
    /* ignore */
  }
  return candidate
}

module.exports = { generateItemNo }
