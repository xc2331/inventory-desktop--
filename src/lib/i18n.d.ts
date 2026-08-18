/**
 * i18n key type declaration (C-04: i18n 类型安全).
 *
 * 在 JS/JSX 项目阶段，用 d.ts 声明让未来 TypeScript 迁移时
 * 自动获得类型安全。t() 函数的参数应限制为 zh 对象中的 key。
 *
 * 用法（TypeScript 项目）:
 *   const { t } = useI18n()
 *   const msg = t('empty_noItems')   // ✓
 *   const bad = t('nonexistent')      // ✗ TS error
 *
 * 保持与 src/lib/i18n.jsx 中 `zh` 对象 key 同步更新。
 * 生成方式：`node -e "const { zh } = require('./src/lib/i18n.jsx'); ..."` 或手动维护。
 *
 * @see src/lib/i18n.jsx
 */

import type { ReactNode } from 'react'

// 完整 key 集（从 zh 对象导出，保持同步）
export type I18nKey =
  | 'appTitle' | 'appSubtitle' | 'appVersion' | 'sidebar_localBackup'
  | 'nav_all' | 'nav_help' | 'nav_categories' | 'nav_locations'
  | 'nav_materials' | 'nav_locationMap' | 'nav_statistics' | 'nav_settings'
  | 'nav_back_all' | 'nav_expired'
  | 'filter_expired'
  | 'empty_noItems' | 'empty_addFirst' | 'empty_noMatch' | 'empty_tryFilter'
  | 'loc_empty'
  | 'cat_addNew' | 'cat_sortHint' | 'cat_sortSection'
  | 'form_largeFile' | 'form_editTitle'
  | 'card_min' | 'card_lowStock' | 'card_expired' | 'card_expireIn'
  | 'stats_list' | 'stats_updated'
  | 'settings_testConnection' | 'settings_testSuccess' | 'settings_testFailed'
  | 'ai_errorGuideTitle' | 'ai_errorTip1' | 'ai_errorTip2' | 'ai_errorTip3'
  | 'ai_retry'
  | 'items_loadMore' | 'items_loadingMore'
  | 'error_pageCrashed' | 'error_btnRetry'
  | 'shortcuts_search' | 'shortcuts_add' | 'shortcuts_delete'
  | 'shortcuts_filterExpired' | 'shortcuts_theme' | 'shortcuts_help'
  | 'search_history' | 'search_historyClear'
  | 'notify_Enabled' | 'notify_Disabled'
  | 'photo_saved'
  | 'loc_empty'

export interface I18nValue {
  [key: string]: string | number | ReactNode
}

export interface I18nReturn {
  (key: I18nKey, params?: Record<string, string | number>): string
  [key: string]: string | I18nValue
}

export interface UseI18nReturn {
  t: I18nReturn
  lang: string
  setLang: (lang: string) => void
}

declare const useI18n: () => UseI18nReturn
export { useI18n }