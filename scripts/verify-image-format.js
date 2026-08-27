// scripts/verify-image-format.js
// 验证 ai-service 的 buildImagePart 对 4 种 imageFormat 的输出
// 策略：从 ai-service.js 源码中抽取 buildImagePart + ensureImageUrl 单独跑（不污染生产代码）

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'electron', 'ai-service.js');
const src = fs.readFileSync(SRC, 'utf8');

// 抽取 buildImagePart 函数体（含 ensureImageUrl 引用，所以一起抽）
const startMarker = '// 把图片按 provider 配置的 imageFormat 拼成多模态消息 part';
const startIdx = src.indexOf(startMarker);
if (startIdx < 0) {
  console.error('FAIL: 找不到 buildImagePart 注释锚点');
  process.exit(1);
}
// 从注释锚点起，截到 ensureImageUrl 函数体结束（ensureImageUrl 紧跟 buildImagePart 之后）
const ensureStart = src.indexOf('function ensureImageUrl(', startIdx);
if (ensureStart < 0) {
  console.error('FAIL: 找不到 ensureImageUrl');
  process.exit(1);
}
// 用括号匹配找 ensureImageUrl 结束的 }
let depth = 0;
let end = -1;
let inStr = null;
for (let i = ensureStart; i < src.length; i++) {
  const c = src[i];
  if (inStr) {
    if (c === '\\') { i++; continue; }
    if (c === inStr) inStr = null;
    continue;
  }
  if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) {
  console.error('FAIL: ensureImageUrl 括号匹配失败');
  process.exit(1);
}

// 同步抽 buildImagePart 的起点（startIdx 是注释，从它到 ensureStart 都属于 buildImagePart 块）
const block = src.slice(startIdx, end);
// buildImagePart 内部调用 ensureImageUrl — 我们要保证 ensureImageUrl 在前
// 由于 block 里 ensureImageUrl 排在 buildImagePart 之后，但 buildImagePart 函数体只
// 引用 ensureImageUrl 的名字（hoist 不适用 const/let，function 声明会 hoist），所以执行顺序无关

const exportsObj = {};
// eslint-disable-next-line no-new-func
const factory = new Function('exports', block + '\nexports.buildImagePart = buildImagePart;\nexports.ensureImageUrl = ensureImageUrl;');
factory(exportsObj);

const { buildImagePart, ensureImageUrl } = exportsObj;
if (typeof buildImagePart !== 'function') {
  console.error('FAIL: buildImagePart 未抽取成功');
  process.exit(1);
}

const SAMPLE = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A//2Q==';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('OK   ' + name); }
  else { fail++; console.log('FAIL ' + name + '\n  got:  ' + JSON.stringify(got) + '\n  want: ' + JSON.stringify(want)); }
}

console.log('=== buildImagePart 单测 ===');

eq('auto -> data URL', buildImagePart(SAMPLE, 'auto'),
  { type: 'image_url', image_url: { url: SAMPLE } });

eq('data_url -> data URL', buildImagePart(SAMPLE, 'data_url'),
  { type: 'image_url', image_url: { url: SAMPLE } });

const bare = SAMPLE.replace(/^data:[^;]+;base64,/, '');
eq('image_url -> 裸 base64', buildImagePart(SAMPLE, 'image_url'),
  { type: 'image_url', image_url: { url: bare } });

eq('image_base64 -> Qwen/GLM', buildImagePart(SAMPLE, 'image_base64'),
  { type: 'image', image: bare });

eq('undefined -> auto', buildImagePart(SAMPLE, undefined),
  { type: 'image_url', image_url: { url: SAMPLE } });

eq('"" -> auto', buildImagePart(SAMPLE, ''),
  { type: 'image_url', image_url: { url: SAMPLE } });

eq('IMAGE_BASE64 大小写不敏感', buildImagePart(SAMPLE, 'IMAGE_BASE64'),
  { type: 'image', image: bare });

eq('空图片 -> 空 url', buildImagePart('', 'auto'),
  { type: 'image_url', image_url: { url: '' } });

// 集成测试：保证返回的对象能塞进 OpenAI messages.content 数组
const part = buildImagePart(SAMPLE, 'image_base64');
const fakeMessages = [{ role: 'user', content: ['text', part] }];
eq('messages 集成', JSON.stringify(fakeMessages[0].content[1]),
  JSON.stringify({ type: 'image', image: bare }));

console.log('');
console.log('=== 结果 ===');
console.log('通过: ' + pass + ' / 失败: ' + fail);
process.exit(fail === 0 ? 0 : 1);
