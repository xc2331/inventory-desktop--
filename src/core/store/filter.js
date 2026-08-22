// ===== core/store/filter.js =====
// Zustand store for filter/search state (replaces useFilters in hooks)
import { create, shallow } from 'zustand'

export const useFilterStore = create((set) => ({
  keyword: '',
  category: '',
  showExpired: false,
  sortBy: 'updated_at',
  sortDir: 'desc',
  viewMode: 'card', // 'card' | 'list'
  page: 0,
  pageSize: 30,

  setKeyword: (keyword) => set({ keyword, page: 0 }),
  setCategory: (category) => set({ category, page: 0 }),
  setShowExpired: (showExpired) => set({ showExpired }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSortDir: (sortDir) => set({ sortDir }),
  setViewMode: (viewMode) => set({ viewMode }),
  setPage: (page) => set({ page }),
  setPageSize: (pageSize) => set({ pageSize }),
  resetFilters: () =>
    set({ keyword: '', category: '', showExpired: false, sortBy: 'updated_at', sortDir: 'desc', page: 0 })
}))

export const useShallowFilterStore = (selector) => useFilterStore(selector, shallow)