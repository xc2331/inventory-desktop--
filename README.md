# 家庭物资管家桌面版 · Family Inventory Desktop

一个用 Electron 构建的轻量桌面应用，用于管理家庭物品。支持 JSON / CSV 导入导出，数据结构与手机端 H5 版本兼容，所有数据本地存储、离线可用。

> 应用名：家庭物资管家 / Family Inventory

## 功能特性

- 简洁现代的界面设计：隐藏顶部系统菜单栏，所有功能入口集中在设置页
- 自定义应用图标：任务栏、窗口与安装包均使用专属简约 Logo
- 物品增删改查（名称、分类、房间、位置、数量、过期日期、编号、最低库存等）
- 数量快速增减按钮（+/−），低于最低库存自动提示「库存不足」
- 9 大预设分类筛选（食品 / 饮料 / 日用品 / 厨房用品 / 清洁用品 / 医药 / 文具 / 工具 / 其他）
- 分类别名归一化：例如 `tool` 与 `工具` 会自动合并为「工具」
- 关键词搜索（名称 / 编号 / 房间 / 位置），支持模糊匹配
- JSON 导入 / 导出（结构含 `version`、`export_time`、`items` 数组，与手机端兼容）
- CSV 导出（含物品主要字段，带 UTF-8 BOM，Excel 直接打开不乱码）
- 启动时自动备份数据库文件（`inventory.db.backup`）
- 过期提醒（已过期 / 7 天内即将过期）
- 批量选择：批量改分类、批量删除
- 可折叠侧边栏：仅保留顶部统一的展开/收起入口

## 技术栈

- **Electron** —— 主进程（窗口、数据库、IPC、文件对话框）
- **React + Vite** —— 渲染进程
- **better-sqlite3** —— 本地 SQLite 数据库
- **Tailwind CSS + Framer Motion** —— 样式与动效

## 界面说明

- **顶部工具栏**：左侧切换侧边栏 + 当前视图标题，中间为圆角搜索框，右侧为导入/导出、批量选择、添加物品
- **侧边栏**：分类筛选、位置树筛选、设置入口；收起后仅显示图标
- **统计条**：物品总数、库存不足、即将过期三项快捷统计
- **设置页**：语言、主题、数据目录、Agent API、分类/位置管理、导入导出

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

## 图标说明

应用图标位于 `build/` 目录：

- `build/icon.ico` —— Windows 打包与任务栏图标（含多尺寸）
- `build/logo.svg` —— SVG 矢量源文件

打包时 `electron-builder` 会自动使用 `build/icon.ico` 作为可执行文件与任务栏图标；开发环境下窗口也通过 `icon` 参数指向同一文件。

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
npm run build:win    # Windows (portable exe)
npm run build:mac    # macOS (dmg)
npm run build:linux  # Linux (AppImage)
```

打包产物输出到 `release-v4d/` 目录。

> 打包脚本已加 `--publish never`，不会自动发布到 GitHub；需要发布 Release 时请用 `GH_TOKEN` 配合 `--publish always`。
> `win.signAndEditExecutable` 设为 `false`，跳过代码签名与 rcedit，在无符号链接权限的环境下也能打包。

## 国内网络加速（可选）

Electron 与 electron-builder 的辅助二进制默认从 GitHub 下载，国内网络可能较慢或失败。安装/打包前设置以下镜像环境变量即可加速：

```bash
# PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
$env:NODE_TLS_REJECT_UNAUTHORIZED="0"   # 仅在遇到证书校验问题时使用

# CMD
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

## 下载安装

1. 前往 [Releases 页面](https://github.com/xc2331/inventory-desktop--/releases) 下载对应平台的安装包
2. Windows：双击 `.exe` 运行
3. macOS：打开 `.dmg` 拖入「应用程序」
4. Linux：赋予执行权限后运行 `.AppImage`

## 项目结构

```
inventory-desktop/
├── build/
│   ├── icon.ico           # 应用图标（多尺寸 ICO）
│   └── logo.svg           # Logo 矢量源文件
├── electron/
│   ├── main.js            # 主进程：数据库、IPC、文件对话框、自动备份
│   └── preload.js         # 预加载脚本：暴露 window.lingguang API
├── src/
│   ├── main.jsx           # React 入口
│   ├── App.jsx            # 主应用
│   ├── index.css          # Tailwind 样式与设计令牌
│   ├── components/        # 组件（Sidebar/TopBar/ItemCard/ItemForm/...）
│   └── lib/               # api.js、categories.js、utils.js、i18n.jsx
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## 更新日志（最近）

- **UI 大改**：顶部菜单栏隐藏，搜索框居中，侧边栏仅保留顶部统一入口
- **新增自定义 Logo**：替换为简约「物资箱」图标，任务栏与窗口同步生效
- **设置集中化**：导入/导出、分类管理、位置管理、语言、主题、数据目录全部集中到设置页
- **分类归一化**：`tool` / `工具` 等中英文别名自动合并到同一分类
- **交互优化**：更柔和的配色、更细的滚动条、卡片动效、表单紧凑布局

## 约束说明

- 不引入复杂 UI 库 / 状态管理库，保持轻量
- 前端打包产物放在 `dist/`，Electron 主进程加载 `dist/index.html`
- 第一版仅做本地管理，不含账号、云端同步、AI 搜索等功能

## License

[MIT](./LICENSE)
