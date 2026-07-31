// 手机扫码传图服务：桌面端启动临时 HTTP 服务，手机拍照/选图上传后转 Base64 存入物品照片
const http = require('http')
const os = require('os')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

function getLocalIp() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

function parseMultipart(req, boundary) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const buffer = Buffer.concat(chunks)
      const delim = Buffer.from('--' + boundary)
      const parts = []
      let start = buffer.indexOf(delim)
      while (start !== -1) {
        const end = buffer.indexOf(delim, start + delim.length)
        const part = end === -1 ? buffer.slice(start) : buffer.slice(start, end)
        const headerEnd = part.indexOf('\r\n\r\n')
        if (headerEnd !== -1) {
          const header = part.slice(0, headerEnd).toString()
          const body = part.slice(headerEnd + 4)
          // 去掉末尾的 \r\n 或 --\r\n
          let data = body
          if (data.slice(-2).toString() === '\r\n') data = data.slice(0, -2)
          if (data.slice(-4).toString() === '--\r\n') data = data.slice(0, -4)
          parts.push({ header, data })
        }
        if (end === -1) break
        start = end
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
    this.port = 0
    this.token = ''
    this.used = false
    this.receivedImage = null
  }

  start() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        resolve({ port: this.port, url: this.getUrl(), token: this.token })
        return
      }
      this.token = crypto.randomUUID()
      this.used = false
      this.receivedImage = null
      this.server = http.createServer((req, res) => this.handle(req, res))
      this.server.on('error', (e) => reject(e))
      this.server.listen(0, '0.0.0.0', () => {
        this.port = this.server.address().port
        const info = { port: this.port, url: this.getUrl(), token: this.token }
        console.log('[qr-upload] server started at', info.url)
        resolve(info)
      })
    })
  }

  stop() {
    if (this.server) {
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
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>手机传图</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #334155; }
    .wrap { max-width: 420px; margin: 0 auto; padding: 24px 16px; }
    h1 { font-size: 20px; margin: 0 0 8px; color: #0f766e; }
    p { margin: 0 0 20px; font-size: 14px; color: #64748b; line-height: 1.5; }
    .card { background: #fff; border-radius: 16px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    label { display: block; width: 100%; }
    input[type="file"] { display: none; }
    .btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 14px; border-radius: 12px; background: linear-gradient(135deg, #14b8a6, #0d9488); color: #fff; font-size: 16px; font-weight: 600; border: none; cursor: pointer; }
    .btn.secondary { background: #f1f5f9; color: #475569; margin-top: 10px; }
    .preview { width: 100%; border-radius: 12px; margin-top: 16px; display: none; }
    .status { margin-top: 16px; font-size: 14px; text-align: center; }
    .status.ok { color: #059669; }
    .status.err { color: #dc2626; }
    .tip { margin-top: 16px; padding: 12px; background: #f0fdfa; border-radius: 10px; font-size: 12px; color: #0f766e; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>📷 手机传图到家庭物资管家</h1>
    <p>选择拍照或从相册选图，上传后会自动同步到电脑端。</p>
    <div class="card">
      <label>
        <input type="file" id="file" accept="image/*" capture="environment">
        <div class="btn" id="takeBtn">拍照 / 选图</div>
      </label>
      <button class="btn secondary" id="albumBtn">从相册选择</button>
      <img id="preview" class="preview" alt="preview">
      <div id="status" class="status"></div>
    </div>
    <div class="tip">提示：上传成功后，电脑端会自动填充照片；如果失败，请检查手机和电脑是否在同一 Wi-Fi。</div>
  </div>
  <script>
    const fileInput = document.getElementById('file');
    const takeBtn = document.getElementById('takeBtn');
    const albumBtn = document.getElementById('albumBtn');
    const preview = document.getElementById('preview');
    const status = document.getElementById('status');

    takeBtn.addEventListener('click', () => fileInput.click());
    albumBtn.addEventListener('click', () => { fileInput.removeAttribute('capture'); fileInput.click(); });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
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
    });
  </script>
</body>
</html>`
  }
}

module.exports = { QRUploadServer }
