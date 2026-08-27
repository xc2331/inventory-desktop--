// 给 opencode zen / bigmodel 两个 provider 显式设置 imageFormat=image_url
// 走法：直接 patch settings.json
const fs = require('fs')
const path = require('path')
const p = path.join(process.env.APPDATA, 'family-inventory', 'settings.json')
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'))
const FMT = 'image_url'
let n = 0
for (const prov of cfg.aiProviders || []) {
  if (!prov.imageFormat) {
    prov.imageFormat = FMT
    n++
    console.log('+', prov.name, '->', FMT)
  } else {
    console.log('=', prov.name, 'kept', prov.imageFormat)
  }
}
fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8')
console.log('updated', n, 'provider(s); file=', p)
