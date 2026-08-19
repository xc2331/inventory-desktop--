# 项目分析报告：家庭物资管家 (Family Inventory)

> 分析日期：2026-08-18
> 分析范围：`inventory-desktop` 全部核心代码 —— Electron 主进程 6 个模块、React 前端 30+ 组件、hooks 与数据访问层

---

## 一、项目理解

**技术栈**：Electron 31 + React 18 + better-sqlite3（本地 SQLite，WAL 模式）+ Tailwind + framer-motion + recharts，Vite 构建。

**用途**：本地化家庭物品管理桌面应用 —— 物品 CRUD、分类/位置树、平面图编辑器、电子材料库、统计可视化，外加三个网络能力：

- 本地 Agent HTTP API（端口 3001，Bearer Token 鉴权）
- 手机扫码传图服务（端口 3002，一次性 Token）
- 对接外部 OpenAI 兼容接口的 AI 视觉识别
- 自研软件内更新器（GitHub/Gitee + 第三方镜像，SHA-512 自校验）

代码质量整体不错（参数化查询、contextIsolation、路径白名单、错误边界都做了），但存在几个高危配置、一批正确性 bug 和明显的架构债。

---

## 二、安全漏洞（按严重程度）

### 🔴 P0-1：`webSecurity: false` 关闭了同源策略

**位置**：`electron/main.js:507`

这几乎一定是为了让 `<img>` 能加载 `file://` 图片，但代价是渲染进程里任何脚本都能跨源读取本地文件。结合下面几条输入面（AI 返回文本、导入 JSON、材料库 URL/内容、远程图片），一旦出现 XSS，攻击面就从"应用数据"扩大到"整个用户文件系统"。

**修复方向**：删掉该配置，用 `protocol.handle('appimg', ...)` 注册自定义协议 serve 图片目录，CSP 中只允许 `img-src appimg: data: https:`。

### 🔴 P0-2：`db:query` / `db:execute` 把原始 SQL 通道暴露给渲染进程，白名单形同虚设

**位置**：`electron/main.js:581-613`

`SQL_SANITIZER.check` 只检查 SQL 字符串是否**包含**白名单表名子串 —— `DROP TABLE items`、`UPDATE items SET ...` 全都包含 "items"，照样通过。渲染进程被攻破（配合 P0-1）即等于数据库任意读写删。

另外白名单里的 `settings`、`sync_state`、`item_photos` 表在 schema 中根本不存在（`main.js:207-271` 只建了 items / materials / categories / locations 四张表），明显是从别处抄来的。

**修复方向**：删除通用 SQL 通道，把前端用到的每条查询改成语义化 IPC handler（`items:listPaged`、`items:search` 等）。前端 `src/lib/api.js` 目前有 20+ 处直接拼 SQL 调用，是最大的重构点但值得做。

### 🔴 P0-3：两个 HTTP 服务都无请求体大小限制

- `electron/qr-upload.js:45-81`：`parseMultipart` 无限制地向内存拼接 chunk。扫码传图服务监听 `0.0.0.0`（`qr-upload.js:128`），token 在 URL query 明文传输，可被局域网嗅探；`used` 标志只挡第二次上传，服务**不会自动关闭**，用户开着二维码弹窗期间一直暴露，局域网内任何人可 POST 超大 body 耗尽内存。
- `electron/api-server.js:24-37`：`readBody` 同样无上限；开启"局域网模式"后风险同步放大。

**修复方向**：两者都加 `Content-Length` 上限（如 10MB）+ 流式截断；QR 服务上传成功或超时 5 分钟后自动 `stop()`；token 放 POST body 而非 URL。

### 🟠 P1-4：Token 非常量时间比较 + 更新器校验链薄弱

- `api-server.js:261` 用 `===` 比较 Bearer token，应改 `crypto.timingSafeEqual`（本地回环风险低，但 lanMode 下是标准要求）。
- `electron/updater.js`：SHA-512 值和 exe 从**同一镜像源**下载，镜像被劫持时可同时替换两者，校验形同虚设；且支持 `http://` 链接（`updater.js:182,258,330` 的 `https:http` 分支）；便携版 exe 未做代码签名。建议至少固定从 GitHub 原始 release 取 update-info 的哈希，或接入 electron-builder 的签名机制。

### 🟠 P1-5：导入 JSON 无校验且是"清空重灌"

**位置**：`main.js:1273-1294`

`sync:importData` 直接 `DELETE FROM items` 后插入，没有合并/跳过选项；导入一个坏文件会瞬间清掉全部现有数据，而唯一的备份（`.backup`）是**上次启动时**的快照。负数数量、超长 photo 字符串、重复 id（直接抛异常回滚）都没有友好处理。

**建议**：提供"合并/覆盖"两种模式 + 导入前预检 + 导入前自动做一次滚动备份。

---

## 三、底层逻辑问题与 Bug

### 架构级：双写入路径 + 字符串同步是最大债务

同一次"保存物品"有两套完全不同的实现：

