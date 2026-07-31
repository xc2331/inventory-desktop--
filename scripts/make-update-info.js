// 生成 update-info.json，随 release assets 一起上传供软件内更新器读取
// 注意：发布时请把本文件生成的 update-info.json 与 .exe 一并上传到 GitHub Releases 和 Gitee Releases
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const pkg = require('../package.json')
const version = pkg.version
const productName = pkg.build.productName
const outputDir = path.resolve(__dirname, '..', pkg.build.directories.output || 'release-v4f')
const filename = `${productName} ${version}.exe`
const filePath = path.join(outputDir, filename)

if (!fs.existsSync(filePath)) {
  console.error(`[release] 找不到打包文件: ${filePath}`)
  process.exit(1)
}

const size = fs.statSync(filePath).size
const hash = crypto.createHash('sha512')
hash.update(fs.readFileSync(filePath))
const sha512 = hash.digest('hex')

const info = {
  version,
  releaseDate: new Date().toISOString(),
  // GitHub 直连与镜像源使用此 URL；Gitee 源会忽略该字段，改用 filename + API 获取到的 tag
  downloadUrl: `https://github.com/xc2331/inventory-desktop--/releases/download/v${version}/${encodeURIComponent(filename)}`,
  filename,
  size,
  sha512,
  releaseNotes: 'v1.2.1 修复与优化：修复 frameless 窗口拖拽导致电子材料库/位置地图按钮无法点击的问题；修复 Agent 接口新增位置不同步；优化二维码局域网 IP 选择；电子材料库支持资源链接、批量编辑、双击打开、右键编辑；设置新增更新日志与 AI 能力说明面板。'
}

const outPath = path.join(outputDir, 'update-info.json')
fs.writeFileSync(outPath, JSON.stringify(info, null, 2), 'utf-8')
console.log(`[release] 已生成 ${outPath}`)
console.log(`[release] 版本: ${version}, 大小: ${size}, SHA512: ${sha512.slice(0, 16)}...`)
console.log(`[release] 请同时上传 ${filename} 与 update-info.json 到 GitHub Releases 和 Gitee Releases`)
