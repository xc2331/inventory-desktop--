// 安全清理脚本：只动 build/ 调试产物、根目录 stray 文件、旧 release 目录
// 用法：
//   node scripts/cleanup-project.js --dry-run   预览要删什么
//   node scripts/cleanup-project.js             执行清理
// 规则：
//   - build/ 只保留 icon.ico、icon.png、logo.svg、tray-icon-16.png
//   - 根目录删除 icon-test.png
//   - release-* 只保留修改时间最新的一个目录

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')

const BUILD_KEEP = new Set(['icon.ico', 'icon.png', 'logo.svg', 'tray-icon-16.png'])
const ROOT_DELETE = ['icon-test.png']

function log(...args) {
  console.log(...args)
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getSize(p) {
  try {
    const stat = fs.statSync(p)
    if (!stat.isDirectory()) return stat.size
    let total = 0
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const child = path.join(p, entry.name)
      total += entry.isDirectory() ? getSize(child) : fs.statSync(child).size
    }
    return total
  } catch {
    return 0
  }
}

function remove(p) {
  if (DRY_RUN) return
  try {
    const stat = fs.statSync(p)
    if (stat.isDirectory()) {
      fs.rmSync(p, { recursive: true, force: true })
    } else {
      fs.unlinkSync(p)
    }
  } catch (e) {
    console.error(`[error] 删除失败 ${p}: ${e.message}`)
  }
}

function main() {
  if (DRY_RUN) log('[DRY-RUN] 以下只是预览，不会真正删除\n')

  // 1. 清理 build/
  const buildDir = path.join(ROOT, 'build')
  let buildFreed = 0
  if (fs.existsSync(buildDir)) {
    for (const entry of fs.readdirSync(buildDir, { withFileTypes: true })) {
      const name = entry.name
      const full = path.join(buildDir, name)
      if (BUILD_KEEP.has(name)) continue
      const size = getSize(full)
      buildFreed += size
      log(`[build] ${entry.isDirectory() ? '目录' : '文件'} ${name} (${humanSize(size)})`)
      remove(full)
    }
  }

  // 2. 清理根目录 stray 文件
  let rootFreed = 0
  for (const name of ROOT_DELETE) {
    const full = path.join(ROOT, name)
    if (!fs.existsSync(full)) continue
    const size = fs.statSync(full).size
    rootFreed += size
    log(`[root] 文件 ${name} (${humanSize(size)})`)
    remove(full)
  }

  // 3. 清理旧 release 目录（保留修改时间最新的一个）
  const entries = fs.readdirSync(ROOT, { withFileTypes: true })
  const releaseDirs = entries
    .filter((e) => e.isDirectory() && e.name.startsWith('release-') && e.name !== 'release-archive')
    .map((e) => ({
      name: e.name,
      path: path.join(ROOT, e.name),
      mtime: fs.statSync(path.join(ROOT, e.name)).mtimeMs,
      size: getSize(path.join(ROOT, e.name))
    }))
    .sort((a, b) => b.mtime - a.mtime)

  let releaseFreed = 0
  if (releaseDirs.length > 0) {
    const [keep, ...old] = releaseDirs
    log(`\n[release] 保留最新: ${keep.name} (${humanSize(keep.size)})`)
    for (const dir of old) {
      releaseFreed += dir.size
      log(`[release] 删除旧目录: ${dir.name} (${humanSize(dir.size)})`)
      remove(dir.path)
    }
  } else {
    log('[release] 没有 release-* 目录需要清理')
  }

  const total = buildFreed + rootFreed + releaseFreed
  log(`\n${DRY_RUN ? '[DRY-RUN] 预计释放' : '实际释放'}空间: ${humanSize(total)}`)
  if (DRY_RUN) log('再次运行（去掉 --dry-run）即可执行删除')
}

main()
