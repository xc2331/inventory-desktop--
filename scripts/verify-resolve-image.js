// v1.9.1: 验证 resolveImageInput 把相对路径 / file:// / 绝对路径 / data URL / http URL
// 统一归一为 data URL（或原样返回 data / http）。
// 这是修 1214 错误的根因路径（v1.5+ 起 items.photo 存相对路径，老版 ensureImageUrl
// 拼出 file:///残缺 URL 被 opencode zen / OpenAI 拒收）。

const path = require('path')
const fs = require('fs')
const os = require('os')

// 不污染项目根目录：用临时目录
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-resolve-image-'))
const photoFile = path.join(tmpDir, 'sample.webp')
// 1x1 transparent webp
const webpBase64 = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA='
fs.writeFileSync(photoFile, Buffer.from(webpBase64, 'base64'))

// 直接 require ai-service.js — 它没有副作用（只 require crypto/fs/path/data-utils，
// 不启动 electron 也不连网络），拿到 module.exports.resolveImageInput
const { resolveImageInput } = require('../electron/ai-service')

let pass = 0
let fail = 0
function assert(cond, name) {
  if (cond) {
    console.log(`  PASS  ${name}`)
    pass++
  } else {
    console.log(`  FAIL  ${name}`)
    fail++
  }
}

console.log('=== resolveImageInput 单元测试 ===')

// 1. data URL 原样返回
const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
assert(resolveImageInput(dataUrl) === dataUrl, 'data URL 原样返回')

// 2. http URL 原样返回
const httpUrl = 'https://example.com/photo.png'
assert(resolveImageInput(httpUrl) === httpUrl, 'http URL 原样返回')

// 3. 相对路径（无 baseDir）— 原样返回
assert(resolveImageInput('2024-01/abc.webp') === '2024-01/abc.webp', '无 baseDir 的相对路径原样返回')

// 4. 相对路径（有 baseDir 且文件存在）— 转 data URL
const r4 = resolveImageInput('sample.webp', tmpDir)
assert(r4.startsWith('data:image/webp;base64,'), '相对路径（文件存在）→ data URL')
assert(r4.length > 50, 'data URL 长度合理')

// 5. 绝对路径
const r5 = resolveImageInput(photoFile)
assert(r5.startsWith('data:image/webp;base64,'), '绝对路径 → data URL')

// 6. file:// URL
const fileUrl = `file:///${photoFile.replace(/\\/g, '/')}`
const r6 = resolveImageInput(fileUrl)
assert(r6.startsWith('data:image/webp;base64,'), 'file:// URL → data URL')

// 7. 空 / null / undefined
assert(resolveImageInput('') === '', '空字符串 → 空')
assert(resolveImageInput(null) === '', 'null → 空')
assert(resolveImageInput(undefined) === '', 'undefined → 空')

// 8. 文件不存在（有 baseDir）— 原样返回（不抛）
const r8 = resolveImageInput('nonexistent.webp', tmpDir)
assert(r8 === 'nonexistent.webp', '不存在的文件 → 原样返回（不抛）')

// 9. .jpg 扩展名
const jpgFile = path.join(tmpDir, 'sample.jpg')
fs.writeFileSync(jpgFile, Buffer.from(webpBase64, 'base64'))
const r9 = resolveImageInput(jpgFile)
assert(r9.startsWith('data:image/jpeg;base64,'), '绝对路径 .jpg → data:image/jpeg')

// 10. .jpeg
const jpegFile = path.join(tmpDir, 'sample.jpeg')
fs.writeFileSync(jpegFile, Buffer.from(webpBase64, 'base64'))
const r10 = resolveImageInput(jpegFile)
assert(r10.startsWith('data:image/jpeg;base64,'), '绝对路径 .jpeg → data:image/jpeg')

// 11. .png
const pngFile = path.join(tmpDir, 'sample.png')
fs.writeFileSync(pngFile, Buffer.from(webpBase64, 'base64'))
const r11 = resolveImageInput(pngFile)
assert(r11.startsWith('data:image/png;base64,'), '绝对路径 .png → data:image/png')

// 12. 未知扩展名 → 默认 image/jpeg
const binFile = path.join(tmpDir, 'sample.bin')
fs.writeFileSync(binFile, Buffer.from(webpBase64, 'base64'))
const r12 = resolveImageInput(binFile)
assert(r12.startsWith('data:image/jpeg;base64,'), '未知扩展 → 默认 image/jpeg')

// 13. 子目录里的相对路径（模拟 items.photo 实际形态 2024-01/abc.webp）
const subDir = path.join(tmpDir, '2024-01')
fs.mkdirSync(subDir, { recursive: true })
const subFile = path.join(subDir, 'abc.webp')
fs.writeFileSync(subFile, Buffer.from(webpBase64, 'base64'))
const r13 = resolveImageInput('2024-01/abc.webp', tmpDir)
assert(r13.startsWith('data:image/webp;base64,'), '子目录相对路径 → data URL（核心回归用例）')

// 清理
fs.rmSync(tmpDir, { recursive: true, force: true })

console.log(`\n${pass} 通过, ${fail} 失败`)
if (fail > 0) process.exit(1)
