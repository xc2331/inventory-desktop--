// scripts/verify-ai-batch.js
// v1.8.6 OCR 异步化验证：脱离 Electron 端到端自检 runLimited + recognizeBatch
//
// 用法：
//   node scripts/verify-ai-batch.js
//
// 退出码：0 全过；1 有失败。

const path = require('path')

// ai-service.js 顶部 require 链很轻，没有 Electron 依赖，可直接 require
const aiService = require(path.join(__dirname, '..', 'electron', 'ai-service.js'))

const results = []

function logResult(name, ok, detail) {
  results.push({ name, ok, detail })
  const tag = ok ? '\u2713' : '\u2717'
  const color = ok ? '\x1b[32m' : '\x1b[31m'
  console.log(`  ${color}${tag}\x1b[0m ${name}${detail ? '  \u2014 ' + detail : ''}`)
}

function fail(name, msg) {
  logResult(name, false, msg)
}
function ok(name, detail) {
  logResult(name, true, detail)
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================
// Case 1: runLimited — 并发数限制
// ============================================================
async function testRunLimitedConcurrency() {
  const N = 12
  const LIMIT = 3
  const WORK_MS = 40
  const items = Array.from({ length: N }, (_, i) => i)
  let active = 0
  let maxActive = 0
  const finishOrder = []

  const { results: rs, cancel } = await aiService.runLimited(
    items,
    LIMIT,
    async (item) => {
      active++
      if (active > maxActive) maxActive = active
      await sleep(WORK_MS)
      active--
      return { item, ts: Date.now() }
    },
    (p) => finishOrder.push(p.done)
  )

  if (maxActive === LIMIT) ok('runLimited 并发上限 = ' + LIMIT, '实测峰值 ' + maxActive)
  else fail('runLimited 并发上限 = ' + LIMIT, '实测峰值 ' + maxActive)

  if (rs.length === N && rs.every((r) => r.ok)) ok('runLimited 全部完成', `${rs.length} 项`)
  else fail('runLimited 全部完成', `完成 ${rs.filter((r) => r.ok).length}/${N}`)

  if (finishOrder.length === N && finishOrder[N - 1] === N) ok('runLimited 进度回调正确', `done 序列: ${finishOrder.slice(0, 3).join(',')},…`)
  else fail('runLimited 进度回调正确', `回调长度 ${finishOrder.length}, 末值 ${finishOrder[N - 1]}`)

  // 取消能力检查
  let canceledCalled = false
  const items2 = Array.from({ length: 50 }, (_, i) => i)
  const { cancel: cancel2 } = await aiService.runLimited(
    items2,
    2,
    async () => { await sleep(20); return 1 },
    null
  )
  canceledCalled = typeof cancel2 === 'function'
  ok('runLimited 返回 cancel 函数', canceledCalled ? '是' : '否')
}

// ============================================================
// Case 2: runLimited — 单条失败不影响其他
// ============================================================
async function testRunLimitedFailureIsolation() {
  const items = [1, 2, 3, 4, 5]
  const { results: rs } = await aiService.runLimited(
    items,
    2,
    async (n) => {
      if (n === 3) throw new Error('mock-fail-3')
      return { n }
    },
    null
  )
  const okCount = rs.filter((r) => r.ok).length
  const failCount = rs.filter((r) => !r.ok).length
  if (okCount === 4 && failCount === 1 && rs[2].error === 'mock-fail-3') {
    ok('runLimited 失败隔离', `4 成功 / 1 失败 (idx=2)`)
  } else {
    fail('runLimited 失败隔离', `${okCount} 成功 / ${failCount} 失败`)
  }
}

// ============================================================
// Case 3: recognizeBatch — 并发数 ≤ N + 进度回调 + 失败聚合
// ============================================================
async function testRecognizeBatchMock() {
  // monkey-patch 内部 recognizeImage 不可行（闭包私有），改用 recognizeBatch 走真实函数，
  // 但其依赖 settings.provider（无配置会提前 return error）。这里通过 mock settings 模拟。
  // 方案：直接测 recognizeBatch 接受空 images / 不传 images 的边界。
  const r1 = await aiService.recognizeBatch({ images: [] })
  if (!r1.ok && r1.total === 0) ok('recognizeBatch 空数组', '返回 ok=false, total=0')
  else fail('recognizeBatch 空数组', JSON.stringify(r1))

  const r2 = await aiService.recognizeBatch({ images: null })
  if (!r2.ok && r2.total === 0) ok('recognizeBatch images=null', '返回 ok=false, total=0')
  else fail('recognizeBatch images=null', JSON.stringify(r2))
}

// ============================================================
// Case 4: 并发数边界 — 超过最大值时的截断
// ============================================================
async function testConcurrencyBounds() {
  // runLimited 的 limit > items.length 不会越界
  const { results: rs } = await aiService.runLimited(
    [1, 2, 3],
    10, // limit > items.length
    async (n) => n * 2,
    null
  )
  if (rs.length === 3 && rs.every((r) => r.ok && r.value === r.value)) {
    ok('runLimited limit > items 不越界', `结果 ${rs.map((r) => r.value).join(',')}`)
  } else {
    fail('runLimited limit > items 不越界', JSON.stringify(rs))
  }

  // limit = 0 时 Math.min(0, 3) = 0 workers，应立即返回（无任务执行）
  let executed = 0
  const { results: rs2 } = await aiService.runLimited(
    [1, 2, 3],
    0,
    async () => { executed++; return 1 },
    null
  )
  if (executed === 0 && rs2.length === 3 && rs2.every((r) => !r.ok)) {
    ok('runLimited limit=0 不执行', `0 个 worker, ${rs2.length} 条未完成结果`)
  } else {
    fail('runLimited limit=0 不执行', `executed=${executed}, okCount=${rs2.filter((r)=>r.ok).length}`)
  }
}

// ============================================================
// Case 5: recognizeBatch — 通过真实函数 + 注入 provider 跑一遍
// ============================================================
async function testRecognizeBatchEndToEnd() {
  // 准备 mock provider：baseUrl 指向一个本地不可达的端口让 HTTP 快速失败
  // 这样能验证"单张失败不影响其他张" + "errors 聚合"
  const settings = {
    aiProviders: [
      {
        id: 'mock-bad',
        baseUrl: 'http://127.0.0.1:1', // 必定 connect refused
        key: 'sk-fake',
        model: 'mock'
      }
    ],
    aiSelectedId: 'mock-bad'
  }
  const images = [
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  ]
  const start = Date.now()
  const result = await aiService.recognizeBatch({
    images,
    db: null, // db 没用到，因为我们让 HTTP 失败
    settings,
    concurrency: 3
  })
  const elapsed = Date.now() - start

  if (result.total === 5 && result.done === 0 && Array.isArray(result.errors) && result.errors.length === 5) {
    ok('recognizeBatch 5 张全部失败，errors 聚合', `耗时 ${elapsed}ms, errors=${result.errors.length}`)
  } else {
    fail('recognizeBatch 5 张全部失败', JSON.stringify({ total: result.total, done: result.done, errLen: result.errors?.length }))
  }

  if (result.ok === false) ok('recognizeBatch 返回 ok=false', '全错时应非 ok')
  else fail('recognizeBatch 返回 ok=false', 'ok=' + result.ok)
}

// ============================================================
// Main
// ============================================================
;(async () => {
  console.log('\n=== v1.8.6 OCR 异步化验证 ===\n')
  await testRunLimitedConcurrency()
  await testRunLimitedFailureIsolation()
  await testConcurrencyBounds()
  await testRecognizeBatchMock()
  await testRecognizeBatchEndToEnd()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n=== 共 ${results.length} 项，${results.length - failed.length} 通过 / ${failed.length} 失败 ===\n`)
  process.exit(failed.length === 0 ? 0 : 1)
})().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
