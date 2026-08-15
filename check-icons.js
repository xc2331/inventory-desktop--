const fs = require('fs')
const path = require('path')
const lucide = require('lucide-react')

const srcDir = './src'
const iconNames = new Set()

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walk(full)
    else if (full.endsWith('.jsx') || full.endsWith('.js')) {
      const content = fs.readFileSync(full, 'utf8')
      const regex = /import\s+\{([\s\S]*?)\}\s+from\s+['"]lucide-react['"]/g
      let m
      while ((m = regex.exec(content)) !== null) {
        const block = m[1]
        const names = block.split(',').map(s => {
          const trimmed = s.trim()
          const parts = trimmed.split(/\s+as\s+/)
          return parts[parts.length - 1].trim()
        })
        for (const n of names) {
          if (n && !n.startsWith('type ')) iconNames.add(n)
        }
      }
    }
  }
}

walk(srcDir)

const missing = []
for (const name of iconNames) {
  if (typeof lucide[name] === 'undefined') missing.push(name)
}

console.log('Total icon names:', Array.from(iconNames).length)
console.log('Icon names:', Array.from(iconNames).sort())
console.log('Missing icons:', missing.sort())
