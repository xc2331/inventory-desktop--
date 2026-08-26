# Family Inventory Agent API

> 当前文档对应版本：**v1.7.9**（2026-08-26）。

软件启动后会在本地回环地址 `127.0.0.1:3001` 启动一个 HTTP 服务，供外部 Agent / 脚本管理物品数据。

## 鉴权

所有接口都需要在请求头中携带 Token：

```http
Authorization: Bearer <your-token>
```

Token 可在「设置 → 外部 Agent 接口」中查看、复制或刷新。比较采用常量时间算法（无计时侧信道）。

**请求体限制**：POST/PATCH 请求体上限 **25MB**，超限请求失败（`message: "payload too large"`）。

## 接口列表

### 状态检查

```http
GET /api/status
```

返回当前数据库路径、数据目录等基本信息。

**v1.7.5+** 响应新增 `health` 字段（数据库健康检查）：

```json
{
  "app": "Family Inventory Agent API",
  "version": "1.8.0",
  "dbPath": "...",
  "dataDir": "...",
  "timestamp": 1234567890000,
  "health": {
    "ok": true,
    "integrity": "ok",
    "items": 123,
    "materials": 45,
    "locations": 31,
    "categories": 14,
    "indexes": [
      "idx_items_created_at",
      "idx_items_expiry_date",
      "idx_materials_event_end",
      "idx_materials_event_start",
      "idx_materials_updated_at",
      "..."
    ],
    "message": "数据库健康（items=123, materials=45, locations=31, categories=14）"
  }
}
```

- `ok: false` 时 `integrity` 字段会写具体异常（`PRAGMA integrity_check` 返回值）
- `indexes` 数组（v1.7.8+）列出所有 `sqlite_master` 里的用户索引名（自动排除 `sqlite_%` 内部索引）。Agent 校验"日期范围索引是否建好"时直接读这个数组即可，无需自己跑 `EXPLAIN`。
- Agent 启动时建议先 `GET /api/status` 探活，确认 `health.ok === true`

### 物品列表

```http
GET /api/items?keyword=牛奶&category=food
```

支持查询参数：
- `keyword`：按名称/编号/位置/标签/OCR 文字做 FTS5 全文搜索（v1.8.0+；零命中回退 LIKE）。多个关键字按空格分词为 `term*` 前缀通配符组合，例如 `发票 保单` 等价于 `发票* AND 保单*`。
- `category`：按分类 key 过滤
- `includePhoto=true`：响应中的每个物品附带完整 `photo` 字段（默认只返回 `hasPhoto` 布尔值，避免 base64 撑爆 Agent 上下文）

列表按 `updatedAt` 倒序返回。注意：用户在界面里手动拖拽的自定义排序**不影响** Agent 接口的返回顺序。

#### v1.7.8+ 列表分页

物品 / 材料 / 分类 / 位置 四个列表端点都支持分页查询参数：

- `page`：从 1 开始的页码，默认 `1`（不传时不分页）
- `limit`：每页条数，默认 `100`，上限 `500`（防单请求爆内存）

**不传 `page` / `limit` 时**：保持 v1.7.7 之前的行为，响应体**只**包含列表字段（不返回 `pagination`），老 Agent 代码无感。

**传了任一参数时**：响应体多一个 `pagination` 字段：

```json
{
  "items": [{ "id": "..." }, { "id": "..." }],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1234,
    "totalPages": 25,
    "hasMore": true
  }
}
```

适用端点：

| 端点 | 列表字段 | 关键过滤参数 |
|---|---|---|
| `GET /api/items` | `items` | `keyword`, `category` |
| `GET /api/materials` | `materials` | `type`, `keyword`, `tag`, `startDate`, `endDate` |
| `GET /api/categories` | `categories` | （无过滤） |
| `GET /api/locations` | `locations` | （无过滤） |

**最佳实践**：Agent 一次性拉全表前先读 `/api/status` 的 `health.items` / `health.materials` 知道总数，再决定要不要分页拉。`total > 500` 时建议按页拉，避免单次响应体过大。

