// 软件内更新器：支持 Gitee + GitHub 多源自动降级 + 手动下载兜底
// 设计目标：国内用户优先走 Gitee，海外用户走 GitHub；任一源失败时自动尝试下一源。
const { app, ipcMain, dialog, shell } = require('electron')
const https = require('https')
const http = require('http')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { spawn } = require('child_process')

// ========== 仓库配置 ==========
// Gitee 配置可通过环境变量 GITEE_OWNER / GITEE_REPO 覆盖，方便不同开发者使用
const GITHUB_OWNER = 'xc2331'
const GITHUB_REPO = 'inventory-desktop--'
const GITEE_OWNER = process.env.GITEE_OWNER || 'xc2331'
const GITEE_REPO = process.env.GITEE_REPO || 'inventory-desktop'

const GITHUB_LATEST_BASE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download`

// 更新源列表，按默认优先级排序。首个可用源即用于下载。
// 包含多个 GitHub 镜像，提高国内可用性。
const UPDATE_SOURCES = [
  {
    id: 'gitee',
    name: 'Gitee 国内源（推荐）',
    type: 'gitee',
    owner: GITEE_OWNER,
    repo: GITEE_REPO
  },
  {
    id: 'ghfast',
    name: 'ghfast.top',
    type: 'github-mirror',
    baseUrl: `https://ghfast.top/${GITHUB_LATEST_BASE}`
  },
  {
    id: 'ghproxy',
    name: 'mirror.ghproxy',
    type: 'github-mirror',
    baseUrl: `https://mirror.ghproxy.com/${GITHUB_LATEST_BASE}`
  },
  {
    id: 'gh-proxy',
    name: 'gh-proxy.com',
    type: 'github-mirror',
    baseUrl: `https://gh-proxy.com/${GITHUB_LATEST_BASE}`
  },
  {
    id: 'moeyy',
    name: 'github.moeyy.xyz',
    type: 'github-mirror',
    baseUrl: `https://github.moeyy.xyz/${GITHUB_LATEST_BASE}`
  },
  {
    id: 'github',
    name: 'GitHub 直连',
    type: 'github',
    baseUrl: GITHUB_LATEST_BASE
  }
]

const UPDATE_INFO_FILE = 'update-info.json'
const SETTINGS_FILE = 'settings.json'

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

function readAppSettings() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'))
  } catch (e) {
    return {}
  }
}

function writeAppSettings(obj) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(obj, null, 2), 'utf-8')
}

// 将原始 GitHub URL 通过镜像源 baseUrl 转换
function applyMirror(originalUrl, mirrorBase) {
  if (!mirrorBase || mirrorBase === GITHUB_LATEST_BASE) return originalUrl
  if (!originalUrl.includes('github.com')) return originalUrl

  // mirrorBase 形如 https://mirror.ghproxy.com/https://github.com/.../releases/latest/download
  // 提取代理前缀，然后把它加到原始 GitHub URL 前面
  const proxyMatch = mirrorBase.match(/^(https?:\/\/[^/]+)\/(https?:\/\/github\.com\/)/)
  if (!proxyMatch) return originalUrl
  return `${proxyMatch[1]}/${originalUrl}`
}

// 根据来源构建最终下载 URL
function buildDownloadUrl(info) {
  const source = info && info._source
  if (!source) throw new Error('更新信息缺少来源')

  if (source.type === 'gitee') {
    if (!info._tag) throw new Error('Gitee 更新信息缺少 tag')
    return `https://gitee.com/${source.owner}/${source.repo}/releases/download/${info._tag}/${encodeURIComponent(info.filename)}`
  }

  if (source.type === 'github-mirror') {
    return applyMirror(info.downloadUrl, source.baseUrl)
  }

  return info.downloadUrl
}

function buildManualUrls() {
  return {
    gitee: `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases`,
    github: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`
  }
}

// 把网络/HTTP 错误转换为用户可理解的中文提示 + 解决方案
function humanizeUpdateError(err, context = 'check', allFailed = false) {
  const msg = (err && err.message) || String(err)
  const isDownload = context === 'download'
  const action = isDownload ? '下载更新' : '检查更新'

  if (allFailed || msg.includes('所有更新源均不可用')) {
    return {
      message: '所有更新源均不可用，暂时无法自动更新',
      solution: '请检查网络连接，或点击下方「手动下载」前往 Gitee / GitHub Releases 页面下载安装包。若长期无法自动更新，建议优先使用 Gitee 国内源。'
    }
  }

  if (msg.includes('Invalid URL') || msg.includes('ERR_INVALID_URL')) {
    return {
      message: `${action}失败：当前源生成的链接无效`,
      solution: '请在「设置 → 软件更新 → 更新源」中切换到「Gitee 国内源（推荐）」后重试。'
    }
  }
  if (msg.includes('timeout') || msg.includes('超时')) {
    return {
      message: `${action}超时：网络响应过慢或无响应`,
      solution: '请检查网络连接，或切换到其他更新源后重试。如果一直超时，可点击下方「手动下载」。'
    }
  }
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || msg.includes('ECONNREFUSED')) {
    return {
      message: `${action}失败：无法连接到更新服务器`,
      solution: '请检查网络连接；若使用代理/VPN，请尝试关闭或切换。也可在设置中切换更新源后重试。'
    }
  }
  if (msg.includes('HTTP 404')) {
    return {
      message: `${action}失败：服务器上找不到更新文件`,
      solution: '可能是新版本尚未发布或文件路径有误。请稍后再试，或到 Gitee/GitHub Releases 查看是否有新版本。'
    }
  }
  if (msg.includes('HTTP 403') || msg.includes('HTTP 429')) {
    return {
      message: `${action}失败：请求被服务器拒绝`,
      solution: '可能是当前 IP 请求过于频繁。请稍后再试，或切换到其他更新源。'
    }
  }
  if (msg.includes('sha512') || msg.includes('校验') || msg.includes('文件校验')) {
    return {
      message: '下载文件校验失败，文件可能在传输中损坏',
      solution: '请重新点击「立即更新」再次下载；若多次失败，可到 Gitee/GitHub Releases 手动下载安装。'
    }
  }
  if (msg.includes('更新信息格式不正确')) {
    return {
      message: '更新信息格式不正确',
      solution: '可能是镜像源缓存了错误内容。请切换到其他更新源后重试，或稍后重试。'
    }
  }

  // 兜底
  return {
    message: `${action}失败：${msg}`,
    solution: '请检查网络连接，或切换到其他更新源后重试。也可点击下方「手动下载」。'
  }
}

function fetchJson(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    let settled = false
    let req = null

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      if (req) req.destroy()
      reject(new Error('请求超时'))
    }, timeout)

    req = client.get(url, { timeout }, (res) => {
      res.setTimeout(timeout, () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        req.destroy()
        reject(new Error('响应超时'))
      })

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const redirectUrl = new URL(res.headers.location, url).href
        return resolve(fetchJson(redirectUrl, timeout))
      }
      if (res.statusCode !== 200) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        data += chunk
        if (data.length > 2 * 1024 * 1024) {
          if (settled) return
          settled = true
          clearTimeout(timer)
          req.destroy()
          reject(new Error('响应数据过大'))
        }
      })
      res.on('end', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error('JSON 解析失败'))
        }
      })
    })

    req.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    req.on('timeout', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      req.destroy()
      reject(new Error('连接超时'))
    })
  })
}

function fetchText(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    let settled = false
    let req = null

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      if (req) req.destroy()
      reject(new Error('请求超时'))
    }, timeout)

    req = client.get(url, { timeout }, (res) => {
      res.setTimeout(timeout, () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        req.destroy()
        reject(new Error('响应超时'))
      })

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const redirectUrl = new URL(res.headers.location, url).href
        return resolve(fetchText(redirectUrl, timeout))
      }
      if (res.statusCode !== 200) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        data += chunk
        if (data.length > 2 * 1024 * 1024) {
          if (settled) return
          settled = true
          clearTimeout(timer)
          req.destroy()
          reject(new Error('响应数据过大'))
        }
      })
      res.on('end', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(data)
      })
    })

    req.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    req.on('timeout', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      req.destroy()
      reject(new Error('连接超时'))
    })
  })
}

function downloadFile(url, dest, onProgress, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const file = fs.createWriteStream(dest)
    let settled = false
    let req = null

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      file.close()
      if (req) req.destroy()
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      reject(new Error('下载超时'))
    }, timeout)

    req = client.get(url, { timeout }, (res) => {
      res.setTimeout(timeout, () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        file.close()
        req.destroy()
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        reject(new Error('下载响应超时'))
      })

      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        file.close()
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        const redirectUrl = new URL(res.headers.location, url).href
        return resolve(downloadFile(redirectUrl, dest, onProgress, timeout))
      }
      if (res.statusCode !== 200) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        file.close()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const total = parseInt(res.headers['content-length'], 10) || 0
      let downloaded = 0
      res.on('data', (chunk) => {
        downloaded += chunk.length
        if (total && onProgress) onProgress(downloaded, total)
      })
      res.pipe(file)
      file.on('finish', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        file.close()
        resolve({ total, downloaded })
      })
    })
    req.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      file.close()
      reject(err)
    })
    req.on('timeout', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      file.close()
      req.destroy()
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      reject(new Error('下载连接超时'))
    })
  })
}

function compareVersion(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

function sha512File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function fetchUpdateInfoFromSource(source) {
  if (source.type === 'gitee') {
    // Gitee 没有 latest/download 重定向，先通过 API 取最新 tag
    const apiUrl = `https://gitee.com/api/v5/repos/${source.owner}/${source.repo}/releases/latest`
    const release = await fetchJson(apiUrl, 15000)
    if (!release.tag_name) {
      throw new Error('Gitee 返回的 release 没有 tag_name')
    }
    const infoUrl = `https://gitee.com/${source.owner}/${source.repo}/releases/download/${release.tag_name}/${UPDATE_INFO_FILE}`
    const text = await fetchText(infoUrl, 15000)
    const info = JSON.parse(text.replace(/^\uFEFF/, ''))
    info._source = source
    info._tag = release.tag_name
    return info
  }

  const base = (source.baseUrl || '').endsWith('/') ? source.baseUrl : `${source.baseUrl}/`
  const infoUrl = `${base}${UPDATE_INFO_FILE}`
  const text = await fetchText(infoUrl, 15000)
  const info = JSON.parse(text.replace(/^\uFEFF/, ''))
  info._source = source
  return info
}

