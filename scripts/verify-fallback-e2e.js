// scripts/verify-fallback-e2e.js
// 端到端验证：ai-service 在 imageFormat 错配时自动按 fallback 列表重试 + 自学习
// 覆盖两个场景：
//   A) OpenAI 兼容 provider（如 opencode zen / openrouter / oneapi）→ 只允许 data_url / image_url
//   B) DashScope/Qwen/GLM provider → 允许 data_url / image_url / image_base64 / image_field
// 需要先起 dev-mock-provider-fallback.js（端口 19998）

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'electron', 'ai-service.js');
const LOG = path.join(__dirname, '..', 'dev-mock-fallback.log.jsonl');
const MOCK_URL = 'http://127.0.0.1:19998';

async function loadAiService() {
  const src = fs.readFileSync(SRC, 'utf8');
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require: (mod) => {
      if (mod === './data-utils' || mod.endsWith('/data-utils')) {
        return require(path.join(path.dirname(SRC), 'data-utils.js'));
      }
      return null;
    },
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Buffer, URL, URLSearchParams,
    fetch: (...a) => globalThis.fetch(...a),
  };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.module.exports;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fmtLabel(part) {
  if (part.type === 'image_url' && part.image_url?.url?.startsWith('data:')) return 'data_url';
  if (part.type === 'image_url' && part.image_url?.url) return 'image_url';
  if (part.type === 'image' && part.image) return 'image_base64';
  if (part.type === 'image_base64' && part.image_base64) return 'image_field';
  return 'unknown:' + JSON.stringify(part).slice(0, 60);
}

async function resetMock() {
  await fetch(MOCK_URL + '/__reset', { method: 'POST' }).catch(() => {});
  fs.writeFileSync(LOG, '');
}

async function readLog() {
  return fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => {
    const obj = JSON.parse(l);
    // mock 已经把 body 序列化成字符串，log 里是嵌套 JSON 字符串；这里还原成对象
    return { ...obj, body: typeof obj.body === 'string' ? JSON.parse(obj.body) : obj.body };
  });
}

async function runScenario(name, opts) {
  console.log(`\n=== 场景 ${name} ===`);
  console.log(`  baseUrl=${opts.baseUrl}  model=${opts.model}  initialFmt=${opts.initialFmt}`);
  await resetMock();

  const settings = {
    aiProviders: [{
      id: opts.id || 'p1',
      name: opts.name || 'fallback-test',
      baseUrl: opts.baseUrl,
      key: 'sk-test',
      model: opts.model,
      imageFormat: opts.initialFmt,
    }],
    aiSelectedId: 'p1'
  };
  const provider = settings.aiProviders[0];

  const t0 = Date.now();
  const r = await opts.ai.recognizeImage({
    image: 'data:image/jpeg;base64,/9j/fake',
    settings,
    provider,
  });
  const elapsed = Date.now() - t0;

  const log = await readLog();
  const fmts = log.map(l => fmtLabel(l.body.messages[1].content[1]));
  console.log(`  result: ok=${r.ok} fmt=${r.imageFormat || '-'} items=${r.items?.length || 0} (${elapsed}ms)`);
  console.log(`  requests: [${fmts.join(', ')}]`);
  if (r.error) console.log(`  error: ${r.error}`);

  return { r, fmts, provider };
}

