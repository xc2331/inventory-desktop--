# To-Do List — Family Inventory Desktop

> 更新日期：2026-08-21

## P0 — 必修复（白屏/崩溃/数据丢失）

- [x] AI 视觉 API 配置点击保存白屏：`migrateAIConfig is not defined`，`electron/main.js` 缺少 `require('./ai-service')`（v1.3.6 已修复）
- [x] Toast 消息覆盖问题（v1.3.3）
- [x] 物品图片上传后不显示 + AI 识别报错 `t is not defined`：`ItemCard.jsx`/`ItemForm.jsx` 调用 `window.api.photo.url()`，但 preload 仅暴露 `window.lingguang`，改为统一走 `window.lingguang` + preload 新增同步 `photo.url()` 实现（v1.5.3）
- [x] 物品图片通过「浏览」入口上传后保存再加载仍不显示：根因是 base64 直接写入 SQLite TEXT 列可能截断；`handleBrowse` 改为 `photo:saveFile` 直接从文件路径复制到 `dataDir/photos/`，仅存相对路径（v1.5.5）
- [x] AI 识别白屏 `ReferenceError: t is not defined`：`FieldOption` 子组件内裸调用 `t()`，改为 `applyLabel` 属性透传（v1.5.4/v1.5.5）
- [x] 编辑/新增物品页面入场动画过平淡（v1.5.3，新增遮罩渐显 + 表单底部滑入 + 首尾 stagger）
- [x] AI 识别逐字段应用：每条建议独立「应用」按钮，不再一键合并全部字段（v1.5.7）
- [x] ItemCard photoUrl TDZ 白屏：const 声明顺序导致 render 阶段访问未初始化的变量（v1.5.7）
- [x] 图片不显示（QR 扫码/粘贴/浏览/拖拽全入口）：`photo.url()` 文件未找到时返回空字符串，跳过 IPC 兜底；改为返回相对路径触发 `<img onError>` 后走 `readPhoto` IPC 兜底，同时增加详细调试日志（v1.5.8）

## P1 — UX 体验（按顺序）

- [x] **UX-01** 物品卡片悬停/选中状态反馈（v1.3.7）
- [x] **UX-02** 拖拽排序手感优化（预览 + snap）（v1.3.8）
- [x] **UX-03** 加载骨架屏（Skeleton）替换 loading 文字（v1.3.9）
- [x] **UX-04** 空状态插画 + 引导 CTA（v1.3.10）
- [x] **UX-05** 表单校验即时反馈（v1.3.11）
- [x] **UX-06** 批量操作面板拖拽排序（v1.3.12）
- [x] **UX-07** 搜索结果关键词高亮（v1.3.13）
- [x] **UX-08** 分类/位置树展开/收起动画（v1.3.14）
- [x] **UX-09** Toast 通知点击定位到对应条目（v1.3.15）
- [x] **UX-10** 图片预览双击放大 + 滚轮缩放（v1.3.16）
- [x] **UX-11** 过期预警列表（按紧迫度排序）
- [x] **UX-12** 统计图表切换动效
- [x] **UX-13** 侧栏展开/收起平滑过渡（v1.4.10 / v1.5.0）
- [x] **UX-14** 分类创建/编辑表单分组交互（v1.4.10 / v1.5.0）
- [x] **UX-15** 主表格斑马纹 + 行悬停高亮（v1.4.11 / v1.5.0）
- [x] **UX-16** 编辑面板抽屉动画（左滑入/右滑出）→ 用户反馈撤回，恢复全屏淡入淡出（v1.4.12 / v1.5.0）
- [x] **UX-17** 图片上传进度指示器：粘贴/浏览/扫码/AI 识别四入口，单张 10%→100%，批量拖拽多张分步（v1.4.13 / v1.5.0）
- [x] **UX-18** 拖拽上传支持多张图片（已有批量拖拽进度；单张上传 UX-18 用户不需要）
- [x] **UX-19** Toast 通知点击关闭 + 倒计时进度条（v1.3.3）
- [x] **UX-20** 深色模式下对比度增强（v1.5.2）

## P2 — 安全/数据