### 获取单个物品（支持模糊搜索）

```http
GET /api/items/<id>
GET /api/items/牛奶
GET /api/items/<id>?includePhoto=true   # 附带完整图片
```

优先按 `id` 精确匹配；若未命中，则按名称或编号模糊搜索，返回候选列表：

```json
{
  "query": "牛奶",
  "candidates": [{...}, {...}]
}
```

### 获取物品图片

```http
GET /api/items/<id>/photo
```

返回 `{ "id": "...", "photo": "data:image/webp;base64,..." }`（或空串）。列表/详情默认不带图片，需要看图时按需调用本接口。

### 创建物品

```http
POST /api/items
Content-Type: application/json

{
  "name": "纯牛奶",
  "quantity": 6,
  "category": "beverage",
  "location": "厨房 > 冰箱 > 冷藏室",
  "expiryDate": 1756464000000
}
```

字段说明：
- `name`（必填）
- `quantity`：数量，默认 0。**负数会被自动截断为 0**（v1.7+）
- `minQuantity`：最低库存，同样非负截断
- `category`：分类 key，支持中文别名（如 `"食品"` 会自动归一化为 `food`）；未匹配到现有分类时保留原值并自动创建该分类
- `location`：**推荐**。层级位置，使用 `>` 分隔（也支持 `/`、`→`），例如 `"厨房 > 冰箱 > 冷藏室"`。系统会自动把每一层同步到位置树。
- `room` / `position`：当没有 `location` 时使用，组合成两层位置。
- `photo`：图片路径/URL/data URL
- `expiryDate`：过期时间毫秒时间戳
- `notes`：备注（v1.7+ 创建/更新均支持）
- `consumeRate` / `consume_unit` 等消耗追踪字段：使用数据库原字段名（`consume_rate`、`consume_unit`、`consume_start_at`，下划线形式）
- `createdAt` / `updatedAt`：创建时若传入毫秒时间戳则原样保留（v1.7+，用于数据恢复/迁移场景）；不传则取当前时间

创建/更新成功后，响应体包含 `sync.categories` 和 `sync.locations`，表示本次新增的分类和位置数量。

### 更新物品

```http
PATCH /api/items/<id>
Content-Type: application/json

{
  "quantity": 4,
  "location": "厨房 > 冰箱 > 冷藏室"
}
```

### 删除物品

```http
DELETE /api/items/<id>
```

### 分类管理

#### 列出分类

```http
GET /api/categories
```

返回全部分类（含 `id`、`key`、`name`、`name_en`、`icon`、`sort_order`）。

#### 创建分类

```http
POST /api/categories
Content-Type: application/json

{
  "name": "食品饮料",
  "key": "food",
  "name_en": "Food & Drinks",
  "icon": "utensils"
}
```

`name` 必填；`key` 留空时自动生成。

#### 更新分类

```http
PATCH /api/categories/<id>
Content-Type: application/json

{
  "name": "食品",
  "key": "food"
}
```

如果修改了 `key`，系统会自动把所有使用该旧 `key` 的物品的 `category` 字段同步为新 `key`，并通知 UI 刷新物品列表。

#### 删除分类

```http
DELETE /api/categories/<id>
```

删除后，原分类下的物品会被迁移到 `other`（未分类）。若发生迁移，UI 物品列表也会同步刷新。

#### 合并分类

```http
POST /api/categories/merge
Content-Type: application/json

{
  "fromKey": "drink",
  "toKey": "food"
}
```

把 `fromKey` 下所有物品移到 `toKey`，并删除 `fromKey` 分类。

### 位置管理

#### 列出位置

```http
GET /api/locations
```

返回全部位置节点（含 `id`、`name`、`parent_id`、`sort_order`）。

#### 创建位置

```http
POST /api/locations
Content-Type: application/json

{
  "name": "厨房",
  "parentId": ""
}
```

`parentId` 为空字符串表示根节点；传入父级位置 `id` 可创建子位置。

#### 更新位置