(async () => {
  // 检查 mock 是否在跑
  try {
    await fetch(MOCK_URL + '/__last', { method: 'GET' });
  } catch {
    console.error('❌ mock provider 未在 19998 端口启动。先执行：');
    console.error('   node scripts/dev-mock-provider-fallback.js');
    process.exit(1);
  }

  const ai = await loadAiService();
  let failures = 0;

  // ───────────────────────────────────────────────────────────────
  // 场景 A: OpenAI 兼容 provider（用户实际场景 — opencode zen）
  //   期望：fallback 只试 data_url / image_url，**永远不**试 image_base64/image_field
  //   mock 配置：MOCK_FAIL_TIMES=1，即第 1 次 400，第 2 次起 200
  // ───────────────────────────────────────────────────────────────
  {
    const { r, fmts, provider } = await runScenario('A: OpenAI 兼容（opencode zen）', {
      ai,
      baseUrl: MOCK_URL, // 不含 dashscope/bailian/aliyun/qwen/bigmodel/zhipu/glm 关键字
      name: 'openai-compatible',
      model: 'mock-vision',
      initialFmt: 'data_url',
    });

    // 1) 必须 ok
    if (!r.ok) { console.error('❌ A1 失败：', r.error); failures++; }
    else if (r.imageFormat !== 'image_url') {
      console.error('❌ A2 imageFormat 应为 image_url，实际：', r.imageFormat); failures++;
    } else console.log('  ✅ A1-2 ok & fallback 命中 image_url');

    // 2) 请求序列：第 1 次 data_url 400（mock 第 1 次返 400），第 2 次 image_url 200
    if (fmts.length !== 2) { console.error('❌ A3 期望 2 次请求，实际', fmts.length); failures++; }
    else if (fmts[0] !== 'data_url' || fmts[1] !== 'image_url') {
      console.error('❌ A3 序列错：', fmts); failures++;
    } else console.log('  ✅ A3 请求序列 [data_url, image_url] 正确');

    // 3) **关键**：OpenAI 兼容 provider 不应该发 type=image 或 type=image_base64
    if (fmts.some(f => f === 'image_base64' || f === 'image_field')) {
      console.error('❌ A4 OpenAI 兼容 provider 发了 type=image / image_base64，会被 schema 校验打回 1214');
      failures++;
    } else console.log('  ✅ A4 没发 type=image/image_base64（避免 1214）');

    // 4) 自学习写回必须是合法 fmt
    if (provider.imageFormat !== 'image_url') {
      console.error('❌ A5 cfg.imageFormat 未写回 image_url，实际：', provider.imageFormat); failures++;
    } else console.log('  ✅ A5 cfg.imageFormat 自学习写回 image_url');

    // 5) 第 2 次直接命中 — prime mock 让下一次请求直接 200（验证自学习后 1 次命中）
    await fetch(MOCK_URL + '/__prime', { method: 'POST' });
    fs.writeFileSync(LOG, '');
    const r2 = await ai.recognizeImage({ image: 'data:image/jpeg;base64,/9j/fake', settings: { aiProviders: [provider], aiSelectedId: provider.id }, provider });
    const log2 = await readLog();
    if (!r2.ok || log2.length !== 1) {
      console.error('❌ A6 第 2 次应 1 次命中，实际：', { ok: r2.ok, reqs: log2.length, error: r2.error, fmt: r2.imageFormat });
      failures++;
    } else console.log('  ✅ A6 第 2 次 1 次命中 image_url（自学习生效）');
  }

  // ───────────────────────────────────────────────────────────────
  // 场景 B: cfg.imageFormat 是脏值（用户实际场景 — v1.8.7 留下 image_base64）
  //   期望：OpenAI 兼容 provider 即使 cfg.imageFormat='image_base64'，
  //   第一次也必须走 data_url，不能发 type=image（否则 1214）
  // ───────────────────────────────────────────────────────────────
  {
    const { r, fmts, provider } = await runScenario('B: cfg 脏值 image_base64（opencode zen）', {
      ai,
      baseUrl: MOCK_URL,
      name: 'openai-compatible-dirty',
      model: 'mock-vision',
      initialFmt: 'image_base64', // 模拟用户 settings.json 里的旧值
    });

    if (!r.ok) { console.error('❌ B1 失败：', r.error); failures++; }
    else if (r.imageFormat !== 'image_url') {
      console.error('❌ B2 imageFormat 应为 image_url，实际：', r.imageFormat); failures++;
    } else console.log('  ✅ B1-2 ok & dirty cfg 被纠正为 image_url');

    // 关键：第一次请求必须是 data_url（不能是 type=image）
    if (fmts[0] === 'image_base64' || fmts[0] === 'image_field') {
      console.error('❌ B3 第一次请求发了 type=image / type=image_base64 — 会触发 1214 schema 错误');
      console.error('   序列：', fmts);
      failures++;
    } else if (fmts[0] === 'data_url' && fmts[1] === 'image_url') {
      console.log('  ✅ B3 序列 [data_url, image_url] 正确（绕开脏 cfg）');
    } else {
      console.error('❌ B3 序列错：', fmts); failures++;
    }

    // 关键：永远不该出现 type=image / type=image_base64
    if (fmts.some(f => f === 'image_base64' || f === 'image_field')) {
      console.error('❌ B4 OpenAI 兼容 provider 发了非法 type'); failures++;
    } else console.log('  ✅ B4 整轮没发 type=image/image_base64');
  }

  console.log('\n========================');
  if (failures === 0) {
    console.log('=== ✅ 全部通过 — fallback 按 provider 正确收敛 ===');
    console.log('=== (DashScope/Qwen/GLM 4-fmt 路径由 verify-fallback-order.js 单元覆盖) ===');
    process.exit(0);
  } else {
    console.log(`=== ❌ ${failures} 个断言失败 ===`);
    process.exit(1);
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
