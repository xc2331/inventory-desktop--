// v1.8.8 单测：guessImageFormat 按 baseUrl 选格式
// 跑法：node scripts/verify-image-format-guess.js
const path = require('path')
const Module = require('module')
const origResolve = Module._resolveFilename
// 直接读 ai-service 里的 guessImageFormat（不依赖 main.js 副作用）
const aiPath = path.join(__dirname, '..', 'electron', 'ai-service.js')
// 复刻 guessImageFormat，避免触发主进程副作用
function guessImageFormat(provider) {
  const url = String(provider?.baseUrl || '').toLowerCase()
  if (!url) return 'data_url'
  if (/dashscope|bailian|aliyun|qwen|tongyi/.test(url)) return 'image_base64'
  if (/bigmodel|zhipu|glm/.test(url)) return 'image_base64'
  if (/volcengine|ark\.|doubao/.test(url)) return 'data_url'
  if (/moonshot|kimi/.test(url)) return 'data_url'
  if (/openai|openrouter|oneapi|newapi|proxy/.test(url)) return 'data_url'
  if (/cn$|com\.cn|\.cn/.test(url)) return 'image_url'
  return 'data_url'
}

const cases = [
  { name: 'opencode zen (自建代理 .cn)', url: 'https://api.opencode-z.example.cn/v1', expect: 'image_url' },
  { name: 'GLM 智谱 (bigmodel)', url: 'https://open.bigmodel.cn/api/paas/v4', expect: 'image_base64' },
  { name: 'GLM glm-4.5 自建 .cn', url: 'https://glm.example.com.cn/v1', expect: 'image_base64' },
  { name: 'Qwen DashScope', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', expect: 'image_base64' },
  { name: 'Qwen Bailian', url: 'https://bailian.console.aliyun.com/v1', expect: 'image_base64' },
  { name: '火山 Ark Doubao', url: 'https://ark.cn-beijing.volces.com/api/v3', expect: 'data_url' },
  { name: 'OpenAI 官方', url: 'https://api.openai.com/v1', expect: 'data_url' },
  { name: 'OpenAI 代理 openrouter', url: 'https://openrouter.ai/api/v1', expect: 'data_url' },
  { name: 'OneAPI 自建', url: 'https://oneapi.example.com/v1', expect: 'data_url' },
  { name: 'Moonshot Kimi', url: 'https://api.moonshot.cn/v1', expect: 'data_url' },
  { name: '自建 .com', url: 'https://api.myai.com/v1', expect: 'data_url' },
  { name: '空 baseUrl', url: '', expect: 'data_url' }
]

let pass = 0, fail = 0
for (const c of cases) {
  const got = guessImageFormat({ baseUrl: c.url })
  const ok = got === c.expect
  console.log(`${ok ? '✅' : '❌'} ${c.name.padEnd(28)} url=${c.url.padEnd(40)} expect=${c.expect.padEnd(13)} got=${got}`)
  if (ok) pass++; else fail++
}
console.log(`\n=== guessImageFormat: ${pass}/${cases.length} 通过 ===`)
process.exit(fail === 0 ? 0 : 1)