```http
PATCH /api/locations/<id>
Content-Type: application/json

{
  "name": "厨房灶台",
  "parentId": "..."
}
```

如果修改了位置名称，系统会自动同步所有引用该名称的物品（`room`、`position`、`location` 路径中的对应片段）。

#### 删除位置

```http
DELETE /api/locations/<id>
```

会递归删除该节点及其所有子节点，并清理物品中对这些位置的引用：

- `room` / `position` 与被删位置同名 → 清空；
- `location` 路径中包含被删节点 → 从路径中移除该片段。

操作完成后会同时刷新位置树和物品列表。

#### 推断位置层级（避免重复）

```http
POST /api/locations/infer
Content-Type: application/json

{
  "raw": "xx小区厨房水槽下",
  "createMissing": true
}
```

Agent 收到自然语言位置描述后，应先调用本接口。服务会：

1. 按常见分隔符（`>`、`/`、`→`）拆分；无分隔符时，用已有位置名做贪心最长匹配。
2. 在每级节点中查找语义相似的现有位置（完全匹配 / 互相包含 / 编辑距离 ≤1）。
3. 命中相似节点则复用，未命中且 `createMissing` 为 `true` 时自动创建。

**响应** `200`：

```json
{
  "raw": "xx小区厨房水槽下",
  "path": ["xx小区", "厨房", "水槽下"],
  "matched": [
    { "input": "xx小区", "matched": "xx小区", "id": "uuid-1" }
  ],
  "created": [
    { "input": "厨房", "id": "uuid-2", "name": "厨房" },
    { "input": "水槽下", "id": "uuid-3", "name": "水槽下" }
  ]
}
```

得到 `path` 后，在创建/更新物品时设置：

```json
{
  "room": "xx小区",
  "position": "水槽下",
  "location": "xx小区 > 厨房 > 水槽下"
}
```

### 电子材料库管理（v1.3.0.a+，路由已从 `/api/materials` 改为 `/api/e-materials`，与实物库存 `/api/items` 明确区分）

#### 列出材料类型

```http
GET /api/e-materials/types
```

响应：`{ "materialTypes": [...] }`

#### 更新材料类型列表

```http
PATCH /api/e-materials/types
Content-Type: application/json

{ "types": ["note", "url", "photo", "recipe", "tutorial", "doc", "other"] }
```

`types` 为字符串数组；也可直接传逗号分隔字符串。返回更新后的类型列表。

#### 列出材料

```http
GET /api/e-materials?type=url&keyword=教程&startDate=2024-01-01&endDate=2024-12-31&tag=奖项
```

> 注意：响应体中 `title` 字段带 `【电子材料】` 前缀，与实物库存（`/api/items`）明确区分。

支持查询参数：

- `type`：按类型过滤，可选 `note`、`url`、`photo`、`recipe`、`tutorial`、`doc`、`other`
- `keyword`：按标题/内容/标签/OCR 文字做 FTS5 全文搜索（v1.8.0+；零命中回退 LIKE）。
- `startDate` / `endDate`：按材料事件时间范围过滤（ISO 日期，如 `2024-01-01`），对应字段 `eventStartDate` / `eventEndDate`
- `tag`：按单个标签模糊匹配
- `includePhoto=true`：附带完整 `photo` 字段（默认仅 `hasPhoto` 布尔值）

材料响应示例：

```json
{
  "id": "...",
  "type": "photo",
  "title": "【电子材料】2024 年度优秀员工证书",
  "content": "",
  "url": "",
  "tags": ["奖项", "个人", "2024"],
  "hasPhoto": true,
  "meta": "",
  "eventStartDate": "2024-01-01",
  "eventEndDate": "2024-12-31",
  "createdAt": "2024-12-31T16:00:00.000Z",
  "updatedAt": "2024-12-31T16:00:00.000Z"
}
```

> v1.7.4 更新：`tags` 统一返回数组；存储层兼容旧版逗号分隔字符串，写接口同时接受数组或逗号字符串。

#### 获取单个材料

```http
GET /api/e-materials/<id>
```

#### 获取材料图片

```http
GET /api/e-materials/<id>/photo
```

返回 `{ "id": "...", "photo": "data:image/...;base64,..." }`，按需取图。

#### 创建材料

```http
POST /api/e-materials
Content-Type: application/json

{
  "type": "url",
  "title": "Tailwind 教程",
  "content": "",
  "url": "https://tailwindcss.com",
  "tags": ["css", "frontend"],
  "photo": "",
  "meta": "",
  "eventStartDate": "2024-01-01",
  "eventEndDate": "2024-12-31"
}
```

`title` 必填；`type` 默认为 `note`；`tags` 支持数组或逗号字符串；`eventStartDate` / `eventEndDate` 为可选 ISO 日期。

#### 更新材料

```http
PATCH /api/e-materials/<id>
Content-Type: application/json

{
  "title": "Tailwind CSS 官方文档"
}
```

#### 删除材料

```http
DELETE /api/e-materials/<id>
```

### AI 视觉识别（v1.2.5+）

```http
POST /api/ai/recognize
Content-Type: application/json

{ "image": "data:image/webp;base64,..." }
```

`image`（或 `photo`）支持 data URL / http(s) URL / 本地绝对路径。调用用户在「设置 → AI 视觉识别」配置的多模态模型，返回识别建议：

```json
{
  "suggestions": [
    { "name": "薯片", "category": "food", "location": "厨房 > 零食柜", "quantity": 1, "confidence": 0.9, "note": "..." }
  ]
}
```

未配置 AI 供应商或识别失败时返回 `502`（`message` 含原因）。建议仅为参考值，Agent 应经用户确认后再调用创建接口入库。

### 图片 OCR（v1.7.9+）

识别物品或电子材料照片里的文字（票据/说明书/保单/保质期/合同等），结果存入独立表并可用于 `keyword` 搜索。

#### 识别物品照片文字

```http
POST /api/items/<id>/ocr
Content-Type: application/json

{ "image": "data:image/webp;base64,..." }
```

- `image` 可选；不传则使用物品已保存的 `photo`。
- 成功返回：`{ "id": "...", "ocr_text": "...", "ocr_at": 1234567890000 }`
- 失败返回：`400`（无图）、`404`（物品不存在）、`502`（OCR 失败）。

#### 读取物品 OCR 结果

```http
GET /api/items/<id>/ocr
```

返回：`{ "id": "...", "ocr_text": "...", "ocr_at": 1234567890000 }`。

若该物品尚未识别，返回 `ocr_text` 为空串、`ocr_at` 为 `0`，**不**返回 `404`。

#### 识别电子材料照片文字

```http
POST /api/e-materials/<id>/ocr
Content-Type: application/json

{ "image": "data:image/webp;base64,..." }
```

参数与物品 OCR 相同。

#### 读取电子材料 OCR 结果

```http
GET /api/e-materials/<id>/ocr
```

#### 通过 keyword 搜索 OCR 文字

`GET /api/items?keyword=保质期` 与 `GET /api/e-materials?keyword=合同编号` 现在会同时搜索已识别的照片文字。

存储说明（Agent 无需关心，仅供排查）：
- 物品 OCR 结果存在 `item_ocr` 表，`item_id` 外键关联 `items.id`。
- 电子材料 OCR 结果存在 `material_ocr` 表，`material_id` 外键关联 `materials.id`。
- 删除物品/材料时，级联删除对应 OCR 记录。

### 全文搜索 FTS5（v1.8.0+）

物品库（`items`）与电子材料库（`materials`）各有一张 FTS5 虚表：

- `items_fts(id, name, item_no, room, position, location, notes, tags, ocr_text)`
- `materials_fts(id, title, content, tags, ocr_text)`

主表 `items` / `materials` 的 INSERT/UPDATE/DELETE 通过触发器自动同步到虚表；OCR 文本（`item_ocr` / `material_ocr`）的写入也会同步更新虚表的 `ocr_text` 列。

