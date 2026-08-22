// SQL 白名单交叉验证：src/lib/api.js 的 SQL_STATEMENTS 必须全部
// 落在 electron/sql-whitelist.json 中（规范化后精确匹配），否则主进程通用通道会拒绝查询。
// 这是防止「改了 api.js 忘了同步白名单」导致线上查询全挂的回归闸门。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { SQL_STATEMENTS } from '../../src/lib/api'

// 与 electron/main.js 的 normalizeSql 保持一致
function normalizeSql(sql) {
  return String(sql)
    .replace(/(\?,\s*)+\?/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
}

function loadWhitelist() {
  const p = resolve(process.cwd(), 'electron/sql-whitelist.json')
  return JSON.parse(readFileSync(p, 'utf8')).map(normalizeSql)
}

describe('security/sql-whitelist', () => {
  it('api.js 的每条 SQL 都必须在主进程白名单内', () => {
    const allowed = new Set(loadWhitelist())
    expect(SQL_STATEMENTS.length).toBeGreaterThan(10)
    const missing = SQL_STATEMENTS.filter((s) => !allowed.has(normalizeSql(s)))
    expect(missing).toEqual([])
  })

  it('白名单规范化：IN 占位符个数不影响匹配', () => {
    const allowed = new Set(loadWhitelist())
    expect(allowed.has(normalizeSql('DELETE FROM items WHERE id IN (?, ?, ?, ?)'))).toBe(true)
    expect(allowed.has(normalizeSql('DELETE FROM items WHERE id IN (?)'))).toBe(true)
  })

  it('危险语句必须被拒绝（旧"包含表名"漏洞回归测试）', () => {
    const allowed = new Set(loadWhitelist())
    const attacks = [
      'DROP TABLE items',
      'DELETE FROM items',
      'UPDATE items SET quantity = 999',
      "SELECT * FROM items WHERE 1=1; DROP TABLE items--",
      'SELECT * FROM categories'
    ]
    for (const a of attacks) {
      expect(allowed.has(normalizeSql(a))).toBe(false)
    }
  })

  it('白名单无重复条目', () => {
    const list = loadWhitelist()
    expect(new Set(list).size).toBe(list.length)
  })
})
