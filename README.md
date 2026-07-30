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
- 可折叠侧边栏：展开/收起入口放在右侧物品主内容区，顶部更简洁
- 右键物品直接编辑、双击查看大图
- 编辑表单支持图片拖拽赋值与文件浏览选择
- 创建物品时编号留空自动生成（`WP-YYYYMMDD-NNN`）
- frameless 无边框窗口，顶栏单行上下一体（标题栏 + 工具栏 + 内联统计 + 窗口控制）

## 技术栈

- **Electron** —— 主进程（窗口、数据库、IPC、文件对话框）
- **React + Vite** —— 渲染进程
- **better-sqlite3** —— 本地 SQLite 数据库
- **Tailwind CSS + Framer Motion** —— 样式与动效

## 界面说明

- **顶部工具栏（单行上下一体）**：侧边栏切换 + 当前视图标题 + 内联统计（物品数 / 库存不足 / 即将过期）+ 居中搜索框 + 导入导出 / 批量选择 / 添加物品 + 窗口控制按钮，全部融合在一行内
- **侧边栏**：分类筛选、位置树筛选、设置入口；收起后仅显示图标
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

## Agent API 自然语言控制指南

家庭物资管家内置一个本地 HTTP 服务，允许外部 AI Agent（如 Claude、ChatGPT、Trae 等）通过自然语言指令管理家中物品数据。本节介绍工作原理、配置方法与典型用法示例。

### 工作原理

应用启动后会在本机回环地址 `127.0.0.1:3001` 启动一个 HTTP 服务，所有接口均需通过 Bearer Token 鉴权。外部 AI Agent 可调用这套 REST 接口完成物品的查询、新增、修改、删除等操作，从而把「帮我看看冰箱里还有什么」「把牛奶数量改成 4」这类自然语言指令翻译成对应的 HTTP 请求。

#### 自然语言 → API 翻译管线

Agent 把用户自然语言转化为数据操作的完整流程分为四步：

1. **意图识别**：Agent 从用户语句中提取操作类型（查询 / 新增 / 修改 / 删除）和关键实体（物品名称、数量、位置、分类等）
2. **接口选择**：根据意图选择对应 API —— 查询用 `GET /api/items`，新增用 `POST /api/items`，修改用 `PATCH /api/items/<id>`，删除用 `DELETE /api/items/<id>`
3. **实体定位**：对于修改 / 删除操作，Agent 先调用 `GET /api/items/<名称>` 模糊搜索获取候选列表，再从中选取目标 `id`
4. **执行 + 回复**：Agent 发起请求，将返回的 JSON 结果整理成自然语言回复给用户

```
用户自然语言 → Agent 识别意图 → 选择 API → (必要时先搜索定位 id) → 发起请求 → 整理结果回复用户
```

#### 分类归一化

创建 / 更新物品时，`category` 字段会自动归一化。Agent 传入中文别名或英文变体都能正确映射：

| 用户可能说 | 传入 category | 归一化结果 |
| --- | --- | --- |
| 「工具」「tool」 | `tool` 或 `工具` | `tools` |
| 「食品」「food」 | `food` 或 `食品` | `food` |
| 「饮料」「drink」 | `drink` 或 `饮料` | `beverage` |

完整对照表见 [Skill 文件](./skills/family-inventory-agent.md) 第五节。

### 配置步骤

1. 打开「家庭物资管家」桌面应用
2. 进入「设置 → 外部 Agent 接口」
3. 复制显示的访问 Token（如需更换可点击「刷新」）
4. 在 Agent 的请求头中携带：`Authorization: Bearer <你的-Token>`

> Token 存储在 `%APPDATA%/Family Inventory/settings.json`，请妥善保管，勿提交到公开仓库或分享给他人。

### 自然语言示例场景

下面列出常见的自然语言指令以及 Agent 应发起的 HTTP 请求。所有请求均需携带 `Authorization: Bearer <token>` 头。

#### 1. 查询物品

- 用户：「帮我看看冰箱里还有什么」
- Agent 请求：

```http
GET /api/items?keyword=冰箱
```

返回 `items` 数组，Agent 可据此总结冰箱中的物品清单。

#### 2. 添加物品

- 用户：「添加一箱牛奶到厨房冰箱，6 盒」
- Agent 请求：

```http
POST /api/items
Content-Type: application/json

{
  "name": "牛奶",
  "quantity": 6,
  "category": "beverage",
  "room": "厨房",
  "position": "冰箱"
}
```

#### 3. 修改数量（先查后改）

- 用户：「把牛奶的数量改成 4」
- Agent 第一步，通过名称定位物品：

```http
GET /api/items/牛奶
```

返回 `candidates` 候选列表，Agent 选中目标物品的 `id`。

- Agent 第二步，更新数量：

```http
PATCH /api/items/<id>
Content-Type: application/json

{ "quantity": 4 }
```

