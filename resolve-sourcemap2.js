const fs = require('fs')
const { SourceMapConsumer } = require('source-map')

const rawMap = JSON.parse(fs.readFileSync('./dist/assets/index-Bql82zz7.js.map', 'utf8'))

const positions = [
  { line: 1721, column: 75836 },
  { line: 1721, column: 16998 },
  { line: 1721, column: 44017 },
  { line: 1721, column: 39753 },
  { line: 1721, column: 39541 },
  { line: 1721, column: 35901 },
  { line: 1721, column: 32724 },
  { line: 1721, column: 34233 },
  { line: 48, column: 9125 },
  { line: 48, column: 15998 },
  { line: 48, column: 15805 },
  { line: 48, column: 1306 },
  { line: 48, column: 220 },
  { line: 1712, column: 144323 },
  { line: 1610, column: 32122 }
]

const consumer = new SourceMapConsumer(rawMap)
for (const pos of positions) {
  const src = consumer.originalPositionFor({ line: pos.line, column: pos.column })
  console.log(`minified ${pos.line}:${pos.column} -> ${src.source}:${src.line}:${src.column} ${src.name || ''}`)
}
