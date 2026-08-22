// 主题切换工具（从 App.jsx 提取，P3-1 模块化）
export function applyThemeClass(theme) {
  const isDark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', isDark)
  }
}

export function getSystemTheme() {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}