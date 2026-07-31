#!/usr/bin/env node
/**
 * 一键发布到 Gitee Release
 *
 * 用法：
 *   1. 在 Gitee 注册账号 → 设置 → 私人令牌 → 生成新令牌（勾选 projects 权限）
 *   2. 设置环境变量：
 *        set GITEE_TOKEN=你的私人令牌
 *        set GITEE_OWNER=你的Gitee用户名
 *        set GITEE_REPO=仓库名
 *   3. 运行：node scripts/publish-gitee.js
 *
 * 脚本会自动：
 *   - 检查/创建 Gitee 仓库
 *   - 创建对应 tag 的 Release
 *   - 上传 exe 和 update-info.json
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const TOKEN = process.env.GITEE_TOKEN
const OWNER = process.env.GITEE_OWNER || 'xc2331'
const REPO = process.env.GITEE_REPO || 'inventory-desktop'

if (!TOKEN) {
  console.error('错误：请先设置环境变量 GITEE_TOKEN')
  console.error('  获取方式：Gitee → 设置 → 私人令牌 → 生成新令牌（勾选 projects 权限）')
  console.error('  设置方式：set GITEE_TOKEN=你的令牌')
  process.exit(1)
}

const pkg = require('../package.json')
const version = pkg.version
const productName = pkg.build.productName
const outputDir = process.env.OUTPUT_DIR
  ? path.resolve(__dirname, '..', process.env.OUTPUT_DIR)
  : path.resolve(__dirname, '..', pkg.build.directories.output || 'release-v5')
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

function apiRequest(method, apiPath, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://gitee.com/api/v5${apiPath}`)
    if (method === 'GET') {
      url.searchParams.set('access_token', TOKEN)
    }

    const body = data ? JSON.stringify(data) : null
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      }
    }
    if (body) options.headers['Content-Length'] = Buffer.byteLength(body)

    const req = https.request(url, options, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => {
        try {
          const json = JSON.parse(d)
          resolve({ status: res.statusCode, data: json })
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

function uploadAsset(releaseId, filePath, name) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(filePath)
    const fileSize = fileBuffer.length
    const boundary = '----FormBoundary' + Math.random().toString(16).slice(2)

    // 构建 multipart/form-data
    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="access_token"\r\n\r\n${TOKEN}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${name}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    )
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
    const body = Buffer.concat([header, fileBuffer, footer])

    const options = {
      method: 'POST',
      host: 'gitee.com',
      path: `/api/v5/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files`,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }

    const req = https.request(options, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => {
        console.log(`  上传 ${name}: HTTP ${res.statusCode}`)
        try {
          resolve({ status: res.statusCode, data: JSON.parse(d) })
        } catch (e) {
          resolve({ status: res.statusCode, data: d })
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()

    // 进度显示
    let uploaded = 0
    const total = body.length
    const interval = setInterval(() => {
      if (uploaded < total) {
        uploaded = Math.min(uploaded + total / 20, total)
        process.stdout.write(`\r  上传 ${name}: ${Math.round((uploaded / total) * 100)}%`)
      }
    }, 500)
    req.on('close', () => {
      clearInterval(interval)
      process.stdout.write(`\r  上传 ${name}: 100%\n`)
    })
  })
}

async function main() {
  console.log('========================================')
  console.log('  Gitee Release 一键发布工具')
  console.log('========================================')
  console.log(`  用户: ${OWNER}`)
  console.log(`  仓库: ${REPO}`)
  console.log(`  版本: ${version} (tag: ${tag})`)
  console.log(`  exe:  ${filename}`)
  console.log('========================================')
  console.log('')

  // 步骤 1：检查仓库是否存在
  console.log('[1/4] 检查仓库是否存在...')
  let repoRes = await apiRequest('GET', `/repos/${OWNER}/${REPO}`)
  if (repoRes.status === 404) {
    console.log('  仓库不存在，正在创建...')
    const createRes = await apiRequest('POST', '/user/repos', {
      name: REPO,
      private: false,
      auto_init: true
    })
    if (createRes.status === 201) {
      console.log('  ✅ 仓库创建成功')
    } else {
      console.error('  ❌ 创建仓库失败:', createRes.data)
      process.exit(1)
    }
  } else if (repoRes.status === 200) {
    console.log('  ✅ 仓库已存在')
  } else {
    console.error('  ❌ 检查仓库失败:', repoRes.status, repoRes.data)
    process.exit(1)
  }

  // 步骤 2：检查是否已有该 tag 的 release
  console.log('[2/4] 检查 Release 是否已存在...')
  let releaseId = null
  const releaseRes = await apiRequest('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`)
  // Gitee 对不存在的 tag 可能返回 200 + null body
  if (releaseRes.status === 200 && releaseRes.data && releaseRes.data.id) {
    releaseId = releaseRes.data.id
    console.log(`  Release 已存在 (id: ${releaseId})，将更新附件`)
    // 删除已有的附件：必须用 attach_files 端点获取带 id 的附件列表
    // （releases/tags/{tag} 返回的 assets 不含 id，无法直接删除）
    console.log('  清理旧附件...')
    const attachList = await apiRequest('GET', `/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files`)
    if (attachList.status === 200 && Array.isArray(attachList.data)) {
      for (const asset of attachList.data) {
        if (asset.id) {
          await apiRequest('DELETE', `/repos/${OWNER}/${REPO}/releases/${releaseId}/attach_files/${asset.id}`)
        }
      }
      console.log(`  已清理 ${attachList.data.length} 个旧附件`)
    }
  } else {
    console.log('  Release 不存在，正在创建...')
    const createReleaseRes = await apiRequest('POST', `/repos/${OWNER}/${REPO}/releases`, {
      tag_name: tag,
      name: tag,
      body: `家庭物资管家 ${version}`,
      target_commitish: 'main'
    })
    if (createReleaseRes.status === 201 || createReleaseRes.status === 200) {
      releaseId = createReleaseRes.data.id
      console.log(`  ✅ Release 创建成功 (id: ${releaseId})`)
    } else {
      console.error('  ❌ 创建 Release 失败:', createReleaseRes.status, createReleaseRes.data)
      process.exit(1)
    }
  }

  // 步骤 3：上传 exe
  console.log('[3/4] 上传 exe 文件...')
  const exeSize = fs.statSync(exePath).size
  console.log(`  文件大小: ${(exeSize / 1024 / 1024).toFixed(1)} MB`)
  const exeRes = await uploadAsset(releaseId, exePath, filename)
  if (exeRes.status === 200 || exeRes.status === 201) {
    console.log('  ✅ exe 上传成功')
  } else {
    console.error('  ❌ exe 上传失败:', exeRes.status, exeRes.data)
  }

  // 步骤 4：上传 update-info.json
  console.log('[4/4] 上传 update-info.json...')
  const infoRes = await uploadAsset(releaseId, infoPath, 'update-info.json')
  if (infoRes.status === 200 || infoRes.status === 201) {
    console.log('  ✅ update-info.json 上传成功')
  } else {
    console.error('  ❌ update-info.json 上传失败:', infoRes.status, infoRes.data)
  }

  console.log('')
  console.log('========================================')
  console.log('  ✅ 发布完成！')
  console.log(`  Gitee Release: https://gitee.com/${OWNER}/${REPO}/releases/${tag}`)
  console.log('========================================')
}

main().catch((e) => {
  console.error('发布失败:', e.message)
  process.exit(1)
})
