import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import path from "path";
import fs from "fs";
import { emitProgress } from '@/app/progressEmitter';

const log = (...args: unknown[]) => console.log("[BrowserManager]", ...args);
const logError = (...args: unknown[]) => console.error("[BrowserManager]", ...args);

function safeSnippet(value: string, limit = 200) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

const userDataDir = path.join(process.cwd(), "browser-profile");

class BrowserManager {
  private static context: BrowserContext | null = null;
  private static launching: Promise<BrowserContext> | null = null;

  static isOpen() {
    return Boolean(this.context && !this.context.isClosed());
  }

  static async resetProfile() {
    log('resetProfile called');

    if (this.context) {
      log('closing browser context');
      await this.context.close();
      this.context = null;
    }

    if (fs.existsSync(userDataDir)) {
      log('removing profile directory', userDataDir);
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }

  static async openBrowser() {
    if (this.context) {
      try {
        // Quick check: pages() alone doesn't throw even on dead contexts
        const existingPages = this.context.pages();
        if (existingPages.length === 0) {
          // Context exists but browser window was closed — probe with a real operation
          log('context has 0 pages, probing with newPage to verify...');
          const probe = await this.context.newPage();
          await probe.close();
        }
        log('reusing existing browser context');
        return this.context;
      } catch (err) {
        logError('existing context is dead or closed, clearing it and relaunching', err);
        this.context = null;
      }
    }

    if (this.launching) {
      log('browser launch already in progress');
      return this.launching;
    }

    log('launching persistent browser', { userDataDir });
    this.launching = (async () => {
      fs.mkdirSync(userDataDir, { recursive: true });

      const maxAttempts = 4;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            viewport: null,
            args: [
              "--start-maximized",
              "--disable-blink-features=AutomationControlled",
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-session-crashed-bubble",
              "--no-first-run",
              "--disable-infobars",
              "--disable-breakpad",
              "--disable-dev-shm-usage",
            ],
          });

          const page = context.pages()[0] ?? (await context.newPage());
          log('browser launched, initializing blank page');
          await page.goto("about:blank");

          this.context = context;
          log('browser context ready');
          return context;
        } catch (error) {
          logError(`failed to launch browser (attempt ${attempt})`, error);
          const isLockError = error instanceof Error && (
            error.message.includes('user-data-dir') ||
            error.message.includes('SingletonLock') ||
            error.message.includes('already in use')
          );
          if (isLockError && attempt <= 2) {
            // Kill any Chrome processes holding the profile lock, then remove the lock files
            log('lock error detected — killing Chrome processes and clearing lock files...');
            try {
              const { execSync } = await import('child_process');
              execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
              log('Chrome processes killed via taskkill');
            } catch { /* No chrome running or taskkill failed — ok */ }
            await new Promise(r => setTimeout(r, 1000));
            for (const lockFile of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
              try {
                fs.unlinkSync(path.join(userDataDir, lockFile));
                log(`removed stale lock file: ${lockFile}`);
              } catch { /* already gone */ }
            }
            await new Promise(r => setTimeout(r, 1000));
            continue; // retry immediately after clearing locks
          }
          if (attempt === maxAttempts) {
            this.context = null;
            throw new Error(`Failed to launch browser: ${error instanceof Error ? error.message : String(error)}`);
          }
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      throw new Error('Unexpected launch failure');
    })();


    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }
}

export function isBrowserOpen() {
  return BrowserManager.isOpen();
}

export async function openBrowser() {
  return BrowserManager.openBrowser();
}

const customGptUrl = 'https://chatgpt.com/g/g-69cae55e4efc8191926d2ca7dfe6ee6c-script-anime-photo-generator';
const aiFlowUrl = 'https://labs.google/fx/tools/flow';

async function getOrCreateAIFlowProject(page: Page, projectName: string) {
  await page.bringToFront();
  log('ensuring AI Flow project', projectName);
  
  // Navigate to flow tools
  if (!page.url().includes('labs.google/fx/tools/flow')) {
    await page.goto(aiFlowUrl);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }
  // Wait for the page UI to actually render (project list or New Project button)
  await page.waitForSelector(
    'button[aria-label*="new" i], button:has-text("New project"), [href*="/project/"], h2, article',
    { state: 'visible', timeout: 15000 }
  ).catch(() => {
    log('page did not settle on a known selector within 15s, continuing anyway');
  });
  await page.waitForTimeout(500); // brief stabilisation pause

  const normalizedName = projectName.trim();
  const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const openExisting = async () => {
    log('searching for existing project', normalizedName);
    const candidates = [
      page.getByRole('link', { name: new RegExp(`^${escapedName}$`, 'i') }),
      page.getByRole('button', { name: new RegExp(`^${escapedName}$`, 'i') }),
      page.getByText(new RegExp(`^${escapedName}$`, 'i')),
    ];

    for (const candidate of candidates) {
      const count = await candidate.count().catch(() => 0);
      if (count > 0) {
        log('found existing project, opening...');
        await candidate.first().click().catch(() => {});
        await page.waitForTimeout(3000);
        
        log('waiting for project-specific URL...');
        await page.waitForURL(/\/project\//, { timeout: 10000 }).catch(() => {
          log('project URL wait timed out');
        });

        return true;
      }

    }

    return false;
  };

  if (await openExisting()) {
    return { projectState: 'opened' as const };
  }

  log('project not found, creating new project', normalizedName);

  // Click "New Project" button and wait for it to be found
  const createButton = page.getByRole('button', { name: /new project/i });
  const createBtnCount = await createButton.count().catch(() => 0);
  if (createBtnCount > 0) {
    await createButton.first().click().catch(() => {});
  } else {
    log('New Project button not found, attempting to navigate to flow root');
    await page.goto(aiFlowUrl);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const retryBtn = page.getByRole('button', { name: /new project/i });
    if ((await retryBtn.count().catch(() => 0)) > 0) {
      await retryBtn.first().click().catch(() => {});
    }
  }

  // Wait (up to 15s) for the title input to actually appear — do NOT use a blind sleep
  log('waiting for project title input to appear...');
  const titleInputSelector = [
    'input[aria-label="Editable text"]',
    'input[placeholder*="project" i]',
    'input[placeholder*="name" i]',
    'input[type="text"]',
  ].join(', ');

  let titleInputHandle: Locator | null = null;
  try {
    await page.waitForSelector(titleInputSelector, { state: 'visible', timeout: 15000 });
    titleInputHandle = page.locator(titleInputSelector).first();
  } catch {
    log('title input did not appear within timeout, attempting contenteditable fallback');
  }

  if (titleInputHandle && (await titleInputHandle.isVisible().catch(() => false))) {
    log('filling project title', normalizedName);
    await titleInputHandle.click({ force: true }).catch(() => {});
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await page.keyboard.type(normalizedName, { delay: 60 }).catch(() => {});

    // Confirm the name is typed before pressing Enter
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter').catch(() => {});

    // Wait for Flow to transition to the newly created project's specific URL
    log('waiting for project-specific URL after naming...');
    await page.waitForURL(/\/project\//, { timeout: 20000 }).catch(() => {
      log('project URL wait timed out, continuing anyway');
    });

    // Wait for network to settle so the title save API call completes
    log('waiting for title save to complete...');
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2000);

    return { projectState: 'created' as const };
  }



  // Fallback: try search again if creation was weird
  if (await openExisting()) {
    return { projectState: 'created' as const };
  }

  return { projectState: 'created' as const };
}

