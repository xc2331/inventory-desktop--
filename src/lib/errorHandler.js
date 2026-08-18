/**
 * Centralized, async-safe error handling.
 *
 * Usage:
 *   const result = await safe(asyncFn, fallback, { onError })
 *   const fn = withError(asyncFn, { onError, fallback })
 *   const result = await fn(args...)
 */

/**
 * Runs `fn` (sync or async), catches errors, and returns a safe result object.
 *
 * @param {Function} fn        - Function to invoke (may return a value or a Promise).
 * @param {*}        fallback  - Value used as `data` on error when provided.
 * @param {Object}   opts      - Options bag.
 * @param {Function} opts.onError - Callback invoked with the caught error.
 * @returns {Promise<{ok: boolean, data?: *, error?: Error}>}
 */
export async function safe(fn, fallback, opts = {}) {
  try {
    const data = await Promise.resolve(fn())
    return { ok: true, data }
  } catch (error) {
    if (typeof opts.onError === 'function') {
      try { opts.onError(error) } catch {}
    }
    const result = { ok: false, error }
    if (fallback !== undefined) result.data = fallback
    return result
  }
}

/**
 * Returns a curried async function that, when called, runs `fn` with the
 * supplied arguments and returns a safe result object.
 *
 * @param {Function} fn   - Async (or sync) function to wrap.
 * @param {Object}   opts - Options bag.
 * @param {Function} opts.onError - Callback invoked with the caught error.
 * @param {*}        opts.fallback - Value used as `data` on error when provided.
 * @returns {Function} A function that accepts `...args` and returns the safe result.
 */
export function withError(fn, opts = {}) {
  return async (...args) => {
    try {
      const data = await Promise.resolve(fn(...args))
      return { ok: true, data }
    } catch (error) {
      if (typeof opts.onError === 'function') {
        try { opts.onError(error) } catch {}
      }
      const result = { ok: false, error }
      if (opts.fallback !== undefined) result.data = opts.fallback
      return result
    }
  }
}