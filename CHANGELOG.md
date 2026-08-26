# 更新日志

## v1.8.4（2026-08-26）

### 新功能（FTS5 健康端点）
- **`/api/fts-health`（GET）**：返回 `items_fts` / `materials_fts` 启动期 integrity-check 状态。
  - 两者都 `ok` → `200 healthy=true` + hint「FTS5 内部结构正常」
  - 任一 `error` → `503 healthy=false` + hint「FTS5 内部结构损坏，建议从备份恢复或重置库」
  - `status=unknown` → `503 healthy=false` + hint「`__ftsHealth` 未初始化（启动期 integrity-check 失败或尚未执行）」
- **status 含义**：`ok` = 启动期 integrity-check 不抛错；`error` = 启动期抛 `SQLITE_CORRUPT_VTAB`；`unknown` = 启动期未执行。
- **外部探针 / Agent 监测**：可轮询 `/api/fts-health` 监测 FTS5 内部结构健康。

### 相关文件
- `electron/api-server.js`：新增 `/api/fts-health` 路由 + `ftsHealth()` 方法（读 `global.__ftsHealth` 暴露 200/503 + hint）。
- `docs/agent-api.md`：扩写「全文搜索 FTS5」章节 + 新增 `/api/fts-health` 子节（含 200/503 响应示例）。
- `package.json`：`1.8.3 → 1.8.4`，`output release-v183 → release-v184`。

### 测试方法
1. 启动 v1.8.4 exe。
2. 跑 `curl http://localhost:3001/api/fts-health`，确认返回 `{"healthy":true,"items_fts":{"status":"ok","ok":true},...}`。
3. 跑 `node_modules\electron\dist\electron.exe scripts/verify-fts5.js`（真实库） + `--in-memory`（内存）应分别输出 14/14、12/12 PASS。

## v1.8.3（2026-08-26）

### 优化（FTS5 虚表自维护 + 内部体检）
- **启动期 FTS5 optimize**：`backfillFtsFromMainTables` 末尾对 `items_fts` / `materials_fts` 发 FTS5 内部 `optimize` 命令，整理倒排索引碎片（删除/更新频繁时回收空间、提升查询稳定性）。失败 `console.warn` 不影响启动。
- **启动期 FTS5 integrity-check**：`optimize` 之后跑 FTS5 内部 `integrity-check` 控制命令，验证虚表内部结构一致；损坏时 `SQLITE_CORRUPT_VTAB` 会被捕获并 `console.warn` 告警。`global.__ftsHealth` 暴露给后续 `/api/fts-health` 端点。
- **verify-fts5.js 新增两个断言**：`optimize` 不抛错 + `integrity-check` 不抛错；真实库 14/14 全过，内存库 12/12 全过。

### 相关文件
- `electron/main.js`：`backfillFtsFromMainTables` 末尾追加 `optimize` + `integrity-check` 双发；`global.__ftsHealth` 暴露。
- `scripts/verify-fts5.js`：新增 2 个 v1.8.3 断言。
- `package.json`：`1.8.2 → 1.8.3`，`output release-v182 → release-v183`。

### 测试方法
1. 启动 v1.8.3 exe，确认右下角更新提示显示「1.8.3」。
2. 打开设置 → 更新日志，确认 1.8.3 条目在列表首位。
3. 跑 `node_modules\electron\dist\electron.exe scripts\verify-fts5.js`（真实库） + `--in-memory`（内存）应分别输出 14/14、12/12 PASS。

## v1.8.2（2026-08-26）

