const fs = require('fs')
const { SourceMapConsumer } = require('source-map')

const rawMap = JSON.parse(fs.readFileSync('./dist/assets/index-BIGMCoXh.js.map', 'utf8'))

const positions = [
  { line: 1721, column: 75228 },
  { line: 1721, column: 67151 },
  { line: 1721, column: 61724 },
  { line: 48, column: 9125 },
  { line: 48, column: 153105 },
  { line: 48, column: 153665 },
  { line: 48, column: 220 },
  { line: 48, column: 1306 },
  { line: 1712, column: 143853 },
  { line: 1610, column: 32122 }
]

const consumer = new SourceMapConsumer(rawMap)
for (const pos of positions) {
  const src = consumer.originalPositionFor({ line: pos.line, column: pos.column })
  console.log(`minified ${pos.line}:${pos.column} -> ${src.source}:${src.line}:${src.column} ${src.name || ''}`)
}
consumer.destroy()
