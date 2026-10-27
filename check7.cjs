const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push(`[console] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[pageerror] ${err.stack || err.message}`));
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(500);
  await page.getByText('Got it!').click().catch(()=>{});
  await page.waitForTimeout(300);
  // find camera icon button (aria via svg data-icon perhaps). Try clicking each svg button and screenshot
  const btns = page.locator('button:has(svg)');
  const count = await btns.count();
  console.log('svg button count', count);
  await browser.close();
})();
