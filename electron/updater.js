// 软件内更新器：从 GitHub Releases 通过镜像源检查/下载/替换升级（portable exe 方案）
const { app, ipcMain, dialog } = require('electron')
const https = require('https')
const http = require('http')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { spawn } = require('child_process')

const OWNER = 'xc2331'
const REPO = 'inventory-desktop--'
const GITHUB_LATEST_BASE = `https://github.com/${OWNER}/${REPO}/releases/latest/download`

const DEFAULT_MIRRORS = [
  { name: 'GitHub 直连', url: GITHUB_LATEST_BASE },
  { name: 'ghproxy', url: `https://ghproxy.com/${GITHUB_LATEST_BASE}` },
  { name: 'mirror.ghproxy', url: `https://mirror.ghproxy.com/${GITHUB_LATEST_BASE}` },
  { name: 'ghps.cc', url: `https://ghps.cc/${GITHUB_LATEST_BASE}` }
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

// 将原始 GitHub URL 通过用户选择的镜像源转换
function applyMirror(originalUrl, mirrorBase) {
  if (!mirrorBase || mirrorBase === GITHUB_LATEST_BASE) return originalUrl
  const suffixMatch = originalUrl.match(
    /github\.com\/[^/]+\/[^/]+\/releases\/(latest\/download\/.+)$/
  )
  if (!suffixMatch) return originalUrl
  const base = mirrorBase.endsWith('/') ? mirrorBase.slice(0, -1) : mirrorBase
  return `${base}/${suffixMatch[1]}`
}

function fetchText(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const req = client.get(url, { timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchText(res.headers.location, timeout))
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
  })
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const file = fs.createWriteStream(dest)
    const req = client.get(url, { timeout: 120000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        return resolve(downloadFile(res.headers.location, dest, onProgress))
      }
      if (res.statusCode !== 200) {
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
        file.close()
        resolve({ total, downloaded })
      })
    })
    req.on('error', (err) => {
      file.close()
      reject(err)
    })
    req.on('timeout', () => {
      file.close()
      req.destroy()
      reject(new Error('下载超时'))
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

  getMirrorUrl() {
    const s = this.getSettings()
    return s.updateMirror || DEFAULT_MIRRORS[1].url
  }

  getUpdateInfoUrl() {
    const mirror = this.getMirrorUrl()
    return `${mirror}/${UPDATE_INFO_FILE}`
  }

  // 检查更新：silent=true 时只在发现新版本时通知，失败不弹错误
  async checkForUpdates(silent = false) {
    try {
      const url = this.getUpdateInfoUrl()
      const text = await fetchText(url)
      const info = JSON.parse(text)
      if (!info.version || !info.downloadUrl || !info.filename) {
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
          downloadUrl: applyMirror(info.downloadUrl, this.getMirrorUrl()),
          filename: info.filename,
          size: info.size || 0
        })
      } else if (!silent) {
        this.send('notAvailable', { currentVersion: this.currentVersion })
      }
      return { hasUpdate, info }
    } catch (e) {
      console.error('[updater] 检查更新失败:', e.message)
      if (!silent) this.send('error', { message: e.message })
      return { hasUpdate: false, error: e }
    }
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
      const url = applyMirror(this.latestInfo.downloadUrl, this.getMirrorUrl())
      const filename = this.latestInfo.filename
      const tempDir = app.getPath('temp')
      const dest = path.join(tempDir, filename)
      this.downloadPath = dest

      if (fs.existsSync(dest)) fs.unlinkSync(dest)

      this.send('downloadStart', { filename, size: this.latestInfo.size || 0 })

      await downloadFile(url, dest, (downloaded, total) => {
        this.send('progress', { downloaded, total, percent: total ? Math.round((downloaded / total) * 100) : 0 })
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
      this.send('error', { message: e.message })
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
      mirror: this.getMirrorUrl(),
      mirrors: DEFAULT_MIRRORS,
      autoCheck: this.getSettings().autoCheckUpdate !== false
    }))

    ipcMain.handle('updater:check', (_event, { silent } = {}) => {
      return this.checkForUpdates(silent)
    })

    ipcMain.handle('updater:setMirror', (_event, mirrorUrl) => {
      const s = this.getSettings()
      s.updateMirror = mirrorUrl
      writeAppSettings(s)
      return { ok: true, mirror: mirrorUrl }
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
  }
}

module.exports = { Updater, DEFAULT_MIRRORS, GITHUB_LATEST_BASE }