- **UI 路径**：`src/lib/api.js:119-186` 前端拼 SQL 直接写库，然后 `rebuildCategories()/rebuildLocations()` **全表扫描重建**；
- **Agent 路径**：`api-server.js:456-481` 在主进程事务内只对单行做 `ensureCategoriesFromItems([row])`。

README 更新日志里 v1.2.13、v1.2.14、v1.2.15 连续三个版本都在修"创建/更新后分类位置不同步"—— 正是这个架构的症状。

**建议**：统一收敛到主进程一个 service 层，UI 和 API 都调它，同步逻辑只写一份。

### 数据模型：位置靠字符串匹配双向同步，无法处理同名节点

`items` 表冗余存 `room/position/location` 三个字符串字段，与 `locations` 树表靠名字字符串互相同步（`api-server.js:705-746`、`data-utils.js:93-141`）。

后果：重命名"卧室 > 柜子"会把"客厅 > 柜子"下物品的 position 一并改掉（`updateLocation` 按 `WHERE position = name` 全局替换，无法区分父节点）。

**建议**：items 表加 `location_id` 外键，room/position/location 降级为可重算的缓存列。

### 明确的功能 Bug（可直接修）

| 位置 | 问题 |
|---|---|
| `main.js:879-883` | `ALLOWED_BULK_FIELDS` 里的 `unit/supplier/purchase_date/purchase_price/purchase_amount/barcode` 列**在 items 表中不存在**，批量更新这些字段必然 SQL 报错；`api.js:224` 的 `bulkPreview` 同样 SELECT 这些幽灵列，每次调用必抛异常 |
| `main.js:911-917` | `batchChangeQty` 的 `set` 模式只更新 `ids[0]`，其余选中项被静默忽略 |
| `main.js:646-681` | `setDataDir` 切换数据目录后，`apiServer` 里持有的还是旧 `db` 引用 —— 之后 Agent 的所有写入都进了旧库，数据分裂；且失败回退路径中设置已写入，可能打开不完整的新文件 |
| 三处 `normalizeCategoryKey` | `api.js:299`（未命中返回原文/空串）、`data-utils.js:18`（返回原文）、`ai-service.js:18`（返回 'other'）行为不一致，同一输入走不同路径结果不同 |
| `main.js:136-146` | 备份直接 `copyFileSync` 主 db 文件，未复制 `-wal/-shm`；若上次异常退出，备份可能是不完整旧状态。应先 `PRAGMA wal_checkpoint(TRUNCATE)` 或用 `db.backup()` API；且只保留一份、启动即覆盖，建议滚动保留 N 份 |
| `api.js:188-193` | `adjustQuantity` 无下限保护（`batchChangeQty` 有 `MAX(0,...)` 但这条没有），Agent/API 可把数量刷成负数 |
| `App.jsx:269-297` | 过期通知的 `list.length > lastNotifyCount` 判断：处理一件过期品后再新增一件时数量不增，不会通知 |

### 性能问题

1. **大字段全量传输**：`fetchAllItems`（`api.js:31`）`SELECT *` 包含 photo base64（单张 ≤100KB）。它被用于：每次搜索/切分类（`hooks/index.js:327-331`，与分页查询并行第三次全量拉取）、每分钟通知轮询（`App.jsx:269`）、启动预热（`hooks/index.js:215-223` 存进 `warmItems`）。500 个带图物品 ≈ 50MB 数据在 IPC 反复序列化 + 双份常驻内存。
   **建议**：列表查询显式排除 `photo/notes` 列；`allItems` 只查 `id, category, room, position, location`；通知改后端聚合只返回计数；图片按需单独 IPC 取。
2. **每次保存物品触发两次全表 rebuild**（见上文架构问题）。
3. **搜索 `LIKE '%kw%'` 用不上索引**，数据量大后可考虑 SQLite FTS5。
4. **无限滚动是追加渲染**（`hooks/index.js:368`），几千条时 DOM 爆炸，建议引入网格虚拟化。
5. **启动串行阻塞**：`initDatabase + backup + migrateCategoryKeys + deduplicateCategories` 全在 `whenReady` 同步链上，后两者每次启动全表扫描，建议加版本号只跑一次 + 启动时先显示窗口。

### 鲁棒性

`hooks/index.js:301-346` 的 `fetchItems` 只有 `finally` 没有 `catch` —— 一次 IPC 瞬时失败就变成 unhandledrejection，被 `App.jsx:101-115` 的全局兜底捕获后**整个应用跳转全屏错误页**。瞬态错误应该降级为 toast + 重试，全局错误页只留给真正致命的渲染崩溃。

---

## 四、UI 设计与动效优化

### 1. 过期卡片遮罩过度设计（最值得改）

**位置**：`ItemCard.jsx:160-176`

已过期物品被红色渐变遮罩**完全盖住** —— 图片、名称都看不见，只剩无限循环的抖动图标 + "已过期"。问题有三：

