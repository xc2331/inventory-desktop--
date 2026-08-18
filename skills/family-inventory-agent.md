# 家庭物资管家 · 中文友好版（Inv-Manage + UTF-8 REST Client）

> 当前文档对应版本：**v1.2.18**（2026-08-06）。本版本将 Agent API 的图片 base64 从列表/详情响应中分离：默认返回 `hasPhoto` 布尔值，新增独立取图端点 `GET /api/items/:id/photo`，大幅减少 Agent 上下文长度。

## Overview

「家庭物资管家」（Family Inventory）是一个本地 Electron 桌面应用，通过本地 HTTP API 管理家庭物品库存。本技能将自然语言指令翻译成 API 请求，完成查询、新增、修改、删除等操作。

**核心原则**：所有带中文的请求一律使用 **Python + UTF-8 显式编码**，避免 Windows PowerShell 默认 GBK 导致乱码。

---

## When to Use

**触发关键词**（用户说任何一条即加载）：
- 涉及「库存、物品、物资、家庭物品、冰箱里有什么、家里有什么」
- 显式调用 `/skills inv-manage`
- 提及 Family Inventory / 物资管家 / 添加物品 / 删除物品 / 过期提醒

**典型场景**：
- 查询某位置/分类的物品
- 添加新物品（名称、数量、位置、过期日期）
- 修改数量/位置/过期日期
- 删除过期或不需要的物品
- 查看分类/位置列表
- 查看即将过期 / 低库存物品

**不要使用**：物品与家庭库存无关，或操作其他系统。

---

## Connection & Authentication

| 项目 | 值 |
|------|------|
| Base URL | `http://127.0.0.1:3001` |
| Auth | `Authorization: Bearer <TOKEN>` |
| Content-Type | `application/json; charset=utf-8` |
| Binding | 仅 127.0.0.1（不对外暴露） |

**本次会话 Token**（已验证有效）：
```
45628386f195932b66d5402c2d31d3b843e9e909ac01d4b7
```
> Token 变更时以用户最新告知为准；若返回 401，提示用户到「设置 → 外部 Agent 接口」重新复制或刷新。

---

## API 速查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 应用状态、数据库路径 |
| GET | `/api/items?keyword=...&category=...` | 物品列表（模糊搜索）。默认不含图片 base64，返回 `hasPhoto` 布尔值 |
| GET | `/api/items/<id 或名称>` | 单个物品（精确 id 或模糊候选）。默认不含图片 |
| GET | `/api/items/<id>/photo` | **独立获取物品图片 base64**（按需调用，避免上下文膨胀） |
| POST | `/api/items` | 新建物品（可传 `photo` 字段设置图片） |
| PATCH | `/api/items/<id>` | 更新物品（仅传要改的字段） |
| DELETE | `/api/items/<id>` | 删除物品 |
| GET | `/api/categories` | 分类列表 |
| GET | `/api/locations` | 位置列表 |
| GET | `/api/e-materials?type=...&keyword=...` | **电子材料库**列表（v1.3.0.a 起）。默认不含图片 base64，`title` 带【电子材料】前缀 |
| GET | `/api/e-materials/types` | **电子材料库类型列表**（v1.3.0.a 新增） |
| PATCH | `/api/e-materials/types` | **电子材料库类型更新**（v1.3.0.a 新增） |
| GET | `/api/e-materials/<id>/photo` | **电子材料库图片** base64（按需调用） |
| POST | `/api/e-materials` | 新建电子材料 |
| PATCH | `/api/e-materials/<id>` | 更新电子材料 |
| DELETE | `/api/e-materials/<id>` | 删除电子材料 |
| GET | `/api/settings` | 设置信息 |

> **图片分离说明（v1.2.17+）**：所有列表/详情接口默认返回 `hasPhoto: true/false` 而非 `photo` base64。如需完整图片，有两种方式：
> 1. **按需取图**（推荐）：`GET /api/items/<id>/photo` → `{ id, photo: "data:image/..." }`
> 2. **批量带图**：在列表/详情 URL 加 `?includePhoto=true`，响应中的每个对象会包含完整 `photo` 字段（向后兼容旧用法）

---

## 中文编码最佳实践（推荐 Python）

**不要**在 Windows PowerShell 中用 `Invoke-RestMethod` 传输中文——它默认 GBK，服务端只认 UTF-8，会导致中文存成 `?????`。统一用 Python `urllib.request` 全程显式 UTF-8。

### 标准头与初始化

```python
import urllib.request, json, sys, urllib.parse

sys.stdout.reconfigure(encoding='utf-8')   # 让控制台正确显示中文
token = "45628386f195932b66d5402c2d31d3b843e9e909ac01d4b7"
headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json; charset=utf-8'
}
```

### POST（新增，含中文请求体）

```python
body = json.dumps({
    "name": "电解质饮料",
    "quantity": 7,
    "category": "beverage",
    "location": "瑞州嘉园 > 厨房 > 冰箱边"
}, ensure_ascii=False).encode('utf-8')   # 关键！
```

> 也可以继续使用 `room` + `position` 组合，例如 `"room": "厨房", "position": "冰箱"`；但推荐用 `location` 表达多层位置。

```python
req = urllib.request.Request('http://127.0.0.1:3001/api/items',
                             data=body, headers=headers, method='POST')
print(json.dumps(json.loads(urllib.request.urlopen(req).read()),
                 ensure_ascii=False, indent=2))
```

### GET（URL 参数含中文）

```python
keyword = "电解质饮料"
url = f"http://127.0.0.1:3001/api/items?keyword={urllib.parse.quote(keyword)}"
req = urllib.request.Request(url, headers=headers)
items = json.loads(urllib.request.urlopen(req).read()).get('items', [])
```

