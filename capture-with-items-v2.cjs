const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function captureWithItems() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Capture console logs
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Navigate to the app
  await page.goto('http://localhost:5003', { waitUntil: 'networkidle' });

  // Wait for app to fully load - wait for the input field
  try {
    await page.waitForSelector('input[type="text"], input:not([type])', { timeout: 30000 });
  } catch (e) {
    console.log('Waiting for input field...');
  }

  console.log('App loaded, waiting for items to appear...');

  // Wait a bit more for items to load from localStorage
  await page.waitForTimeout(5000);

  // Check if there are items already
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Body text preview:', bodyText.substring(0, 500));

  // Find the input field
  const inputField = page.locator('input[type="text"], input:not([type])').first();
  if (await inputField.count() > 0) {
    const items = [
      { name: 'Bananas', qty: 4 },
      { name: 'Avocados', qty: 2 },
      { name: 'Spinach', qty: 1 },
      { name: 'Milk', qty: 1 },
      { name: 'Eggs', qty: 12 },
      { name: 'Chicken breast', qty: 2 },
      { name: 'Pasta', qty: 1 },
    ];

    for (const item of items) {
      await inputField.fill(`${item.qty} ${item.name}`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }
  }

  // Wait for items to appear and organize
  await page.waitForTimeout(3000);

  // Take full page screenshot
  await page.screenshot({
    path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-with-items-full.png',
    fullPage: true
  });

  // Take viewport screenshot
  await page.screenshot({
    path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-with-items-viewport.png',
    fullPage: false
  });

  // Get all elements with classes
  const elements = await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    const results = [];
    all.forEach(el => {
      const classList = el.className;
      if (typeof classList === 'string' && classList.length > 0) {
        results.push({
          tag: el.tagName.toLowerCase(),
          className: classList,
          text: el.textContent ? el.textContent.substring(0, 100) : ''
        });
      }
    });
    return results;
  });

  // Save element info
  fs.writeFileSync(
    '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/elements-with-items.json',
    JSON.stringify(elements, null, 2)
  );

  // Find key elements by class patterns
  const patterns = ['GrocerySection', 'GroceryItem', 'ItemInput', 'AppHeader', 'StatsCard', 'SmartSuggestions', 'space-y', 'Reorder', 'SectionItem'];

  for (const pattern of patterns) {
    const elements = await page.locator(`[class*="${pattern}"]`).all();
    console.log(`Found ${elements.length} elements matching ${pattern}`);

    for (let i = 0; i < Math.min(elements.length, 5); i++) {
      const el = elements[i];
      try {
        await el.screenshot({
          path: `/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-${pattern.toLowerCase()}-${i}.png`
        });
      } catch (e) {
        console.log(`Could not screenshot ${pattern}-${i}:`, e.message);
      }
    }
  }

  // Get main content area
  const mainContent = page.locator('main, [role="main"], div[class*="space-y-1"]').first();
  if (await mainContent.count() > 0) {
    await mainContent.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-main-content.png'
    });
  }

  // Get the list container
  const listContainer = page.locator('div[class*="space-y-1"]').last();
  if (await listContainer.count() > 0) {
    await listContainer.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-list-container.png'
    });
  }

  // Get the input bar area
  const inputArea = page.locator('div[class*="ItemInputBar"], div[class*="input-bar"], div:has(input[type="text"])').first();
  if (await inputArea.count() > 0) {
    await inputArea.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-input-area.png'
    });
  }

  // Get the header
  const header = page.locator('header, div[class*="sticky top-0"]').first();
  if (await header.count() > 0) {
    await header.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-header.png'
    });
  }

  // Get individual sections
  const sections = page.locator('div[class*="grocery-section"], div[class*="SectionItem"]').all();
  const sectionElements = await sections;
  console.log(`Found ${sectionElements.length} section elements`);

  for (let i = 0; i < sectionElements.length; i++) {
    try {
      await sectionElements[i].screenshot({
        path: `/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-section-${i}.png`
      });
    } catch (e) {
      console.log(`Could not screenshot section ${i}:`, e.message);
    }
  }

  // Get individual items
  const items = page.locator('div[class*="GroceryItemComponent"], div[class*="item-row"], div[class*="item"]').all();
  const itemElements = await items;
  console.log(`Found ${itemElements.length} item elements`);

  for (let i = 0; i < Math.min(itemElements.length, 10); i++) {
    try {
      await itemElements[i].screenshot({
        path: `/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-item-${i}.png`
      });
    } catch (e) {
      console.log(`Could not screenshot item ${i}:`, e.message);
    }
  }

  await page.waitForTimeout(2000);
  await browser.close();
  console.log('Screenshots with items captured!');
}

captureWithItems().catch(console.error);