const { chromium } = require('playwright');
const path = require('path');

const MOCK_PATH = 'C:\\Users\\4070\\AppData\\Roaming\\TRAE SOLO CN\\ModularData\\ai-agent\\work-mode-projects\\6a69bff1700b850e63b3d704\\mock.js';
const OUT = 'C:\\Users\\4070\\.trae-cn\\work\\6a69bff1700b850e63b3d707\\screenshots';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\4070\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-web-security', '--disable-features=Vulkan']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.addInitScript({ path: MOCK_PATH });

  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push('PAGEERR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  console.log('[body text len]', bodyText.length);
  console.log('[body excerpt]', bodyText.slice(0, 300));
  console.log('[errors]', consoleErrors.slice(0, 5));

  await page.screenshot({ path: `${OUT}\\00_full.png`, fullPage: true });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });