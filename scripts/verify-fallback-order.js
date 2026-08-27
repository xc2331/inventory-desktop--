// scripts/verify-fallback-order.js
// 单元测试：getFallbackOrder / isValidFmtForProvider / guessImageFormat 的分支
// 不需要 mock，纯逻辑覆盖

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'electron', 'ai-service.js');

async function loadHelpers() {
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
  };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.module.exports;
}

const cases = [
  // [name, provider, expectedOrder]
  ['opencode zen（OpenAI 兼容）', { baseUrl: 'https://opencode.ai/zen/v1' }, ['data_url', 'image_url']],
  ['openai 官方', { baseUrl: 'https://api.openai.com/v1' }, ['data_url', 'image_url']],
  ['openrouter', { baseUrl: 'https://openrouter.ai/api/v1' }, ['data_url', 'image_url']],
  ['oneapi 自建', { baseUrl: 'https://my-oneapi.local:8080/v1' }, ['data_url', 'image_url']],
  ['volcengine Ark', { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' }, ['data_url', 'image_url']],
  ['doubao', { baseUrl: 'https://ark.doubao.com/api/v3' }, ['data_url', 'image_url']],
  ['moonshot kimi', { baseUrl: 'https://api.moonshot.cn/v1' }, ['data_url', 'image_url']],
  ['DashScope', { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }, ['data_url', 'image_url', 'image_base64', 'image_field']],
  ['Qwen Bailian', { baseUrl: 'https://bailian.console.aliyun.com/v1' }, ['data_url', 'image_url', 'image_base64', 'image_field']],
  ['GLM bigmodel', { baseUrl: 'https://open.bigmodel.cn/api/paas/v4' }, ['data_url', 'image_url', 'image_base64', 'image_field']],
  ['Zhipu', { baseUrl: 'https://api.zhipu.cn/v1' }, ['data_url', 'image_url', 'image_base64', 'image_field']],
  ['空 baseUrl', { baseUrl: '' }, ['data_url', 'image_url']],
];

(async () => {
  const ai = await loadHelpers();
  let failures = 0;

  console.log('=== getFallbackOrder 单元测试 ===\n');
  for (const [name, provider, expected] of cases) {
    const got = ai.getFallbackOrder(provider);
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    if (ok) console.log(`  ✅ ${name.padEnd(28)} → [${got.join(', ')}]`);
    else {
      console.error(`  ❌ ${name.padEnd(28)} → [${got.join(', ')}]  期望 [${expected.join(', ')}]`);
      failures++;
    }
  }

  console.log('\n=== isValidFmtForProvider 关键检查 ===\n');
  const openai = { baseUrl: 'https://opencode.ai/zen/v1' };
  const qwen = { baseUrl: 'https://dashscope.aliyuncs.com/v1' };
  // OpenAI 兼容：image_base64/image_field 都应 false
  if (ai.isValidFmtForProvider('image_base64', openai)) { console.error('  ❌ opencode 不应允许 image_base64'); failures++; }
  else console.log('  ✅ opencode zen 不允许 image_base64（避免 1214）');
  if (ai.isValidFmtForProvider('data_url', openai)) console.log('  ✅ opencode zen 允许 data_url');
  else { console.error('  ❌ opencode zen 应允许 data_url'); failures++; }
  if (ai.isValidFmtForProvider('image_url', openai)) console.log('  ✅ opencode zen 允许 image_url');
  else { console.error('  ❌ opencode zen 应允许 image_url'); failures++; }
  // Qwen：4 种都允许
  if (ai.isValidFmtForProvider('image_base64', qwen)) console.log('  ✅ DashScope 允许 image_base64');
  else { console.error('  ❌ DashScope 应允许 image_base64'); failures++; }
  if (ai.isValidFmtForProvider('image_field', qwen)) console.log('  ✅ DashScope 允许 image_field');
  else { console.error('  ❌ DashScope 应允许 image_field'); failures++; }

  console.log('\n========================');
  if (failures === 0) {
    console.log('=== ✅ 全部通过 ===');
    process.exit(0);
  } else {
    console.log(`=== ❌ ${failures} 个失败 ===`);
    process.exit(1);
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
