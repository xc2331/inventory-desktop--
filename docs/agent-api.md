# Family Inventory Agent API

软件启动后会在本地回环地址 `127.0.0.1:3001` 启动一个 HTTP 服务，供外部 Agent / 脚本管理物品数据。

## 鉴权

所有接口都需要在请求头中携带 Token：

```http
Authorization: Bearer <your-token>
```

Token 可在「设置 → 外部 Agent 接口」中查看、复制或刷新。

## 接口列表

### 状态检查

```http
GET /api/status
```

返回当前数据库路径、数据目录等基本信息。

### 物品列表

```http
GET /api/items?keyword=牛奶&category=food
```

支持查询参数：
- `keyword`：按名称/编号/位置模糊搜索
- `category`：按分类 key 过滤

### 获取单个物品（支持模糊搜索）

```http
GET /api/items/<id>
GET /api/items/牛奶
```

优先按 `id` 精确匹配；若未命中，则按名称或编号模糊搜索，返回候选列表：

```json
{
  "query": "牛奶",
  "candidates": [{...}, {...}]
}
```

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
- `quantity`：数量，默认 0
- `minQuantity`：最低库存
- `category`：分类 key，支持中文别名（如 `"食品"` 会自动归一化为 `food`）
- `location`：**推荐**。层级位置，使用 `>` 分隔（也支持 `/`、`→`），例如 `"厨房 > 冰箱 > 冷藏室"`。系统会自动把每一层同步到位置树。
- `room` / `position`：当没有 `location` 时使用，组合成两层位置。
- `photo`：图片路径/URL
- `expiryDate`：过期时间毫秒时间戳

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
GET /api/e-materials?type=url&keyword=教程
```

> 注意：响应体中 `title` 字段带 `【电子材料】` 前缀，与实物库存（`/api/items`）明确区分。

支持查询参数：

- `type`：按类型过滤，可选 `note`、`url`、`photo`、`recipe`、`tutorial`、`doc`、`other`
- `keyword`：按标题/内容/标签模糊搜索

#### 获取单个材料

```http
GET /api/e-materials/<id>
```

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
  "meta": ""
}
```

`title` 必填；`type` 默认为 `note`；`tags` 支持数组或逗号字符串。

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

- 服务仅绑定 `127.0.0.1`，不会暴露到局域网或公网。
- Token 存储在 `%APPDATA%/Family Inventory/settings.json` 中，请勿泄露。
- 刷新 Token 后，旧 Token 会立即失效。
