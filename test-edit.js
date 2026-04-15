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
    await createButton.first().click();
    await page.waitForTimeout(4000); 
  }
  
  // find input and change
  const titleInput = page.locator('input[aria-label="Editable text"]');
  if (await titleInput.count() > 0) {
    await titleInput.first().fill("Automated Project Name 123");
    await page.keyboard.press('Enter');
    console.log("Successfully changed name");
  } else {
    console.log("Could not find Editable text input");
  }
  
  setTimeout(() => context.close(), 3000);
})();
