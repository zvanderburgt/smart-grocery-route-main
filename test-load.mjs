import { chromium } from 'playwright';

async function testPage() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Listen for console messages
  page.on('console', msg => {
    console.log(`[CONSOLE ${msg.type()}]`, msg.text());
  });

  // Listen for page errors
  page.on('pageerror', error => {
    console.log('[PAGE ERROR]', error.message);
  });

  // Listen for failed requests
  page.on('requestfailed', request => {
    console.log('[REQUEST FAILED]', request.url(), request.failure()?.errorText);
  });

  console.log('Navigating to http://localhost:5173...');
  const response = await page.goto('http://localhost:5173', {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  console.log('Response status:', response?.status());

  // Wait a bit for React to render
  await page.waitForTimeout(3000);

  // Get page content
  const content = await page.content();
  console.log('\n=== PAGE HTML (first 5000 chars) ===');
  console.log(content.substring(0, 5000));

  // Check for #root content
  const rootContent = await page.$eval('#root', el => el.innerHTML).catch(e => e.message);
  console.log('\n=== #root innerHTML ===');
  console.log(rootContent);

  // Check for any error boundaries
  const errorElements = await page.$$eval('[data-error], .error, [role="alert"]', els => els.map(e => e.outerHTML));
  if (errorElements.length > 0) {
    console.log('\n=== ERROR ELEMENTS ===');
    console.log(errorElements);
  }

  // Get all console errors from browser
  const logs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script')).map(s => s.src);
  });
  console.log('\n=== SCRIPTS ===');
  console.log(logs.slice(0, 20));

  await browser.close();
}

testPage().catch(console.error);