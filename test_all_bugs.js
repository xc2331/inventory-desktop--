const { chromium } = require('playwright');

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

  const results = {};

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  console.log('=== MAIN PAGE LOADED ===');
  console.log('body:', (await page.evaluate(() => document.body?.innerText || '')).slice(0, 100));

  // --- Bug 1: Category filter ---
  // Get initial count of items
  const initialText = await page.evaluate(() => document.body?.innerText || '');
  const initialAllMatch = initialText.match(/全部物品[\s\S]{0,20}(\d+)/);
  const initTotal = initialAllMatch ? initialAllMatch[1] : '?';
  console.log('initial total for 全部物品:', initTotal);

  // Find category buttons in sidebar
  // The sidebar has category buttons with names like "食品", "饮料"
  const categories = ['食品', '饮料', '日用品', '厨房用品'];
  for (const cat of categories) {
    const btn = page.locator('button, div').filter({ hasText: new RegExp(`^${cat}$`) });
    // Try clicking on category button — pick the smallest one (the actual category chip)
    const matches = await btn.all();
    let clicked = false;
    for (const m of matches) {
      const t = (await m.innerText()).trim();
      if (t === cat) {
        await m.click();
        await page.waitForTimeout(600);
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      console.log(`WARN: could not click ${cat}`);
      continue;
    }
    const txt = await page.evaluate(() => document.body?.innerText || '');
    const allMatch = txt.match(/全部物品[\s\S]{0,20}(\d+)/);
    const catMatch = txt.match(new RegExp(`\n?${cat}[\s\S]{0,20}(\d+)`));
    console.log(`After clicking ${cat}: 全部物品=${allMatch?.[1]||'?'}, ${cat}=${catMatch?.[1]||'?'}`);
    await page.screenshot({ path: `${OUT}\\bug1_cat_${cat}.png`, fullPage: true });
  }

  // Reload to get back to 全部
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  results.bug1 = 'completed';

  // --- Bug 2: Material Library ---
  const matBtn = page.locator('button, a, div').filter({ hasText: /电子材料库/ }).first();
  await matBtn.click().catch(e => console.log(e.message));
  await page.waitForTimeout(2500);
  const matText = (await page.evaluate(() => document.body?.innerText || '')).slice(0, 300);
  console.log('=== MATERIALS PAGE ===');
  console.log(matText);
  await page.screenshot({ path: `${OUT}\\bug2_materials.png`, fullPage: true });
  results.bug2 = 'completed';

  // --- Bug 3: Location Map ---
  const mapBtn = page.locator('button, a, div').filter({ hasText: /位置地图/ }).first();
  await mapBtn.click().catch(e => console.log(e.message));
  await page.waitForTimeout(2500);
  const mapText = (await page.evaluate(() => document.body?.innerText || '')).slice(0, 300);
  console.log('=== MAP PAGE ===');
  console.log(mapText);
  await page.screenshot({ path: `${OUT}\\bug3_map.png`, fullPage: true });

  // Try to click on a map point (any interactive element in the canvas area)
  const canvas = page.locator('canvas').first();
  if (await canvas.isVisible()) {
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 3, box.y + box.height / 3);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${OUT}\\bug3_map_point.png`, fullPage: true });
    }
  }
  results.bug3 = 'completed';

  // --- Bug 4: Context menu + hover ---
  // Navigate back to items view
  const invBtn = page.locator('button, a, div').filter({ hasText: /全部物品|物品管理|库存/ }).first();
  await invBtn.click().catch(e => console.log(e.message));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}\\bug4_inventory.png`, fullPage: true });

  // Try to find an item card. If there's data in the DB, items will show
  const cards = page.locator('article, [data-item], [class*="item-card"], [class*="ItemCard"]');
  const count = await cards.count();
  console.log('item card count via selectors:', count);
  // Also try generic approach: any element with image or category pill
  const anyCard = page.locator('[class*="item"]', { hasText: /食品|饮料|厨房/ }).first();
  if (await anyCard.isVisible()) {
    const b = await anyCard.boundingBox();
    if (b) {
      await page.mouse.click(b.x + Math.min(60, b.width/2), b.y + Math.min(60, b.height/2), { button: 'right' });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}\\bug4_contextmenu.png`, fullPage: true });
    }
  } else {
    // Try all clickable elements
    console.log('no card found with that selector, trying broader');
    const body = await page.evaluate(() => document.body?.innerHTML || '');
    console.log('body contains ItemCard:', body.includes('ItemCard'));
    console.log('body contains item-card:', body.includes('item-card'));
    // Try a very general card selector
    const broaderCard = page.locator('[class*="card"]').first();
    if (await broaderCard.isVisible()) {
      const bb = await broaderCard.boundingBox();
      if (bb) {
        await page.mouse.click(bb.x + 40, bb.y + 40, { button: 'right' });
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${OUT}\\bug4_contextmenu.png`, fullPage: true });
      }
    }
  }
  results.bug4 = 'completed';

  console.log('=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });