# 家庭物资管家 · Agent 技能文件

> Family Inventory Agent Skill —— 让 AI Agent 通过本地 HTTP API 用自然语言管理家庭物品

本文件是「家庭物资管家」桌面应用的 Agent 技能说明。加载本文件后，AI Agent（如 Trae、Claude、ChatGPT 等）即可理解如何调用本应用的本地 HTTP API，把用户的自然语言指令翻译成对应的接口请求，完成物品的查询、新增、修改、删除等操作。

---

## 一、应用概述

「家庭物资管家」（Family Inventory）是一个基于 Electron 的本地桌面应用，用于管理家庭物品库存。所有数据存储在本地 SQLite 数据库中，离线可用，不依赖云端。

应用启动后会同时在本地启动一个 HTTP 服务，供外部 Agent / 脚本管理物品数据。Agent 可以通过这套 API 帮助用户：

- 查询家里某个位置（冰箱、厨房、储物间）有哪些物品
- 添加新购买的物品并记录数量、位置、过期日期
- 修改物品数量（例如用掉了几盒牛奶后更新库存）
- 删除已过期或不再需要的物品
- 查看分类、位置列表，了解库存全貌
- 提醒即将过期的物品

---

## 二、如何连接

### 基本信息

| 项目 | 值 |
| --- | --- |
| Base URL | `http://127.0.0.1:3001` |
| 鉴权方式 | Bearer Token |
| 鉴权头 | `Authorization: Bearer <your-token>` |
| 请求体格式 | `application/json` |
| 返回格式 | `application/json; charset=utf-8` |
| 绑定地址 | 仅 `127.0.0.1`（本机回环，不对外暴露） |

### 获取 Token

1. 打开「家庭物资管家」桌面应用
2. 进入「设置 → 外部 Agent 接口」
3. 复制显示的访问 Token（如需更换可点击「刷新」，刷新后旧 Token 立即失效）

### 通用请求头

所有接口都要求携带鉴权头，否则返回 `401 Unauthorized`：

```http
Authorization: Bearer <your-token>
Content-Type: application/json
```

### 连通性测试

```http
GET /api/status
```

返回示例：

```json
{
  "app": "Family Inventory Agent API",
  "version": "1.0.0",
  "dbPath": "C:/Users/xxx/AppData/Roaming/Family Inventory/inventory.db",
  "dataDir": "C:/Users/xxx/AppData/Roaming/Family Inventory",
  "timestamp": 1700000000000
}
```

> Agent 首次接入时建议先调用 `/api/status` 确认应用已启动且 Token 正确。

---

## 三、完整 API 参考

### 1. 状态检查

```http
GET /api/status
```

返回当前数据库路径、数据目录、时间戳等基本信息。无需请求体。

**响应** `200`：

```json
{
  "app": "Family Inventory Agent API",
  "version": "1.0.0",
  "dbPath": "...",
  "dataDir": "...",
  "timestamp": 1700000000000
}
```

### 2. 物品列表

```http
GET /api/items?keyword=牛奶&category=beverage
```

**查询参数**（均可选）：

| 参数 | 说明 |
| --- | --- |
| `keyword` | 按名称 / 编号 / 房间 / 位置 / 详细位置模糊搜索 |
| `category` | 按分类 key 过滤（见分类对照表） |

不带任何参数时返回全部物品，按 `updatedAt` 倒序排列。

**响应** `200`：

```json
{
  "items": [
    {
      "id": "uuid-xxx",
      "name": "纯牛奶",
      "itemNo": "WP-20260101-001",
      "room": "厨房",
      "position": "冰箱",
      "location": "厨房 > 冰箱 > 冷藏室",
      "quantity": 6,
      "minQuantity": 2,
      "photo": "",
      "category": "beverage",
      "expiryDate": 1756464000000,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-02T00:00:00.000Z"
    }
  ]
}
```

### 3. 获取单个物品（支持模糊搜索）

```http
GET /api/items/<id 或 名称 或 编号>
```

匹配逻辑：

1. 优先按 `id` 精确匹配，命中则返回 `{ "item": {...} }`
2. 未命中则按名称 / 编号模糊搜索，返回候选列表 `{ "query": "...", "candidates": [...] }`（最多 20 条）

**精确命中响应** `200`：

```json
{
  "item": {
    "id": "uuid-xxx",
    "name": "纯牛奶",
    "quantity": 6
  }
}
```

**模糊搜索响应** `200`：

```json
{
  "query": "牛奶",
  "candidates": [
    { "id": "uuid-1", "name": "纯牛奶", "quantity": 6 },
    { "id": "uuid-2", "name": "酸奶", "quantity": 3 }
  ]
}
```

> 当用户用名称指代物品时，Agent 应先调用本接口获取候选列表，再从中选取目标 `id` 进行后续操作。

### 4. 创建物品

```http
POST /api/items
Content-Type: application/json

{
  "name": "纯牛奶",
  "quantity": 6,
  "minQuantity": 2,
  "category": "beverage",
  "room": "厨房",
  "position": "冰箱",
  "location": "厨房 > 冰箱 > 冷藏室",
  "photo": "",
  "expiryDate": 1756464000000
}
```

**请求字段**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 物品名称 |
| `quantity` | number | 否 | 数量，默认 0 |
| `minQuantity` | number | 否 | 最低库存，默认 0 |
| `category` | string | 否 | 分类 key（会被自动归一化，见分类对照表） |
| `room` | string | 否 | 房间 |
| `position` | string | 否 | 位置（如冰箱、橱柜） |
| `location` | string | 否 | 详细位置 |
| `photo` | string | 否 | 图片路径 / URL |
| `expiryDate` | number | 否 | 过期时间（毫秒时间戳） |
| `itemNo` | string | 否 | 编号，**留空时自动生成 `WP-YYYYMMDD-NNN`** |
| `id` | string | 否 | 自定义 ID，不传则自动生成 UUID |

**响应** `201`：

```json
{
  "item": {
    "id": "uuid-xxx",
    "name": "纯牛奶",
    "itemNo": "WP-20260730-001",
    "quantity": 6,
    "category": "beverage",
    "room": "厨房",
    "position": "冰箱",
    "expiryDate": 1756464000000,
    "createdAt": "2026-07-30T00:00:00.000Z",
    "updatedAt": "2026-07-30T00:00:00.000Z"
  }
}
```

**错误响应** `400`（缺少 name）：

```json
{ "error": "Bad request", "message": "name is required" }
```

### 5. 更新物品

```http
PATCH /api/items/<id>
Content-Type: application/json

{
  "quantity": 4,
  "location": "厨房 > 冰箱 > 冷藏室"
}
```

只需传入要修改的字段，未传入的字段保持不变。支持的字段与创建接口一致（`name`、`itemNo`、`room`、`position`、`location`、`quantity`、`minQuantity`、`photo`、`category`、`expiryDate`）。

**响应** `200`：返回更新后的完整物品对象 `{ "item": {...} }`。

**错误响应** `404`（id 不存在）：

```json
{ "error": "Not found" }
```

### 6. 删除物品

```http
DELETE /api/items/<id>
```

**响应** `200`：

```json
{ "deleted": 1 }
```

`deleted` 为实际删除的行数，`0` 表示该 id 不存在。

### 7. 分类列表

```http
GET /api/categories
```

**响应** `200`：

```json
{
  "categories": [
    { "key": "food", "name": "食品", "sort_order": 0 },
    { "key": "beverage", "name": "饮料", "sort_order": 1 }
  ]
}
```

### 8. 位置列表

```http
GET /api/locations
```

**响应** `200`：

```json
{
  "locations": [
    { "id": "...", "name": "冰箱", "sort_order": 0 }
  ]
}
```

### 9. 设置信息

```http
GET /api/settings
```

**响应** `200`：

```json
{
  "language": "zh",
  "theme": "light",
  "dataDir": "C:/Users/xxx/AppData/Roaming/Family Inventory",
  "defaultDataDir": "C:/Users/xxx/AppData/Roaming/Family Inventory"
}
```

---

## 四、物品对象字段说明

所有返回的物品对象（`item` / `items` 数组元素）字段如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 物品唯一 ID（UUID） |
| `name` | string | 名称 |
| `itemNo` | string | 编号，留空时自动生成 `WP-YYYYMMDD-NNN` |
| `room` | string | 房间（如「厨房」「客厅」） |
| `position` | string | 位置（如「冰箱」「橱柜」） |
| `location` | string | 详细位置 |
| `quantity` | number | 当前数量 |
| `minQuantity` | number | 最低库存，低于此值应用会提示「库存不足」 |
| `photo` | string | 图片路径 / URL |
| `category` | string | 分类 key（归一化后） |
| `expiryDate` | number | 过期时间（**毫秒级 Unix 时间戳**，0 表示未设置） |
| `createdAt` | string | 创建时间（ISO 8601 字符串） |
| `updatedAt` | string | 更新时间（ISO 8601 字符串） |

> 注意：`expiryDate` 在物品对象中以**毫秒时间戳**形式返回，判断是否过期可用 `expiryDate < Date.now()`。

---

## 五、分类 key 对照表

应用内置分类归一化机制，传入中文别名或常见英文变体都会自动映射到规范 key。Agent 在创建 /更新物品时应优先使用下表的 `key`。

| key（规范值） | 中文名 | 常见别名（会被自动归一化） |
| --- | --- | --- |
| `electronic` | 电子产品 | electronics、电子、电子产品、電子、電子產品 |
| `food` | 食品 | foods、食品、食物 |
| `beverage` | 饮料 | beverages、饮料、飲料、drink、drinks |
| `daily` | 日用品 | dailies、日用品、daily necessities |
| `kitchen` | 厨房用品 | kitchens、厨房用品、廚房用品、kitchenware |
| `cleaning` | 清洁用品 | cleanings、清洁用品、清潔用品、cleaning supplies |
| `medical` | 医药 | medicals、医药、醫藥、medicine、medicines、drug、drugs |
| `stationery` | 文具 | stationeries、文具、office supplies |
| `tools` | 工具 | tool、工具、hand tools、power tools |
| `other` | 其他 | others、其他、其它、misc、miscellaneous |

**归一化示例**：

- 传入 `"tool"` → 自动归一化为 `"tools"`
- 传入 `"工具"` → 自动归一化为 `"tools"`
- 传入 `"食品"` → 自动归一化为 `"food"`

> 启动时应用还会自动合并 `tool` / `tools` 等重复分类，保证数据一致。

---

## 六、自然语言 → API 映射示例

下面给出 8 个以上典型场景，展示如何把用户的自然语言指令翻译成 API 调用。所有请求均需携带 `Authorization: Bearer <token>` 头。

### 场景 1：查询某位置的物品

- 用户：「帮我看看冰箱里还有什么」
- Agent 调用：

```http
GET /api/items?keyword=冰箱
```

- Agent 回复：根据返回的 `items` 总结冰箱中的物品清单、数量与过期情况。

### 场景 2：添加物品

- 用户：「添加一箱牛奶到厨房冰箱，6 盒」
- Agent 调用：

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

- Agent 回复：确认已添加，并可告知自动生成的编号 `itemNo`。

### 场景 3：修改数量（先查后改）

- 用户：「把牛奶的数量改成 4」
- Agent 第一步，定位物品：

```http
GET /api/items/牛奶
```

- Agent 第二步，从 `candidates` 中选中目标 `id`，更新数量：

```http
PATCH /api/items/<id>
Content-Type: application/json

{ "quantity": 4 }
```

- Agent 回复：确认数量已更新为 4。

### 场景 4：删除过期物品（先查后删）

- 用户：「删除那个过期的面包」
- Agent 第一步，搜索「面包」：

```http
GET /api/items/面包
```

- Agent 第二步，从 `candidates` 中筛选 `expiryDate` 已过期的项，删除对应 `id`：

```http
DELETE /api/items/<id>
```

- Agent 回复：确认已删除过期面包。

### 场景 5：查询即将过期的物品

- 用户：「厨房里有哪些快过期的东西」
- Agent 调用：

```http
GET /api/items?keyword=厨房
```

- Agent 处理：根据返回物品的 `expiryDate`，筛选 7 天内即将过期或已过期的物品。
- Agent 回复：列出即将过期的物品并提醒用户尽快使用。

### 场景 6：查看分类

- 用户：「帮我看看有哪些分类」
- Agent 调用：

```http
GET /api/categories
```

- Agent 回复：列出所有分类的中文名与 key。

### 场景 7：按分类批量查询

- 用户：「家里还有多少饮料」
- Agent 调用：

```http
GET /api/items?category=beverage
```

- Agent 处理：汇总 `items` 中各饮料的数量。
- Agent 回复：报告饮料库存总量与明细。

### 场景 8：补充库存

- 用户：「又买了 12 个鸡蛋，帮我加上去」
- Agent 第一步，查找现有鸡蛋：

```http
GET /api/items/鸡蛋
```

- Agent 第二步，若已有鸡蛋则累加数量：

```http
PATCH /api/items/<id>
Content-Type: application/json

{ "quantity": <原数量 + 12> }
```

- 若不存在则新建：

```http
POST /api/items
Content-Type: application/json

{ "name": "鸡蛋", "quantity": 12, "category": "food", "room": "厨房", "position": "冰箱" }
```

### 场景 9：设置过期日期

- 用户：「那盒牛奶下周三过期，帮我记一下」
- Agent 第一步，定位牛奶：

```http
GET /api/items/牛奶
```

- Agent 第二步，把「下周三」换算成毫秒时间戳，更新过期日期：

```http
PATCH /api/items/<id>
Content-Type: application/json

{ "expiryDate": 1756464000000 }
```

### 场景 10：低库存提醒

- 用户：「哪些东西快用完了」
- Agent 调用：

```http
GET /api/items
```

- Agent 处理：遍历全部物品，筛选 `quantity <= minQuantity`（且 `minQuantity > 0`）的物品。
- Agent 回复：列出库存不足的物品及建议补充数量。

---

## 七、多步操作技巧

很多自然语言指令需要「先查后改 / 先查后删」，因为用户通常用名称指代物品，而修改 / 删除接口需要 `id`。推荐流程：

### 搜索后更新

```
1. GET /api/items/<名称>          → 拿到 candidates 列表
2. 从 candidates 中选取目标 item 的 id
3. PATCH /api/items/<id>          → 传入要修改的字段
```

### 搜索后删除

```
1. GET /api/items/<名称>          → 拿到 candidates 列表
2. 从 candidates 中选取目标 item 的 id（可结合 expiryDate 等字段判断）
3. DELETE /api/items/<id>         → 删除
```

### 搜索后补货（累加数量）

```
1. GET /api/items/<名称>          → 查看是否已存在
2a. 若存在：PATCH /api/items/<id>  { "quantity": 原数量 + 新增数量 }
2b. 若不存在：POST /api/items      { "name": "...", "quantity": 新增数量, ... }
```

**注意事项**：

- 当 `candidates` 返回多条记录时，Agent 应向用户确认要操作哪一条，或根据上下文（如「过期的」「冰箱里的」）自动筛选。
- 若 `candidates` 为空，说明物品不存在，应提示用户或改用 `POST` 创建。
- 修改数量时若想做「累加」，需要先读出原 `quantity` 再计算新值，接口本身不支持相对增量。

---

## 八、错误处理指南

### 常见错误码

| HTTP 状态码 | 含义 | 处理建议 |
| --- | --- | --- |
| `200` | 成功 | 正常处理返回数据 |
| `201` | 创建成功 | 仅 `POST /api/items` 返回 |
| `400` | 请求参数错误 | 通常是缺少 `name`，检查请求体 |
| `401` | 未授权 | 检查 Token 是否正确、是否携带 `Authorization` 头 |
| `404` | 资源不存在 | `PATCH` 时 id 不存在；检查 id 是否正确 |
| `500` | 服务器内部错误 | 查看返回的 `message`，可能是数据库异常 |

### 典型错误响应

**401 未授权**：

```json
{ "error": "Unauthorized", "message": "请在请求头中提供 Authorization: Bearer <token>" }
```

**400 参数错误**：

```json
{ "error": "Bad request", "message": "name is required" }
```

**404 未找到**：

```json
{ "error": "Not found" }
```

**500 内部错误**：

```json
{ "error": "Internal error", "message": "错误详情" }
```

### Agent 处理建议

1. **连接失败 / 超时**：应用可能未启动，提示用户打开「家庭物资管家」桌面应用。
2. **401**：Token 错误或已失效，提示用户到「设置 → 外部 Agent 接口」重新复制或刷新 Token。
3. **404（PATCH/DELETE）**：id 不存在，可能是用户指代的物品已被删除；建议重新搜索确认。
4. **模糊搜索返回空 candidates**：物品不存在，可询问用户是否需要新建。
5. **创建时 400**：检查是否遗漏了必填的 `name` 字段。

---

## 九、重要说明

### 1. 时间戳格式

- `expiryDate`：**毫秒级** Unix 时间戳（如 `1756464000000`）。
- `createdAt` / `updatedAt`：ISO 8601 字符串（如 `"2026-07-30T00:00:00.000Z"`）。

Agent 在处理「下周三」「三个月后」等相对时间时，需先换算成毫秒时间戳再传入 `expiryDate`。

### 2. 安全性

- 所有接口均需 Bearer Token 鉴权。
- Token 存储在 `%APPDATA%/Family Inventory/settings.json`，请勿泄露。
- 数据库写操作使用参数化查询，防止 SQL 注入。

### 3. 速率与并发

本服务为单进程本地 HTTP 服务，数据库操作串行执行。Agent 无需做复杂并发控制，但应避免短时间内发起大量重复请求。批量操作建议逐条调用并检查返回值。

---

## 十、快速上手清单

Agent 接入时可按以下步骤自检：

1. `GET /api/status` —— 确认应用已启动、Token 有效
2. `GET /api/categories` —— 获取分类列表，了解可用分类
3. `GET /api/items` —— 获取全部物品，了解当前库存
4. 尝试一个 `POST /api/items` 创建测试物品
5. 用 `PATCH` / `DELETE` 修改或删除测试物品

通过自检后，即可开始响应用户的自然语言指令。

---

*本技能文件对应「家庭物资管家」桌面版，接口实现见 `electron/api-server.js`，详细接口文档见 `docs/agent-api.md`。*
