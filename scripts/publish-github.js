#!/usr/bin/env node
/**
 * 一键发布到 GitHub Release
 *
 * 用法：
 *   1. 在 GitHub → Settings → Developer settings → Personal access tokens → 生成新令牌（勾选 repo 权限）
 *   2. 设置环境变量：
 *        set GH_TOKEN=你的GitHub令牌
 *        set GH_OWNER=xc2331           (可选，默认 xc2331)
 *        set GH_REPO=inventory-desktop--  (可选，默认 inventory-desktop--)
 *   3. 运行：node scripts/publish-github.js
 *
 * 脚本会自动：
 *   - 创建对应 tag 的 Release（已存在则复用）
 *   - 删除旧附件（避免重复）
 *   - 上传 exe 和 update-info.json
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

// 从项目根目录的 .env.local 加载令牌（已被 .gitignore 忽略，不会提交）
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf-8')
  content.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match) return
    const key = match[1]
    const value = match[2]
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  })
}
loadEnvLocal()

const TOKEN = process.env.GH_TOKEN
const OWNER = process.env.GH_OWNER || 'xc2331'
const REPO = process.env.GH_REPO || 'inventory-desktop--'

if (!TOKEN) {
  console.error('错误：请先设置环境变量 GH_TOKEN')
  console.error('  获取方式：GitHub → Settings → Developer settings → Personal access tokens → 生成新令牌（勾选 repo 权限）')
  console.error('  设置方式：set GH_TOKEN=你的令牌')
  process.exit(1)
}

const pkg = require('../package.json')
const version = pkg.version
const productName = pkg.build.productName
const outputDir = process.env.OUTPUT_DIR
  ? path.resolve(__dirname, '..', process.env.OUTPUT_DIR)
  : path.resolve(__dirname, '..', pkg.build.directories.output || 'release-v10')
const filename = `${productName} ${version}.exe`
const exePath = path.join(outputDir, filename)
const infoPath = path.join(outputDir, 'update-info.json')
const tag = `v${version}`

if (!fs.existsSync(exePath)) {
  console.error(`找不到 exe 文件: ${exePath}`)
  console.error('请先运行 npm run build:win')
  process.exit(1)
}
if (!fs.existsSync(infoPath)) {
  console.error(`找不到 update-info.json: ${infoPath}`)
  console.error('请先运行 node scripts/make-update-info.js')
  process.exit(1)
}

function apiRequest(method, apiPath, data, host) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://${host || 'api.github.com'}${apiPath}`)
    const body = data ? JSON.stringify(data) : null
    const options = {
      method,
      rejectUnauthorized: false,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'family-inventory-publisher'
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
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) })
        } catch (e) {
          resolve({ status: res.statusCode, data: d })
        }
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
        'User-Agent': 'family-inventory-publisher',
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
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) })
        } catch (e) {
          resolve({ status: res.statusCode, data: d })
        }
      })
    })
    req.on('error', (err) => {
      clearInterval(interval)
      reject(err)
    })
    req.write(fileBuffer)
    req.end()
  })
}

async function main() {
  console.log('========================================')
  console.log('  GitHub Release 一键发布工具')
  console.log('========================================')
  console.log(`  用户: ${OWNER}`)
  console.log(`  仓库: ${REPO}`)
  console.log(`  版本: ${version} (tag: ${tag})`)
  console.log(`  exe:  ${filename}`)
  console.log('========================================')
  console.log('')

  // 步骤 1：检查是否已有该 tag 的 release
  console.log('[1/4] 检查 Release 是否已存在...')
  let releaseId = null
  let uploadUrl = null
  const releaseRes = await apiRequest('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`)
  if (releaseRes.status === 200 && releaseRes.data && releaseRes.data.id) {
    releaseId = releaseRes.data.id
    uploadUrl = releaseRes.data.upload_url.replace('{?name,label}', '')
    console.log(`  Release 已存在 (id: ${releaseId})，将更新附件`)

    // 删除已有附件
    if (releaseRes.data.assets && releaseRes.data.assets.length > 0) {
      console.log('  清理旧附件...')
      for (const asset of releaseRes.data.assets) {
        try {
          await apiRequest('DELETE', `/repos/${OWNER}/${REPO}/releases/${releaseId}/assets/${asset.id}`)
          console.log(`  已删除: ${asset.name}`)
        } catch { console.log(`  删除失败: ${asset.name}`) }
      }
      // GitHub 删除是异步的，轮询直到附件确认消失（最多等 60 秒）
      let attempts = 0
      while (attempts < 12) {
        const fresh = await apiRequest('GET', `/repos/${OWNER}/${REPO}/releases/${releaseId}`)
        if (!fresh.data || !fresh.data.assets || fresh.data.assets.length === 0) break
        attempts++
        console.log(`  等待删除生效 (${attempts}/12)... 还剩 ${fresh.data.assets.length} 个附件`)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
      console.log(`  清理完成，开始上传新版本...`)
    }
  } else {
    console.log('  Release 不存在，正在创建...')
    const createRes = await apiRequest('POST', `/repos/${OWNER}/${REPO}/releases`, {
      tag_name: tag,
      name: tag,
      body: `家庭物资管家 ${version}`,
      target_commitish: 'main'
    })
    if (createRes.status === 201 || createRes.status === 200) {
      releaseId = createRes.data.id
      uploadUrl = createRes.data.upload_url.replace('{?name,label}', '')
      console.log(`  ✅ Release 创建成功 (id: ${releaseId})`)
    } else {
      console.error('  ❌ 创建 Release 失败:', createRes.status, createRes.data)
      process.exit(1)
    }
  }

  // 步骤 2：上传 exe
  console.log('[2/4] 上传 exe 文件...')
  const exeSize = fs.statSync(exePath).size
  console.log(`  文件大小: ${(exeSize / 1024 / 1024).toFixed(1)} MB`)
  const exeRes = await uploadAsset(uploadUrl, exePath, filename)
  if (exeRes.status === 201) {
    console.log('  ✅ exe 上传成功')
  } else {
    console.error('  ❌ exe 上传失败:', exeRes.status, exeRes.data)
  }

  // 步骤 3：上传 update-info.json
  console.log('[3/4] 上传 update-info.json...')
  const infoRes = await uploadAsset(uploadUrl, infoPath, 'update-info.json')
  if (infoRes.status === 201) {
    console.log('  ✅ update-info.json 上传成功')
  } else {
    console.error('  ❌ update-info.json 上传失败:', infoRes.status, infoRes.data)
  }

  // 步骤 4：验证
  console.log('[4/4] 验证 Release...')
  const verifyRes = await apiRequest('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`)
  if (verifyRes.status === 200) {
    console.log(`  ✅ 验证成功: tag=${verifyRes.data.tag_name}, assets=${verifyRes.data.assets.length}`)
  }

  console.log('')
  console.log('========================================')
  console.log('  ✅ 发布完成！')
  console.log(`  GitHub Release: https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`)
  console.log('========================================')
}

main().catch((e) => {
  console.error('发布失败:', e.message)
  process.exit(1)
})
