// ===== core/store/items.unit.test.js =====
// Unit tests for the items Zustand store (P3-2 / P3-4)
import { describe, it, expect } from 'vitest'
import { useItemStore } from '../../../src/core/store/items'

describe('core/store/items', () => {
  beforeEach(() => {
    useItemStore.setState({ items: [], selectedItem: null, loading: false, error: null, total: 0 })
  })

  it('setItems populates items and total', () => {
    useItemStore.getState().setItems([{ id: 1, name: 'A' }, { id: 2, name: 'B' }])
    const { items, total } = useItemStore.getState()
    expect(items).toHaveLength(2)
    expect(total).toBe(2)
  })

  it('addItem appends and increments total', () => {
    useItemStore.getState().setItems([{ id: 1, name: 'A' }])
    useItemStore.getState().addItem({ id: 2, name: 'B' })
    const { items, total } = useItemStore.getState()
    expect(items).toHaveLength(2)
    expect(items[1].name).toBe('B')
    expect(total).toBe(2)
  })

  it('removeItem removes by id', () => {
    useItemStore.getState().setItems([{ id: 1, name: 'A' }, { id: 2, name: 'B' }])
    useItemStore.getState().removeItem(1)
    const { items, total } = useItemStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('B')
    expect(total).toBe(1)
  })

  it('updateItem patches by id', () => {
    useItemStore.getState().setItems([{ id: 1, name: 'A', quantity: 10 }])
    useItemStore.getState().updateItem(1, { quantity: 20 })
    const { items } = useItemStore.getState()
    expect(items[0].quantity).toBe(20)
    expect(items[0].name).toBe('A')
  })

  it('clearError resets error state', () => {
    useItemStore.setState({ error: 'test error' })
    useItemStore.getState().clearError()
    expect(useItemStore.getState().error).toBeNull()
  })
})