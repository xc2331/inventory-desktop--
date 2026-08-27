// scripts/dev-mock-provider-fallback.js
// mock OpenAI 兼容服务（端口 19998）：前 2 次 POST /chat/completions 返回 400，第三次起返回 200
// 用来验证 ai-service 收到 400 后能否自动 fallback 其它 imageFormat

const http = require('http');
const fs = require('fs');
const path = require('path');

const LOG = path.join(__dirname, '..', 'dev-mock-fallback.log.jsonl');
fs.writeFileSync(LOG, '');

let requestCount = 0;
// 可通过环境变量 MOCK_FAIL_TIMES 控制前 N 次返回 400（默认 2）
const FAIL_TIMES = Number(process.env.MOCK_FAIL_TIMES || 2);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/__last') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ count: requestCount }));
    return;
  }

  if (req.method === 'POST' && req.url === '/__reset') {
    requestCount = 0;
    fs.writeFileSync(LOG, '');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, count: 0 }));
    return;
  }

  if (req.method === 'POST' && req.url === '/__prime') {
    // 把 requestCount 推到 FAIL_TIMES+1，让下一次请求直接 200
    // 用于验证"自学习后第 2 次调用 1 次命中"场景
    requestCount = FAIL_TIMES + 1;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, count: requestCount }));
    return;
  }

  if (req.method === 'POST' && req.url === '/chat/completions') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requestCount++;
      const parsed = (() => { try { return JSON.parse(body); } catch { return {}; } })();
      fs.appendFileSync(LOG, JSON.stringify({ ts: Date.now(), n: requestCount, body: parsed }) + '\n');

      if (requestCount <= FAIL_TIMES) {
        // 前 N 次返回 400 — 模拟 1210 / 1214 image format error
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(400);
        res.end(JSON.stringify({
          error: {
            type: 'server_error',
            code: '1210',
            message: `图片输入格式/解析错误（mock 第 ${requestCount}/${FAIL_TIMES} 次故意 400）`
          }
        }));
        return;
      }
      // 第 3 次起 200
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: parsed.model || 'mock',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({ items: [{ name: 'mock-item', category: '其他', tags: [], confidence: 0.9 }] })
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      }));
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/models') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'mock-vision' }] }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const PORT = 19998;
server.listen(PORT, '127.0.0.1', () => {
  console.log('fallback mock provider listening on http://127.0.0.1:' + PORT);
  console.log('前 2 次 /chat/completions → 400；第 3 次起 → 200');
});
