<div align="center">

# 家庭物资管家 · Family Inventory

<p align="center">
  <img src="build/logo.svg" alt="Family Inventory Logo" width="120" />
  <br/>
  <sub>一个知道你家里还有什么、放在哪、够不够用的小工具</sub>
</p>

> *「家里的东西，本该心中有数。」*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue.svg)](#下载安装)
[![Release](https://img.shields.io/github/v/release/xc2331/inventory-desktop--?include_prereleases&label=Release)](https://github.com/xc2331/inventory-desktop--/releases)
[![Electron](https://img.shields.io/badge/Electron-31.x-9fe2bf.svg)](https://www.electronjs.org/)

<br>

**轻量本地化的家庭物品管理桌面应用** —— 物品、分类、位置、库存、过期提醒一站式管理，所有数据本地存储，离线可用，JSON 导出与手机端 H5 版本结构兼容。

<sub>支持 Windows / macOS / Linux，数据文件可放在 U 盘或同步盘，走到哪管到哪。</sub>

<br>

[看效果](#效果示例) · [下载安装](#下载安装) · [核心功能](#核心功能) · [Agent API](#agent-外部接口) · [自己构建](#开发与构建)

</div>

---

## 效果示例

```
用户      ❯ 冰箱里还剩什么快过期的？

应用      ❯ 冰箱中共有 12 件物品，其中 2 件需要关注：
           · 牛奶 — 3 天后过期，剩余 1 盒
           · 酸奶 — 已过期 2 天，建议清理
```

```
用户      ❯ 帮我记一下，阳台工具箱新增一把锤子

应用      ❯ 已添加「锤子」到「阳台 > 工具箱」，
           编号 TY-20260115-003，当前库存 1。
```

主界面采用无边框窗口 + 顶栏工具栏一体化设计，侧边栏可折叠，卡片悬浮放大，双击图片即可全屏查看。

<div align="center">
  <img src="docs/hero.png" alt="Family Inventory UI Preview" width="720" />
  <br/>
  <sub>界面预览：分类 · 位置 · 过期 · 库存 · 趋势 · 数量 多维统计</sub>
</div>

---

## 核心功能

- **物品全生命周期管理**：名称、分类、编号、房间、位置、数量、最低库存、过期日期、图片
- **分类智能归一化**：`tool` / `工具` / `tools` 自动合并，支持 250+ 个分类图标
- **位置树筛选**：房间 / 位置父子层级，快速定位物品在哪
- **位置地图可视化**：按房间查看物品分布，点击房间进入平面图编辑器，拖拽划分子区域
- **平面图编辑器**：拖拽绘制子区域、绑定位置、图层排序、置顶/置底、子区域实景图上传
- **库存与过期预警**：低于最低库存标红，7 天内过期 / 已过期自动提醒
- **数量快捷 ±1**：卡片上直接增减数量，实时同步数据库
- **批量操作**：批量改分类、批量删除
- **图片压缩存储**：本地图片拖拽或浏览后自动压缩为 WebP Base64（≤100KB），与数据一起导出
- **手机扫码传图**：同一局域网内手机扫码后拍照/选图上传到电脑，自动填充物品图片
- **AI 视觉识别**：上传物品图片后点击「AI 识别」，自动给出名称、分类、位置、数量建议，确认后回填
- **电子材料库**：集中管理证件照、网址、教程、菜谱等非实物资料，支持图片/链接/文件路径
- **数据统计页**：分类饼图 / 柱状图、位置分布、过期 / 库存环形图、创建更新趋势折线、数量雷达图
- **外部 Agent API**：启动本地 HTTP 服务，Claude / ChatGPT / Trae 等 Agent 可通过 Token 鉴权管理物品
- **软件内更新**：检查更新、选择下载目录、下载完成后手动确认安装
- **数据自由迁移**：JSON 导入导出、CSV 导出，数据库目录可自定义
- **启动自动备份**：每次启动自动复制 `inventory.db` 为 `inventory.db.backup`

---

## 下载安装

1. 前往 [Releases 页面](https://github.com/xc2331/inventory-desktop--/releases) 下载对应平台安装包
2. **Windows**：双击 `.exe` 运行（便携版，无需安装）
3. **macOS**：打开 `.dmg` 拖入「应用程序」
4. **Linux**：赋予执行权限后运行 `.AppImage`

> 数据文件默认位于系统应用数据目录，可在「设置 → 数据目录」中更改到 U 盘或同步盘。

---

## 界面说明

- **顶栏（单行一体）**：侧边栏切换 + 视图标题 + 搜索框 + 导入导出 / 批量选择 / 添加物品 + 内联统计 + 窗口控制按钮
- **侧边栏**：分类筛选、位置树筛选、位置地图、统计入口、设置入口；收起后仅显示图标
- **位置地图**：按房间展示物品数量卡片，点击房间卡片右侧「编辑平面图」进入平面图编辑器
- **统计页**：分类 / 位置 / 过期 / 库存 / 时间 / 数量 多维数据可视化
- **设置页**：语言、主题、数据目录、Agent API、分类 / 位置管理、导入导出、更新源

---

## 图片存储说明

数据库 `photo` 字段统一存储字符串：

- `data:image/webp;base64,xxxx` —— 内嵌压缩后的图片数据（推荐）
- `https://...` 或相对路径 / 本地路径 —— 在线图片地址或旧版路径

渲染时自动判断前缀：
- 以 `data:` 开头 → 直接作为 `<img src>` 显示
- 否则 → 当作 URL 处理

**上传流程**：用户选择/拖拽图片 → 前端 Canvas 压缩（最大 800px、WebP 优先质量 0.6、回退 JPEG）→ 若压缩后 >100KB 则提示重新选择 → 存入 `photo` 字段。

JSON 导入导出时 `photo` 字段原样保留，Base64 图片会自动跟随数据文件迁移。

---

## Agent 外部接口

应用内置本地 HTTP API，允许外部 AI Agent 通过自然语言指令管理家中物品。

### 快速配置

1. 打开应用 →「设置 → 外部 Agent 接口」
2. 自定义服务端口（默认 3001）
3. 按需开启「暴露到局域网」（同一局域网内其他设备可通过本机 IP 访问）
4. 自定义或刷新访问 Token
5. Agent 请求头携带：`Authorization: Bearer <Token>`

### 自然语言 → API 示例

| 用户说 | Agent 请求 |
| --- | --- |
| 帮我看看冰箱里还有什么 | `GET /api/items?keyword=冰箱` |
| 添加 6 盒牛奶到厨房冰箱 | `POST /api/items { name, quantity, category, location: "厨房 > 冰箱" }` |
| 把牛奶数量改成 4 | `GET /api/items/牛奶` → `PATCH /api/items/<id> { quantity: 4 }` |
| 删除过期的面包 | `GET /api/items/面包` → `DELETE /api/items/<id>` |

> 位置字段说明：`location` 优先，使用 `>` 分隔层级（也支持 `/`、`→`）；未传 `location` 时回退到 `room` + `position`。创建/更新成功后，系统会自动把位置同步到「位置地图」和「位置管理」。

更完整的接口规范、字段说明与 Skill 文件见 [`docs/agent-api.md`](./docs/agent-api.md) 与 [`skills/family-inventory-agent.md`](./skills/family-inventory-agent.md)。

---

## 开发与构建

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

### 打包

```bash
npm run build:win    # Windows (portable exe)
npm run build:mac    # macOS (dmg)
npm run build:linux  # Linux (AppImage)
```

产物输出到 `release-v15/` 目录。

### 发布到 GitHub / Gitee Releases

```bash
npm run publish:github   # 需要 GH_TOKEN
npm run publish:gitee    # 需要 GITEE_TOKEN
npm run publish:all      # 两个都发布
```

> 可在项目根目录创建 `.env.local` 文件存放 `GH_TOKEN` 和 `GITEE_TOKEN`，发布脚本会自动读取（该文件已被 .gitignore 忽略，不会提交）。

### 国内网络加速（可选）

```powershell
# PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
```

---

## 项目结构

```
inventory-desktop/
├── build/                    # 应用图标
├── docs/                     # 接口文档
├── electron/                 # 主进程（窗口、数据库、IPC、API 服务、更新器）
├── scripts/                  # 构建与发布脚本
├── skills/                   # Agent Skill 文件
├── src/
│   ├── components/           # React 组件
│   ├── lib/                  # API 封装、国际化、图标、工具函数
│   ├── App.jsx               # 主应用
│   └── index.css             # Tailwind + 设计令牌
├── index.html
├── package.json
├── tailwind.config.js
└── vite.config.js
```

---

## 最近更新

- **v1.2.16**：设置页重新排序：「数据管理」置顶，「更新日志 / 新功能」置底，其余顺序保持不变
- **v1.2.15**：修复 UI 创建/更新物品后新位置/新分类未自动同步的问题；AI 视觉识别配置支持多供应商，可同时保存多个 Base URL、API Key、模型并选择当前使用供应商
- **v1.2.14**：修复 Agent 接口创建/更新物品后位置与分类仍未同步的问题；位置解析支持多种分隔符并自动去空格；物品写入与分类/位置同步放在同一事务中；分类显示名优先保留原始中文
- **v1.2.13**：修复 Agent 外部接口创建/更新物品时分类和位置未同步的问题；设置新增「重建分类与位置」按钮
- **v1.2.12**：平面图编辑器属性面板重做：实景图置顶并按原比例完整显示；面板宽度默认 480px 且支持拖拽调节；属性与图层改为标签页，图层列表独立展示
- **v1.2.11**：恢复默认打开主物品列表页；生产构建不再自动打开 DevTools；修复平面图编辑器选中子区域时 'LayerBtn is not defined' 报错
- **v1.2.10**：修复平面图编辑器点击子区域方块时因绑定位置被删除导致的报错；为所有 bindLocationId 查找与跳转增加空值防御；已删除位置显示「已删除位置」提示
- **v1.2.9**：修复位置地图及进入平面图编辑器时可能出现的白屏问题；为位置地图增加错误边界、数据加载与空值防御；优化右侧抽屉动画避免布局异常；补全平面图编辑器的 i18n 文案
- **v1.2.8**：软件内更新支持取消下载、下载前选择目录、下载完成提示路径
- **v1.2.7**：版本号升级用于测试更新流程
- **v1.2.6**：AI 自动获取模型列表、电子材料库大图展示、修复返回白屏与更新检查逻辑
- **v1.2.5**：新增 AI 视觉识别、外部 Agent /api/ai/recognize 接口
- **v1.2.4**：托盘单实例启动、平面图图层遮盖与实景图、AI 视觉识别后端预置
- **v1.2.3**：手机扫码传图压缩优化、平面图编辑器交互修复
- **v1.2.2**：二维码服务修复、表单 Ctrl+V 粘贴图片、电子材料库大图查看
- **v1.2.1**：frameless 无边框窗口、Agent 接口同步、电子材料库批量编辑
- **v1.2.0**：电子材料库、位置地图、手机扫码传图、外部 Agent API、软件内更新

---

## License

[MIT](./LICENSE)
