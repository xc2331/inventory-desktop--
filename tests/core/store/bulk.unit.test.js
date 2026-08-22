// ===== core/store/bulk.unit.test.js =====
// Unit tests for the bulk edit Zustand store (P3-2 / P3-4)
import { describe, it, expect } from 'vitest'
import { useBulkStore } from '../../../src/core/store/bulk'

describe('core/store/bulk', () => {
  beforeEach(() => {
    useBulkStore.getState().clearSelection()
    useBulkStore.getState().clearPreview()
  })

  it('toggleSelect adds and removes ids', () => {
    useBulkStore.getState().toggleSelect('a')
    useBulkStore.getState().toggleSelect('b')
    expect(useBulkStore.getState().getSelectedCount()).toBe(2)
    expect(useBulkStore.getState().isSelected('a')).toBe(true)

    useBulkStore.getState().toggleSelect('a')
    expect(useBulkStore.getState().getSelectedCount()).toBe(1)
    expect(useBulkStore.getState().isSelected('a')).toBe(false)
  })

  it('selectAll replaces current selection', () => {
    useBulkStore.getState().toggleSelect('x')
    useBulkStore.getState().selectAll(['a', 'b', 'c'])
    const count = useBulkStore.getState().getSelectedCount()
    expect(count).toBe(3)
    expect(useBulkStore.getState().isSelected('a')).toBe(true)
    expect(useBulkStore.getState().isSelected('x')).toBe(false)
  })

  it('clearSelection empties the set', () => {
    useBulkStore.getState().selectAll(['a', 'b'])
    useBulkStore.getState().clearSelection()
    expect(useBulkStore.getState().getSelectedCount()).toBe(0)
  })

  it('setPreview stores preview data', () => {
    useBulkStore.getState().setPreview([{ id: 1, before: 10, after: 20 }])
    const { preview, showPreview } = useBulkStore.getState()
    expect(preview).toHaveLength(1)
  })

  it('clearPreview resets both fields', () => {
    useBulkStore.getState().setPreview([{ id: 1 }])
    useBulkStore.getState().setShowPreview(true)
    useBulkStore.getState().clearPreview()
    const { preview, showPreview } = useBulkStore.getState()
    expect(preview).toEqual([])
    expect(showPreview).toBe(false)
  })
})