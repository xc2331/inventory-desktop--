#!/usr/bin/env node
/**
 * 批量发布多个版本到 GitHub Releases
 *
 * 用法:
 *   node scripts/publish-github-batch.js              # 发布 output 目录下所有版本
 *   node scripts/publish-github-batch.js 1.5.8 1.5.9  # 指定版本
 *
 * 每个版本会:
 *   1. 临时写 update-info.json（对应版本 hash/size）
 *   2. 创建/更新 GitHub Release
 *   3. 清理旧附件
 *   4. 上传 exe + update-info.json
 *   5. 验证
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf-8')
  content.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match) return
    if (process.env[match[1]] === undefined) process.env[match[1]] = match[2]
  })
}
loadEnvLocal()

const TOKEN = process.env.GH_TOKEN
const OWNER = process.env.GH_OWNER || 'xc2331'
const REPO = process.env.GH_REPO || 'inventory-desktop--'

if (!TOKEN) {
  console.error('错误：请先设置环境变量 GH_TOKEN')
  process.exit(1)
}

const pkg = require('../package.json')
const productName = pkg.build.productName
const outputDir = path.resolve(__dirname, '..', pkg.build.directories.output || 'release-v19-v169')

// 找出要发布的版本
let versions
if (process.argv.length > 2) {
  versions = process.argv.slice(2)
} else {
  versions = fs.readdirSync(outputDir)
    .filter((f) => f.startsWith(productName + ' ') && f.endsWith('.exe'))
    .map((f) => f.slice(productName.length + 1, -4))
    .sort((a, b) => {
      const pa = a.split('.').map(Number)
      const pb = b.split('.').map(Number)
      for (let i = 0; i < 3; i++) { if (pa[i] !== pb[i]) return pa[i] - pb[i] }
      return 0
    })
}

console.log('========================================')
console.log('  批量发布到 GitHub Releases')
console.log('========================================')
console.log(`  用户: ${OWNER}`)
console.log(`  仓库: ${REPO}`)
console.log(`  版本数: ${versions.length}`)
console.log(`  版本: ${versions.join(', ')}`)
console.log('========================================\n')

function apiRequest(method, apiPath, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.github.com${apiPath}`)
    const body = data ? JSON.stringify(data) : null
    const options = {
      method,
      rejectUnauthorized: false,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'family-inventory-batch-publisher'
      }
    }
    if (body) {
      options.headers['Content-Type'] = 'application/json'
      options.headers['Content-Length'] = Buffer.byteLength(body)
    }
    const req = https.request(url, options, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, data: d }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function uploadAsset(uploadUrl, filePath, name) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(filePath)
    const parsed = new URL(uploadUrl)
    parsed.searchParams.set('name', name)
    const options = {
      method: 'POST',
      rejectUnauthorized: false,
      host: parsed.host,
      path: parsed.pathname + parsed.search,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'family-inventory-batch-publisher',
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuffer.length
      }
    }
    let uploaded = 0
    const total = fileBuffer.length
    const interval = setInterval(() => {
      if (uploaded < total) {
        uploaded = Math.min(uploaded + total / 20, total)
        process.stdout.write(`\r  上传 ${name}: ${Math.round((uploaded / total) * 100)}%`)
      }
    }, 500)
    const req = https.request(options, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => {
        clearInterval(interval)
        process.stdout.write(`\r  上传 ${name}: 100%\n`)
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, data: d }) }
      })
    })
    req.on('error', (err) => { clearInterval(interval); reject(err) })
    req.write(fileBuffer)
    req.end()
  })
}

async function publishVersion(ver) {
  const tag = `v${ver}`
  const exeFilename = `${productName} ${ver}.exe`
  const exePath = path.join(outputDir, exeFilename)
  if (!fs.existsSync(exePath)) {
    console.error(`  ❌ 跳过 ${ver}: exe 不存在`)
    return false
  }

  // 生成对应版本的 update-info.json（临时写入 output 目录）
  const size = fs.statSync(exePath).size
  const hash = crypto.createHash('sha512')
  hash.update(fs.readFileSync(exePath))
  const sha512 = hash.digest('hex')
  const info = {
    version: ver,
    releaseDate: new Date().toISOString(),
    downloadUrl: `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${encodeURIComponent(exeFilename)}`,
    filename: exeFilename,
    size,
    sha512,
    releaseNotes: `Family Inventory v${ver}`
  }
  const infoPath = path.join(outputDir, 'update-info.json')
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf-8')

  console.log(`\n[${ver}] 开始发布...`)

  // 检查/创建 Release
  let releaseId, uploadUrl
  const releaseRes = await apiRequest('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`)
  if (releaseRes.status === 200 && releaseRes.data?.id) {
    releaseId = releaseRes.data.id
    uploadUrl = releaseRes.data.upload_url.replace('{?name,label}', '')
    console.log(`  Release 已存在 (id: ${releaseId})，清理旧附件...`)
    if (releaseRes.data.assets && releaseRes.data.assets.length > 0) {
      for (const asset of releaseRes.data.assets) {
        try {
          await apiRequest('DELETE', `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets/${asset.id}`)
          console.log(`    已删除: ${asset.name}`)
        } catch { console.log(`    删除失败: ${asset.name}`) }
      }
      // 等待删除生效
      for (let i = 0; i < 12; i++) {
        const fresh = await apiRequest('GET', `/repos/${OWNER}/${REPO}/releases/${releaseId}`)
        if (!fresh.data?.assets || fresh.data.assets.length === 0) break
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  } else {
    console.log(`  创建 Release...`)
    const createRes = await apiRequest('POST', `/repos/${OWNER}/${REPO}/releases`, {
      tag_name: tag,
      name: tag,
      body: `Family Inventory v${ver}`,
      target_commitish: 'main'
    })
    if (createRes.status === 201 || createRes.status === 200) {
      releaseId = createRes.data.id
      uploadUrl = createRes.data.upload_url.replace('{?name,label}', '')
      console.log(`  ✅ Release 创建成功`)
    } else {
      console.error(`  ❌ 创建失败: ${createRes.status}`, createRes.data)
      return false
    }
  }

  // 上传 exe
  const exeRes = await uploadAsset(uploadUrl, exePath, exeFilename)
  if (exeRes.status === 201) {
    console.log('  ✅ exe 上传成功')
  } else {
    console.error(`  ❌ exe 上传失败: ${exeRes.status}`, exeRes.data)
    return false
  }

  // 上传 update-info.json
  const infoRes = await uploadAsset(uploadUrl, infoPath, 'update-info.json')
  if (infoRes.status === 201) {
    console.log('  ✅ update-info.json 上传成功')
  } else {
    console.error(`  ❌ update-info.json 上传失败: ${infoRes.status}`, infoRes.data)
  }

  // 验证
  const verify = await apiRequest('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`)
  if (verify.status === 200) {
    console.log(`  ✅ 验证成功: ${verify.data.assets.length} 个附件`)
    console.log(`  链接: https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`)
    return true
  }

  return false
}

// 主流程：串行发布
async function main() {
  const results = []
  for (const ver of versions) {
    const ok = await publishVersion(ver)
    results.push({ version: ver, ok })
    if (ok) {
      // 版本间隔 3 秒，避免 GitHub API 限流
      if (versions.indexOf(ver) < versions.length - 1) {
        console.log('  等待 3 秒...')
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    }
  }

  const success = results.filter(r => r.ok).length
  const fail = results.filter(r => !r.ok).length
  console.log(`\n========================================`)
  console.log(`  发布完成！成功: ${success}, 失败: ${fail}`)
  console.log('========================================')
}

main().catch((e) => {
  console.error('发布失败:', e.message)
  process.exit(1)
})