### PATCH（更新，用 id 避免 URL 中文）

```python
item_id = "<从搜索得到的 uuid>"
body = json.dumps({"quantity": 4}, ensure_ascii=False).encode('utf-8')
req = urllib.request.Request(
    f'http://127.0.0.1:3001/api/items/{item_id}',
    data=body, headers=headers, method='PATCH')
print(json.dumps(json.loads(urllib.request.urlopen(req).read()),
                 ensure_ascii=False, indent=2))
```

### DELETE

```python
req = urllib.request.Request(f'http://127.0.0.1:3001/api/items/{item_id}',
                             headers=headers, method='DELETE')
print(urllib.request.urlopen(req).status)   # 204 表示成功
```

---

## 操作流程（通用）

### 先查后改 / 先查后删（按名称定位 → 用 id 操作）

1. `GET /api/items/<名称>`（或 GET + keyword）→ 拿到 `items` 列表
2. 从列表选取目标 `id`（可用 room/position/expiryDate 辅助判断）
3. 用该 `id` 执行 PATCH 或 DELETE

**多候选时**：若返回多条，向用户确认，或按上下文（「过期的」「冰箱里的」）自动筛选。

### 补货（累加数量）

1. 搜索现有物品 → 若存在则 `PATCH { quantity: 原值 + 新增值 }`
2. 若不存在则 `POST` 新建

### 查看即将过期 / 低库存

- 即将过期：筛 `0 < expiryDate <= Date.now() + 7天`（毫秒）
- 低库存：筛 `quantity <= minQuantity 且 minQuantity > 0`

---

## 分类 key 对照（优先用规范 key）

| key | 中文名 |
|-----|--------|
| electronic | 电子产品 |
| food | 食品 |
| beverage | 饮料 |
| daily | 日用品 |
| kitchen | 厨房用品 |
| cleaning | 清洁用品 |
| medical | 医药 |
| stationery | 文具 |
| tools | 工具 |
| other | 其他 |

传入中文别名或英文变体会被自动归一化。

---

## 位置字段规范（重要）

创建或更新物品时，位置信息必须按以下优先级填写，系统会自动同步到「位置地图」和「位置管理」：

| 字段 | 说明 | 示例 |
|------|------|------|
| `location` | **优先使用**。用 `>` 分隔多层位置，支持 `/`、`→` 作为替代分隔符。 | `"厨房 > 冰箱 > 冷藏室"` |
| `room` + `position` | 当没有 `location` 时使用。`room` 表示房间/区域，`position` 表示具体位置。 | `"厨房"` + `"冰箱"` |

**注意**：
- 只要传了 `location`，系统就忽略 `room` / `position`。
- `location` 中的每一层都会自动在位置树中创建节点。
- 如果位置在应用中已存在（同名同层级），不会重复创建。
- 创建/更新成功后，响应体会包含 `sync.categories` 和 `sync.locations`，表示新增的分类和位置数量。

## 时间戳

- `expiryDate`：**毫秒级** Unix 时间戳；`0` = 未设置。判断过期：`expiryDate < Date.now()`
- `createdAt` / `updatedAt`：ISO 8601 字符串。

---

## 错误码

| 状态码 | 含义 | 处理 |
|--------|------|------|
| 200 / 201 | 成功 | 正常处理 |
| 400 | 参数错误 | 通常缺 `name`，检查请求体 |
| 401 | 未授权 | Token 错误/失效，提示用户重新提供 |
| 404 | 资源不存在 | id 不对，重新搜索 |
| 500 | 内部错误 | 看 message |

---

## 关键 Pitfalls

1. **乱码根源**：用 `Invoke-RestMethod` 发中文 → 服务端收到 GBK → 存成 `?????`。**务必用 Python 模板**，并确保 `ensure_ascii=False` + `.encode('utf-8')`。
2. **GET 中文参数必须 `urllib.parse.quote()`**，否则报 `UnicodeEncodeError`。
3. **修改/删除必须用 id**，不要用名称直接拼 PATCH/DELETE 路径。
4. **累加数量不能直接设增量**，必须先 GET 原 `quantity`，再 PATCH 新值。
5. **PowerShell exit_code 误判**：即使返回完整 JSON，terminal 可能显示 `exit_code=1`，**以实际输出为准，不要判断失败**。
6. **乱码数据清理**：如果已经因 GBK 污染产生 `?????` 条目，必须 DELETE 清理后重新用 UTF-8 添加。

---

## Verification Checklist

- [ ] Token 有效（`/api/status` 返回非 401）
- [ ] 所有含中文的请求均使用 Python 模板（POST body 和 GET quote）
- [ ] 修改/删除前已搜索取得正确 id
- [ ] 多候选时已向用户确认或按上下文筛选
- [ ] 累加数量时先读了原值
- [ ] 向用户用中文清晰汇报操作结果

---

## One-Shot Recipes（中文操作示例）

**查冰箱里有什么**：
```python
url = "http://127.0.0.1:3001/api/items?keyword=冰箱"
# GET with headers, 打印结果
```

**添加牛奶 6 盒到厨房冰箱**：POST 含中文 body（见上文模板）

**把牛奶数量改成 4**：先 GET `/api/items?keyword=牛奶` → 取 id → PATCH 数量

**删除过期面包**：GET 搜索 → 筛选 `expiryDate < now` → DELETE 对应 id

**哪些东西快用完了**：GET `/api/items` → 筛 `quantity <= minQuantity`（需 minQuantity 已设置）