export async function fillAIFlowPrompt(
  page: Page,
  text: string,
  previousFlowTitle?: string | null,
  characterReferences?: Record<string, string>
) {
  log('filling AI Flow prompt dynamically inline', { length: text.length, previousFlowTitle, charactersCount: Object.keys(characterReferences || {}).length });
  await page.bringToFront();

  const promptSelectors = [
    'div[role="textbox"]',
    'div[contenteditable="true"]',
    'div.sc-cc6342e-0.iTYalL',
  ];

  log('waiting for prompt textbox selectors...', { promptSelectors });
  
  // Wait for at least one of the selectors to become visible
  const foundSelector = await Promise.race(
    promptSelectors.map(selector => 
      page.waitForSelector(selector, { state: 'visible', timeout: 15000 })
        .then(() => selector)
        .catch(() => null)
    )
  );

  if (!foundSelector) {
    logError('none of the prompt textbox selectors appeared within timeout');
    return false;
  }

  const prompt = page.locator(foundSelector).first();
  log('found prompt textbox, preparing to fill...', { foundSelector });
  await prompt.click().catch(() => {});
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});

  // Helper: type an @ reference and select it from the dropdown
  const injectAtReference = async (refName: string) => {
    log('injecting @ reference', { refName });
    await page.keyboard.type(`@${refName}`);
    await page.waitForTimeout(1500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    // Don't add a trailing space here, as the original text script handles spacing
  };

  // 1. Inject previousFlowTitle @reference FIRST (same order as before — proven to work).
  // The Enter key inside injectAtReference selects from the dropdown; putting text
  // before the @ref caused that Enter to submit the prefix as a separate message.
  // We add the instruction AFTER the chip so Flow still knows what it's for.
  if (previousFlowTitle) {
    await injectAtReference(previousFlowTitle);
    await page.keyboard.insertText(
      ' [Character & style reference ONLY — use this to keep the same character faces, ' +
      'art style, and visual quality. The scene location, background, setting, and action ' +
      'are described in the script below and are completely new. ' +
      'Do NOT copy or reuse the previous scene\'s environment or events.]\n\n'
    );
    await page.waitForTimeout(200);
  }


  // 2. Type out the script chronologically and inject character blocks inline
  if (!characterReferences || Object.keys(characterReferences).length === 0) {
    log('no characters to inject inline, pasting entire script');
    await page.keyboard.insertText(text).catch(() => {});
  } else {
    log('parsing script to inject characters inline', { characterReferences });
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keys = Object.keys(characterReferences);
    // Build regex to match '@Webbed Vigilante'
    const pattern = new RegExp(`@(${keys.map(escapeRegExp).join('|')})`, 'g');
    
    let lastIndex = 0;
    let match;
    
    while ((match = pattern.exec(text)) !== null) {
      // Type everything up to the mention
      const chunk = text.slice(lastIndex, match.index);
      if (chunk) {
        await page.keyboard.insertText(chunk);
        await page.waitForTimeout(50); // slight delay for stability
      }
      
      const charName = match[1];
      const resolvedName = characterReferences[charName];
      
      // Inject the dynamic character block!
      await injectAtReference(resolvedName);
      
      lastIndex = pattern.lastIndex;
    }
    
    // Type remaining text
    const remainingChunk = text.slice(lastIndex);
    if (remainingChunk) {
      await page.keyboard.insertText(remainingChunk);
    }
  }

  await page.waitForTimeout(1000);
  await page.keyboard.press('Tab').catch(() => {});
  log('prompt typed and characters injected successfully');
  return true;
}




/**
 * Watches the AI Flow canvas and downloads exactly 2 character variations 
 * after verifying their prompts. Files are named {charId}-1.png and {charId}-2.png.
 */
export async function watchAndDownloadCharacter(
  page: Page,
  charName: string,
  charId: string,
  downloadPath: string,
  targetPrompt: string,
  timeoutMs = 120000
): Promise<string[]> {
  log('watchAndDownloadCharacter', { charId, timeoutMs });
  await fs.promises.mkdir(downloadPath, { recursive: true });

  emitProgress({ pipeline: 'character', label: `Watching for ${charName} generation…`, step: 1, total: 5, pct: 10, subLabel: charName });

  // Extract the unique part of the prompt — everything after "Character: "
  // Use only the first 40 chars for matching: the DOM truncates long descriptions with "..."
  // so a full-string match will always fail on lengthy descriptions.
  const normTarget = targetPrompt.replace(/\s+/g, ' ').trim();
  let uniqueDesc = normTarget;
  if (normTarget.includes('Character: ')) {
    uniqueDesc = normTarget.split('Character:')[1].trim();
  }
  // Short fingerprint — robust against truncation and whitespace differences
  const descFingerprint = uniqueDesc.slice(0, 40).replace(/\s+/g, ' ').trim();
  log('watchAndDownloadCharacter: matching on fingerprint', { descFingerprint });

  const startTime = Date.now();
  let lastProgressTime = Date.now();

  const savedPaths: string[] = [];
  const verifiedIds = new Set<string>(); // IDs we've already downloaded
  const failedIds  = new Set<string>(); // IDs that didn't match — don't re-check until page refresh

  // Close any open detail panel before starting
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  while (Date.now() - startTime < timeoutMs && savedPaths.length < 2) {

    // ── 1. Wait if currently still generating ─────────────────────────────
    const isGenerating = await page.locator('text=/Generating|Cooking|WAITING/i').count().catch(() => 0);

    // ── 2. Collect ALL thumbnails, pick the LAST 2 ────────────────────────
    const thumbnails = page.locator('img[src*="media.getMediaUrlRedirect"]');
    const count = await thumbnails.count().catch(() => 0);

    // AI Flow renders newest thumbnails FIRST in the DOM (index 0 = most recent).
    // Always check the first 2 thumbnails — those are the ones just generated.
    const indicesToCheck: number[] = [];
    if (count >= 2) {
      indicesToCheck.push(0, 1);   // index 0 = newest, index 1 = second newest
    } else if (count === 1) {
      indicesToCheck.push(0);
    }
    log(`thumbnail count on canvas: ${count}, checking indices: ${indicesToCheck.join(', ')}`);

    let loopProgress = false;

    for (const i of indicesToCheck) {
      if (savedPaths.length >= 2) break;

      const thumb = thumbnails.nth(i);
      if (!(await thumb.isVisible().catch(() => false))) continue;

      // Extract stable ID from the src URL
      const src = (await thumb.getAttribute('src').catch(() => '')) || '';
      const idMatch = src.match(/name=([^&]+)/);
      const id = idMatch ? idMatch[1] : `idx-${i}`;

      if (verifiedIds.has(id)) continue; // already downloaded
      if (failedIds.has(id))  continue;  // already checked and didn't match

      log(`checking thumbnail #${i} (id: ${id.slice(0, 20)})`);

      // ── 3. Open full-screen detail view ──────────────────────────────────
      // Clicking a thumbnail opens a full-screen detail view (not a sidebar).
      // The reliable signal it's open is the "Download" button appearing top-right.
      emitProgress({ pipeline: 'character', label: 'Opening image detail view…', step: 2, total: 5, pct: 30, subLabel: charName });
      await thumb.click();
      await page.waitForSelector(
        'button:has-text("Download"), button[aria-label*="download" i]',
        { state: 'visible', timeout: 8000 }
      ).catch(() => {
        log('Download button did not appear after thumbnail click — continuing anyway');
      });
      // No fixed sleep — waitForSelector already guarantees the view is ready

      // ── 4. Expand via Grandir and read the full prompt ────────────────────
      emitProgress({ pipeline: 'character', label: 'Verifying prompt match…', step: 3, total: 5, pct: 50, subLabel: charName });
      const sidebarPrompt = await extractAndExpandSidebarPrompt(page);
      const normSidebar = sidebarPrompt.replace(/\s+/g, ' ').trim();

      log('sidebar prompt (expanded)', { snippet: safeSnippet(normSidebar, 80) });

      // ── 5. Match: check if the page text contains the description fingerprint ─
      // normSidebar = entire page innerText (919+ chars) — it starts with nav bar text
      // but the actual prompt is somewhere inside it. We match on a 40-char fingerprint
      // of the character description so truncation in the DOM doesn't break the check.
      const isMatch =
        normSidebar.includes(descFingerprint) ||
        normSidebar.includes(normTarget) ||
        (uniqueDesc.length > 10 && normSidebar.includes(uniqueDesc.slice(0, 60)));

      if (!isMatch) {
        log('prompt mismatch — marking failed, closing panel', {
          expected: safeSnippet(uniqueDesc, 40),
          got: safeSnippet(normSidebar, 40),
        });
        failedIds.add(id);
        await page.keyboard.press('Escape');
        continue;
      }

      // ── 6. MATCH FOUND — rename immediately, then download immediately ────
      log('prompt MATCHED!', { id: id.slice(0, 20) });
      verifiedIds.add(id);
      loopProgress = true;

      const variationIndex = savedPaths.length + 1;
      const targetTitle = variationIndex === 1 ? charName : `${charName} ${variationIndex - 1}`;
      const filename  = `${targetTitle}.png`;
      const destPath  = path.join(downloadPath, filename);

      // Rename immediately — no need to read current title first
      emitProgress({ pipeline: 'character', label: `Renaming scene to "${targetTitle}"…`, step: 4, total: 5, pct: 70, subLabel: charName });
      await renameFlowTitle(page, targetTitle);
      log(`renamed scene title → "${targetTitle}"`);

      // Download immediately
      emitProgress({ pipeline: 'character', label: `Downloading variation ${variationIndex}…`, step: 5, total: 5, pct: 85 + (variationIndex * 7), subLabel: charName });
      try {
        await triggerGridDownload(page, destPath);
        savedPaths.push(destPath);
        log(`downloaded variation ${variationIndex}`, { destPath });
        emitProgress({ pipeline: 'character', label: `Variation ${variationIndex} saved ✓`, step: 5, total: 5, pct: savedPaths.length >= 2 ? 100 : 92, subLabel: charName, done: savedPaths.length >= 2 });
      } catch (err) {
        logError(`failed to download variation ${variationIndex}`, err);
      }

      await page.keyboard.press('Escape');
      // Brief yield so the canvas redraws before the next iteration
      await page.waitForTimeout(150);
    }

    // ── 7. Stuck detection & page refresh ─────────────────────────────────
    if (loopProgress) {
      lastProgressTime = Date.now();

    } else if (
      isGenerating === 0 &&
      savedPaths.length < 2 &&
      Date.now() - lastProgressTime > 8000
    ) {
      // Not generating, last 2 thumbnails didn't match or aren't visible yet → refresh
      log('character pipeline stuck (no match, not generating, 8s elapsed) — refreshing page');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      lastProgressTime = Date.now();
      failedIds.clear(); // allow re-checking after reload

    } else if (
      isGenerating > 0 &&
      Date.now() - lastProgressTime > 15000
    ) {
      log('still generating, continuing to wait...');
      lastProgressTime = Date.now();
    }

    await page.waitForTimeout(1000);
  }

  return savedPaths;
}

/**
 * In AI Flow's full-screen detail view, the prompt is shown as a card
 * at the bottom-right of the screen with truncated text and a ↓ chevron
 * (keyboard_arrow_down icon) to expand it.
 *
 * This function:
 * 1. Clicks the ↓ chevron to expand the prompt card
 * 2. Reads the full prompt text from the card
 */
async function extractAndExpandSidebarPrompt(page: Page): Promise<string> {
  // ── Step 1: Expand the prompt card ──────────────────────────────────────
  // The expand button is the keyboard_arrow_down icon button in the prompt card
  // at the bottom-right corner of the detail view.
  const expandCandidates = [
    // The chevron SVG button at the edge of the prompt card (most specific)
    page.locator('button:has(> span.material-symbols-outlined:text("keyboard_arrow_down"))').first(),
    page.locator('button:has(> span:text("keyboard_arrow_down"))').first(),
    // Fallback: any button in the prompt card area containing a downward arrow
    page.locator('[class*="prompt"] button').first(),
    page.locator('[class*="prompt"] svg').locator('..').first(),
    // Text-based fallbacks (French / English / Portuguese UI)
    page.locator('button:has-text("Grandir")').first(),
    page.locator('button:has-text("Expand")').first(),
    page.locator('button:has-text("Show more")').first(),
  ];

  for (const btn of expandCandidates) {
    if (await btn.isVisible().catch(() => false)) {
      log('expanding prompt card via chevron/expand button');
      await btn.click({ force: true }).catch(() => {});
      // No fixed sleep — we read the text immediately after
      break;
    }
  }

  // ── Step 2: Read the full expanded prompt text ───────────────────────────
  // After expanding, the card shows the full prompt text.
  // The card is at bottom-right — look for text containing known character prompt keywords.
  const promptReadCandidates = [
    // Direct aria-label
    page.locator('div[aria-label="Prompt"]').first(),
    // Any element containing our character prompt markers
    page.locator('p, div, span').filter({ hasText: /reference sheet.*panel|Character reference/i }).first(),
    page.locator('p, div, span').filter({ hasText: /front view.*side view/i }).first(),
    // The prompt text container at bottom right (common Flow class patterns)
    page.locator('[class*="prompt-text"]').first(),
    page.locator('[class*="PromptText"]').first(),
    page.locator('[class*="promptText"]').first(),
  ];

  for (const loc of promptReadCandidates) {
    const visible = await loc.isVisible().catch(() => false);
    if (!visible) continue;
    const text = await loc.evaluate((el) => {
      return (el as HTMLElement).innerText || el.textContent || '';
    }).catch(() => '');
    if (text.trim().length > 10) {
      log('extractAndExpandSidebarPrompt: read prompt text', { length: text.length, snippet: text.slice(0, 60) });
      return text;
    }
  }

  // ── Fallback: read the full page body text ────────────────────────────────
  // As a last resort, pull the entire visible page text and return it —
  // the match logic will check if the character description appears anywhere.
  const fallbackText = await page.evaluate(() => {
    return document.body.innerText || document.body.textContent || '';
  }).catch(() => '');

  log('extractAndExpandSidebarPrompt: using full page body fallback', { length: fallbackText.length });
  return fallbackText;
}

/**
 * Manually attempts to verify and download the currently visible (or latest) thumbnail as a variation.
 */
export async function manualSyncCharacter(
  page: Page,
  charName: string,
  charId: string,
  downloadPath: string
): Promise<string[]> {
  log('manualSyncCharacter', { charId });
  await fs.promises.mkdir(downloadPath, { recursive: true });

  const savedPaths: string[] = [];

  // Ensure canvas is clear or we are looking at something
  const thumbnails = page.locator('img[src*="media.getMediaUrlRedirect"]');
  const count = await thumbnails.count().catch(() => 0);
  
  if (count === 0) {
    logError('manualSyncCharacter: No thumbnails found on canvas.');
    return [];
  }

  let targetThumb = null;
  
  // See if the full-screen detail view is already open (Download button visible = detail view open)
  const isDetailOpen = await page.locator('button:has-text("Download")').isVisible().catch(() => false);
  
  if (!isDetailOpen) {
    // Pick the last thumbnail (most recently generated)
    targetThumb = thumbnails.nth(count - 1);
    if (await targetThumb.isVisible().catch(() => false)) {
      await targetThumb.click();
      await page.waitForSelector(
        'button:has-text("Download"), button[aria-label*="download" i]',
        { state: 'visible', timeout: 8000 }
      ).catch(() => {});
      await page.waitForTimeout(500);
    } else {
        return [];
    }
  }

  // Find available filename starting with variation 1
  let variationIndex = 1;
  let targetTitle = charName;
  let filename = `${targetTitle}.png`;
  let destPath = path.join(downloadPath, filename);
  while (true) {
      const exists = await fs.promises.access(destPath).then(() => true).catch(() => false);
      if (!exists) break;
      variationIndex++;
      targetTitle = `${charName} ${variationIndex - 1}`;
      filename = `${targetTitle}.png`;
      destPath = path.join(downloadPath, filename);
  }

  // Rename Scene Title just in case
  const currentTitle = await extractFlowTitle(page);
  if (currentTitle !== targetTitle) {
    await renameFlowTitle(page, targetTitle);
    log(`manualSyncCharacter: renamed scene title to "${targetTitle}"`);
  }

  try {
    await triggerGridDownload(page, destPath);
    savedPaths.push(destPath);
    log(`manualSyncCharacter: downloaded variation ${variationIndex}`, { destPath });
  } catch (err) {
    logError(`manualSyncCharacter: failed to download variation ${variationIndex}`, err);
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  return savedPaths;
}


/**
 * Extracts and expands the prompt text in the AI Flow sidebar.
 */
async function extractSidebarPrompt(page: Page): Promise<string> {
  const promptLocators = [
    page.locator('div[aria-label="Prompt"]'),
    page.locator('div:has-text("Prompt") + div'),
    page.locator('.sc-c7ee1759-1').getByText(/reference sheet|Character/i), // fallback text-based find
  ];

  let rawText = '';
  for (const loc of promptLocators) {
    if (await loc.isVisible().catch(() => false)) {
      log('attempting to expand prompt text...');
      // Aggressively attempt to click the "little arrow down" or expand texts
      const expandCandidates = [
        loc.locator('svg'), // Arrow inside the prompt container
        loc.locator('button'), // Any button near the text
        page.locator('button:has-text("Grandir"), button:has-text("more"), button:has-text("expand")'),
      ];

      for (const btn of expandCandidates) {
          if (await btn.first().isVisible().catch(() => false)) {
              await btn.first().click({ force: true }).catch(() => {});
              await page.waitForTimeout(200); // short delay to let react render expanded
          }
      }

      // Now grab all text (textContent guarantees no CSS truncations, innerText guarantees visible)
      rawText = await loc.evaluate((el) => {
          return (el as HTMLElement).innerText || el.textContent || '';
      }).catch(() => '');
      
      if (rawText.trim()) break;
    }
  }

  return rawText;
}




export async function submitAIFlowPrompt(page: Page) {
  log('submitting AI Flow prompt');
  await page.bringToFront();

  const submitButtons = [
    page.getByRole('button', { name: /^Create$/i }),
    page.getByRole('button', { name: /^arrow_forward\s*Create$/i }),
    page.locator('button:has-text("Create")'),
    page.locator('button:has-text("arrow_forward")'),
    page.locator('button.sc-e8425ea6-0.gLXNUV'),
  ];

  for (const candidate of submitButtons) {
    const count = await candidate.count().catch(() => 0);
    if (!count) continue;

    await candidate.first().scrollIntoViewIfNeeded().catch(() => {});
    await candidate.first().click({ force: true });
    log('clicked create/submit button');
    await page.waitForTimeout(1000);
    await page.waitForFunction(() => {
      const text = document.body?.innerText ?? '';
      return /generating|queued|working on it|in progress|loading|cancel/i.test(text) || !!document.querySelector('[aria-busy="true"]');
    }, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    return true;
  }

  const prompt = page.locator('div[role="textbox"][contenteditable="true"], div.sc-cc6342e-0.iTYalL').first();
  if (await prompt.count().catch(() => 0)) {
    await prompt.focus().catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(3000);
    log('pressed Enter as fallback submit');
    return true;
  }

  logError('submit control not found');
  return false;
}


export async function openChatGPT(gptUrl?: string) {
  const context = await BrowserManager.openBrowser();
  const page = await context.newPage();
  const targetUrl = gptUrl || customGptUrl;
  log('opening ChatGPT page', targetUrl);
  await page.goto(targetUrl);
  log('ChatGPT page opened');
  return page;
}

export async function openGrok() {
  const context = await BrowserManager.openBrowser();
  const page = await context.newPage();
  log('opening Grok page');
  await page.goto("https://grok.com/imagine");
  log('Grok page opened');
  return page;
}

export async function extractShotInGrok(
  projectName: string, 
  gridIndex: number, 
  imagePath: string, 
  extractedPath: string,
  onShotSaved?: (shotId: string, url: string) => Promise<void>,
  minDelayMs = 10000,
  maxDelayMs = 20000,
  shotAssignments?: { shotIndex: number; imagePath: string }[]   // per-shot overrides
) {
  log(`Extracting shots for grid ${gridIndex + 1} of project ${projectName}${shotAssignments ? ` (custom assignments: ${shotAssignments.length} shots)` : ' (all 9)'}`);
  
  await fs.promises.mkdir(extractedPath, { recursive: true });

  // Build assignment map: shotIndex(1-9) -> imagePath
  const assignmentMap: Record<number, string> = {};
  if (shotAssignments && shotAssignments.length > 0) {
    for (const a of shotAssignments) {
      assignmentMap[a.shotIndex] = a.imagePath;
    }
  }

  // Determine which shots to run
  const shotsToRun = shotAssignments && shotAssignments.length > 0
    ? shotAssignments.map(a => a.shotIndex).sort((a, b) => a - b)
    : Array.from({ length: 9 }, (_, i) => i + 1);

  const extractedPaths: string[] = [];
  const shotSources: Record<string, string> = {};

  for (let i = 0; i < shotsToRun.length; i++) {
    const shotIndex = shotsToRun[i];
    const thisImagePath = assignmentMap[shotIndex] ?? imagePath;
    // Per-grid naming: grid{N}_{slot}.png — always starts at slot 1 for every grid
    const shotFileKey = `grid${gridIndex + 1}_${shotIndex}`;
    const extractedFilename = `${shotFileKey}.png`;
    const extractedFilePath = path.join(extractedPath, extractedFilename);

    const shotPct = Math.round((i / shotsToRun.length) * 90) + 5;
    emitProgress({ pipeline: 'extraction', label: `Extracting Grid ${gridIndex + 1} Shot ${shotIndex} (${i + 1}/${shotsToRun.length})…`, step: i + 1, total: shotsToRun.length, pct: shotPct, subLabel: `Grid ${gridIndex + 1}` });

    // ── RESUME: skip shots already on disk ───────────────────────────────────
    const alreadyOnDisk = await fs.promises.access(extractedFilePath).then(() => true).catch(() => false);
    if (alreadyOnDisk) {
      log(`Skipping ${shotFileKey} — already extracted on disk`);
      emitProgress({ pipeline: 'extraction', label: `Shot ${shotIndex} already done ✓ (Grid ${gridIndex + 1})`, step: i + 1, total: shotsToRun.length, pct: shotPct, subLabel: `Grid ${gridIndex + 1}` });
      extractedPaths.push(extractedFilePath);
      continue;
    }
    // ─────────────────────────────────────────────────────────────────────────

    let downloadSuccess = false;
    let attempts = 0;

    while (!downloadSuccess && attempts < 2) {
      attempts++;
      log(`Extracting Grid ${gridIndex + 1}, Shot ${shotIndex} (${shotFileKey}) from ${path.basename(thisImagePath)} - Attempt ${attempts}`);

      const context = await BrowserManager.openBrowser();
      const page = await context.newPage();
      try {
        log(`Opening fresh Grok page for shot ${shotIndex}`);
        await page.goto('https://grok.com/imagine', { waitUntil: 'domcontentloaded' });

        // ── CRITICAL: Force Image mode (not Video) ────────────────────────────
        // Grok remembers the last used mode. If it was left on Video, the upload
        // goes to video generation instead of photo. We must click the Image button.
        log('Ensuring Image mode is selected (not Video)...');
        try {
          // Wait for the mode toggle to render
          await page.waitForSelector('button[role="radio"]', { state: 'visible', timeout: 10000 });

          // The Image button text varies by locale: "Image", "Imagem", etc.
          // Strategy: find all radio buttons and click the first one (Image is always first)
          const radioButtons = page.locator('button[role="radio"]');
          const radioCount = await radioButtons.count().catch(() => 0);

          if (radioCount >= 2) {
            // Always click the FIRST radio button — that's Image, second is Video
            const imageBtn = radioButtons.nth(0);
            const isAlreadySelected = await imageBtn.evaluate((el) =>
              el.classList.contains('text-primary-foreground') ||
              el.getAttribute('aria-checked') === 'true' ||
              el.getAttribute('data-state') === 'checked'
            ).catch(() => false);

            if (!isAlreadySelected) {
              log('Image mode not active — clicking Image button');
              await imageBtn.click({ force: true });
              await page.waitForTimeout(600);
              log('Image mode activated');
            } else {
              log('Image mode already active');
            }
          } else {
            // Fallback: try to find by text content
            const imgBtnByText = page.locator('button[role="radio"]:has-text("Image"), button[role="radio"]:has-text("Imagem"), button[role="radio"]:has-text("imagen")').first();
            if (await imgBtnByText.count().catch(() => 0) > 0) {
              await imgBtnByText.click({ force: true }).catch(() => {});
              await page.waitForTimeout(600);
              log('Image mode activated via text match');
            }
          }
        } catch (modeErr) {
          log('Could not find mode toggle, continuing anyway:', modeErr);
        }
        // ─────────────────────────────────────────────────────────────────────

        // Upload the grid image — wait for input to be ready
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.waitFor({ state: 'attached', timeout: 30000 });
        await fileInput.setInputFiles(thisImagePath);
        log('Grid image file set — waiting for Grok to process upload...');

        // ── STEP 1: Wait until Grok has accepted the upload ──────────────────
        // The send button (aria-label="submeter" in PT, or "Send"/"Submit") only
        // appears in the DOM once Grok has processed an attachment or text input.
        // Waiting for it is the most reliable upload-complete signal available.
        log('Waiting for send button to appear (signals upload ready)...');
        const uploadReady = await page.waitForSelector(
          'button[aria-label="submeter"], button[aria-label="Send"], button[aria-label="Submit"], button[aria-label="Enviar"], button[aria-label="Soumettre"]',
          { state: 'visible', timeout: 30000 }
        ).then(() => true).catch(() => false);

        if (uploadReady) {
          log('Upload ready — send button is visible');
          await page.waitForTimeout(500); // brief settle
        } else {
          log('Send button not seen in 30s — waiting 4s fallback');
          await page.waitForTimeout(4000);
        }
        // ─────────────────────────────────────────────────────────────────────

        // ── STEP 2: Focus the ProseMirror tiptap chat input ─────────────────
        const chatInput = page.locator('div.tiptap.ProseMirror, div[contenteditable="true"]').first();
        await chatInput.waitFor({ state: 'visible', timeout: 15000 });
        await chatInput.click();
        await page.waitForTimeout(400);

        // ── STEP 3: Type @ and wait for the attachment reference dropdown ─────
        log('Typing @ to open image reference dropdown...');
        await page.keyboard.type('@');
        // Wait for the dropdown/suggest popup to appear
        const dropdownAppeared = await page.waitForSelector(
          '[role="listbox"], [role="option"], [role="menu"], div[class*="suggest"], div[class*="mention"], div[class*="popup"]',
          { state: 'visible', timeout: 6000 }
        ).then(() => true).catch(() => false);

        if (dropdownAppeared) {
          log('Reference dropdown appeared — selecting first item');
          await page.waitForTimeout(300);
        } else {
          log('Reference dropdown not seen — waiting 800ms before Enter');
          await page.waitForTimeout(800);
        }
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500); // let selection register in editor

        // ── STEP 4: Count existing downloads, register download listener ─────
        const initialDownloadCount = await page.locator('button[aria-label="Download"]').count();
        const downloadPromise = page.waitForEvent('download', { timeout: 120000 });

        // ── STEP 5: Paste the prompt via clipboard ───────────────────────────
        const prompt = `extract the exact shot${shotIndex} from the image without the shot number text`;

        log('Pasting prompt via clipboard...');
        await page.evaluate((text: string) => navigator.clipboard.writeText(text), prompt);
        await chatInput.click(); // re-focus input before paste
        await page.keyboard.press('Control+V');
        await page.waitForTimeout(700); // let paste fully render

        // ── STEP 6: Click the SEND BUTTON to submit ──────────────────────────
        // IMPORTANT: Grok uses ProseMirror — Enter = newline, NOT submit.
        // The send button aria-label is locale-specific (e.g. 'submeter' in PT).
        log('Looking for send button to submit...');
        const sendBtn = page.locator(
          'button[aria-label="submeter"], button[aria-label="Send"], button[aria-label="Submit"], button[aria-label="Soumettre"], button[aria-label="Enviar"]'
        ).last();

        const sendBtnVisible = await sendBtn.isVisible().catch(() => false);
        if (sendBtnVisible) {
          log('Send button found — clicking');
          await sendBtn.click();
        } else {
          // Fallback: try to find it by its arrow icon shape
          const arrowBtn = page.locator('button svg[class*="arrow"], button svg path[d*="M12"]').locator('..').last();
          const arrowBtnVisible = await arrowBtn.isVisible().catch(() => false);
          if (arrowBtnVisible) {
            log('Arrow-icon send button found — clicking');
            await arrowBtn.click();
          } else {
            log('Send button not found — fallback Ctrl+Enter');
            await chatInput.click();
            await page.keyboard.press('Control+Enter');
          }
        }

        log(`Waiting for Grok to finish generating shot ${shotIndex}...`);
        emitProgress({ pipeline: 'extraction', label: `Waiting for Grok to generate Grid ${gridIndex + 1} Shot ${shotIndex}…`, step: i + 1, total: shotsToRun.length, pct: shotPct, subLabel: `Grid ${gridIndex + 1}` });

        // First: wait for Grok to enter "generating" state (so we know it actually started)
        await page.waitForFunction(() => {
          const body = document.body?.innerText ?? '';
          const ariabusy = !!document.querySelector('[aria-busy="true"], [data-state="loading"]');
          return /generating|loading|working|queued|processing/i.test(body) || ariabusy;
        }, { timeout: 30000, polling: 400 }).catch(() => {
          log('generating state not detected in 30s — continuing anyway');
        });

        // Then: wait until Grok is DONE generating AND a new Download button has appeared
        await page.waitForFunction(
          (initial: number) => {
            const body = document.body?.innerText ?? '';
            const isStillGenerating =
              /generating|loading|working|queued|processing/i.test(body) ||
              !!document.querySelector('[aria-busy="true"], [data-state="loading"]');
            const downloadCount = document.querySelectorAll('button[aria-label="Download"]').length;
            // Only accept once: (a) new Download button AND (b) generation is no longer active
            return downloadCount > initial && !isStillGenerating;
          },
          initialDownloadCount,
          { timeout: 120000, polling: 500 }
        );

        // Download
        await page.locator('button[aria-label="Download"]').last().click();
        const download = await downloadPromise;
        await download.saveAs(extractedFilePath);
        log(`Saved grid${gridIndex + 1}_${shotIndex} to ${extractedFilePath}`);
        emitProgress({ pipeline: 'extraction', label: `Shot ${shotIndex} saved ✓ (Grid ${gridIndex + 1})`, step: i + 1, total: shotsToRun.length, pct: Math.round(((i + 1) / shotsToRun.length) * 100), subLabel: `Grid ${gridIndex + 1}`, done: i + 1 === shotsToRun.length });
        
        // Capture the source URL — keyed by grid{N}_{slot}
        const currentUrl = page.url();
        shotSources[shotFileKey] = currentUrl;
        
        // INCREMENTAL SAVE: persist URL immediately
        if (onShotSaved) {
          await onShotSaved(shotFileKey, currentUrl).catch(e => logError('Incremental save failed', e));
        }

        downloadSuccess = true;

      } catch (e) {
        log(`Error on shot ${shotIndex}:`, e);
      } finally {
        await page.close().catch(() => {});
      }
    }

    if (!downloadSuccess) {
      throw new Error(`Failed to extract shot ${shotIndex} for grid ${gridIndex + 1} after ${attempts} attempts`);
    }

    extractedPaths.push(extractedFilePath);

    // Configurable anti-bot pause between shots (skip after last shot)
    if (i < shotsToRun.length - 1) {
      const clampedMin = Math.max(0, minDelayMs);
      const clampedMax = Math.max(clampedMin, maxDelayMs);
      const waitMs = Math.floor(Math.random() * (clampedMax - clampedMin + 1)) + clampedMin;
      log(`Anti-bot pause: ${waitMs}ms (${(waitMs/1000).toFixed(1)}s) before next shot...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  return { success: true, paths: extractedPaths, shotSources };
}

/**
 * Navigates to an existing Grok conversation for a shot, applies a follow-up
 * correction prompt, and saves the new generated image directly to disk.
 */
export async function editShotInGrok(sourceUrl: string, tweakPrompt: string, targetPath: string) {
  log(`Editing shot — navigating to: ${sourceUrl}`);
  const context = await BrowserManager.openBrowser();
  const page = await context.newPage();

  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded' });

    // Wait for the chat input to be ready
    const chatInput = page.locator('[contenteditable="true"], textarea').first();
    await chatInput.waitFor({ state: 'visible', timeout: 30000 });
    await chatInput.click();

    // Capture existing images to detect when a new one is generated
    const initialImgSrcs = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.map(img => img.src).filter(src => src.startsWith('blob:') || src.includes('grok') || src.includes('x.ai'));
    });
    log(`Initial images found: ${initialImgSrcs.length}`);

    // Register download listener BEFORE submitting
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);

    // Type and submit the correction prompt
    log('Typing correction prompt:', tweakPrompt);
    await page.keyboard.type(tweakPrompt, { delay: 20 });
    await page.keyboard.press('Enter');
    log('Prompt submitted, waiting for Grok to generate...');

    // Wait for a NEW image to appear (signals generation complete)
    await page.waitForFunction(
      (oldSrcs: string[]) => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const currentSrcs = imgs.map(img => img.src).filter(src => src.startsWith('blob:') || src.includes('grok') || src.includes('x.ai'));
        const hasNewImg = currentSrcs.some(src => !oldSrcs.includes(src));
        const hasDownloadBtn = document.querySelectorAll('button[aria-label="Download"]').length > 0;
        return hasNewImg && hasDownloadBtn;
      },
      initialImgSrcs,
      { timeout: 180000, polling: 500 }
    );
    log('Generation complete — clicking download button...');

    // Small wait so button is fully interactive
    await page.waitForTimeout(500);

    // Click the last (newest) download button
    await page.locator('button[aria-label="Download"]').last().click();
    log('Download button clicked');

    // Check if the native download event fired
    const dlEvent = await downloadPromise;
    let saved = false;

    if (dlEvent) {
      await dlEvent.saveAs(targetPath);
      saved = true;
      log('Saved via download event');
    }

    // Fallback: read the last generated image directly from the page
    if (!saved) {
      const imageBase64 = await page.evaluate(async () => {
        // Get all candidate images, prefer ones NOT in the user input area
        const allImgs = Array.from(document.querySelectorAll('img'));
        // Filter to images that look like AI-generated content (blob or CDN URLs)
        const candidates = allImgs.filter(img =>
          img.src.startsWith('blob:') ||
          img.src.includes('grok') ||
          img.src.includes('x.ai') ||
          img.naturalWidth > 200
        );
        const img = candidates[candidates.length - 1];
        if (!img) return null;
        // Fetch the image and return as base64
        try {
          const resp = await fetch(img.src);
          const buf = await resp.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary);
        } catch {
          return null;
        }
      });

      if (imageBase64) {
        await fs.promises.writeFile(targetPath, Buffer.from(imageBase64, 'base64'));
        saved = true;
        log('Saved via direct image extraction');
      }
    }

    if (!saved) {
      throw new Error('Could not save generated image — neither download event nor direct extraction succeeded');
    }

    log(`Shot edited and saved to ${targetPath}`);
    return { success: true, path: targetPath, newUrl: page.url() };
  } catch (error) {
    logError('editShotInGrok failed:', error);
    await page.screenshot({ path: targetPath.replace('.png', '_error_screenshot.png') }).catch(() => {});
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Navigates to an existing Grok conversation for a shot and simply redownloads the generated image.
 */
export async function downloadShotFromGrok(sourceUrl: string, targetPath: string) {
  log(`Redownloading shot — navigating to: ${sourceUrl}`);
  const context = await BrowserManager.openBrowser();
  const page = await context.newPage();

  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded' });

    // Wait for the download button to be available
    const downloadBtn = page.locator('button[aria-label="Download"]').last();
    await downloadBtn.waitFor({ state: 'visible', timeout: 30000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    
    await downloadBtn.click();
    log('Download button clicked');

    // Check if the native download event fired
    const dlEvent = await downloadPromise;
    let saved = false;

    if (dlEvent) {
      await dlEvent.saveAs(targetPath);
      saved = true;
      log('Saved via download event');
    }

    // Fallback: read the last generated image directly from the page
    if (!saved) {
      const imageBase64 = await page.evaluate(async () => {
        const allImgs = Array.from(document.querySelectorAll('img'));
        const candidates = allImgs.filter(img =>
          img.src.startsWith('blob:') ||
          img.src.includes('grok') ||
          img.src.includes('x.ai') ||
          img.naturalWidth > 200
        );
        const img = candidates[candidates.length - 1];
        if (!img) return null;
        try {
          const resp = await fetch(img.src);
          const buf = await resp.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return btoa(binary);
        } catch {
          return null;
        }
      });

      if (imageBase64) {
        await fs.promises.writeFile(targetPath, Buffer.from(imageBase64, 'base64'));
        saved = true;
        log('Saved via direct image extraction');
      }
    }

    if (!saved) {
      throw new Error('Could not redownload image — neither download event nor direct extraction succeeded');
    }

    log(`Shot redownloaded and saved to ${targetPath}`);
    return { success: true, path: targetPath, newUrl: page.url() };
  } catch (error) {
    logError('downloadShotFromGrok failed:', error);
    await page.screenshot({ path: targetPath.replace('.png', '_error_screenshot.png') }).catch(() => {});
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
}





export async function openAIFlow(projectName?: string, url?: string) {
  const context = await BrowserManager.openBrowser();
  const pages = context.pages();
  const page = pages.find((p) => p.url().includes('labs.google/fx/tools/flow')) ?? await context.newPage();
  
  log('opening AI Flow page', { projectName: projectName ?? null, url: url ?? null });
  
  let result: { projectState: 'opened' | 'created' };
  
  if (url) {
    log('navigating to direct AI Flow URL', url);
    await page.goto(url);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    result = { projectState: 'opened' };
  } else if (projectName) {
    result = await getOrCreateAIFlowProject(page, projectName);
  } else {
    await page.goto(aiFlowUrl);
    result = { projectState: 'opened' };
  }
    
  log('AI Flow project ensured', result);
  return { page, ...result };
}



async function findChatGptPage(context: BrowserContext) {
  const pages = context.pages();
  const page = pages.find((p) => p.url().includes('g/g-69cae55e4efc8191926d2ca7dfe6ee6c-script-anime-photo-generator')) ?? pages[0];

  if (!page) {
    throw new Error("No browser page is open. Click Open ChatGPT first.");
  }

  return page;
}

export async function sendTextToChatGPT(scriptText: string, gptUrl?: string): Promise<{ response: string; conversationUrl: string }> {
  const targetUrl = (gptUrl || customGptUrl).replace(/\?.*$/, '').replace(/\/+$/, '');
  log('sendTextToChatGPT', { length: scriptText.length, targetUrl });

  const context = await BrowserManager.openBrowser();
  let page = context.pages().find((p) => !p.isClosed());
  if (!page) page = await context.newPage();

  await page.bringToFront();
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for the send button — this means the page is ready
  const sendBtnSel = 'button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]';
  await page.waitForSelector(sendBtnSel, { state: 'attached', timeout: 60000 });

  // Explicitly click and focus the chat input before pasting
  const chatInputSel = '#prompt-textarea, [contenteditable="true"], textarea';
  const chatInput = page.locator(chatInputSel).first();
  await chatInput.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  if (await chatInput.isVisible().catch(() => false)) {
    await chatInput.click();
    await page.waitForTimeout(200);
    // Clear any existing text
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
  }

  // Write text to clipboard then paste 
  await page.evaluate((text: string) => navigator.clipboard.writeText(text), scriptText);
  await page.keyboard.press('Control+v');

  // Wait for the text to land and the send button to become enabled
  await page.waitForTimeout(1000);

  // Count existing assistant messages before sending
  const assistantCountBeforeSend = await page
    .locator('div[data-message-author-role="assistant"], article[data-testid*="conversation-turn"]')
    .count();

  // Click the send button (falls back to Enter)
  const sendBtn = page.locator(sendBtnSel).first();
  await sendBtn.click().catch(async () => {
    log('send button click failed, falling back to Enter');
    await page.keyboard.press('Enter');
  });
  log('message sent, waiting for response');

  const response = await waitForAssistantResponse(page, assistantCountBeforeSend);
  log('assistant response captured', { length: response.length, preview: safeSnippet(response) });
  return { response, conversationUrl: page.url() };
}

async function waitForAssistantResponse(page: Page, assistantCountBeforeSend: number): Promise<string> {
  log('waitForAssistantResponse started', { assistantCountBeforeSend });

  // Step 1: Wait for generation to START (a new assistant message appears)
  const newMessageLocator = page.locator(
    'div[data-message-author-role="assistant"], article[data-testid*="conversation-turn"]'
  );

  log('waiting for new assistant message to appear...');
  await page.waitForFunction(
    (count: number) => {
      const msgs = document.querySelectorAll(
        'div[data-message-author-role="assistant"], article[data-testid*="conversation-turn"]'
      );
      return msgs.length > count;
    },
    assistantCountBeforeSend,
    { timeout: 120000, polling: 500 }
  ).catch(() => log('timed out waiting for new message to appear, continuing anyway'));

  // Step 2: Wait for generation to FINISH — send button re-enables OR stop button disappears
  log('waiting for generation to complete...');
  await page.waitForFunction(
    () => {
      // The stop-generating button disappears when done
      const stopBtn = document.querySelector('button[aria-label="Stop generating"], button[data-testid="stop-button"]');
      if (stopBtn) return false;
      // Also check: the send button is enabled again
      const sendBtn = document.querySelector(
        'button[aria-label="Send prompt"], button[data-testid="send-button"], button[aria-label="Send message"]'
      ) as HTMLButtonElement | null;
      if (sendBtn && !sendBtn.disabled) return true;
      // Fallback: just check no streaming cursor exists
      const cursor = document.querySelector('.result-streaming, [data-is-streaming="true"]');
      return !cursor;
    },
    {},
    { timeout: 240000, polling: 1000 }
  ).catch(() => log('timed out waiting for generation to complete, extracting what we have'));

  await page.waitForTimeout(500); // brief settle

  // Step 3: Extract the last assistant message text with multiple fallbacks
  log('extracting assistant response...');

  // Try 1: last div with role=assistant
  const assistantDivs = page.locator('div[data-message-author-role="assistant"]');
  const divCount = await assistantDivs.count().catch(() => 0);
  if (divCount > 0) {
    const lastDiv = assistantDivs.nth(divCount - 1);
    const text = await lastDiv.innerText().catch(() => '');
    if (text.trim()) {
      log('extracted via data-message-author-role', { length: text.length });
      return text.trim();
    }
  }

  // Try 2: last article (newer ChatGPT DOM)
  const articles = page.locator('article[data-testid*="conversation-turn"]');
  const articleCount = await articles.count().catch(() => 0);
  if (articleCount > 0) {
    const lastArticle = articles.nth(articleCount - 1);
    const text = await lastArticle.innerText().catch(() => '');
    if (text.trim()) {
      log('extracted via article', { length: text.length });
      return text.trim();
    }
  }

  // Try 3: grab all text from the main conversation container
  const conversationText = await page.locator(
    'main, [class*="conversation"], [class*="chat-content"]'
  ).first().innerText().catch(() => '');
  if (conversationText.trim()) {
    log('extracted via conversation container fallback', { length: conversationText.length });
    return conversationText.trim();
  }

  log('all extraction methods failed, returning empty string');
  return '';
}

/**
 * Aggressively attempts to extract the generation title from the AI Flow UI.
 */
async function extractFlowTitle(page: Page): Promise<string> {

  let title = '';

  // 1. Check for an editable input field (often used for titles in AI Flow)
  title = (await page.locator('input[aria-label="Editable text"], input[type="text"]').first().inputValue().catch(() => '')) || '';

  // 2. Check standard header/h2 tags
  if (!title.trim()) {
      title = (await page.locator('header h2, h2, .sc-c7ee1759-1 h2').first().textContent().catch(() => '')) || '';
  }

  // 3. Fallback: get the first line of text in the header area
  if (!title.trim()) {
      const headerText = await page.locator('header').first().innerText().catch(() => '');
      title = headerText.split('\n')[0] || '';
  }

  return title.trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ');
}

/**
 * Actively renames the generation in AI flow to our standardized naming format.
 */
export async function renameFlowTitle(page: Page, newTitle: string): Promise<string> {
  log('renaming flow title', { newTitle });

  // In AI Flow's detail view, the scene title is displayed as plain text at the top-left.
  // It only becomes an <input> AFTER you click on it.
  // Strategy: click the title text area → wait for the input to appear → type → Enter.

  // Step 1: Try to click the title area to activate it
  const titleTextSelectors = [
    'input[aria-label="Editable text"]',       // already active (e.g. after a previous click)
    '[aria-label="Editable text"]',             // the text span before activation
    'h1[contenteditable], h2[contenteditable]', // contenteditable heading
  ];

  for (const sel of titleTextSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      await el.click({ force: true }).catch(() => {});
      break;
    }
  }

  // Step 2: Wait for the input to appear (clicking activates it)
  const titleInput = page.locator('input[aria-label="Editable text"], input[type="text"]').first();
  await page.waitForSelector(
    'input[aria-label="Editable text"], input[type="text"]',
    { state: 'visible', timeout: 3000 }
  ).catch(() => {
    log('title input did not appear after click — skipping rename');
  });

  if (!(await titleInput.isVisible().catch(() => false))) {
    logError('could not activate title input — skipping rename');
    return newTitle;
  }

  // Step 3: Clear and type the new name, then confirm with Enter
  await titleInput.click({ force: true }).catch(() => {});
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(newTitle);
  await page.keyboard.press('Enter');
  // No wait needed — proceed straight to download

  return newTitle;
}


// Removed waitForCharacterReady since it's now integrated into watchAndDownloadCharacter


/**
 * Watches the AI Flow canvas and downloads exactly 2 grid variations 
 * after verifying their prompts using the exact same logic as characters.
 * Files are named Grid [N].png and Grid [N] 1.png.
 */
export async function watchAndDownloadGrid(
  page: Page,
  gridIndex: number,
  downloadPath: string,
  targetPrompt: string,
  timeoutMs = 120000
): Promise<string[]> {
  log(`watchAndDownloadGrid starting for Grid ${gridIndex + 1}`, { timeoutMs });
  await fs.promises.mkdir(downloadPath, { recursive: true });

  const gridLabel = `Grid ${gridIndex + 1}`;
  emitProgress({ pipeline: 'grid', label: `Watching for ${gridLabel} generation…`, step: 1, total: 5, pct: 10, subLabel: gridLabel });

  const startTime = Date.now();
  let lastProgressTime = Date.now();
  
  const savedPaths: string[] = [];
  const verifiedIds = new Set<string>();
  const attemptedIds = new Set<string>();

  // Ensure canvas is clear
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  let errorCount = 0;

  while (Date.now() - startTime < timeoutMs && savedPaths.length < 2) {
    const isGenerating = await page.locator('text=/Generating|Cooking|WAITING/i').count().catch(() => 0);
    const thumbnails = page.locator('img[src*="media.getMediaUrlRedirect"]');
    const count = await thumbnails.count().catch(() => 0);
    
    let loopProgress = false;

    // Scan the top 4 recent generations
    for (let i = 0; i < Math.min(count, 4) && savedPaths.length < 2; i++) {
        const thumb = thumbnails.nth(i);
        if (!(await thumb.isVisible().catch(() => false))) continue;

        const src = (await thumb.getAttribute('src').catch(() => '')) || '';
        const idMatch = src.match(/name=([^&]+)/);
        const id = idMatch ? idMatch[1] : null;

        if (!id || verifiedIds.has(id)) continue;
        if (attemptedIds.has(id)) continue;
        attemptedIds.add(id);

        // 1. Open Detail View — wait for the Download button, same as character pipeline
        emitProgress({ pipeline: 'grid', label: 'Opening image detail view…', step: 2, total: 5, pct: 30, subLabel: gridLabel });
        await thumb.click();
        await page.waitForSelector(
          'button:has-text("Download"), button[aria-label*="download" i]',
          { state: 'visible', timeout: 8000 }
        ).catch(() => {
          log('Download button did not appear after thumbnail click — continuing anyway');
        });

        // 2. Extract and Verify Prompt — use the same fast function as character pipeline
        emitProgress({ pipeline: 'grid', label: 'Verifying prompt match…', step: 3, total: 5, pct: 50, subLabel: gridLabel });
        log(`verifying sidebar prompt for grid ${gridIndex + 1}...`);
        const sidebarPrompt = await extractAndExpandSidebarPrompt(page);
        
        const normSidebar = sidebarPrompt.replace(/\s+/g, ' ').trim();
        const normTarget = targetPrompt.replace(/\s+/g, ' ').trim();
        
        let isMatch = false;
        
        // Grid prompts are long and often contain @ references which AI Flow expands or formats differently in the sidebar.
        // Instead of a 90% strict match, we simplify: check if the sidebar contains the first 60 characters of our target prompt.
        // We strip out punctuation and normalize spaces to make it robust.
        const cleanForMatch = (text: string) => text.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const cleanSidebar = cleanForMatch(sidebarPrompt);
        const cleanTarget = cleanForMatch(targetPrompt);
        
        // Take a reliable 80-character chunk from the beginning of the prompt to identify the grid.
        const targetSnippet = cleanTarget.slice(0, 80);

        if (cleanSidebar === cleanTarget || cleanSidebar.includes(cleanTarget)) {
            isMatch = true;
        } else if (targetSnippet.length > 10 && cleanSidebar.includes(targetSnippet)) {
            isMatch = true;
        }

        if (!isMatch) {
            log('prompt mismatch, skipping grid variation', { sidebarSnippet: safeSnippet(normSidebar, 30) });
            await page.keyboard.press('Escape');
            await page.waitForTimeout(400);
            continue;
        }

        log(`grid ${gridIndex + 1} prompt verified successfully!`);
        verifiedIds.add(id);
        loopProgress = true;

        // 3. Determine base grid name format
        const variationIndex = savedPaths.length + 1;
        const targetTitle = variationIndex === 1 ? `Grid ${gridIndex + 1}` : `Grid ${gridIndex + 1} ${variationIndex - 1}`;
        const filename = `${targetTitle}.png`;
        const destPath = path.join(downloadPath, filename);

        // 4. Rename Scene Title — always rename immediately, no pre-read needed
        emitProgress({ pipeline: 'grid', label: `Renaming scene to "${targetTitle}"…`, step: 4, total: 5, pct: 70, subLabel: gridLabel });
        await renameFlowTitle(page, targetTitle);
        log(`renamed grid scene title to "${targetTitle}"`);

        // 5. Download Variation
        emitProgress({ pipeline: 'grid', label: `Downloading variation ${variationIndex}…`, step: 5, total: 5, pct: 85 + (variationIndex * 7), subLabel: gridLabel });
        try {
            await triggerGridDownload(page, destPath);
            savedPaths.push(destPath);
            log(`downloaded grid variation ${variationIndex}`, { destPath });
            emitProgress({ pipeline: 'grid', label: `Variation ${variationIndex} saved ✓`, step: 5, total: 5, pct: savedPaths.length >= 2 ? 100 : 92, subLabel: gridLabel, done: savedPaths.length >= 2 });
        } catch (err) {
            logError(`failed to download grid variation ${variationIndex}`, err);
            errorCount++;
        }

        await page.keyboard.press('Escape');
        await page.waitForTimeout(150); // fast yield matching character pipeline
    }

    if (loopProgress) {
        lastProgressTime = Date.now();
        attemptedIds.clear(); // Clear so missing variations aren't ignored
    } else if (Date.now() - lastProgressTime > 8000 && isGenerating === 0 && savedPaths.length < 2) {
        // No new valid ones, stuck -> refresh
        log('grid pipeline stuck (no progress for 8s), refreshing...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        lastProgressTime = Date.now();
    }

    await page.waitForTimeout(1000);
  }

  return savedPaths;
}

/**
 * Triggers the download of the original size image using the browser's session.
 */
export async function triggerGridDownload(page: Page, destinationPath: string) {
  log('triggering browser-based download', { destinationPath });

  // 1. Ensure the download button/menu is ready. 
  // We'll look for "1K", which is the high-res option.
  let downloadButton = page.locator('role=menuitem >> text=1K').first();
  
  if (!(await downloadButton.isVisible().catch(() => false))) {
    log('1K button not visible, clicking Download menu');
    const menuButton = page.locator('button:has-text("Download")').first();
    await menuButton.click().catch(() => logError('failed to click Download menu'));
    // Wait for the menu item to appear
    await page.waitForSelector('role=menuitem >> text=1K', { state: 'visible', timeout: 5000 }).catch(() => {
        logError('1K download option did not appear after clicking menu');
    });
  }

  // 2. Click the button and wait for the download event
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }), // Longer timeout for large files/slow generation
    downloadButton.click().catch(err => {
        logError('failed to click 1K download button', err);
        throw err;
    }),
  ]);

  // 3. Save it
  await download.saveAs(destinationPath);
  
  log('download completed and saved', { destinationPath });
  return destinationPath;
}

export async function getGridImageUrl(page: Page) {
  log('extracting grid image URL');
  // Fallback if detail view logic isn't used
  const img = page.locator('img').first();
  const count = await img.count().catch(() => 0);
  if (count === 0) {
    logError('no images found on page');
    return null;
  }
  const src = await img.getAttribute('src').catch(() => null);
  return src;
}

export async function resetBrowserProfile() {
  await BrowserManager.resetProfile();
}

/**
 * Simple video generation flow:
 * 1. Click Video radio
 * 2. Click chat input
 * 3. Paste image via clipboard (DataTransfer) — like Ctrl+C on the file then Ctrl+V
 * 4. Wait for upload
 * 5. Paste prompt via clipboard
 * 6. Enter to send
 * 7. Wait and download
 */
export async function generateVideoInGrok(shotImagePath: string, videoOutputPath: string, compositePrompt: string) {
  log(`Generating video — source: ${path.basename(shotImagePath)}`);
  const shotId = path.basename(shotImagePath, '.png');
  emitProgress({ pipeline: 'video', label: 'Opening Grok for video generation…', step: 1, total: 5, pct: 5, subLabel: `Shot ${shotId}` });
  const context = await BrowserManager.openBrowser();
  const page = await context.newPage();

  try {
    await page.goto('https://grok.com/imagine', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button[role="radio"]', { state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1000);

    // STEP 1 — Click Video mode radio (language-agnostic via DOM scan)
    emitProgress({ pipeline: 'video', label: 'Switching to Video mode…', step: 1, total: 5, pct: 15, subLabel: `Shot ${shotId}` });
    log('Clicking Video mode...');
    await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll<HTMLElement>('button[role="radio"]'));
      const videoBtn = radios.find(b => /vide?o/i.test(b.textContent || ''));
      if (videoBtn) videoBtn.click();
      else if (radios.length >= 2) radios[radios.length - 1].click();
    });
    await page.waitForTimeout(1500);

    // STEP 2 — Click the chat input
    emitProgress({ pipeline: 'video', label: 'Uploading shot image…', step: 2, total: 5, pct: 30, subLabel: `Shot ${shotId}` });
    log('Clicking chat input...');
    const chatInput = page.locator('[contenteditable="true"], textarea').first();
    await chatInput.waitFor({ state: 'visible', timeout: 15000 });
    await chatInput.click();
    await page.waitForTimeout(300);

    // STEP 3 — Paste image via DataTransfer (equivalent of Ctrl+C on file then Ctrl+V)
    log('Pasting image into chat input...');
    const imageBuffer = await fs.promises.readFile(shotImagePath);
    const base64Image = imageBuffer.toString('base64');
    const filename = path.basename(shotImagePath);

    await page.evaluate(async ({ b64, name }: { b64: string; name: string }) => {
      const byteStr = atob(b64);
      const ab = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) ab[i] = byteStr.charCodeAt(i);
      const file = new File([ab], name, { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const el = document.querySelector<HTMLElement>('[contenteditable="true"]') ?? document.querySelector<HTMLElement>('textarea');
      el?.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    }, { b64: base64Image, name: filename });

    // STEP 4 — Wait for the image to upload (thumbnail appears)
    log('Waiting for image upload...');
    await page.waitForTimeout(4000); // give Grok time to process the pasted image

    // STEP 5 — Paste the prompt text via clipboard
    emitProgress({ pipeline: 'video', label: 'Submitting video prompt…', step: 3, total: 5, pct: 45, subLabel: `Shot ${shotId}` });
    log('Pasting prompt text...');
    await chatInput.click();
    await page.evaluate((text: string) => navigator.clipboard.writeText(text), compositePrompt);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(800);

    // STEP 6 — Submit
    const downloadPromise = page.waitForEvent('download', { timeout: 300000 });
    log('Sending prompt...');
    await page.keyboard.press('Enter');
    emitProgress({ pipeline: 'video', label: 'Waiting for Grok video generation…', step: 4, total: 5, pct: 55, subLabel: `Shot ${shotId}` });
    log('Waiting for video generation to finish...');

    // STEP 7 — Wait for generation to complete
    await page.waitForFunction(
      () => {
        const hasDownload = document.querySelectorAll('button[aria-label="Download"]').length > 0;
        const isGenerating = /generating|working on it|cooking/i.test(document.body.innerText);
        return hasDownload && !isGenerating;
      },
      { timeout: 300000, polling: 1500 }
    );

    emitProgress({ pipeline: 'video', label: 'Downloading video…', step: 5, total: 5, pct: 90, subLabel: `Shot ${shotId}` });
    log('Done — clicking download...');
    await page.waitForTimeout(1500);
    await page.locator('button[aria-label="Download"]').last().click();

    const download = await downloadPromise;
    await download.saveAs(videoOutputPath);
    log(`Video saved to ${videoOutputPath}`);
    emitProgress({ pipeline: 'video', label: 'Video saved ✓', step: 5, total: 5, pct: 100, subLabel: `Shot ${shotId}`, done: true });

    return { success: true, path: videoOutputPath, grokUrl: page.url() };

  } catch (error) {
    logError('generateVideoInGrok failed:', error);
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Edits an existing Grok video conversation by navigating to the saved URL
 * and submitting a new modification prompt. Downloads the result.
 */
export async function editVideoInGrok(
  sourceUrl: string,
  videoOutputPath: string,
  modificationPrompt: string
) {
  log(`Editing video in Grok — url: ${sourceUrl}`);
  const context = await BrowserManager.openBrowser();
  const page = await context.newPage();

  try {
    // Navigate to the existing conversation (keeps full context)
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // Click the chat input
    const chatInput = page.locator('[contenteditable="true"], textarea').first();
    await chatInput.waitFor({ state: 'visible', timeout: 15000 });
    await chatInput.click();
    await page.waitForTimeout(300);

    // STEP 2 — Paste the modification prompt and CLICK SEND
    log('Pasting modification prompt...');
    await page.evaluate((text: string) => navigator.clipboard.writeText(text), modificationPrompt);
    await chatInput.click();
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(700); // let paste render

    log('Clicking send button to submit edit...');

    // Grok uses ProseMirror — Enter = newline. Must click the send button.
    const sendBtn = page.locator(
      'button[aria-label="submeter"], button[aria-label="Send"], button[aria-label="Submit"], button[aria-label="Enviar"], button[aria-label="Soumettre"]'
    ).last();
    const sendBtnVisible = await sendBtn.isVisible().catch(() => false);
    if (sendBtnVisible) {
      await sendBtn.click();
    } else {
      log('Send button not found — fallback Ctrl+Enter');
      await chatInput.click();
      await page.keyboard.press('Control+Enter');
    }
    log('Waiting for new edited video to generate...');


    // STEP 3 — Wait for generation to START then FINISH
    // Phase A: generation begins (stop button appears or spinner visible) — 15s max
    await page.waitForFunction(
      () => {
        const hasStop = !!document.querySelector(
          'button[aria-label="Stop"], button[aria-label="Parar"], button[aria-label="Arrêter"]'
        );
        const hasSpinner = !!document.querySelector(
          '[class*="spinner"], [class*="loading"], [class*="animate-spin"]'
        );
        const busy = /gerar|generat|processar|a criar|working|cooking/i.test(document.body.innerText);
        return hasStop || hasSpinner || busy;
      },
      { timeout: 15000, polling: 500 }
    ).catch(() => log('Generation start signal not detected — proceeding'));

    // Phase B: generation FINISHED (stop button gone + download button present)
    await page.waitForFunction(
      () => {
        const stopGone = !document.querySelector(
          'button[aria-label="Stop"], button[aria-label="Parar"], button[aria-label="Arrêter"]'
        );
        const hasDownload = document.querySelectorAll('button[aria-label="Download"]').length > 0;
        const stillBusy = /gerar|generat|processar|a criar|working|cooking/i.test(document.body.innerText);
        return stopGone && hasDownload && !stillBusy;
      },
      { timeout: 300000, polling: 1500 }
    );

    log('Generation complete — clicking download...');
    await page.waitForTimeout(1500);

    // Register download listener RIGHT before clicking (avoids race conditions)
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await page.locator('button[aria-label="Download"]').last().click();

    const download = await downloadPromise;
    await download.saveAs(videoOutputPath);
    log(`Edited video saved to ${videoOutputPath}`);

    return { success: true, path: videoOutputPath, grokUrl: page.url() };

  } catch (error) {
    logError('editVideoInGrok failed:', error);
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Navigates to an existing Grok video conversation, opens the "More options" (⋯) menu,
 * clicks "Upscale", waits for the upscaled video to generate, then downloads it.
 */
export async function upscaleVideoInGrok(sourceUrl: string, videoOutputPath: string) {
  log(`Upscaling video — navigating to: ${sourceUrl}`);
  const context = await BrowserManager.openBrowser();
  const page = await context.newPage();

  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Step 1 — Click "More options" (3-dots) button
    log('Clicking More options (3-dots) button...');
    const moreBtn = page.locator('button[aria-label="More options"]').first();
    await moreBtn.waitFor({ state: 'visible', timeout: 15000 });
    await moreBtn.click();
    await page.waitForTimeout(1000);

    // Step 2 — Click "Upscale" in the dropdown menu
    log('Clicking Upscale menu item...');
    const upscaleItem = page.locator('[role="menuitem"]:has-text("Upscale"), li:has-text("Upscale"), button:has-text("Upscale")').first();
    await upscaleItem.waitFor({ state: 'visible', timeout: 8000 });
    await upscaleItem.click();
    log('Upscale clicked — waiting for generation to start...');
    await page.waitForTimeout(2000);

    // Step 3 — Wait for any stop/busy signal, then wait for it to finish
    // Phase A: generation begins
    await page.waitForFunction(
      () => {
        const hasStop = !!document.querySelector(
          'button[aria-label="Stop"], button[aria-label="Parar"], button[aria-label="Arrêter"]'
        );
        const hasSpinner = !!document.querySelector(
          '[class*="spinner"], [class*="loading"], [class*="animate-spin"]'
        );
        const busy = /gerar|generat|processar|a criar|working|cooking|upscal/i.test(document.body.innerText);
        return hasStop || hasSpinner || busy;
      },
      { timeout: 20000, polling: 500 }
    ).catch(() => log('Upscale start signal not detected — proceeding'));

    // Phase B: generation finished (download button appears, no stop button)
    log('Waiting for upscaled video to be ready...');
    await page.waitForFunction(
      () => {
        const stopGone = !document.querySelector(
          'button[aria-label="Stop"], button[aria-label="Parar"], button[aria-label="Arrêter"]'
        );
        const hasDownload = document.querySelectorAll('button[aria-label="Download"]').length > 0;
        const stillBusy = /gerar|generat|processar|a criar|working|cooking|upscal/i.test(document.body.innerText);
        return stopGone && hasDownload && !stillBusy;
      },
      { timeout: 300000, polling: 1500 }
    );

    log('Upscale complete — clicking download...');
    await page.waitForTimeout(1500);

    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await page.locator('button[aria-label="Download"]').last().click();

    const download = await downloadPromise;
    await download.saveAs(videoOutputPath);
    log(`Upscaled video saved to ${videoOutputPath}`);

    return { success: true, path: videoOutputPath, grokUrl: page.url() };

  } catch (error) {
    logError('upscaleVideoInGrok failed:', error);
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
}