#### 4. 删除物品（先查后删）

- 用户：「删除那个过期的面包」
- Agent 第一步，搜索「面包」：

```http
GET /api/items/面包
```

- Agent 第二步，从候选列表中筛选已过期项并删除：

```http
DELETE /api/items/<id>
```

#### 5. 按位置查询快过期物品

- 用户：「厨房里有哪些快过期的东西」
- Agent 请求：

```http
GET /api/items?keyword=厨房
```

返回结果后，Agent 根据 `expiryDate` 字段（毫秒时间戳）筛选 7 天内即将过期或已过期的物品并提示用户。

#### 6. 查看分类

- 用户：「帮我看看有哪些分类」
- Agent 请求：

```http
GET /api/categories
```

返回所有分类及其 `key` / 中文名，便于后续按分类筛选或创建物品时指定 `category`。

#### 7. 补充库存（先查后加）

- 用户：「又买了 12 个鸡蛋，帮我加上去」
- Agent 第一步，查找现有鸡蛋：

```http
GET /api/items/鸡蛋
```

- Agent 第二步，若已有鸡蛋则累加数量：

```http
PATCH /api/items/<id>
Content-Type: application/json

{ "quantity": 24 }
```

- Agent 回复：确认鸡蛋库存已从 12 补充到 24。

#### 8. 查看库存全貌

- 用户：「家里还有多少饮料」
- Agent 请求：

```http
GET /api/items?category=beverage
```

- Agent 处理：汇总返回 `items` 中各饮料的数量。
- Agent 回复：报告饮料库存总量与明细清单。

### Skill 文件

仓库 `skills/` 目录下提供了配套的 `family-inventory-agent.md` 技能文件，包含完整的接口规范、字段说明、分类对照表与 8 个以上自然语言映射示例。将该文件加载到 AI Agent 后，Agent 即可获得本应用的完整 API 使用能力。

#### 如何加载 Skill 文件

| Agent 平台 | 加载方式 |
| --- | --- |
| **Trae** | 将 `family-inventory-agent.md` 内容粘贴到 Skill 配置，或在项目根目录放置该文件 |
| **Claude** | 放入 Project Instructions / Custom Instructions |
| **ChatGPT** | 粘贴到自定义指令（Custom Instructions）或 GPTs 的 Knowledge |
| **Cursor** | 放入 `.cursorrules` 或项目上下文文件 |
| **通用** | 任何支持加载 Markdown 上下文的 Agent 均可直接使用 |

### 安全提示

- HTTP 服务仅绑定 `127.0.0.1`，不会暴露到局域网或公网，外部设备无法直接访问。
- 所有接口均需 Bearer Token 鉴权，未携带或 Token 错误将返回 `401 Unauthorized`。
- Token 可在「设置 → 外部 Agent 接口」中随时刷新，刷新后旧 Token 立即失效。
- 数据库写操作使用参数化查询，防止 SQL 注入。

更详细的接口字段与示例请参考 [`docs/agent-api.md`](./docs/agent-api.md)。

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

打包产物输出到 `release-v4f/` 目录。

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
├── docs/
│   └── agent-api.md       # Agent API 接口文档
├── electron/
│   ├── main.js            # 主进程：数据库、IPC、文件对话框、自动备份
│   ├── api-server.js      # 本地 HTTP API 服务（供外部 Agent 调用）
│   ├── item-no.js         # 智能编号生成（参考已有数据规则）
│   └── preload.js         # 预加载脚本：暴露 window.lingguang API
├── skills/
│   └── family-inventory-agent.md  # Agent 技能文件（自然语言 → API 映射）
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

- **顶栏上下一体**：合并为单行布局，统计内联显示，风格更统一
- **分类去重重构**：修复 UNIQUE 约束冲突导致 tool/工具 仍显示两条的问题
- **图片拖拽赋值**：编辑表单支持拖拽图片快速赋值、点击浏览在文件管理器选择、实时预览
- **悬浮动效优化**：柔和弹簧参数 + CSS 过渡曲线调优，卡片悬浮更丝滑
- **位置计数稳定**：选择分类时位置数量基于全量数据，不再随筛选变化
- **自动编号**：参考已有数据规则，编号留空时自动生成 `WP-YYYYMMDD-NNN`
- **右键编辑 / 双击大图**：右键物品直接打开编辑，双击查看大图
- **Agent API 文档**：README 新增自然语言翻译管线说明、8 个示例场景、Skill 加载指南
- **frameless 窗口**：标题栏与工具栏一体化，自定义窗口控制按钮

## 约束说明

- 不引入复杂 UI 库 / 状态管理库，保持轻量
- 前端打包产物放在 `dist/`，Electron 主进程加载 `dist/index.html`
- 第一版仅做本地管理，不含账号、云端同步、AI 搜索等功能

## License

[MIT](./LICENSE)
