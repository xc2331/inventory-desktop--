// scripts/run-fallback-e2e.js
// 一键启 mock + 跑 verify-fallback-e2e.js，自动清理 mock 进程
// 用法：node scripts/run-fallback-e2e.js

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const ROOT = path.join(__dirname, '..');
const MOCK = path.join(__dirname, 'dev-mock-provider-fallback.js');
const E2E = path.join(__dirname, 'verify-fallback-e2e.js');
const PORT = 19998;

function waitPort(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryOnce = () => {
      const s = net.createConnection(port, '127.0.0.1');
      s.once('connect', () => { s.end(); resolve(); });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
        setTimeout(tryOnce, 100);
      });
    };
    tryOnce();
  });
}

(async () => {
  // 先确保端口空
  await new Promise((res) => {
    const c = net.createConnection(PORT, '127.0.0.1');
    c.once('connect', () => {
      // 占用中 — 尝试 kill
      c.end();
      console.log('⚠ 端口 ' + PORT + ' 已被占用，尝试清理...');
      const { execSync } = require('child_process');
      try {
        execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \\$_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, { stdio: 'inherit' });
      } catch {}
      setTimeout(res, 800);
    });
    c.once('error', () => { res(); });
  });

  console.log('▶ 启动 mock provider (19998)...');
  const failTimes = process.env.MOCK_FAIL_TIMES || '2';
  const mock = spawn(process.execPath, [MOCK], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, MOCK_FAIL_TIMES: failTimes } });

  let code = 0;
  try {
    await waitPort(PORT, 5000);
    console.log('▶ mock ready — 跑 e2e');
    await new Promise((resolve) => {
      const e2e = spawn(process.execPath, [E2E], { cwd: ROOT, stdio: 'inherit' });
      e2e.on('exit', (c) => { code = c || 0; resolve(); });
    });
  } finally {
    console.log('▶ 关闭 mock');
    try { mock.kill('SIGKILL'); } catch {}
  }
  process.exit(code);
})();