- [x] 批量编辑时 XSS 防护（`innerHTML` 注入点扫描，天然干净无需改动）
- [x] 导出 JSON 防文件名特殊字符导致崩溃（v1.5.1，`sanitizeFilename`）
- [x] 数据库文件损坏时启动自动备份 + 提示恢复（v1.5.2）
- [ ] 敏感字段（AI API Key）存储加密而非明文 localStorage
- [ ] 大文件图片上传前自动压缩（当前仅拍照时压缩）

## P3 — 架构

- [ ] 重构为模块化架构：`src/pages/*`, `src/features/*`, `src/core/*`
- [ ] 引入 Zustand 或 Redux Toolkit 替代全局 Context 嵌套
- [ ] SQL 查询统一走 `db/query.js` 单入口（目前散落在多处）
- [ ] 测试：Vitest 单元 + Playwright E2E（至少覆盖 CRUD + 搜索 + 批量编辑）
- [ ] 更新日志自动生成（git tag → 脚本 → release notes）

## 完成清单

### 本次会话已修复

1. **P0**: AI 视觉 API 配置保存白屏 → 补 `main.js` 导入 `ai-service` 模块
2. **P0**: Toast 队列化（最多 3 条不覆盖）
3. **UX-01** 物品卡片交互反馈：悬停 + 点击 + 键盘焦点 + 选中环
4. **UX-02** 卡片拖拽预览：缩放/旋转/阴影 + 松手弹簧回弹
5. **UX-03** 加载骨架屏：SkeletonCard 组件 + shimmer 流光
6. **UX-04** 空状态插画：EmptyState 入场动画 + 装饰光晕 + CTA 弹性交互
7. **UX-05** 表单校验：blur 触发 + 错误提示弹性 + 字段抖动 + 边框高亮
8. **UX-06** 批量面板拖拽排序：Reorder.Group 水平拖拽预览 + 最多 8 张卡片
9. **UX-07** 搜索结果高亮：材料库标题/正文 `<mark>` 黄色高亮
10. **UX-08** 位置树动画：ease-out 曲线 + staggered 子项入场
11. **UX-09** Toast 点击定位：保存后 Toast 点击 → 滚动到对应卡片 + 高亮 1.4s
12. **UX-10** 图片预览缩放：双击缩放循环 + 滚轮缩放 + 键盘平移 + 触屏捏合
13. **P0** 图片不显示（QR 扫码/粘贴/浏览/拖拽）：`photo.url()` 文件未找到时返回空字符串，跳过 IPC 兜底；改为返回相对路径触发 `<img onError>` 后走 `readPhoto` IPC 兜底，同时增加详细 `console.warn` 调试日志（v1.5.8）
14. **P0** `make-update-info.js` 版本号匹配：只匹配 `v${version}` 导致 `update-info.json` 默认说明，改为同时匹配 `${version}` 和 `v${version}`（v1.5.8）

### v1.4.x 批次

13. **UX-11** 过期预警列表：按紧迫度分级（critical / urgent / warning）+ 三种排序
14. **UX-12** 统计图表动效：柱状/饼图渐变填充入场
15. **UX-13** 侧栏平滑过渡：`AnimatePresence` staggered + spring 宽度动画 + 收起箭头指示器
16. **UX-14** 分类表单分组：基本信息 + 标识配置两组，逐字段入场 stagger
17. **UX-15** 斑马纹 + 悬停高亮：`idx % 2` 条件类名 + `bg-primary-soft/30`
18. **UX-16** 编辑面板抽屉动画：右侧滑入 `initial={{ x: '100%' }}` → `animate={{ x: 0 }}`
19. **UX-17** 图片上传进度指示器：粘贴/浏览/扫码三个入口接入 `uploadProgress` 模拟
20. **BUG-FIX** `dark is not defined`：`applyThemeClass` 局部变量被引用，改为 App 组件 `useMemo` 预计算
21. **BUG-FIX** 侧栏展开底部按钮无响应：移除 `drag-region`，加 `w-full` 占满宽度
22. **BUG-FIX** 「回到全部」位置：统一到左上角 `ArrowLeft`，与材料库/位置地图/统计/设置风格一致

### 版本策略说明

- 「满9进1」：1.3.0~1.3.9 后 → 1.4.0；1.4.0~1.4.9 后 → 1.5.0；1.5.0~1.5.9 后 → 1.6.0
- 当前版本：**1.5.8**（构建完成，exe 74.8MB 已复制到项目根目录）
- 构建输出目录：`release-v19-v169`
