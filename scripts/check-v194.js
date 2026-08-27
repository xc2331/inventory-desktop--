const asar = require('@electron/asar');
const buf = asar.extractFile('release-v194/win-unpacked/resources/app.asar', 'electron/ai-service.js');
const src = buf.toString('utf8');
console.log('tryAppGetPath 出现:', (src.match(/tryAppGetPath/g) || []).length);
console.log('downloadUrlToDataUrl 出现:', (src.match(/downloadUrlToDataUrl/g) || []).length);
console.log('app.getPath:', (src.match(/app\.getPath/g) || []).length);
console.log('urlDownloaded 标签:', (src.match(/urlDownloaded/g) || []).length);
console.log('require https:', (src.match(/require\("https"\)/g) || []).length);
console.log('require http:', (src.match(/require\("http"\)/g) || []).length);