**query 行为（v1.8.2+ 召回率优化）**

1. 关键字按空格分词，每词加 `term*` 前缀通配符；
2. **v1.8.2+**：`ftsUnionLikeSearch()` 同时跑 FTS5 MATCH + LIKE `%...%` 求并集（`id IN (FTS5) OR id IN (LIKE)`），处理中文单字 / 词干场景的召回；`keyword` 中 `%` / `_` 用 `ESCAPE '\\'` 转义防注入；
3. FTS5 零命中或表达式触发 syntax error 时回退 LIKE（兼容 unicode61 中文边界、特殊字符等场景）；
4. LIMIT 200 防爆，超过请用分页参数 `page` / `pageSize`。

**老库兼容**

v1.8.0 启动时自动 `SELECT * FROM items/materials` + `LEFT JOIN item_ocr/material_ocr` 把已有数据全量回填到 FTS5 虚表（每库执行一次，幂等）；

**启动期 FTS5 自维护（v1.8.3+）**

`backfillFtsFromMainTables` 末尾对 `items_fts` / `materials_fts` 依次跑：

1. FTS5 内部 `optimize` 命令：整理倒排索引碎片（删除/更新频繁时回收空间），失败 console.warn 不影响启动；
2. FTS5 内部 `integrity-check` 命令：验证虚表内部结构一致；损坏时抛 `SQLITE_CORRUPT_VTAB` 被捕获并 console.warn 告警；正常则 `global.__ftsHealth` 标记为 `{ items_fts_check: 'ok', materials_fts_check: 'ok' }`。

**FTS5 健康端点（v1.8.4+）**

`GET /api/fts-health`：返回虚表自维护结果，便于外部探针 / Agent 监测。

```http
GET /api/fts-health
```

响应：

```json
{
  "healthy": true,
  "items_fts": { "status": "ok", "ok": true },
  "materials_fts": { "status": "ok", "ok": true },
  "hint": "FTS5 内部结构正常"
}
```

不健康时返回 `503`：

```json
{
  "healthy": false,
  "items_fts": { "status": "error", "ok": false },
  "materials_fts": { "status": "ok", "ok": true },
  "hint": "FTS5 内部结构损坏，建议从备份恢复或重置库"
}
```

`status` 含义：`ok` = 启动期 integrity-check 通过；`error` = 启动期抛 `SQLITE_CORRUPT_VTAB`；`unknown` = 启动期 integrity-check 未执行（如新装用户首次冷启动）。
### 设置信息

```http
GET /api/settings
```

返回语言、主题、当前数据目录等。

## 实时同步说明

所有写入类接口（创建/更新/删除/合并）在执行完成后都会向前端发送 `api:dataChanged` 通知。因此通过 Agent 修改的分类、位置、物品、电子材料库数据都会即时反映到软件界面中，无需手动刷新。

## 示例（Python）

```python
import requests

BASE = 'http://127.0.0.1:3001'
TOKEN = 'your-token'
headers = {'Authorization': f'Bearer {TOKEN}'}

# 列出所有物品
r = requests.get(f'{BASE}/api/items', headers=headers)
print(r.json())

# 创建物品（推荐用 location 表达多层位置）
r = requests.post(f'{BASE}/api/items', headers=headers, json={
    'name': '鸡蛋',
    'quantity': 12,
    'category': 'food',
    'location': '厨房 > 冰箱 > 冷藏室'
})
print(r.json())
```

## 安全提示

- 默认仅绑定 `127.0.0.1`；在「设置 → 外部 Agent 接口」开启「暴露到局域网」后会监听 `0.0.0.0`，**同一局域网内任何知道 Token 的设备都可访问**，请仅在可信网络开启。
- Token 存储在 `%APPDATA%/family-inventory/settings.json`（注意目录为小写）中，请勿泄露。
- 刷新 Token 后，旧 Token 会立即失效。
- POST/PATCH 请求体上限 25MB。
- 所有 SQL 参数化执行；接口无法访问数据库以外的本地文件。
