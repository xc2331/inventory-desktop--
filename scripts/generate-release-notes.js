#!/usr/bin/env node
/*
 * generate-release-notes.js
 * 从 git tag 自动生成 changelog 草稿（markdown）
 *
 * 用法:
 *   node scripts/generate-release-notes.js              # 生成上一个 tag → 当前 HEAD
 *   node scripts/generate-release-notes.js 1.5.0       # 从 v1.5.0 到当前 HEAD
 *   node scripts/generate-release-notes.js 1.5.0 1.6.0 # 两个 tag 之间
 *
 * 输出: docs/changelog-<版本>.md（草稿，需人工审核）
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DOCS = path.join(ROOT, 'docs')

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' }).trim()
}

function parseArgs() {
  const raw = process.argv.slice(2)
  if (raw.length === 0) {
    // 取最新两个 tag
    const tags = git('tag --sort=-v:refname').split('\n').filter(Boolean)
    if (tags.length < 2) {
      console.error('至少需要 2 个 git tag 或手动指定范围')
      process.exit(1)
    }
    return { from: tags[1], to: tags[0] }
  }
  if (raw.length === 1) {
    return { from: raw[0], to: 'HEAD' }
  }
  return { from: raw[0], to: raw[1] }
}

function getLatestVersionTag() {
  const tags = git('tag --sort=-v:refname').split('\n').filter(Boolean)
  return tags[0] || '0.0.0'
}

function getChangelogForVersionRange(from, to) {
  const tagLine = from.startsWith('v') ? from : `v${from}`
  const toLine = to === 'HEAD' ? git('describe --tags --always') : (to.startsWith('v') ? to : `v${to}`)
  const commits = git(`log ${tagLine}..${toLine} --pretty=format:"%h|%an|%s" --no-merges`)
    .split('\n').filter(Boolean)

  // 按 commit message 分类
  const buckets = { feat: [], fix: [], docs: [], refactor: [], perf: [], ci: [], chore: [], other: [] }
  const typeRe = /^(feat|fix|docs|refactor|perf|ci|chore)(\([^)]*\))?!?:\s*/i

  commits.forEach(c => {
    const parts = c.split('|')
    if (parts.length < 3) return
    const hash = parts[0]
    const author = parts[1]
    const msg = parts.slice(2).join('|')
    if (!msg) return
    const m = msg.match(typeRe)
    const type = m ? m[1].toLowerCase() : 'other'
    buckets[type].push({ hash, author, msg })
  })

  // 版本对比
  const fromVer = from.replace(/^v/, '')
  const toVer = to === 'HEAD' ? getLatestVersionTag().replace(/^v/, '') : to.replace(/^v/, '')

  return { fromVer, toVer, buckets, totalCommits: commits.length, tagLine, toLine }
}

function renderMarkdown(fromVer, toVer, buckets, totalCommits, date) {
  const sectionOrder = [
    ['feat', '🚀 新功能', true],
    ['fix', '🐛 修复', true],
    ['docs', '📄 文档', false],
    ['refactor', '♻️ 重构', false],
    ['perf', '⚡ 性能', false],
    ['ci', '🔧 CI/流程', false],
    ['chore', '📦 杂项', false],
    ['other', '其他', false],
  ]

  let md = `# Changelog v${toVer}\n\n`
  md += `> 生成时间: ${date}\n\n`
  md += `## 变更摘要\n\n`
  md += `- 共 ${totalCommits} 个提交\n`
  md += `- 范围: v${fromVer} → v${toVer}\n\n`
  md += `---\n\n`

  sectionOrder.forEach(([key, title, important]) => {
    if (buckets[key].length === 0) return
    md += `### ${title}\n\n`
    buckets[key].forEach(c => {
      const cleanMsg = c.msg.replace(/^[\w\-/]*:\s*/i, '')
      md += `- \`${c.hash}\` ${cleanMsg}\n`
    })
    md += '\n'
  })

  md += `---\n\n`
  md += `_由 \`scripts/generate-release-notes.js\` 自动生成，请人工审核后发布_\n`
  return md
}

// main
const { from, to } = parseArgs()
const info = getChangelogForVersionRange(from, to)
const date = new Date().toISOString().replace('T', ' ').slice(0, 19)
const md = renderMarkdown(info.fromVer, info.toVer, info.buckets, info.totalCommits, date)

// 输出文件
fs.mkdirSync(DOCS, { recursive: true })
const outPath = path.join(DOCS, `changelog-${info.fromVer}-to-${info.toVer}.md`)
fs.writeFileSync(outPath, md, 'utf-8')

console.log(`[release-notes] 已生成: ${outPath}`)
console.log(`[release-notes] ${info.totalCommits} commits | ${info.fromVer} → ${info.toVer}`)

// 同时也打印到 stdout 方便 piped 使用
console.log('\n---\n')
console.log(md)