/**
 * Locale-aware date / number formatting.
 *
 * `locale` accepts the app's internal value ('zh_CN' / 'en_US') and is
 * normalized to the Intl BCP-47 tag ('zh-CN' / 'en-US').
 */

/**
 * Format a date for display.
 *
 * @param {string|number} dateStr - ISO string or millisecond timestamp.
 * @param {'zh_CN'|'en_US'} [locale] - Locale key from i18n.
 * @returns {string}
 */
export function formatDate(dateStr, locale) {
  if (!dateStr && dateStr !== 0) return ''
  const d = typeof dateStr === 'number' ? new Date(dateStr) : new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const loc = locale === 'en_US' || locale === 'en' ? 'en-US' : 'zh-CN'
  return d.toLocaleDateString(loc, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Format a number with locale-appropriate grouping.
 *
 * @param {number} n      - Value to format.
 * @param {'zh_CN'|'en_US'} [locale] - Locale key from i18n.
 * @returns {string}
 */
export function formatNumber(n, locale) {
  if (n == null || Number.isNaN(n)) return ''
  const loc = locale === 'en_US' || locale === 'en' ? 'en-US' : 'zh-CN'
  return Number(n).toLocaleString(loc)
}