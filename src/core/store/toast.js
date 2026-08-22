// ===== core/store/toast.js =====
// Zustand store for toast notifications (replaces useToasts in hooks)
import { create, shallow } from 'zustand'

let _toastId = 0

export const useToastStore = create((set, get) => ({
  toasts: [],

  addToast: (message, type = 'success', options = {}) => {
    const id = ++_toastId
    const duration = options.duration ?? 3000
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration, createdAt: Date.now() }]
    }))
    return id
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clearToasts: () => set({ toasts: [] })
}))

export const useShallowToastStore = (selector) => useToastStore(selector, shallow)