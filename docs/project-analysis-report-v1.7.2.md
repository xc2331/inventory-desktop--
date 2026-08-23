# 项目分析报告（v1.7.2 → v1.7.3）：家庭物资管家

> 分析日期：2026-08-22 · 基线：v1.7.2（本轮全量重读：ItemForm/MaterialLibrary/FloorPlanEditor/SettingsView/StatisticsView 等此前未通读文件 + 全项目模式扫描）
> 结论：v1.7.2 已清掉历史 P0/P1；本轮发现 **1 个隐私泄露级问题、3 个正确性 bug**，并启动此前约定的位置数据模型改造（location_id 外键化）。

---

## 一、新发现问题

### 🔴 P0-1：QR 二维码经第三方服务生成 —— 上传地址+Token 外泄
**位置**：`ItemForm.jsx:799`、`FloorPlanEditor.jsx:1361`、`MaterialLibrary.jsx:1873`

三处均使用 `https://api.qrserver.com/v1/create-qr-code/?data=<url>` 生成二维码。`data` 参数是完整上传地址（`http://<局域网IP>:<端口>?token=<一次性token>`）——**每次扫码传图都会把内网拓扑和 token 发给该第三方服务**。token 虽是一次性，但泄露内网 IP/端口本身即为隐私问题，且该服务不可用时二维码直接挂。
**修复**：引入 `qrcode` 库在本地离线生成（dataURL），三处统一走 `lib/qr.js` 助手。

### 🟠 P1-2：ItemForm 位置必填校验用错分类 key —— 规则完全失效
**位置**：`ItemForm.jsx:104-105, 483-486`

校验列表为 `household / kitchen / tools / cleaning / supplies / food / medicine`。其中 `household`、`supplies` 在默认分类中**不存在**，`medicine` 实际是 `medical`。结果：「可库存类目必须填位置」的规则对真实分类（食品/医药/日用品等）**从不触发**，属于死代码+错拼双 bug。
**修复**：抽出 `STOCK_CATEGORIES` 常量（含正确的 medical 等全部默认可库存 key），校验与提交共用。

### 🟠 P1-3：`singleProgressRef` 误用普通对象 —— 进度条卡死 / 定时器泄漏
**位置**：`ItemForm.jsx:140`

`const singleProgressRef = { current: 0, timer: null, done: false }` 每次渲染重建；粘贴监听闭包捕获首次渲染的旧对象，后续 `clearInterval` 清的是新对象的空句柄 → 上传进度可能卡在 90%、interval 持续跑。
**修复**：改 `useRef`。

### 🟠 P1-4：多图存储后无法显示
**位置**：`ItemForm.jsx:315`（多图拖拽以 `\n` 拼接存入 photo）vs `ItemCard`/`Lightbox`（单 `<img src>`）

多选拖拽的照片拼接存储后，卡片与灯箱把整串当单路径渲染 → 坏图。半成品功能。
**修复**（最小）：渲染取 `\n` 第一张为封面 + 右下角 `+N` 徽章；灯箱展示首张。完整画廊留待后续。

### 🟡 P2-5：位置数据模型（此前约定启动）
`items` 仍以 `room/position/location` 三个字符串与位置树做名字匹配双向同步：同名节点重命名互相误伤、五处字符串手术逻辑并存。
**修复**：`items.location_id` 外键化 + `services/locations.js` 收敛 rename/delete 级联 + 一次性回填 + 导入后自动回填。字符串三字段降级为可重算缓存（UI/导出/Agent API 零变化）。

## 二、体验改进（本轮实施）

| # | 项 | 说明 |
|---|---|---|
| U-1 | ItemForm 位置区重排 | 树选择器为主；三个手动输入折叠进「手动输入」高级区；树为空/无匹配时可**就地新建位置**（从源头减少格式混乱输入） |
| U-2 | 搜索无结果 → 新建预填 | 空态加「新建《关键词》」按钮，名称自动填入搜索词 |
| U-3 | 重置手动排序 | 设置-数据管理区新增按钮（`UPDATE items SET sort_order=0`，进 SQL 白名单+测试） |
| U-4 | ItemForm 脏状态确认 | 有改动时 Esc/关闭弹确认，防误触丢输入 |
| U-5 | EmptyState 漂浮动画 CSS 化 | 移除 framer-motion `repeat:Infinity`，纳入「关闭动画」开关管控 |

## 三、复核确认无恙的项（易误报）

- FloorPlanEditor 的 `.then` 链均有 catch（此前 grep 误报）；加载失败有兜底默认平面图
- SettingsView 的 AI API Key 输入已做 password 掩码 + 显隐切换
- 图表 `key={i}` 用于静态 Cell 列表，无重排风险
- StatisticsView/预热/通知轮询已全部走轻量查询（v1.7.2 成果保持）

## 四、v1.7.3 实施清单

A. QR 本地离线生成（P0-1，三处）→ B. 分类校验 key 修正（P1-2）→ C. useRef 修复（P1-3）→ D. 多图封面+徽章（P1-4）→ E. location_id 外键化（P2-5）→ F-J. U-1~U-5 → 版本 1.7.3 + 文档 + 测试 + 构建 + 打包
