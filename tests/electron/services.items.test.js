// services/items 写入服务单元测试：用内存 SQLite 验证创建/更新/排序的核心行为。
// 注意：better-sqlite3 经 electron-rebuild 后为 Electron ABI，在纯 Node（Vitest）下无法加载——
// 此时自动跳过本套件（应用内冒烟测试覆盖实际行为）；如需本地跑通可临时 `npm rebuild better-sqlite3`。
import { describe, it, expect, beforeEach } from 'vitest'

let Database = null
let svc = null
try {
  Database = (await import('better-sqlite3')).default
  new Database(':memory:').close() // 探测原生二进制 ABI 是否与当前 Node 兼容（加载是惰性的）
  svc = await import('../../electron/services/items')
} catch (e) {
  Database = null
  svc = null
  console.warn('[services.items.test] better-sqlite3 不可用（Electron ABI），跳过：', e?.message)
}
const { createItem, updateItem, setOrder } = svc || {}

function buildDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY, name TEXT DEFAULT '', item_no TEXT DEFAULT '',
      room TEXT DEFAULT '', position TEXT DEFAULT '', location TEXT DEFAULT '',
      quantity INTEGER DEFAULT 0, min_quantity INTEGER DEFAULT 0, photo TEXT DEFAULT '',
      category TEXT DEFAULT '', expiry_date INTEGER DEFAULT 0, notes TEXT DEFAULT '',
      consume_rate REAL DEFAULT 0, consume_unit TEXT DEFAULT 'day',
      consume_start_at INTEGER DEFAULT 0, photo_meta TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, key TEXT UNIQUE, name TEXT DEFAULT '', name_en TEXT DEFAULT '',
      icon TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0
    );
    CREATE TABLE locations (
      id TEXT PRIMARY KEY, name TEXT DEFAULT '', parent_id TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0, created_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0
    );
  `)
  return db
}

describe.skipIf(!Database || !svc)('electron/services/items', () => {
  let db
  beforeEach(() => { db = buildDb() })

  it('createItem 写入行并同步新分类/位置', () => {
    const { row, sync } = createItem(db, { name: '牛奶', category: '食品', location: '厨房 > 冰箱', quantity: 6 })
    expect(row.name).toBe('牛奶')
    expect(row.quantity).toBe(6)
    expect(sync.categories).toBe(1)
    expect(sync.locations).toBe(2) // 厨房 + 冰箱
    const saved = db.prepare('SELECT * FROM items WHERE id = ?').get(row.id)
    expect(saved.name).toBe('牛奶')
    expect(db.prepare('SELECT COUNT(*) c FROM categories').get().c).toBe(1)
  })

  it('createItem 负数量归零', () => {
    const { row } = createItem(db, { name: 'X', quantity: -5 })
    expect(row.quantity).toBe(0)
  })

  it('createItem 保留外部传入的 created_at（撤销恢复场景）', () => {
    const ts = 1700000000000
    const { row } = createItem(db, { id: 'keep-me', name: 'X', created_at: ts, updated_at: ts })
    expect(row.created_at).toBe(ts)
    expect(db.prepare('SELECT id FROM items WHERE id=?').get('keep-me').id).toBe('keep-me')
  })

  it('updateItem 仅合并 patch 字段并刷新 updated_at', () => {
    const { row } = createItem(db, { name: 'A', quantity: 1 })
    const before = db.prepare('SELECT * FROM items WHERE id=?').get(row.id)
    const { row: next } = updateItem(db, row.id, { quantity: 9 })
    expect(next.quantity).toBe(9)
    expect(next.name).toBe('A')
    expect(next.updated_at).toBeGreaterThanOrEqual(before.updated_at)
  })

  it('updateItem 不存在的 id 返回 null', () => {
    expect(updateItem(db, 'nope', { quantity: 1 })).toBeNull()
  })

  it('setOrder 把给定顺序物化为 sort_order 1..N', () => {
    const a = createItem(db, { name: 'A' }).row.id
    const b = createItem(db, { name: 'B' }).row.id
    const c = createItem(db, { name: 'C' }).row.id
    const res = setOrder(db, [c, a, b])
    expect(res.ordered).toBe(3)
    const getOrder = (id) => db.prepare('SELECT sort_order FROM items WHERE id=?').get(id).sort_order
    expect(getOrder(c)).toBe(1)
    expect(getOrder(a)).toBe(2)
    expect(getOrder(b)).toBe(3)
  })
})
