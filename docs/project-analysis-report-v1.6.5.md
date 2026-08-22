# 项目分析报告（新版 v1.6.5）：家庭物资管家 (Family Inventory)

> 分析日期：2026-08-21 · 基线：v1.3.1（上一份报告）→ v1.6.5，101 个提交，66 个文件变更（+6657 / -906）
> 本报告覆盖：新版架构变化、旧问题修复状态、**新版引入的新问题**、未修复存量问题、UI/动效/交互评价

---

## 一、新版概览：项目发生了什么

从 v1.3.1 到 v1.6.5 的主要演进：

| 变化 | 说明 |
|---|---|
| **P3 模块化重构** | 新增 `src/core/`（Zustand stores × 5 + `core/db/query.js` SQL 单入口 + theme）、`src/features/`、`src/pages/`、`tests/`（Vitest，9 个测试文件） |
| **依赖** | 新增 `zustand ^5.0.15`、`vitest`、`@testing-library/*`、`jsdom` |
| **拖拽重写** | ItemCard 拖拽从 framer-motion `drag` + `layout` 改为**原生 pointer 事件 + ghost 克隆**方案，彻底解决拖拽偏移 bug |
| **数据库损坏恢复链** | main.js 新增 `recoverFromCorrupt`：损坏检测 → 备份损坏文件 → 从 `<dataDir>/backups/*.bak` 恢复 → 通知前端 |
| **图片链路重做** | `photo:saveFile`（路径直接复制，避免大 base64 截断）、`photo:url` 同步转 URL、MIME 修正、renderer 端 `readPhoto` 兜底 |
| **新页面** | `ExpiryAlerts`（过期预警中心：三档紧迫度、筛选、排序）、`SkeletonCard`（加载骨架屏） |
| **体验修复** | Toast 队列化（最多 3 条）、BulkEditBar Portal + 视口边界检测、Lightbox 缩放/双击循环放大、深色主题对比度增强（UX-20）、`MotionConfig` 全局过渡、启动 `html{background}` 防白闪 |
| **其余** | batchChangeQty set 模式修复、发布脚本批量化、README/todo 文档维护 |

代码量和测试从零到有，方向是对的。但**几个关键修复停在半路**，且新版引入了一批新问题（见第三节）。

---

## 二、旧报告（v1.3.1）问题修复状态

### ✅ 已修复（5 项）
| 旧编号 | 问题 | 修复方式 |
|---|---|---|
| 逻辑-3 | `batchChangeQty` set 模式只改 `ids[0]` | `main.js:1117` 改为事务内遍历所有 id |
| 逻辑-2(部分) | `ALLOWED_BULK_FIELDS` 幽灵列 | 删掉了 `barcode/photo`，**但 `unit/supplier/purchase_date/purchase_price` 仍是幽灵列**（items 表无这些列） |
| UX-1 | 过期卡片全遮罩 + 无限抖动 | 改为顶部色带 + 边框 + 徽章，抖动只播 1 次（`ItemCard.jsx:15-17`） |
| UX-Toast | Toast 单槽覆盖 | 队列化，MAX_STACK=3（`hooks/index.js`） |
| UX-空状态 | 搜索无结果缺行动 | 新增"清除筛选"按钮（`App.jsx:948`）+ EmptyState 重做 |

### ⚠️ 半途修复（根因未除，在修症状）
| 问题 | 现状 |
|---|---|
| **图片显示链路** | v1.5.8/v1.5.9 两个版本都在修"照片不显示"，加了一层又一层兜底（`photo.url` 同步快速路径 → `<img onError>` → IPC base64 兜底）。**但根因是 preload 里的 `app` 未定义**（见新问题 #1），快速路径从第一天起就是死的，所有图片都在走最慢的兜底路径 |
| **启动白闪** | `index.css` 给 html/body 加了跟随系统 `prefers-color-scheme` 的背景色。但应用主题存在 settings.json（主进程），无法同步读取：系统亮+应用暗 → 仍白闪；系统暗+应用亮 → 现在反过来黑闪。且 CSS 用的 `html:not(.light)` 类从未被任何 JS 设置 |

