// ===== core/store/filter.unit.test.js =====
// Unit tests for the filter Zustand store (P3-2 / P3-4)
import { describe, it, expect } from 'vitest'
import { useFilterStore } from '../../../src/core/store/filter'

describe('core/store/filter', () => {
  beforeEach(() => {
    useFilterStore.getState().resetFilters()
  })

  it('setKeyword resets page to 0', () => {
    useFilterStore.getState().setKeyword('test')
    const { keyword, page } = useFilterStore.getState()
    expect(keyword).toBe('test')
    expect(page).toBe(0)
  })

  it('setCategory resets page to 0', () => {
    useFilterStore.getState().setCategory('food')
    const { category, page } = useFilterStore.getState()
    expect(category).toBe('food')
    expect(page).toBe(0)
  })

  it('resetFilters clears all filter state', () => {
    useFilterStore.getState().setKeyword('abc')
    useFilterStore.getState().setCategory('misc')
    useFilterStore.getState().setShowExpired(true)
    useFilterStore.getState().setPage(3)

    useFilterStore.getState().resetFilters()
    const state = useFilterStore.getState()
    expect(state.keyword).toBe('')
    expect(state.category).toBe('')
    expect(state.showExpired).toBe(false)
    expect(state.page).toBe(0)
  })

  it('setSortBy and setSortDir track independently', () => {
    useFilterStore.getState().setSortBy('name')
    useFilterStore.getState().setSortDir('asc')
    const { sortBy, sortDir } = useFilterStore.getState()
    expect(sortBy).toBe('name')
    expect(sortDir).toBe('asc')
  })

  it('setPageSize updates page size', () => {
    useFilterStore.getState().setPageSize(50)
    expect(useFilterStore.getState().pageSize).toBe(50)
  })
})