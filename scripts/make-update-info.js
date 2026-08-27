// 生成 update-info.json，随 release assets 一起上传供软件内更新器读取
// 注意：发布时请把本文件生成的 update-info.json 与 .exe 一并上传到 GitHub Releases 和 Gitee Releases
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const pkg = require('../package.json')
const version = pkg.version
const productName = pkg.build.productName
const outputDir = path.resolve(__dirname, '..', pkg.build.directories.output || 'release-v4f')

/**
 * 规范化版本号以便比较：去除连字符、空格、下划线
 */
function normVer(v) {
  return v.replace(/[-_ ]/g, '')
}

const exactFilename = `${productName} ${version}.exe`
const exactPath = path.join(outputDir, exactFilename)
const pkgNorm = normVer(version)

let filePath = exactPath
if (!fs.existsSync(exactPath)) {
  const candidates = fs.readdirSync(outputDir)
    .filter((f) => f.startsWith(productName + ' ') && f.endsWith('.exe'))
    .filter((f) => {
      const fileVersion = f.slice(productName.length + 1, -4)
      return normVer(fileVersion) === pkgNorm
    })
  if (candidates.length === 0) {
    console.error(`[release] 找不到匹配版本 ${version} 的打包文件`)
    console.error(`[release] 候选: ${fs.readdirSync(outputDir).filter((f) => f.startsWith(productName + ' ') && f.endsWith('.exe')).join(', ') || '(无)'}`)
    process.exit(1)
  }
  filePath = path.join(outputDir, candidates[0])
  console.warn(`[release] 精确文件名 ${exactFilename} 未找到，使用版本匹配: ${path.basename(filePath)}`)
}

const filename = path.basename(filePath)
const size = fs.statSync(filePath).size
const hash = crypto.createHash('sha512')
hash.update(fs.readFileSync(filePath))
const sha512 = hash.digest('hex')

// 从 release-notes.json 读取当前版本的更新说明
let releaseNotes = `Family Inventory v${version}`
try {
  const notes = require('../release-notes.json')
  const current = Array.isArray(notes) ? notes.find((n) => n.version === `${version}` || n.version === `v${version}`) || notes[0] : null
  if (current) {
    releaseNotes = `${current.version} 更新内容：${(current.features || current.items || []).join('；')}`
  }
} catch (e) {
  console.warn('[release] 读取 release-notes.json 失败，使用默认更新说明')
}

// GitHub Release 会把 asset 文件名中的空格自动转成 '.'（硬限制，无法 PATCH 改回）。
// Gitee 保留原空格 + %20 编码。为了让 update-info.json 里的 downloadUrl 真实可访问，
// GitHub 端用兼容形式（空格 -> '.'），filename 仍保留人类可读的原名（仅用于展示）。
const ghOwner = 'xc2331'
const ghRepo = 'inventory-desktop--'
const ghUrlName = filename.replace(/ /g, '.')
const giteeOwner = 'xc2331'
const giteeRepo = 'inventory-desktop'
const githubUrl = `https://github.com/${ghOwner}/${ghRepo}/releases/download/v${version}/${encodeURIComponent(ghUrlName)}`
const giteeUrl = `https://gitee.com/${giteeOwner}/${giteeRepo}/releases/download/v${version}/${encodeURIComponent(filename)}`

const info = {
  version,
  releaseDate: new Date().toISOString(),
  downloadUrl: githubUrl,
  fallbackUrl: giteeUrl,
  filename,
  size,
  sha512,
  releaseNotes
}

const outPath = path.join(outputDir, 'update-info.json')
fs.writeFileSync(outPath, JSON.stringify(info, null, 2), 'utf-8')
console.log(`[release] 已生成 ${outPath}`)
console.log(`[release] 版本: ${version}, 文件: ${filename}, 大小: ${size}, SHA512: ${sha512.slice(0, 16)}...`)
console.log(`[release] 请同时上传 ${filename} 与 update-info.json 到 GitHub Releases 和 Gitee Releases`)