### ❌ 未修复（10 项，全部原样）
1. **`webSecurity: false`**（`main.js:710`）— 同源策略仍关闭
2. **`db:query/db:execute` 原始 SQL 通道 + 无效白名单**（`main.js:784-789`，`DROP TABLE items` 依然通过）— 注意：P3 的 `core/db/query.js` 只是渲染进程侧的**转发封装**，SQL 仍在渲染进程拼接，安全边界没有任何变化
3. **qr-upload / api-server 无请求体大小限制**（两文件 0 变更）
4. **Token 非常量时间比较**（`api-server.js:261`）
5. **更新器校验链**：SHA-512 与 exe 同源下载、支持 http、无签名（updater.js 0 变更）
6. **导入 JSON 清空重灌**，无合并模式（`main.js` sync:importData 未变）
7. **`fetchItems` 无 catch**（`hooks/index.js:334-376` 只有 finally）— 一次 IPC 瞬时错误仍会触发全屏错误页
8. **大字段全量拉取**：`fetchAllItems` 仍 `SELECT *`（含 photo base64），且**新增了第三个调用方** ExpiryAlerts；通知轮询仍每分钟全量拉取（`App.jsx:323-325`）；`warmItems` 预热仍在
9. **双写入路径**：`api.js createItem/updateItem`（前端拼 SQL + rebuild 全表）与 api-server 两套逻辑并存；`normalizeCategoryKey` 仍三处不一致
10. **`setDataDir` 后 apiServer 持旧 db 引用**、位置字符串同步架构债、`adjustQuantity` 无下限保护 — 均未动

---

## 三、新版本引入的新问题（重点）

### 🔴 N-1：preload 中 `app` 未定义 —— 图片快速路径从第一天起就是死代码
**位置**：`electron/preload.js:2,7-17`

```js
const { contextBridge, ipcRenderer, app } = require('electron')  // app 在 preload 中不存在！
function resolveDataDir() {
  try { ... app.getPath('userData') ... } catch {}
  return app.getPath('userData')  // ← 这里必然 throw TypeError
}
```

Electron 的 `app` 模块**只在主进程可用**，preload（即使 sandbox:false）拿到的 `require('electron')` 只有 `ipcRenderer/contextBridge/webFrame` 等。`app` 是 `undefined`，`resolveDataDir()` 第 16 行必然抛 `TypeError`，被 `photo.url()` 的 catch 吞掉后返回相对路径 → 每张图片都要经历「`<img src=相对路径>` 加载失败 → onError → IPC `readPhoto` → base64 回传」的最慢路径。

**后果**：v1.5.8/v1.5.9 修的"QR 照片不显示"实际是这个 bug 的症状链；每张卡片图片 = 一次失败加载 + 一次 IPC 往返 + base64 序列化，图片多时明显卡顿、闪烁。
**修复**：preload 里用 `ipcRenderer.sendSync('app:getDataDir')` 在启动时同步取一次 dataDir 缓存，或主进程通过 `additionalArguments` 传给 preload；`app.getPath` 从 preload 移除。

### 🔴 N-2：数据库恢复链是死代码 —— 真出损坏时会得到一个空库
**位置**：`main.js:156-201`

恢复链从 `<dataDir>/backups/*.bak` 找备份，**但全项目没有任何代码往该目录写过 .bak 文件**——`backupDatabase()`（`main.js:135-146`）仍然只复制单个 `inventory.db.backup`（无 WAL checkpoint、启动即覆盖）。`findLatestBackup()` 永远返回 null → `recoverFromCorrupt` 永远走到「未找到可用备份，将创建空数据库」。

**后果**：一旦触发损坏恢复，用户面对的是空库（虽然损坏文件被留作 `.corrupted.<ts>`，算唯一安慰）。现有那份 `inventory.db.backup` 从未被恢复链使用。
**修复**：`backupDatabase` 改为 checkpoint 后写入 `backups/inventory-YYYYMMDD.bak` 并滚动保留 N 份；恢复链优先用 backups/，其次回退 `inventory.db.backup`。

### 🟠 N-3：`photo:saveFile` 形成任意文件外泄链
**位置**：`main.js:1459+`（新增 handler）

渲染进程传任意**绝对路径**，主进程直接 `copyFileSync` 到 photos 目录；配合已有的 `photo:read`（返回 base64）和 `photo:url`，被攻破的渲染进程可以把磁盘上任意文件复制进 photos 再读出来。它与 `webSecurity:false` + 无效 SQL 白名单叠加，把"渲染进程被攻破"的后果升级为"任意本地文件读取"。应校验路径来源（仅接受 `dialog:pickImage` 返回的路径白名单，或主进程自行打开对话框）。

### 🟠 N-4：ExpiryAlerts 调用 `categoryDisplayName` 签名错误
**位置**：`ExpiryAlerts.jsx:72,254`

