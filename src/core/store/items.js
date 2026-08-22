// ===== core/store/items.js =====
// Zustand store for items data (replaces useState in hooks/useItems)
// 渐进迁移：hooks 仍可保留，后续逐步用 useItemStore 替代
import { create, shallow } from 'zustand'

export const useItemStore = create((set, get) => ({
  items: [],
  selectedItem: null,
  loading: false,
  error: null,
  total: 0,

  setItems: (items) => set({ items, total: Array.isArray(items) ? items.length : 0 }),
  setTotal: (total) => set({ total }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSelectedItem: (item) => set({ selectedItem: item }),

  addItem: (item) => set((state) => ({ items: [...state.items, item], total: state.total + 1 })),
  removeItem: (id) =>
    set((state) => {
      const idx = state.items.findIndex((i) => i.id === id)
      if (idx === -1) return state
      const items = [...state.items]
      items.splice(idx, 1)
      return { items, total: items.length }
    }),
  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i))
    })),

  clearError: () => set({ error: null })
}))

export const useShallowItemStore = (selector) => useItemStore(selector, shallow)