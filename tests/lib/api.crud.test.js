// ===== lib/api.crud.test.js =====
// Unit tests for core CRUD functions in lib/api.js (P3-4)
// Mocks the window.lingguang DB proxy so tests run without Electron
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  fetchAllItems,
  searchItems,
  deleteItem,
  adjustQuantity,
  bulkDeleteItems,
  bulkPreview
} from '../../src/lib/api'
import { query, execute } from '../../src/core/db/query'

const mockDb = {
  query: vi.fn(),
  execute: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  window.lingguang = {
    api: { db: mockDb, sync: { rebuildCategories: vi.fn(), rebuildLocations: vi.fn(), stats: vi.fn() }, items: { batchUpdate: vi.fn() } },
    categories: { list: vi.fn() },
    locations: { list: vi.fn() }
  }
  mockDb.query.mockResolvedValue([])
  mockDb.execute.mockResolvedValue({ changes: 0 })
})

describe('lib/api CRUD functions', () => {
  it('fetchAllItems queries SELECT *', async () => {
    mockDb.query.mockResolvedValue([{ id: 1, name: 'A' }])
    const result = await fetchAllItems()
    expect(mockDb.query).toHaveBeenCalled()
    expect(result).toEqual([{ id: 1, name: 'A' }])
  })

  it('searchItems builds LIKE query with 5 bind params', async () => {
    mockDb.query.mockResolvedValue([{ id: 1 }])
    await searchItems('test')
    const call = mockDb.query.mock.calls[0][0]
    expect(call.binds).toHaveLength(5)
    expect(call.binds[0]).toBe('%test%')
  })

  it('deleteItem executes DELETE statement', async () => {
    await deleteItem('x1')
    expect(mockDb.execute).toHaveBeenCalled()
  })

  it('adjustQuantity executes UPDATE with delta', async () => {
    await adjustQuantity('x1', 5)
    expect(mockDb.execute).toHaveBeenCalled()
  })

  it('bulkDeleteItems generates parameterized IN clause', async () => {
    mockDb.execute.mockResolvedValue({ changes: 2 })
    const result = await bulkDeleteItems(['a', 'b'])
    expect(mockDb.execute).toHaveBeenCalled()
    expect(result.deleted).toBe(2)
  })

  it('bulkPreview returns diff for changed fields', async () => {
    mockDb.query.mockResolvedValue([
      { id: 1, name: 'A', quantity: 10, category: 'old' },
      { id: 2, name: 'B', quantity: 10, category: 'new' }
    ])
    const result = await bulkPreview(['1', '2'], { category: 'new' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
    expect(result[0].before.category).toBe('old')
    expect(result[0].after.category).toBe('new')
  })
})