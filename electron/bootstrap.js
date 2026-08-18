const fs = require('fs')
const os = require('os')
const path = require('path')
const p = path.join(os.tmpdir(), 'lingguang-bootstrap.log')
fs.appendFileSync(p, '[bootstrap] BEGIN ' + new Date().toISOString() + '\n')
fs.appendFileSync(p, '[bootstrap] process.argv=' + JSON.stringify(process.argv) + '\n')
try {
  const e = require('electron')
  fs.appendFileSync(p, '[bootstrap] electron ok\n')
} catch (err) {
  fs.appendFileSync(p, '[bootstrap] electron FAIL ' + err.message + '\n')
}