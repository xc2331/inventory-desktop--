const { chromium } = require('playwright');

const MOCK_PATH = 'C:\\Users\\4070\\AppData\\Roaming\\TRAE SOLO CN\\ModularData\\ai-agent\\work-mode-projects\\6a69bff1700b850e63b3d704\\mock.js';
const OUT = 'C:\\Users\\4070\\.trae-cn\\work\\6a69bff1700b850e63b3d707\\screenshots';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\4070\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-web-security']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript({ path: MOCK_PATH });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Dump role info
  const roleDump = await page.evaluate(() => {
    const els = document.querySelectorAll('*');
    const out = [];
    els.forEach((el, i) => {
      const t = (el.innerText || '').trim();
      if (/^全部物品$|^食品$|^饮料$|^日用品$|^厨房用品$|^清洁用品$|^医药$|^电子材料库$|^位置地图$|^统计$|^设置$/.test(t)) {
        out.push({ tag: el.tagName, role: el.getAttribute('role'), cls: (el.className || '').toString().slice(0, 60), t, clickable: el.onclick != null });
      }
    });
    return out;
  });
  console.log(JSON.stringify(roleDump, null, 2));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });