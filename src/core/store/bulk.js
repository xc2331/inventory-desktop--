// ===== core/store/bulk.js =====
// Zustand store for bulk edit state (replaces useBulk in hooks)
import { create, shallow } from 'zustand'

export const useBulkStore = create((set) => ({
  selectedIds: new Set(),
  preview: [],
  showPreview: false,

  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedIds: next }
    }),
  selectAll: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),
  isSelected: (id) => {
    const state = useBulkStore.getState()
    return state.selectedIds.has(id)
  },
  getSelectedCount: () => {
    const state = useBulkStore.getState()
    return state.selectedIds.size
  },
  setPreview: (preview) => set({ preview }),
  setShowPreview: (showPreview) => set({ showPreview }),
  clearPreview: () => set({ preview: [], showPreview: false })
}))

export const useShallowBulkStore = (selector) => useBulkStore(selector, shallow)