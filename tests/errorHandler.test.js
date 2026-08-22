/**
 * Unit tests for src/lib/errorHandler.js
 * Pure-logic tests — no Electron/browser globals needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { safe, withError } from '../src/lib/errorHandler'

describe('errorHandler', () => {
  describe('safe()', () => {
    it('returns ok:true with data on success', async () => {
      const fn = () => 42
      const result = await safe(fn)
      expect(result).toEqual({ ok: true, data: 42 })
    })

    it('returns ok:true with data on async success', async () => {
      const fn = async () => 'hello'
      const result = await safe(fn)
      expect(result).toEqual({ ok: true, data: 'hello' })
    })

    it('returns ok:false with error on failure', async () => {
      const fn = () => { throw new Error('boom') }
      const result = await safe(fn)
      expect(result).toEqual({ ok: false, error: expect.any(Error) })
      expect(result.error.message).toBe('boom')
    })

    it('includes fallback when provided', async () => {
      const fn = () => { throw new Error('x') }
      const result = await safe(fn, 'default-val')
      expect(result).toEqual({ ok: false, error: expect.any(Error), data: 'default-val' })
    })

    it('calls onError callback when provided', async () => {
      const onError = vi.fn()
      const fn = () => { throw new Error('err') }
      await safe(fn, null, { onError })
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('does not call onError on success', async () => {
      const onError = vi.fn()
      await safe(() => 'ok', null, { onError })
      expect(onError).not.toHaveBeenCalled()
    })

    it('swallows onError callback errors', async () => {
      const fn = () => { throw new Error('main') }
      const onError = () => { throw new Error('handler-crash') }
      // Should not re-throw
      await expect(safe(fn, null, { onError })).resolves.toMatchObject({ ok: false })
    })
  })

  describe('withError()', () => {
    it('returns ok:true with data on success', async () => {
      const fn = (a, b) => a + b
      const wrapped = withError(fn)
      const result = await wrapped(2, 3)
      expect(result).toEqual({ ok: true, data: 5 })
    })

    it('returns ok:false with error on failure', async () => {
      const fn = () => { throw new Error('fail') }
      const wrapped = withError(fn, { fallback: null })
      const result = await wrapped()
      expect(result).toEqual({ ok: false, error: expect.any(Error), data: null })
    })

    it('forwards args correctly', async () => {
      const fn = vi.fn((a, b) => a + b)
      const wrapped = withError(fn)
      await wrapped(10, 20)
      expect(fn).toHaveBeenCalledWith(10, 20)
    })

    it('calls onError callback when provided', async () => {
      const onError = vi.fn()
      const fn = () => { throw new Error('boom') }
      const wrapped = withError(fn, { onError })
      await wrapped()
      expect(onError).toHaveBeenCalledTimes(1)
    })

    it('works with async functions', async () => {
      const fn = async () => { throw new Error('async-err') }
      const wrapped = withError(fn, { fallback: 'default' })
      const result = await wrapped()
      expect(result).toEqual({ ok: false, error: expect.any(Error), data: 'default' })
    })
  })
})