`categoryDisplayName(cat, lang)` 期望分类**对象**，这里传的是 `(item.category /* 字符串 key */, categories /* 数组当 lang */, 'zh_CN')`。结果是永远返回原始 key——列表和搜索里显示 `food`/`tools` 而不是「食品/工具」。

### 🟠 N-5：ExpiryAlerts 脉冲圆点颜色无效
**位置**：`ExpiryAlerts.jsx:164`

`style={{ backgroundColor: meta.color.replace('text-', '') }}` → `'red-500'` 不是合法 CSS 颜色 → 圆点透明。TIER_META 应补 hex 色值（该组件用的是 `red-500/orange-500` 等 shadcn 风格类名，而项目 Tailwind 主题用的是 `danger/warn` 令牌，两套体系混用）。

### 🟠 N-6：拖拽未处理 `pointercancel`
**位置**：`ItemCard.jsx` `handleGripPointerDown`

只监听 `pointermove/pointerup`。触屏拖拽被系统手势打断、或 Alt+Tab 等场景触发 `pointercancel` 时：ghost 残留屏幕、原卡片 `visibility:hidden` **永久不可见**（直到刷新）。同时 Esc 不能取消拖拽、组件卸载不清理监听。建议补 `pointercancel`（等同放弃拖拽）+ 卸载清理 + Esc 取消。

### 🟡 N-7：ExpiryAlerts 整页硬编码中文
「件」「搜索物品…」「显示已过期」「紧迫度/日期/名称」「数量」「已过期 N 天」「安全」「查看已过期物品」全部未走 i18n（`t()` 只用了 3 处），英文用户在该页看到中文。这是新增页面上的 i18n 回归。

### 🟡 N-8：`src/features/`、`src/pages/` 是无人引用的脚手架
全项目 0 处 import。P3 重构实际只落地了 `core/db/query.js`（机械转发）和 Zustand store——**而 store 也没有任何组件在用**（App.jsx/hooks 仍是旧 useState 逻辑）。"渐进迁移"停在第一步，留下约 300 行死代码，测试测的也是这些没人用的 store。

### 🟡 N-9：两个新的无限动画（GPU 成本）
- `ExpiryAlerts.jsx:162-167` 预警卡右上圆点 `repeat: Infinity` 脉冲 ×3 个；
- `SkeletonCard.jsx` 骨架块双层无限动画（opacity 呼吸 + shimmer 流光）× 每卡片 10+ 块，首屏 60 张卡 = 600+ 个无限动画节点。
建议：脉冲点改为 CSS animation（可被 `.no-anim` 统一关闭）；Skeleton 用纯 CSS `@keyframes` 而非 framer-motion 逐节点驱动，并控制在首屏 8-12 张。

### 🟡 N-10：`index.html` 防白闪 CSS 与主题系统脱节
`html:not(.light)` 选择器中的 `.light` 类从未被设置；应用主题（settings.json）与系统主题（media query）不一致时闪错色。正确做法：启动时主进程把主题写进 localStorage，index.html 内联脚本同步读取并设置 `dark` 类（顺带能修复 `backgroundColor` 之外的整帧闪色）。

---

## 四、底层逻辑与架构评价

### 做对了的
1. **拖拽重写（原生 pointer + ghost）是教科书级修复**：无 transform 叠加、落点精确、还顺带解决了 layout 动画冲突。比加 `dragSnapToOrigin` 的方案更彻底。
2. **`core/db/query.js` 单入口方向正确**——但它当前只是转发层，SQL 拼接仍在渲染进程，安全属性没变。真正的价值要等白名单/语义化 handler 落地主进程后才能兑现。
3. **损坏恢复链的思路**（检测→保全→恢复→通知前端）是对的，只差把备份真的写进它找的目录（N-2）。
4. **Toast 队列、BulkEditBar Portal+视口边界、Lightbox 缩放**都是标准的正确实现。

### 结构性建议（与上版一致，优先级上调）
1. **收敛双写入路径**仍是第一架构债：UI 与 Agent 各写一套、`rebuild` 全表扫描的旧疾都在。建议把 `api-server.js` 里的 service 函数抽成 `electron/services/items.js`，IPC handler 与 HTTP handler 都调它。
2. **`fetchItems` 仍无 catch** + 全局 unhandledrejection → 全屏错误页：任何一次数据库瞬时错误都把用户踢出界面。这是鲁棒性上最便宜的高价值修复（加一个 catch + toast + 重试）。
3. **`SELECT *` 治理**：现在有 3 个组件各自 `fetchAllItems()`（hooks 预热、通知轮询、ExpiryAlerts）。给 query 层加一个 `fetchItemsMeta()`（排除 photo/notes/content 大列）即可全局受益。
4. **Zustand 迁移要么继续要么删除**：当前状态最差——双份状态逻辑并存的心智成本 > 收益。建议下个版本把 `useItems` 的列表状态真正迁入 store，删掉 hooks 里的镜像代码。

