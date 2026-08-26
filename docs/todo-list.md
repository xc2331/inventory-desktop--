# To-Do List — Family Inventory Desktop

> 更新日期：2026-08-26
> 当前版本：**v1.8.1**（GitHub + Gitee Release 已发布）

## ✅ 全部 10 项已完成（v1.7.4 ~ v1.8.1）

### 🤖 Agent 联动
- [x] **1. 图片自动识字（OCR）** — Agent 能搜到图片内容（v1.7.9 + v1.7.9i 改存 `item_ocr` / `material_ocr` 独立表）
- [x] **2. API 加分页** — `?page=&limit=` 防止材料多时卡顿（v1.7.8）
- [x] **4. 全文搜索** — 任意词命中正文（v1.8.0 FTS5 + v1.8.1 修复启动崩溃）

### 🖼️ 界面
- [x] **6. 标签改成小标签块** — 不用手输逗号，`TagBlock.jsx` 自由新建 + 颜色稳定映射（v1.7.9j）

### ⚡ 性能
- [x] **10. 图片单独存文件** — `dataDir/photos/`，库体积大降（v1.5.5）
- [x] **11. 搜索用的索引** — `idx_items_name`/`category`/`room`/`expiry_date`/`created_at` + 5 个 materials 索引，老库 `migrateIndexes()` 自动补齐（v1.7.5）

### 🛠️ 工程
- [x] **12. 关键逻辑加自动测试** — Vitest 50 用例全绿（CRUD + 搜索 + 批量编辑 + 错误处理 + SQL 白名单）
- [x] **13. 重复代码合并** — `electron/tags.js` + `src/lib/tags.js` 抽公共 `parseTags` / `normalizeTags`（v1.7.5）

### 🔒 可靠性
- [x] **15. 库损坏早发现** — 启动期 `PRAGMA integrity_check` + `system:health` IPC + `/api/status` 返回 `health` 字段（v1.7.5）

### 📦 打包
- [x] **3. 修杀毒软件锁文件** — OCR 改存独立表，移除主表 ALTER，杀软不再持锁 `database is locked`（v1.7.9i）
- [x] **16. 加更新日志文件** — `CHANGELOG.md` + `release-notes.json` 同步到每个 release（v1.5.0+ 起持续维护）

## 待清理文件清单（v1.8.1 阶段产生的临时/调试脚本）

### 根目录临时脚本（建议删除）
- `apply-readme.js` / `apply-skill.js` — 单次升级补丁
- `bump-version.js` — 单次版本号脚本
- `fix-fts-quote.js` — 单次引号修复
- `resolve-sourcemap.js` / `resolve-sourcemap2.js` — sourcemap 调试
- `test-db.js` / `test-fts-*.js` (8 个) / `test-e2e-rest.js` / `test_all_bugs.js` / `test_real.js` — 临时 e2e
- `dump_roles.js` / `check-icons.js` / `t.sh` — 调试工具
- `click-test.ps1` / `worker.ps1` / `batch-build.ps1` — PowerShell 脚本
- `_remove_funcs.py` — 一次性清理脚本
- `0` — 空文件

### docs 过期文件（建议删除或归档）
- `docs/ai-features-analysis.md` — 早期分析
- `docs/changelog-1.3.16-to-1.3.17.md` — 单次 changelog
- `docs/date-index-testing.md` — 索引测试记录
- `docs/mobile-photo-upload-plan.md` — 旧规划
- `docs/project-analysis-report*.md` (3 份) — 阶段性报告
- `docs/update-source-setup.md` — 旧更新源说明
- `docs/v2-ui-redesign-plan.md` — UI 重设计规划

### 根目录旧报告
- `AGENT_INTEGRATION_PLAN.md` / `PROJECT_SUMMARY.md` / `SERPENT_ANALYSIS.md` — 早期文档

> 清理建议：保留 `README.md` / `CHANGELOG.md` / `LICENSE` / `package.json` / `package-lock.json` / `vite.config.js` / `postcss.config.js` / `tailwind.config.js` / `index.html` / `.gitignore` / `update-info.json` / `release-notes.json` / 业务源代码。
