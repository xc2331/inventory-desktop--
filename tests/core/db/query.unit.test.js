// ===== core/db/query.unit.test.js =====
// Unit tests for the SQL single-entry module (P3-3 / P3-4)
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { query, execute } from '../../../src/core/db/query'

const mockDb = {
  query: vi.fn(),
  execute: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  window.lingguang = { api: { db: mockDb } }
})

describe('core/db/query', () => {
  it('query forwards SQL and binds correctly', async () => {
    mockDb.query.mockResolvedValue([{ id: 1, name: '测试' }])
    const result = await query('SELECT * FROM items WHERE id = ?', [1])
    expect(mockDb.query).toHaveBeenCalledWith({ sql: 'SELECT * FROM items WHERE id = ?', binds: [1] })
    expect(result).toEqual([{ id: 1, name: '测试' }])
  })

  it('query without binds works', async () => {
    mockDb.query.mockResolvedValue([])
    await query('SELECT * FROM items')
    expect(mockDb.query).toHaveBeenCalledWith({ sql: 'SELECT * FROM items' })
  })

  it('query with named binds (object)', async () => {
    mockDb.query.mockResolvedValue([{ id: 1 }])
    await query('SELECT * FROM items WHERE id = @id', { id: 1 })
    expect(mockDb.query).toHaveBeenCalledWith({ sql: 'SELECT * FROM items WHERE id = @id', binds: { id: 1 } })
  })

  it('execute forwards SQL and binds correctly', async () => {
    mockDb.execute.mockResolvedValue({ changes: 1 })
    const result = await execute('DELETE FROM items WHERE id = ?', [1])
    expect(mockDb.execute).toHaveBeenCalledWith({ sql: 'DELETE FROM items WHERE id = ?', binds: [1] })
    expect(result).toEqual({ changes: 1 })
  })

  it('execute without binds works', async () => {
    mockDb.execute.mockResolvedValue({ changes: 0 })
    await execute('UPDATE items SET quantity = 0')
    expect(mockDb.execute).toHaveBeenCalledWith({ sql: 'UPDATE items SET quantity = 0' })
  })

  it('throws when DB API not initialized', async () => {
    delete window.lingguang
    await expect(query('SELECT 1')).rejects.toThrow('[db] Database API not initialized')
  })

  it('supports window.lingguang.db fallback (flat namespace)', async () => {
    window.lingguang = { db: mockDb }
    mockDb.query.mockResolvedValue([{ id: 1 }])
    const result = await query('SELECT 1', [])
    expect(mockDb.query).toHaveBeenCalledWith({ sql: 'SELECT 1', binds: [] })
    expect(result).toEqual([{ id: 1 }])
  })
})