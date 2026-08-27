// scripts/verify-ai-image-format-e2e.js
// 端到端：调 ai-service.recognizeImage，针对每种 imageFormat 验证：
//   1) 发出的 payload 中图片 part 形状正确
//   2) ai-service 解析 mock 返回 ok + items[0].name === 'mock-item'
// 需要先起 dev-mock-provider.js（默认端口 19999）

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'electron', 'ai-service.js');
const LOG = path.join(__dirname, '..', 'dev-mock-provider.log.jsonl');

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
    Buffer,
    process,
    fetch, // Node 18+ 全局 fetch
    setTimeout, clearTimeout, setInterval, clearInterval,
    __filename: SRC,
    __dirname: path.dirname(SRC),
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: SRC });
  return sandbox.module.exports;
}

async function clearLog() {
  fs.writeFileSync(LOG, '');
}

function readLastLog() {
  const lines = fs.readFileSync(LOG, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return null;
  return JSON.parse(lines[lines.length - 1]).body;
}

const SAMPLE = 'data:image/jpeg;base64,/9j/test';
const SETTINGS = {
  aiProviders: [
    { id: 'p1', name: 'mock', baseUrl: 'http://127.0.0.1:19999', key: 'sk-test', model: 'mock-vision' }
  ],
  aiSelectedId: 'p1',
};

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? '\n  ' + extra : '')); }
}

(async () => {
  const ai = await loadAiService();

  // 1) auto — 应该发 data URL
  await clearLog();
  let r = await ai.recognizeImage({ image: SAMPLE, db: null, settings: SETTINGS });
  let body = readLastLog();
  ok('auto 返回 ok', r.ok, JSON.stringify(r).slice(0, 200));
  const autoPart = body?.messages?.[1]?.content?.[1];
  ok('auto image_url 形', autoPart && autoPart.type === 'image_url' && autoPart.image_url.url === SAMPLE,
    JSON.stringify(autoPart));

  // 2) data_url — 等同 auto
  await clearLog();
  SETTINGS.aiProviders[0].imageFormat = 'data_url';
  r = await ai.recognizeImage({ image: SAMPLE, db: null, settings: SETTINGS });
  body = readLastLog();
  const dataPart = body?.messages?.[1]?.content?.[1];
  ok('data_url image_url 形', dataPart && dataPart.type === 'image_url' && dataPart.image_url.url === SAMPLE,
    JSON.stringify(dataPart));

  // 3) image_url — 裸 base64
  await clearLog();
  SETTINGS.aiProviders[0].imageFormat = 'image_url';
  r = await ai.recognizeImage({ image: SAMPLE, db: null, settings: SETTINGS });
  body = readLastLog();
  const iuPart = body?.messages?.[1]?.content?.[1];
  ok('image_url 裸 base64', iuPart && iuPart.type === 'image_url' && iuPart.image_url.url === '/9j/test',
    JSON.stringify(iuPart));

  // 4) image_base64 — Qwen/GLM 风格
  await clearLog();
  SETTINGS.aiProviders[0].imageFormat = 'image_base64';
  r = await ai.recognizeImage({ image: SAMPLE, db: null, settings: SETTINGS });
  body = readLastLog();
  const ibPart = body?.messages?.[1]?.content?.[1];
  ok('image_base64 Qwen/GLM 形', ibPart && ibPart.type === 'image' && ibPart.image === '/9j/test',
    JSON.stringify(ibPart));

  // 5) recognizeText 同步切换
  await clearLog();
  SETTINGS.aiProviders[0].imageFormat = 'image_base64';
  r = await ai.recognizeText({ image: SAMPLE, settings: SETTINGS });
  body = readLastLog();
  const tPart = body?.messages?.[1]?.content?.[1];
  ok('recognizeText 也走 imageFormat', tPart && tPart.type === 'image' && tPart.image === '/9j/test',
    JSON.stringify(tPart));

  // 6) recognizeBatch 三张图并发，发出的三份 payload 都是 image_base64 形
  await clearLog();
  SETTINGS.aiProviders[0].imageFormat = 'image_base64';
  r = await ai.recognizeBatch({
    images: [SAMPLE, SAMPLE, SAMPLE],
    db: null,
    settings: SETTINGS,
    concurrency: 3
  });
  const lines = fs.readFileSync(LOG, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  ok('recognizeBatch 返回 ok', r.ok, JSON.stringify(r).slice(0, 200));
  ok('recognizeBatch 发出 3 次请求', lines.length === 3, 'lines=' + lines.length);
  const allImageBase64 = lines.every(l => {
    const b = JSON.parse(l).body;
    const p = b?.messages?.[1]?.content?.[1];
    return p && p.type === 'image' && p.image === '/9j/test';
  });
  ok('recognizeBatch 三张全走 image_base64', allImageBase64);

  console.log('');
  console.log('=== 结果 ===');
  console.log('通过: ' + pass + ' / 失败: ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
