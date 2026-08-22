// ===== core/theme.unit.test.js =====
// Unit tests for theme utility (P3-1)
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyThemeClass, getSystemTheme } from '../../src/core/theme'

beforeEach(() => {
  document.documentElement.className = ''
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({ matches: false })),
    configurable: true
  })
})

describe('core/theme', () => {
  it('applyThemeClass adds "dark" for dark theme', () => {
    applyThemeClass('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('applyThemeClass removes "dark" for light theme', () => {
    document.documentElement.className = 'dark'
    applyThemeClass('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('applyThemeClass respects system preference for system theme', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true }))
    applyThemeClass('system')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('getSystemTheme returns dark when system is dark', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: true }))
    expect(getSystemTheme()).toBe('dark')
  })

  it('getSystemTheme returns light when system is light', () => {
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false }))
    expect(getSystemTheme()).toBe('light')
  })
})