- **信息损失**：用户最需要知道"过期的是什么"，恰恰被遮住了；
- **性能**：`repeat: Infinity` 的 shake + 脉冲 boxShadow 持续占用 GPU 合成，多张过期卡同时存在时明显耗电；
- **动画开关失效**：设置里的"关闭动画"只切换了 `no-anim` CSS 类（`hooks/index.js:175`），所有 framer-motion 动画完全不受控 —— 这是全局性问题，需要用 `<MotionConfig reducedMotion="always">` 或 MotionProvider 包装整个应用。

**建议**：降级为顶部红色色带 + 边框 + 徽章（"即将过期"横幅的样式已经很好，复用即可），抖动动画只播 2 次后静止。

### 2. 暗色主题启动白闪

`index.html` 无内联主题脚本，React 异步 `getSettings()` 之后才加 `dark` 类，暗色用户每次启动先白屏一闪。

**修复**：index.html 里加一段同步内联脚本，从 localStorage 缓存（settings 变更时同步写入）提前设置 class，与 `backgroundColor`（`main.js:501` 已做）配合实现无缝启动。

### 3. 动效体系不一致

`lib/motion.js` 定义了很好的设计系统（0.28s EASE、spring 弹性、stagger 列表），但 `App.jsx:604-758` 的 8 个视图切换全部硬编码 `duration: 0.1` 自己的一套，几乎感知不到又与体系脱节。

**建议**：视图切换统一用 motion.js 的参数；"下钻"语义的页面（位置地图→平面图）用 scale 0.98→1 表达层级，返回时反向，比目前清一色的 x:16 位移更有空间感。

### 4. 交互细节

- **数量步进器**：家庭场景常要 +5/+10，建议长按加速连击；右键菜单里的"加入清单/在地图中查看"是空实现（`hooks/index.js:589-601` placeholder），点了没反应，应先隐藏。
- **删除无撤销**：误删代价高，建议 ConfirmDialog 改为轻量"确认 + Toast 内嵌撤销按钮（5 秒）"或软删除回收站。
- **Toast 单槽覆盖**（`hooks/index.js:36-44`）：批量操作时前一条反馈被顶掉，建议队列化。
- **密度切换是隐形三态循环按钮**（`App.jsx:817`），不显示当前档位，用户不知道点到了哪，建议三段选择器。
- **导出下拉菜单**用 `onMouseDown` + `onBlur setTimeout(150ms)`（`TopBar.jsx:224`），键盘不可达、Esc 不关闭，建议标准 click-outside + Esc 处理。
- **快捷键冲突**：`App.jsx:437` 全局 `?` 键打开快捷键面板没有排除输入框聚焦状态 —— 在搜索框里打英文问号会误触。
- **可达性**：卡片双击看大图无键盘等价物（无 `tabindex`/`role`）；即临过期横幅 `{expiry.days} 天后过期`（`ItemCard.jsx:187`）硬编码中文，英文界面下也是中文。

### 5. 表单与空状态

- ItemForm 按 Esc 直接关闭丢弃输入，应检测脏状态给确认；
- 搜索无结果只有一个 pill 提示（`App.jsx:849-855`），建议给出行动按钮："清除筛选" / "新建《xxx》" —— 后者直接把搜索词预填进新建表单，是很自然的转化。

---

## 五、代码组织

- `MaterialLibrary.jsx` 1954 行、`FloorPlanEditor.jsx` 1480 行、`App.jsx` 968 行、`hooks/index.js` 744 行 —— 巨型文件，建议按 hooks 目录已有模式拆分（MaterialLibrary 子目录已经开了头）。
- `App.jsx` 里 `itemsHook.handleCreateItem/handleUpdateItem`（`hooks/index.js:410-461`）与实际使用的 `App.handleSave`（`App.jsx:398`）重复，前者是死代码。
- 工作区根目录散落 48 个 `.cs` 截图工具脚本、53 个 exe、50 个 dll、12 个 release 目录 —— 与项目无关，建议清理出仓库。

---

## 六、优先级建议

| 级别 | 事项 |
|---|---|
| **P0 安全** | 移除 `webSecurity:false`（改自定义协议）；关闭通用 SQL IPC 通道；两个 HTTP 服务加 body 上限 + QR 服务自动过期 |
| **P0 数据** | 备份改滚动 + WAL checkpoint；导入支持合并模式 |
| **P1 正确性** | 幽灵列白名单、`batchChangeQty set` 只改首个、`setDataDir` 后 apiServer 旧引用、`normalizeCategoryKey` 三处统一 |
| **P1 架构** | 写入路径收敛到主进程 service 层；位置改外键引用 |
| **P2 性能** | 列表查询剥离 photo 大字段、通知后端聚合、列表虚拟化 |
| **P2 体验** | 过期遮罩重设计、MotionConfig 接管动画开关、暗色白闪、撤销删除、Toast 队列 |

---

## 七、落地建议

建议从 **P1 正确性那批小 bug**（半天工作量、都是明确修复）和 **过期遮罩重设计**（最直观的体验提升）开始；P0 安全项里自定义协议改造工作量最大，可以单独排期。
