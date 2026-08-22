// tests/setup.js
import { expect, beforeAll } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Mock window.lingguang for DB-related tests
beforeAll(() => {
  global.window.lingguang = global.window.lingguang || {}
})