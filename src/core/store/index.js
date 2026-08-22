// ===== core/store =====
// Zustand store aggregate export (P3-2 模块化状态管理)
// 调用方应从 core/store 导入，而非直接引用 hooks/index.js

export { useItemStore, useShallowItemStore } from './items'
export { useFilterStore, useShallowFilterStore } from './filter'
export { useSettingsStore, useShallowSettingsStore } from './settings'
export { useBulkStore, useShallowBulkStore } from './bulk'
export { useToastStore, useShallowToastStore } from './toast'