### 优化（FTS5 召回率 + 启动期 EXCLUSIVE 锁重试）
- **FTS5 ∪ LIKE 并集召回**：`listItems` / `listMaterials` 的 keyword 搜索改为 `id IN (FTS5 MATCH) OR id IN (LIKE 兜底)` 求并集——FTS5 解决 token 化精确命中、LIKE 兜底解决中文单字 / 词干 / 模糊场景的召回率。引入 `ftsUnionLikeSearch()` 工具函数集中处理。
- **LIKE 注入转义**：新工具对 `keyword` 中的 `%` / `_` 加 `ESCAPE '\\'` 转义，封堵 SQL 通配符注入。
- **启动期 EXCLUSIVE 锁重试**：`backfillFtsFromMainTables` 内对 `tx(rows)` 失败退避重试 3 次（间隔 200ms），覆盖 Windows Defender / Search 等外部进程瞬时持锁场景。`runTxWithRetry(label, txFn)` 集中重试逻辑。
- **长期验证脚本** `scripts/verify-fts5.js`：真实库 12/12 全过（INSERT/UPDATE/DELETE 触发器同步链路 + 虚表/触发器齐全 + 4 关键字命中）；内存库 + seed 10/10 全过（seed 模式 UPDATE/DELETE 标记 skip）。
- **`/api/fts-debug` 调试端点**：v1.8.0 临时引入，v1.8.1 已从代码删除，本次明确未再回退。

### 相关文件
- `electron/api-server.js`：新增 `ftsUnionLikeSearch()` 工具；`listItems` / `listMaterials` 改用 FTS5 ∪ LIKE 并集。
- `electron/main.js`：新增 `sleepSync()` + `runTxWithRetry()`；`backfillFtsFromMainTables` 内 `tx(rows)` 重试 3 次。
- `scripts/verify-fts5.js`：新增 FTS5 长期验证脚本（真实库 + 内存库双路径）。
- `package.json`：`1.8.1 → 1.8.2`，`output release-v181 → release-v182`。

### 测试方法
1. 启动 v1.8.2 exe，确认右下角更新提示显示「1.8.2」。
2. 打开设置 → 更新日志，确认 1.8.2 条目在列表首位。
3. 在物品列表搜索「菜」/「万汇城」/「净水器」，确认能命中对应物品；搜索英文「iPad」同样命中。
4. 跑 `node_modules\electron\dist\electron.exe scripts\verify-fts5.js`（真实库） + `--in-memory`（内存）应分别输出 12/12、10/10 PASS。

## v1.8.1（2026-08-26）

- 修复 v1.8.0 启动崩溃：`backfillFtsFromMainTables` 函数里 SQL 字符串外层使用单引号，内层出现 SQL 空串字面量 `''` 被 JS 解析器当成字符串结束；改为反引号模板字符串。

## v1.8.0（2026-08-26）

- 全文搜索 FTS5：新增 `items_fts` / `materials_fts` 虚表（unicode61 + remove_diacritics 2）；6 个触发器（items_ai/ad/au + item_ocr_ai/au/ad + materials_ai/ad/au + material_ocr_ai/au/ad）自动同步主表 / OCR 子表到 FTS5。
- 老库启动一次性回填：`backfillFtsFromMainTables` 在 `initDatabase` 末尾把已有 `items` / `materials` + OCR 文本全量写进 FTS5（幂等）。
- `listItems` / `listMaterials` 的 keyword 改为 FTS5 MATCH：多关键字按空格分词 → `term*` 前缀通配符组合 → `MATCH ?` → 命中 `id IN (...)`；零命中或 syntax error 时回退原 LIKE。
- `api-server.js` 顶部新增 `ftsKeywordSearch` 工具（trim + 分词 + 通配符 + 错误兜底 + LIMIT 200）。
- `docs/agent-api.md` 新增「全文搜索 FTS5（v1.8.0+）」章节；`/api/items` 与 `/api/e-materials` 的 keyword 描述更新。
- `release-notes.json` / `README.md` 同步到 v1.8.0 / v1.8.1。

## v1.7.9j（2026-08-26）

