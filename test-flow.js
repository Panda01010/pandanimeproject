const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const userDataDir = path.join(process.cwd(), "browser-profile");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null,
  });
  
  const page = context.pages()[0] || await context.newPage();
  await page.goto("https://labs.google/fx/tools/flow");
  await page.waitForTimeout(3000);
  
  // click new project
  const createButton = page.getByRole('button', { name: /new project/i });
  if (await createButton.count() > 0) {
    console.log("Clicking New Project");
    await createButton.first().click();
    await page.waitForTimeout(4000); // Wait for the new project UI to appear fully
  } else {
    console.log("Could not find New Project button");
  }
  
  // Try taking a full page screenshot and saving the DOM
  await page.screenshot({ path: 'flow_screenshot.png' });
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('flow_dom.html', html);
  console.log("Saved DOM to flow_dom.html and flow_screenshot.png");
  
  setTimeout(() => context.close(), 2000);
})();
