// ===== core/store/settings.js =====
// Zustand store for application settings (replaces useSettings in hooks)
import { create, shallow } from 'zustand'

const DEFAULT_SETTINGS = {
  theme: 'system',
  lang: 'zh',
  viewMode: 'card',
  pageSize: 30,
  autoCheckUpdate: true,
  updateSource: 'gitee'
}

export const useSettingsStore = create((set) => ({
  ...DEFAULT_SETTINGS,
  loading: false,

  setTheme: (theme) => set({ theme }),
  setLang: (lang) => set({ lang }),
  setViewMode: (viewMode) => set({ viewMode }),
  setPageSize: (pageSize) => set({ pageSize }),
  setAutoCheckUpdate: (autoCheckUpdate) => set({ autoCheckUpdate }),
  setUpdateSource: (updateSource) => set({ updateSource }),
  setLoading: (loading) => set({ loading }),

  applySettings: (settings) => set(settings),
  resetSettings: () => set(DEFAULT_SETTINGS)
}))

export const useShallowSettingsStore = (selector) => useSettingsStore(selector, shallow)