### 新功能（标签块 UI）
- **标签块 TagBlock**：在物品表单的「标签」字段以彩色块状多选的形式呈现标签，可一键添加、删除、模糊搜索候选。
- **自由新建标签**：用户在输入框直接回车即可新建标签，自动复用 `categories` 表（`key=name`）作为标签来源，不新增数据库表，零迁移成本。
- **颜色高亮**：每个标签基于 `key` 哈希映射到 12 色 palette，便于在卡片/列表中一眼区分。
- **向后兼容**：完全沿用 `items.tags` 现有 JSON 字符串字段，老库无感升级。

### 相关文件
- `src/components/TagBlock.jsx`：新建（多选 / 自由新建 / 模糊搜索 / 颜色稳定映射）。
- `src/components/ItemForm.jsx`：接入 `TagBlock`，`form.tags` 与 `onSave` 透传 JSON 字符串。
- `src/lib/i18n.jsx`：新增 `f_tags` / `tag_block_empty` / `tag_addBtn` / `tag_remove` / `tag_search_placeholder` / `tag_create` / `tag_creating` / `tag_noMatch` / `tag_noMore` / `tag_tip` / `tag_total` 中英文案。
- `package.json`：`1.7.9i → 1.7.9j`，`output release-v179i → release-v179j`。

### 测试方法
1. 打开「添加物品」表单，在「标签」字段点「+ 添加标签」按钮。
2. 在搜索框输入「发票」回车，可直接新建并选中该标签；同时已存在的「财务」类目也会出现在候选列表里，可点击。
3. 选中若干标签后保存物品；再次打开该物品，标签块仍保留已选项；标签旁 X 按钮可逐个移除。
4. 已存在 items.tags 的旧库不需要任何迁移；新版本首次启动不会触发 ALTER。

## v1.7.9i（2026-08-26）

### 修复（v1.7.9 数据库锁定 / 安装失败）
- **OCR 结果改存独立表**：为避免 Windows Defender / Search 等外部进程持锁导致 `ALTER TABLE items/materials` 失败，OCR 结果不再扩展主表字段，而是新建 `item_ocr` / `material_ocr` 独立表（外键级联删除）。
- **移除所有 ALTER 加列逻辑**：`ensureItemColumns` / `ensureMaterialColumns` / `migrateIndexes` 不再尝试修改 `items` / `materials` 主表结构，启动期不再触发杀软锁文件。
- **恢复流程去 EXCLUSIVE 锁**：`initDatabaseAfterRecovery` 同步改为 WAL + busy_timeout + mmap_size，与主启动流程一致。
- **数据库可正常打开**：Electron 运行时验证 `inventory.db` 能成功初始化，`item_ocr` / `material_ocr` 表与索引创建成功。

### 相关文件
- `electron/main.js`：建表语句去掉 `ocr_text` / `ocr_at`，新增 `item_ocr` / `material_ocr`；移除对主表的 ALTER 加列。
- `electron/api-server.js`：`/api/items` 与 `/api/e-materials` 的 keyword 搜索改用 `LEFT JOIN item_ocr/material_ocr`；OCR 写入/读取改为独立表。
- `electron/preload.js` / `src/lib/api.js` / `src/components/ItemForm.jsx`：注释同步更新。
- `docs/agent-api.md`：新增「图片 OCR（v1.7.9+）」章节，说明 4 个端点、字段及 keyword 搜索。

## v1.7.9（2026-08-25）

### 新功能
- **图片 OCR 自动识字**：物品/材料照片可一键提取文字，结果可被搜索命中。
- **Agent API OCR 端点**：
  - `POST /api/items/:id/ocr`
  - `GET /api/items/:id/ocr`
  - `POST /api/e-materials/:id/ocr`
  - `GET /api/e-materials/:id/ocr`
- **搜索集成**：`/api/items` 与 `/api/e-materials` 的 `keyword` 同时匹配 `name/title/notes/content` 和 OCR 文字。

## v1.7.8（2026-08-25）

### 新功能
- **Agent API 列表分页**：`/api/items`、`/api/e-materials`、`/api/categories`、`/api/locations` 支持 `?page=&limit=`。
- **向后兼容**：不传 `page`/`limit` 时返回全量数组，行为与旧版一致。

