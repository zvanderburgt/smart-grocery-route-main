const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Navigate to the app
  await page.goto('http://localhost:5003', { waitUntil: 'networkidle' });

  // Wait for app to load
  await page.waitForTimeout(3000);

  // Take full page screenshot
  await page.screenshot({
    path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-screenshot-full.png',
    fullPage: true
  });

  // Take viewport screenshot
  await page.screenshot({
    path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-screenshot-viewport.png',
    fullPage: false
  });

  // Get the main list area
  const listContainer = page.locator('div.w-full.mx-auto.px-4').first();
  if (await listContainer.count() > 0) {
    await listContainer.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-list-area.png'
    });
  }

  // Get the grocery list section
  const grocerySection = page.locator('div.space-y-1').first();
  if (await grocerySection.count() > 0) {
    await grocerySection.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-grocery-sections.png'
    });
  }

  // Get individual grocery sections
  const sections = page.locator('[class*="GrocerySection"], [class*="grocery-section"], [class*="section"]').first();
  if (await sections.count() > 0) {
    await sections.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-single-section.png'
    });
  }

  // Get the input bar area
  const inputBar = page.locator('[class*="ItemInputBar"], [class*="item-input"]').first();
  if (await inputBar.count() > 0) {
    await inputBar.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-input-bar.png'
    });
  }

  // Get the header
  const header = page.locator('[class*="AppHeader"], [class*="app-header"]').first();
  if (await header.count() > 0) {
    await header.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-header.png'
    });
  }

  // Get the stats card if visible
  const statsCard = page.locator('[class*="StatsCard"], [class*="stats-card"]').first();
  if (await statsCard.count() > 0) {
    await statsCard.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-stats-card.png'
    });
  }

  // Get all section elements
  const allSections = page.locator('[class*="GrocerySection"]');
  const count = await allSections.count();
  console.log(`Found ${count} grocery sections`);

  for (let i = 0; i < count; i++) {
    const section = allSections.nth(i);
    await section.screenshot({
      path: `/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-section-${i}.png`
    });
  }

  // Get the full list area with all sections
  const fullList = page.locator('div.space-y-1.coarse\\:space-y-0\\.5').first();
  if (await fullList.count() > 0) {
    await fullList.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-full-list.png'
    });
  }

  // Get all items in the list
  const items = page.locator('[class*="GroceryItemComponent"], [class*="grocery-item"]').first();
  if (await items.count() > 0) {
    await items.screenshot({
      path: '/Users/zack/Projects/smart-grocery-route-main/brag-output-2026-07-23-133258/app-single-item.png'
    });
  }

  await page.waitForTimeout(2000);
  await browser.close();
  console.log('Screenshots captured!');
}

captureScreenshots().catch(console.error);