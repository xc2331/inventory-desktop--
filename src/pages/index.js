// ===== pages =====
// 页面级入口：当前 App.jsx 仍是主应用容器，
// 后续将各主要视图（统计页、设置页、分类管理等）拆入 pages/
// 阶段目标：保持 import 路径清晰，渐进迁移

export { default as App } from '../../App'