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
  "room": "厨房",
  "position": "冰箱",
  "expiryDate": 1756464000000
}
```

字段说明：
- `name`（必填）
- `quantity`：数量，默认 0
- `minQuantity`：最低库存
- `category`：分类 key
- `room` / `position` / `location`：位置信息
- `photo`：图片路径/URL
- `expiryDate`：过期时间毫秒时间戳

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

### 分类列表

```http
GET /api/categories
```

### 位置列表

```http
GET /api/locations
```

### 设置信息

```http
GET /api/settings
```

返回语言、主题、当前数据目录等。

## 示例（Python）

```python
import requests

BASE = 'http://127.0.0.1:3001'
TOKEN = 'your-token'
headers = {'Authorization': f'Bearer {TOKEN}'}

# 列出所有物品
r = requests.get(f'{BASE}/api/items', headers=headers)
print(r.json())

# 创建物品
r = requests.post(f'{BASE}/api/items', headers=headers, json={
    'name': '鸡蛋',
    'quantity': 12,
    'category': 'food',
    'room': '厨房',
    'position': '冰箱'
})
print(r.json())
```

## 安全提示

- 服务仅绑定 `127.0.0.1`，不会暴露到局域网或公网。
- Token 存储在 `%APPDATA%/Family Inventory/settings.json` 中，请勿泄露。
- 刷新 Token 后，旧 Token 会立即失效。
