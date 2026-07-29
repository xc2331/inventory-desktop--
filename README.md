# 家庭物资管家桌面版 · Family Inventory Desktop

一个用 Electron 构建的轻量桌面应用，用于管理家庭物品。支持 JSON / CSV 导入导出，数据结构与手机端 H5 版本兼容，所有数据本地存储、离线可用。

> 应用名：家庭物资管家 / Family Inventory

## 功能特性

- 物品增删改查（名称、分类、房间、位置、数量、过期日期、编号、最低库存等）
- 数量快速增减按钮（+/−），低于最低库存自动提示「库存不足」
- 9 大预设分类筛选（食品 / 饮料 / 日用品 / 厨房用品 / 清洁用品 / 医药 / 文具 / 工具 / 其他）
- 关键词搜索（名称 / 编号 / 房间 / 位置）
- JSON 导入 / 导出（结构含 `version`、`export_time`、`items` 数组，与手机端兼容）
- CSV 导出（含物品主要字段，带 UTF-8 BOM，Excel 直接打开不乱码）
- 启动时自动备份数据库文件（`inventory.db.backup`）
- 过期提醒（已过期 / 7 天内即将过期）

## 技术栈

- **Electron** —— 主进程（窗口、数据库、IPC、文件对话框）
- **React + Vite** —— 渲染进程（可复用手机端 UI 代码）
- **better-sqlite3** —— 本地 SQLite 数据库
- **Tailwind CSS** —— 样式

## 数据库说明

- 数据库文件：`userData/inventory.db`（Electron 的 `app.getPath('userData')`）
- 启动时自动备份为 `inventory.db.backup`
- 表 `items` 字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | 物品唯一 ID |
| name | TEXT | 名称 |
| item_no | TEXT | 编号 |
| room | TEXT | 房间 |
| position | TEXT | 位置 |
| location | TEXT | 详细位置 |
| quantity | INTEGER | 数量 |
| min_quantity | INTEGER | 最低库存 |
| photo | TEXT | 图片（URL/路径） |
| category | TEXT | 分类 |
| expiry_date | INTEGER | 过期日期（毫秒时间戳） |
| created_at | INTEGER | 创建时间（毫秒时间戳） |
| updated_at | INTEGER | 更新时间（毫秒时间戳） |

所有时间戳均为毫秒级 Unix 时间戳。

### JSON 导出结构

```json
{
  "version": 1,
  "export_time": 1700000000000,
  "items": [
    { "id": "...", "name": "...", "category": "...", "quantity": 1 }
  ]
}
```

导入时会**覆盖**当前数据（先清空再写入，事务保证原子性），可直接导入手机端导出的 JSON。

## API 桥接（preload）

前端通过 `window.lingguang` 操作主进程：

- `window.lingguang.db.query({ sql, binds })` → 返回行数组
- `window.lingguang.db.execute({ sql, binds })` → 返回 `{ changes, lastInsertRowid }`
- `window.lingguang.sync.exportData()` → 返回完整 JSON 字符串
- `window.lingguang.sync.importData(jsonString)` → 导入并覆盖数据
- `window.lingguang.sync.exportCSV()` → 返回 CSV 字符串
- `window.lingguang.file.save({ content, defaultName, filters })` → 保存文件对话框
- `window.lingguang.file.open({ filters })` → 打开文件对话框

> 所有数据库写操作均使用参数化查询，防止 SQL 注入。

## 开发与运行

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

> 安装后会自动执行 `electron-builder install-app-deps`，为 Electron 重新编译 `better-sqlite3` 原生模块。若失败，可手动执行 `npm run rebuild`。

### 开发模式

```bash
npm run dev
```

同时启动 Vite 开发服务器与 Electron，支持前端热更新。

### 生产构建

```bash
npm run build        # 仅构建前端到 dist/
```

### 打包安装包

```bash
npm run build:win    # Windows (nsis exe)
npm run build:mac    # macOS (dmg)
npm run build:linux  # Linux (AppImage)
```

打包产物输出到 `release/` 目录。

## 下载安装

1. 前往 [Releases 页面](https://github.com/xc2331/inventory-desktop--/releases) 下载对应平台的安装包
2. Windows：双击 `.exe` 安装
3. macOS：打开 `.dmg` 拖入「应用程序」
4. Linux：赋予执行权限后运行 `.AppImage`

## 项目结构

```
inventory-desktop/
├── electron/
│   ├── main.js          # 主进程：数据库、IPC、文件对话框、自动备份
│   └── preload.js       # 预加载脚本：暴露 window.lingguang API
├── src/
│   ├── main.jsx         # React 入口
│   ├── App.jsx          # 主应用
│   ├── index.css        # Tailwind 样式
│   ├── components/      # 组件（Sidebar/TopBar/ItemCard/ItemForm/...）
│   └── lib/             # api.js、categories.js、utils.js
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## 约束说明

- 不引入复杂 UI 库 / 状态管理库，保持轻量
- 前端打包产物放在 `dist/`，Electron 主进程加载 `dist/index.html`
- 第一版仅做本地管理，不含账号、云端同步、AI 搜索等功能

## License

[MIT](./LICENSE)