class Updater {
  constructor(getMainWindow, onQuit) {
    this.getMainWindow = getMainWindow
    this.onQuit = onQuit
    this.currentVersion = app.getVersion()
    this.latestInfo = null
    this.downloadPath = ''
    this.isDownloading = false
    this.registerIpc()
  }

  send(channel, data) {
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(`updater:${channel}`, data)
    }
  }

  getSettings() {
    return readAppSettings()
  }

  getPreferredSourceId() {
    const s = this.getSettings()
    const stored = s.updateSource
    if (UPDATE_SOURCES.some((src) => src.id === stored)) return stored

    // 兼容旧配置 updateMirror
    const oldMirror = s.updateMirror
    if (oldMirror) {
      const matched = UPDATE_SOURCES.find(
        (src) => src.type !== 'gitee' && src.baseUrl === oldMirror
      )
      if (matched) return matched.id
    }

    return UPDATE_SOURCES[0].id // 默认 Gitee
  }

  getSourcesInPriorityOrder() {
    const preferredId = this.getPreferredSourceId()
    const preferred = UPDATE_SOURCES.find((s) => s.id === preferredId)
    const rest = UPDATE_SOURCES.filter((s) => s.id !== preferredId)
    return preferred ? [preferred, ...rest] : UPDATE_SOURCES
  }

  // 检查更新：silent=true 时只在发现新版本时通知，失败不弹错误
  async checkForUpdates(silent = false) {
    const errors = []
    const sources = this.getSourcesInPriorityOrder()

    for (const source of sources) {
      try {
        const info = await fetchUpdateInfoFromSource(source)
        if (!info.version || !info.filename) {
          throw new Error('更新信息格式不正确')
        }
        this.latestInfo = info
        const hasUpdate = compareVersion(info.version, this.currentVersion) > 0
        if (hasUpdate) {
          this.send('available', {
            currentVersion: this.currentVersion,
            latestVersion: info.version,
            releaseDate: info.releaseDate || '',
            releaseNotes: info.releaseNotes || '',
            downloadUrl: buildDownloadUrl(info),
            filename: info.filename,
            size: info.size || 0,
            sourceName: source.name
          })
        } else if (!silent) {
          this.send('notAvailable', { currentVersion: this.currentVersion, sourceName: source.name })
        }
        return { hasUpdate, info, source }
      } catch (e) {
        console.error(`[updater] 源 ${source.name} 失败:`, e.message)
        errors.push({ source: source.name, error: e.message })
      }
    }

    console.error('[updater] 所有更新源均不可用')
    const { message, solution } = humanizeUpdateError(
      new Error('所有更新源均不可用'),
      'check',
      true
    )
    if (!silent) {
      this.send('error', {
        message,
        solution,
        errors,
        manualUrls: buildManualUrls()
      })
    }
    return { hasUpdate: false, error: new Error('所有更新源均不可用'), errors, message, solution }
  }

  // 下载并自动安装
  async downloadAndInstall() {
    if (!this.latestInfo) {
      this.send('error', { message: '请先检查更新' })
      return
    }
    if (this.isDownloading) return
    this.isDownloading = true

    try {
      const url = buildDownloadUrl(this.latestInfo)
      const filename = this.latestInfo.filename
      const tempDir = app.getPath('temp')
      const dest = path.join(tempDir, filename)
      this.downloadPath = dest

      if (fs.existsSync(dest)) fs.unlinkSync(dest)

      this.send('downloadStart', { filename, size: this.latestInfo.size || 0, sourceName: this.latestInfo._source?.name })

      await downloadFile(url, dest, (downloaded, total) => {
        this.send('progress', {
          downloaded,
          total,
          percent: total ? Math.round((downloaded / total) * 100) : 0
        })
      })

      // 校验 sha512
      if (this.latestInfo.sha512) {
        const hash = await sha512File(dest)
        if (hash.toLowerCase() !== String(this.latestInfo.sha512).toLowerCase()) {
          fs.unlinkSync(dest)
          throw new Error('文件校验失败，请重新下载')
        }
      }

      this.send('downloaded', { filename, path: dest, version: this.latestInfo.version })
      this.install(dest)
    } catch (e) {
      console.error('[updater] 下载失败:', e.message)
      const { message, solution } = humanizeUpdateError(e, 'download')
      this.send('error', { message, solution, manualUrls: buildManualUrls() })
    } finally {
      this.isDownloading = false
    }
  }

  // 生成 PowerShell 脚本完成旧 exe 替换并启动新版本
  install(newExePath) {
    try {
      const oldExePath = app.getPath('exe')
      const appDir = path.dirname(oldExePath)
      const backupPath = `${oldExePath}.bak`
      const scriptPath = path.join(app.getPath('temp'), 'family-inventory-update.ps1')

      const ps = `
# 家庭物资管家自动更新脚本
$oldExe = '${oldExePath.replace(/'/g, "''")}'
$newExe = '${newExePath.replace(/'/g, "''")}'
$backup = '${backupPath.replace(/'/g, "''")}'
$appDir = '${appDir.replace(/'/g, "''")}'

Start-Sleep -Seconds 3

try {
  if (Test-Path $oldExe) {
    Move-Item -Path $oldExe -Destination $backup -Force -ErrorAction Stop
  }
  Move-Item -Path $newExe -Destination $oldExe -Force -ErrorAction Stop
  Start-Process -FilePath $oldExe -WorkingDirectory $appDir
} catch {
  if (Test-Path $backup) {
    Move-Item -Path $backup -Destination $oldExe -Force -ErrorAction SilentlyContinue
  }
  [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null
  [System.Windows.Forms.MessageBox]::Show('自动更新失败：' + $_.Exception.Message, '更新失败', 'OK', 'Error')
}

Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue
`
      fs.writeFileSync(scriptPath, ps, 'utf-8')

      const child = spawn(
        'powershell.exe',
        ['-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { detached: true, stdio: 'ignore' }
      )
      child.on('error', (err) => {
        console.error('[updater] 启动更新脚本失败:', err)
        dialog.showErrorBox('更新失败', `无法启动更新脚本：${err.message}`)
      })
      child.unref()

      // 通知渲染进程并退出当前应用
      this.send('installing')
      setTimeout(() => {
        if (this.onQuit) this.onQuit()
        app.quit()
      }, 500)
    } catch (e) {
      console.error('[updater] 安装失败:', e)
      this.send('error', { message: e.message })
    }
  }

  registerIpc() {
    ipcMain.handle('updater:info', () => ({
      currentVersion: this.currentVersion,
      source: this.getPreferredSourceId(),
      sources: UPDATE_SOURCES,
      autoCheck: this.getSettings().autoCheckUpdate !== false
    }))

    ipcMain.handle('updater:check', (_event, { silent } = {}) => {
      return this.checkForUpdates(silent)
    })

    // 新接口：按源 id 设置首选源
    ipcMain.handle('updater:setSource', (_event, sourceId) => {
      const s = this.getSettings()
      if (UPDATE_SOURCES.some((src) => src.id === sourceId)) {
        s.updateSource = sourceId
        delete s.updateMirror // 清理旧配置
        writeAppSettings(s)
      }
      return { ok: true, source: this.getPreferredSourceId() }
    })

    // 兼容旧接口：按 URL 设置镜像
    ipcMain.handle('updater:setMirror', (_event, mirrorUrl) => {
      const s = this.getSettings()
      const matched = UPDATE_SOURCES.find((src) => src.type !== 'gitee' && src.baseUrl === mirrorUrl)
      if (matched) {
        s.updateSource = matched.id
      } else {
        s.updateMirror = mirrorUrl
        delete s.updateSource
      }
      writeAppSettings(s)
      return { ok: true, source: this.getPreferredSourceId() }
    })

    ipcMain.handle('updater:setAutoCheck', (_event, enabled) => {
      const s = this.getSettings()
      s.autoCheckUpdate = enabled === true
      writeAppSettings(s)
      return { ok: true, autoCheck: s.autoCheckUpdate }
    })

    ipcMain.handle('updater:download', () => {
      return this.downloadAndInstall()
    })

    ipcMain.handle('updater:openExternal', (_event, url) => {
      if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
        shell.openExternal(url).catch((err) => console.error('[updater] 打开链接失败:', err))
      }
      return { ok: true }
    })
  }
}

module.exports = { Updater, UPDATE_SOURCES, GITHUB_LATEST_BASE }