## v1.7.7（2026-08-25）

### 修复（v1.7.6 实际未生效 + 启动链加固）
- **API 启动链加固**：`app.whenReady().then()` 链外加 `try/catch` 包裹，任何一步抛错都不会再让 API server "静默死亡"。如果 `initDatabase` 失败，会用 `db: null` 降级模式启动 API，至少 `/api/status` 还能响应（`health: null` + `version: 真实版本号`），外部 Agent 拿得到进程活着的证据。
- **启动日志**：每次启动会把每一步结果写入 `userData/startup-error.log`（如 `[startup] whenReady begin, version=1.7.7` → `createWindow ok` → `initDatabase ok` → `apiServer started`），下次出问题能直接看这个文件定位是卡在哪一步。
- **真正的版本号**：v1.7.6 之前用户测的 `/api/status` 实际返回 `version: "1.7.2"`，是因为进程被老的 `Family Inventory.exe` 占着端口 / 用户没真正关掉旧实例。v1.7.7 exe 文件名直接叫 `Family Inventory 1.7.7.exe`，asar 内 `package.json version = "1.7.7"`，可执行文件也是 78.6MB 的全新包。

> 如果再测一次 `/api/status` 还是没有 `health` 字段 / 版本号不对，麻烦把 `C:\Users\4070\AppData\Roaming\family-inventory\startup-error.log` 的内容发我，能立刻定位是哪一步失败。

## v1.7.6（2026-08-25）

### 修复（用户实测 v1.7.5 后反馈的 4 个 UI 问题）
- **搜索清空按钮**：之前要点 3 次才能清空。原因是点击时 input 先 onBlur 触发关闭弹窗，导致按钮被 React 卸载、click 事件丢失。改用 `onMouseDown preventDefault` 阻止 input 失焦 + 清空后主动 `inputRef.current.focus()`。
- **搜索历史弹窗层级**：之前 z-index = 50，被物品拖拽层（z-index = 9999）盖住。改成 z-index = 10000 排在所有内容之上。
- **设置页"当前版本 / 更新源"显示**：在 `updaterInfo` 异步加载完成之前显示"加载中"状态（带 spinner），不显示尴尬的 `—` 占位；选中的更新源后加 `✓` 标记；检查按钮在版本未就绪时禁用。

> 关于 `/api/status` 没有 `health` 字段：反查 v1.7.5 build 确认代码已包含，但**用户的实际响应是 `version: "1.7.4"`**——说明当时测的是 v1.7.4 进程。请确认 v1.7.6 启动后再调一次，能看到 `version: "1.7.6"` + `health: { items: N, materials: N, indexes: [...], ... }`。

## v1.7.5（2026-08-25）

### 改进
- **重复代码合并**：把 `parseTags` / `normalizeTags` 从 3 处实现抽到
  `electron/tags.js`（main 端）和 `src/lib/tags.js`（renderer 端），
  修了一个隐藏 bug — 旧版 renderer 的数组分支不会 `String().trim()`。
- **搜索索引补齐**：新增 8 个索引
  - items: `idx_items_name` / `category` / `room` / `expiry_date` / `created_at`
  - materials: `idx_materials_type` / `title` / `event_start_date` /
    `event_end_date` / `updated_at`
  - 老库通过 `migrateIndexes()` 自动补齐（幂等）
- **数据库健康检查**：启动期跑 `PRAGMA integrity_check`，
  损坏时立即在日志报错（不阻塞启动）。同时：
  - 新增 IPC `system:health`
  - `GET /api/status` 返回 `health` 字段（含 items / materials 行数）

## v1.7.4（2026-08-25）

### 改进
- tags 兼容解析（读端 `parseTags` + 写端 `normalizeTags`）
- materials 表新增 `event_start_date` / `event_end_date`（时间范围）
- `listMaterials` 支持 `?startDate=&endDate=&tag=`
- 旧数据库自动迁移
- `docs/agent-api.md` 更新至 v1.7.4
