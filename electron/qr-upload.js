// 手机扫码传图服务：桌面端启动临时 HTTP 服务，手机拍照/选图上传后转 Base64 存入物品照片
const http = require('http')
const os = require('os')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const PREFERRED_NAMES = ['wi-fi', 'wifi', 'wlan', 'ethernet', 'eth', '本地连接', '以太网']
const BLOCKED_NAMES = ['virtual', 'vmware', 'hyper-v', 'veth', 'docker', 'tun', 'tap', 'ppp', 'loopback']

function scoreInterface(name) {
  const lower = name.toLowerCase()
  if (BLOCKED_NAMES.some((n) => lower.includes(n))) return -1
  return PREFERRED_NAMES.reduce((s, pn) => (lower.includes(pn) ? s + 2 : s), 0)
}

function getInterfaceCandidates() {
  const interfaces = os.networkInterfaces()
  const candidates = []
  for (const [name, list] of Object.entries(interfaces)) {
    const score = scoreInterface(name)
    if (score < 0) continue
    for (const iface of list) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      const addr = iface.address
      if (addr.startsWith('127.')) continue
      if (addr.startsWith('169.254.')) continue
      candidates.push({ name, address: addr, score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

function getLocalIp() {
  const candidates = getInterfaceCandidates()
  console.log('[qr-upload] available IPs:', candidates)
  return candidates.length > 0 ? candidates[0].address : '127.0.0.1'
}

function getLocalIps() {
  return getInterfaceCandidates().map((c) => c.address)
}

// 上传体大小上限：超过即断开连接，防止局域网恶意大 body 耗尽内存
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
// 二维码有效期：启动 10 分钟后自动关闭服务，用户忘关弹窗不再长期暴露端口
const QR_EXPIRE_MS = 10 * 60 * 1000

function parseMultipart(req, boundary) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let aborted = false
    req.on('data', (c) => {
      if (aborted) return
      total += c.length
      if (total > MAX_UPLOAD_BYTES) {
        aborted = true
        chunks.length = 0
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (aborted) return
      const buffer = Buffer.concat(chunks)
      const boundaryBuf = Buffer.from('--' + boundary)
      const parts = []
      let start = buffer.indexOf(boundaryBuf)
      while (start !== -1) {
        const afterBoundary = start + boundaryBuf.length
        // 到达结束边界 --boundary--\r\n
        if (buffer.slice(afterBoundary, afterBoundary + 2).toString() === '--') break
        const nextBoundary = buffer.indexOf(boundaryBuf, afterBoundary)
        const part = nextBoundary === -1 ? buffer.slice(afterBoundary) : buffer.slice(afterBoundary, nextBoundary)
        const headerEnd = part.indexOf('\r\n\r\n')
        if (headerEnd !== -1) {
          const header = part.slice(0, headerEnd).toString()
          // 正文只取到下一个 boundary 之前的 \r\n，避免混入 boundary 标记
          const bodyStart = headerEnd + 4
          let bodyEnd = part.indexOf(Buffer.from('\r\n--' + boundary), bodyStart)
          if (bodyEnd === -1) bodyEnd = part.length
          let body = part.slice(bodyStart, bodyEnd)
          // 去除末尾换行
          if (body.length >= 2 && body.slice(-2).toString() === '\r\n') {
            body = body.slice(0, -2)
          }
          parts.push({ header, data: body })
        }
        if (nextBoundary === -1) break
        start = nextBoundary
      }
      resolve(parts)
    })
    req.on('error', reject)
  })
}

class QRUploadServer {
  constructor({ getMainWindow }) {
    this.getMainWindow = getMainWindow
    this.server = null
    this.connections = new Set()
    this.port = 0
    this.token = ''
    this.used = false
    this.receivedImage = null
    this.expireTimer = null
  }

  start() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.scheduleExpire()
        resolve({ port: this.port, url: this.getUrl(), token: this.token, ips: getLocalIps() })
        return
      }
      this.token = crypto.randomUUID()
      this.used = false
      this.receivedImage = null
      this.connections = new Set()
      this.server = http.createServer((req, res) => this.handle(req, res))
      this.server.on('connection', (socket) => {
        this.connections.add(socket)
        socket.on('close', () => this.connections.delete(socket))
      })
      // 优先使用固定端口 3002，方便用户一次性放行防火墙；被占用则回退到随机端口
      const onListen = () => {
        this.port = this.server.address().port
        const info = { port: this.port, url: this.getUrl(), token: this.token, ips: getLocalIps() }
        console.log('[qr-upload] server started at', info.url)
        this.scheduleExpire()
        resolve(info)
      }
      const onError = (e) => {
        if (e.code === 'EADDRINUSE' && this.port === 0) {
          // 3002 被占用，回退随机端口
          console.log('[qr-upload] port 3002 in use, falling back to random port')
          this.server.removeListener('error', onError)
          this.server.once('error', (e2) => reject(e2))
          this.server.listen(0, '0.0.0.0', onListen)
        } else {
          reject(e)
        }
      }
      this.server.once('error', onError)
      this.server.listen(3002, '0.0.0.0', () => {
        this.server.removeListener('error', onError)
        this.server.on('error', (e) => console.error('[qr-upload] server error:', e))
        onListen()
      })
    })
  }

  // 二维码有效期：超时自动关闭服务（token 一并失效），避免用户忘关弹窗长期暴露端口
  scheduleExpire() {
    clearTimeout(this.expireTimer)
    this.expireTimer = setTimeout(() => {
      if (this.server) {
        console.log('[qr-upload] expired after', QR_EXPIRE_MS / 60000, 'min, stopping server')
        this.stop()
      }
    }, QR_EXPIRE_MS)
    if (this.expireTimer.unref) this.expireTimer.unref()
  }

  stop() {
    clearTimeout(this.expireTimer)
    this.expireTimer = null
    if (this.server) {
      try {
        // 强制断开所有活跃连接，确保端口立即释放
        if (typeof this.server.closeAllConnections === 'function') {
          this.server.closeAllConnections()
        }
      } catch (e) {
        /* ignore */
      }
      for (const socket of this.connections) {
        try { socket.destroy() } catch (e) { /* ignore */ }
      }
      this.connections.clear()
      this.server.close()
      this.server = null
    }
    this.port = 0
    this.token = ''
    this.used = false
    this.receivedImage = null
  }

  getUrl() {
    return `http://${getLocalIp()}:${this.port}?token=${this.token}`
  }

  sendToRenderer(channel, data) {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }

  async handle(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`)
    const token = url.searchParams.get('token')

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (token !== this.token) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Token 无效或已过期')
      return
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(this.mobilePage())
      return
    }

    if (req.method === 'POST') {
      if (this.used) {
        res.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('该二维码已使用，请刷新桌面端二维码重新上传')
        return
      }
      try {
        const contentType = req.headers['content-type'] || ''
        const boundaryMatch = contentType.match(/boundary=([^;\s]+)/)
        if (!boundaryMatch) {
          res.writeHead(400)
          res.end('Missing boundary')
          return
        }
        const parts = await parseMultipart(req, boundaryMatch[1])
        const filePart = parts.find((p) => p.header.includes('filename='))
        if (!filePart || !filePart.data || filePart.data.length === 0) {
          res.writeHead(400)
          res.end('No file uploaded')
          return
        }
        const base64 = filePart.data.toString('base64')
        const ext = this.guessExt(filePart.header)
        const dataUrl = `data:image/${ext};base64,${base64}`
        this.used = true
        this.receivedImage = dataUrl
        this.sendToRenderer('qrUpload:image', { image: dataUrl })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        console.error('[qr-upload] upload error:', e)
        res.writeHead(500)
        res.end('Upload failed')
      }
      return
    }

    res.writeHead(404)
    res.end('Not found')
  }

  guessExt(header) {
    const m = header.match(/filename="[^"]*\.([a-zA-Z0-9]+)"/)
    if (m) return m[1].toLowerCase()
    const ct = header.match(/Content-Type:\s*image\/([a-zA-Z0-9]+)/i)
    if (ct) return ct[1].toLowerCase()
    return 'jpeg'
  }

  mobilePage() {
    const url = this.getUrl()
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>手机传图</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; background: #fbfaf8; color: #1c1917; }
    .wrap { max-width: 420px; margin: 0 auto; padding: 24px 16px; }
    h1 { font-size: 20px; margin: 0 0 8px; color: #059669; }
    p { margin: 0 0 20px; font-size: 14px; color: #5c5751; line-height: 1.5; }
    .card { background: #fff; border-radius: 20px; padding: 20px; box-shadow: 0 2px 8px rgba(28,25,23,0.05); border: 1px solid #e9e5de; }
    label { display: block; width: 100%; }
    input[type="file"] { position: fixed; left: -9999px; }
    .btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 14px; border-radius: 14px; background: #059669; color: #fff; font-size: 16px; font-weight: 600; border: none; cursor: pointer; }
    .btn.secondary { background: #f5f3f0; color: #5c5751; margin-top: 10px; }
    .preview { width: 100%; border-radius: 14px; margin-top: 16px; display: none; }
    .status { margin-top: 16px; font-size: 14px; text-align: center; }
    .status.ok { color: #059669; }
    .status.err { color: #be123c; }
    .urlbox { margin-top: 16px; padding: 12px; background: #f5f3f0; border-radius: 12px; font-size: 12px; color: #78716c; word-break: break-all; }
    .tip { margin-top: 16px; padding: 12px; background: #d1fae5; border-radius: 12px; font-size: 12px; color: #065f46; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>📷 手机传图到家庭物资管家</h1>
    <p>选择拍照或从相册选图，上传后会自动同步到电脑端。</p>
    <div class="card">
      <label>
        <input type="file" id="cameraInput" accept="image/*" capture="environment">
        <div class="btn" id="takeBtn">拍照上传</div>
      </label>
      <label>
        <input type="file" id="albumInput" accept="image/*">
        <button type="button" class="btn secondary" id="albumBtn">从相册选择</button>
      </label>
      <img id="preview" class="preview" alt="preview">
      <div id="status" class="status"></div>
    </div>
    <div class="urlbox">访问地址：${url}<br>若打不开，请检查电脑防火墙是否放行端口 ${this.port}。</div>
    <div class="tip">提示：二维码一次性有效，上传成功后自动失效。如果失败，请检查手机和电脑是否在同一 Wi-Fi，并尝试关闭手机流量。</div>
  </div>
  <script>
    const cameraInput = document.getElementById('cameraInput');
    const albumInput = document.getElementById('albumInput');
    const takeBtn = document.getElementById('takeBtn');
    const albumBtn = document.getElementById('albumBtn');
    const preview = document.getElementById('preview');
    const status = document.getElementById('status');

    takeBtn.addEventListener('click', () => cameraInput.click());
    albumBtn.addEventListener('click', () => albumInput.click());

    async function upload(input) {
      const file = input.files[0];
      if (!file) return;
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';
      status.textContent = '正在上传…';
      status.className = 'status';
      const form = new FormData();
      form.append('photo', file);
      try {
        const res = await fetch(window.location.href, { method: 'POST', body: form });
        if (res.ok) {
          status.textContent = '✅ 上传成功！电脑端已收到图片。';
          status.className = 'status ok';
        } else {
          const text = await res.text();
          status.textContent = '上传失败：' + text;
          status.className = 'status err';
        }
      } catch (e) {
        status.textContent = '上传失败：' + e.message;
        status.className = 'status err';
      }
    }

    cameraInput.addEventListener('change', () => upload(cameraInput));
    albumInput.addEventListener('change', () => upload(albumInput));
  </script>
</body>
</html>`
  }
}

module.exports = { QRUploadServer }