---

## 五、UI 设计 / 动效 / 交互评价

### 亮点（较 v1.3.1 明显进步）
- **SkeletonCard** 骨架屏完整复刻卡片结构（图区/标题/步进器/徽章），比 Loader 文字好一个量级；
- **MotionConfig 全局过渡**（`main.jsx:10-15`）统一了默认时长，视图切换不再各自为政；
- **Lightbox** 支持滚轮缩放、双击循环 1→2→3→1、pinch、拖拽平移，看证件照/大图体验完整；
- **BulkEditBar** 下拉改 Portal + `getBoundingClientRect` 视口边界翻转，v1.6.3 连修三个版本终于稳了；
- **深色主题 V4**（UX-20）重做了令牌对比度，`text-tertiary` 从灰色系换暖白 `#d4ccc0`，可读性实测提升。

### 待改进
1. **「关闭动画」设置仍管不到 framer-motion**：`no-anim` 类只压 CSS/recharts（`index.css:266-273`），MotionConfig 明明就在 `main.jsx`——接一个 `reducedMotion={animations ? 'user' : 'always'}` 一行搞定，却没接。与 N-9 的无限动画叠加，关动画的用户依然满屏动画。
2. **拖拽缺少过程反馈**：ghost 跟随时没有任何「将交换到哪」的提示——目标卡片不高亮、无插入位指示。用户只能松手才知道结果。建议在 pointermove 的最近邻计算（已有现成代码）里给目标卡加 `ring-2 ring-primary` 高亮，成本极低。
3. **ExpiryAlerts 风格与全站脱节**：shadcn 系类名（`bg-card/muted/input/text-muted-foreground`）+ 硬编码 red/orange/amber，全站是 `surface/bg/danger/warn` 令牌体系，深色下尤其明显（N-5 的透明圆点就是症状）。建议统一到设计令牌。
4. **密度切换仍是隐形三态循环按钮**（上版建议未采纳），侧边栏新增了过期预警入口（好），但顶栏按钮越加越多，960px 最小宽度下已拥挤——建议把通知/密度/批量收进一个「视图选项」popover。
5. **可达性**：拖拽把手无键盘等价（`tabIndex`+方向键移动是标准做法）；ExpiryAlerts 的三档筛选按钮 `aria-pressed` 未设置。
6. **拖拽排序持久化仍是 localStorage 绝对下标**（`App.jsx:218-253`）：基础序是 `updated_at DESC`，任何一次编辑就洗牌，旧下标拼出新排列；分类筛选下拖拽污染全局序。要认真做就给 items 加 `sort_order` 列（上次建议维持）。

---

## 六、优先级清单（v1.6.5 → 下版本）

| 级别 | 事项 | 工作量 |
|---|---|---|
| **P0** | N-1 preload `app` 未定义 → 改 sendSync/主进程注入 dataDir，删掉三层兜底中的两层 | 小 |
| **P0** | N-2 备份写入 `backups/*.bak` + 滚动保留，接通恢复链 | 小 |
| **P0** | `fetchItems` 加 catch（toast+重试），瞬态错误不再全屏 | 小 |
| **P1** | N-3 `photo:saveFile` 路径白名单；N-6 拖拽 pointercancel/Esc；N-4/N-5 ExpiryAlerts 显示 bug | 小 |
| **P1** | 幽灵列清理（unit/supplier/purchase_date/purchase_price）；MotionConfig 接 animations 开关 | 小 |
| **P1** | 大字段治理：`fetchItemsMeta()`（排除 photo/content），ExpiryAlerts/通知轮询改用 | 中 |
| **P2** | webSecurity:false + SQL 通道语义化（上版 P0 安全项，未动，持续挂账） | 大 |
| **P2** | 双写入路径收敛 service 层；位置外键化 | 大 |
| **P2** | ExpiryAlerts i18n + 令牌统一；拖拽目标高亮；Zustand 迁移收尾或回滚 | 中 |

> 备注：P0 三项合计约一天工作量，都是"小改动大收益"；P2 的两个大项是上一版就挂账的架构债，越晚做迁移成本越高。
