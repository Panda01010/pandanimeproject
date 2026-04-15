export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { isBrowserOpen, openBrowser, openAIFlow, openChatGPT, openGrok, extractShotInGrok, editShotInGrok, downloadShotFromGrok, generateVideoInGrok, editVideoInGrok, upscaleVideoInGrok, resetBrowserProfile, sendTextToChatGPT, fillAIFlowPrompt, submitAIFlowPrompt, getGridImageUrl, triggerGridDownload, renameFlowTitle } from '@/app/BrowserManager';


async function saveFailureArtifacts(page: { screenshot: (options: { path: string; fullPage?: boolean }) => Promise<Buffer>; url: () => string }, paths: ReturnType<typeof getProjectPaths>, gridIndex: number, reason: string) {
  const failureBase = `grid-${gridIndex + 1}-failure`;
  const screenshotPath = path.join(paths.shotsPath, `${failureBase}.png`);
  const logPath = path.join(paths.logsPath, `${failureBase}.txt`);
  await fs.mkdir(paths.shotsPath, { recursive: true });
  await fs.mkdir(paths.logsPath, { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await fs.writeFile(logPath, JSON.stringify({
    projectName: activeProjectName,
    gridIndex: gridIndex + 1,
    url: page.url(),
    reason,
    timestamp: new Date().toISOString(),
  }, null, 2), 'utf8');
  return { screenshotPath, logPath };
}


const projectsRoot = path.join(process.cwd(), 'projects');
const activeProjectFile = path.join(projectsRoot, 'active.txt');
let activeProjectName = '';
let activeProjectPath = '';

async function saveActiveProject(projectName: string) {
  await fs.mkdir(projectsRoot, { recursive: true });
  await fs.writeFile(activeProjectFile, projectName.trim(), 'utf8');
}

async function loadActiveProject() {
  try {
    const name = await fs.readFile(activeProjectFile, 'utf8');
    if (name.trim()) {
      const paths = getProjectPaths(name.trim());
      await fs.access(paths.projectPath);
      activeProjectName = name.trim();
      activeProjectPath = paths.projectPath;
      return true;
    }
  } catch {
    // No active project file or project dir missing
  }
  return false;
}

async function listProjectNames() {
  const entries = await fs.readdir(projectsRoot, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
}

function sanitizeProjectName(projectName: string) {
  return projectName.trim().replace(/[\\/]+/g, '-');
}

async function setActiveProject(projectName: string) {
  const sanitized = sanitizeProjectName(projectName);
  const paths = getProjectPaths(sanitized);
  await fs.mkdir(paths.projectPath, { recursive: true });
  activeProjectName = sanitized;
  activeProjectPath = paths.projectPath;
  await saveActiveProject(sanitized);
  return paths;
}

function getActiveProjectMeta() {
  return activeProjectName ? { projectName: activeProjectName, projectPath: activeProjectPath } : { projectName: '', projectPath: '' };
}

function getActiveProjectPaths() {
  return activeProjectName ? getProjectPaths(activeProjectName) : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getProjectPaths(projectName: string) {
  const projectPath = path.join(projectsRoot, projectName);
  return {
    projectPath,
    promptsPath: path.join(projectPath, 'prompts'),
    gridsPath: path.join(projectPath, 'grids'),
    shotsPath: path.join(projectPath, 'shots'),
    videosPath: path.join(projectPath, 'videos'),
    logsPath: path.join(projectPath, 'logs'),
    charactersPath: path.join(projectPath, 'characters'),
    charactersJsonPath: path.join(projectPath, 'characters', 'characters.json'),
    rawOutputPath: path.join(projectPath, 'logs', 'raw-gpt-output.txt'),
    promptsJsonPath: path.join(projectPath, 'prompts', 'prompts.json'),
    gridApprovalsPath: path.join(projectPath, 'grids', 'approvals.json'),
    imageApprovalsPath: path.join(projectPath, 'grids', 'image-approvals.json'),
    metadataPath: path.join(projectPath, 'metadata.json'),
  };
}

// ── Character helpers ────────────────────────────────────────────────────────

interface Character {
  id: string;
  name: string;
  description: string;
  generated?: boolean;
}

function parseCharacterBlock(rawText: string): Character[] {
  const characters: Character[] = [];
  for (const line of rawText.split('\n')) {
    const trimmed = line.trim();
    // Skip blank lines and header lines (no @ prefix)
    if (!trimmed.startsWith('@')) continue;

    // Match: @Name: [description]  OR  @Name: description (no brackets)
    const match = trimmed.match(/^@([^:]+):\s*\[?(.+?)\]?\s*$/);
    if (match) {
      const name = match[1].trim();
      const description = match[2].trim();
      if (!name || !description) continue;
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      characters.push({ id, name, description, generated: false });
    }
  }
  return characters;
}

async function readCharacters(charactersJsonPath: string): Promise<Character[]> {
  try {
    const raw = await fs.readFile(charactersJsonPath, 'utf8');
    return JSON.parse(raw) as Character[];
  } catch {
    return [];
  }
}

async function saveCharacters(charactersJsonPath: string, characters: Character[]) {
  const dir = path.dirname(charactersJsonPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(charactersJsonPath, JSON.stringify(characters, null, 2), 'utf8');
}

async function readProjectMetadata(metadataPath: string): Promise<{ aiFlowUrl?: string }> {
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveProjectMetadata(metadataPath: string, data: { aiFlowUrl?: string }) {
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });
  await fs.writeFile(metadataPath, JSON.stringify(data, null, 2), 'utf8');
}


async function ensureProjectStructure(projectName: string) {
  const paths = getProjectPaths(projectName);
  await Promise.all([
    fs.mkdir(paths.promptsPath, { recursive: true }),
    fs.mkdir(paths.gridsPath, { recursive: true }),
    fs.mkdir(paths.shotsPath, { recursive: true }),
    fs.mkdir(paths.videosPath, { recursive: true }),
    fs.mkdir(paths.logsPath, { recursive: true }),
  ]);
  activeProjectName = projectName;
  activeProjectPath = paths.projectPath;
  await saveActiveProject(projectName);
  return paths;
}

async function activateExistingProject(projectName: string) {
  const sanitized = sanitizeProjectName(projectName);
  const paths = getProjectPaths(sanitized);
  await fs.access(paths.projectPath);
  activeProjectName = sanitized;
  activeProjectPath = paths.projectPath;
  await saveActiveProject(sanitized);
  return paths;
}

async function clearActiveProjectIfMatches(projectName: string) {
  if (activeProjectName === projectName) {
    activeProjectName = '';
    activeProjectPath = '';
    await fs.unlink(activeProjectFile).catch(() => {});
  }
}

function requireActiveProject() {
  if (!activeProjectName) {
    throw new Error('Create a project before saving files.');
  }
  return getProjectPaths(activeProjectName);
}

function parseGridSections(rawText: string) {
  const headingMatches = [...rawText.matchAll(/^Grid\s+\d+:/gm)];
  return headingMatches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < headingMatches.length ? headingMatches[index + 1].index ?? rawText.length : rawText.length;
    return rawText.slice(start, end);
  });
}

async function saveGridFiles(blocks: string[], gridsPath: string) {
  const paths: string[] = [];
  await Promise.all(
    blocks.map(async (block, index) => {
      const filePath = path.join(gridsPath, `grid-${index + 1}-raw.txt`);
      await fs.writeFile(filePath, block, 'utf8');
      paths.push(filePath);
    }),
  );
  return paths.sort((a, b) => a.localeCompare(b));
}

async function readGridFiles(gridsPath: string) {
  const entries = await fs.readdir(gridsPath, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && /^grid-\d+-raw\.txt$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const blocks = await Promise.all(files.map((file) => fs.readFile(path.join(gridsPath, file), 'utf8')));
  return { files, blocks };
}

async function readGridApprovals(approvalsPath: string) {
  const raw = await fs.readFile(approvalsPath, 'utf8').catch(() => '');
  const parsed = raw ? (JSON.parse(raw) as { approvedGridIndexes?: number[] }) : {};
  return new Set(Array.isArray(parsed.approvedGridIndexes) ? parsed.approvedGridIndexes : []);
}

function parseShotPrompts(rawText: string) {
  const result: { style: string; setting: string; shots: Record<number, string> } = {
    style: '',
    setting: '',
    shots: {},
  };

  // Extract Style
  const styleMatch = rawText.match(/🎨 Style\s*\n\s*([\s\S]*?)(?=\n\n|\n[^\s\n])/);
  if (styleMatch) result.style = styleMatch[1].trim();

  // Extract Setting
  const settingMatch = rawText.match(/🌲 Setting\s*\n\s*([\s\S]*?)(?=\n\n|\n[^\s\n])/);
  if (settingMatch) result.setting = settingMatch[1].trim();

  // Extract Shot descriptions
  const shotLines = rawText.matchAll(/Shot\s+(\d+)\s*[–-]\s*(.*)/g);
  for (const match of shotLines) {
    const num = parseInt(match[1]);
    result.shots[num] = match[2].trim();
  }

  return result;
}

async function readImageApprovals(imageApprovalsPath: string): Promise<Record<string, string>> {
  const raw = await fs.readFile(imageApprovalsPath, 'utf8').catch(() => '');
  const parsed = raw ? (JSON.parse(raw) as { imageApprovals?: Record<string, string> }) : {};
  // Normalise keys to strings — JSON always produces string keys but old saves may have used numbers
  const approvals = parsed.imageApprovals || {};
  const normalised: Record<string, string> = {};
  for (const [k, v] of Object.entries(approvals)) {
    normalised[String(k)] = v;
  }
  return normalised;
}

// ── GPT URL helpers ──────────────────────────────────────────────────────────

const gptsFilePath = path.join(process.cwd(), 'gpts.json');
const selectedGptFilePath = path.join(process.cwd(), 'selected-gpt.txt');
const DEFAULT_GPT_URL = 'https://chatgpt.com/g/g-69cae55e4efc8191926d2ca7dfe6ee6c-script-anime-photo-generator';

async function readSelectedGptUrl(): Promise<string> {
  try {
    const selectedId = (await fs.readFile(selectedGptFilePath, 'utf8')).trim();
    const raw = await fs.readFile(gptsFilePath, 'utf8');
    const gpts = JSON.parse(raw) as Array<{ id: string; url: string }>;
    const found = gpts.find(g => g.id === selectedId);
    return found?.url || DEFAULT_GPT_URL;
  } catch {
    return DEFAULT_GPT_URL;
  }
}

export async function GET() {
  if (!activeProjectName) {
    await loadActiveProject();
  }
  const open = isBrowserOpen();
  const projectNames = await listProjectNames();
  const meta = getActiveProjectMeta();
  const paths = activeProjectName ? getProjectPaths(activeProjectName) : null;
  const raw = paths ? await fs.readFile(paths.rawOutputPath, 'utf8').catch(() => '') : '';
  const scriptText = paths ? await fs.readFile(path.join(paths.projectPath, 'script.txt'), 'utf8').catch(() => '') : '';
  const onDiskGridData = paths ? await readGridFiles(paths.gridsPath) : { files: [], blocks: [] };
  const parsedBlocks = raw ? parseGridSections(raw) : [];
  const blocks = onDiskGridData.blocks.length ? onDiskGridData.blocks : parsedBlocks;
  const gridPaths = paths ? (onDiskGridData.files.length ? onDiskGridData.files.map((file) => path.join(paths.gridsPath, file)) : await saveGridFiles(blocks, paths.gridsPath)) : [];
  const approvals = paths ? await readGridApprovals(paths.gridApprovalsPath).catch(() => new Set<number>()) : new Set<number>();
  const imageApprovals = paths ? await readImageApprovals(paths.imageApprovalsPath) : {};

  if (raw && paths) {
    await fs.writeFile(paths.promptsJsonPath, JSON.stringify(blocks, null, 2), 'utf8');
  }

  console.log('[open-browser] GET status', {
    open,
    projectName: activeProjectName || null,
    projectPath: activeProjectPath || null,
    promptsSavedTo: paths ? paths.promptsJsonPath : null,
    gridFilesSavedTo: gridPaths,
    blockCount: blocks.length,
    projectCount: projectNames.length,
  });

    const gridImages = activeProjectName && paths
      ? (await fs.readdir(paths.gridsPath, { withFileTypes: true }).catch(() => []))
          .filter(entry => entry.isFile() && entry.name.endsWith('.png'))
          .map(entry => entry.name)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : [];

    const extractedShotsArray = activeProjectName && paths
      ? (await fs.readdir(path.join(paths.projectPath, 'extracted'), { withFileTypes: true }).catch(() => []))
          .filter(entry => entry.isFile() && entry.name.endsWith('.png'))
          .map(entry => entry.name)
      : [];
    
    const extractedShots: Record<number, string[]> = {};
    for (const filename of extractedShotsArray) {
      const globalShotNumMatch = filename.match(/^(\d+)\.png$/);
      if (globalShotNumMatch) {
         const globalShotNumber = Number(globalShotNumMatch[1]);
         const gridIndex = Math.floor((globalShotNumber - 1) / 9);
         if (!extractedShots[gridIndex]) extractedShots[gridIndex] = [];
         extractedShots[gridIndex].push(filename);
      }
    }
    
    for (const key of Object.keys(extractedShots)) {
      extractedShots[Number(key)].sort((a, b) => {
         return Number(a.split('.')[0]) - Number(b.split('.')[0]);
      });
    }

    const metadata = paths ? await readProjectMetadata(paths.metadataPath).catch(() => ({})) : {};
    const shotSources = (metadata as any).shotSources || {};

    const characters = paths ? await readCharacters(paths.charactersJsonPath) : [];

    const gridDescriptions = await Promise.all(
      blocks.map(async (block) => parseShotPrompts(block))
    );

    const generatedVideos = activeProjectName && paths
      ? (await fs.readdir(paths.videosPath, { withFileTypes: true }).catch(() => []))
          .filter(entry => entry.isFile() && entry.name.endsWith('.mp4'))
          .map(entry => entry.name)
          .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]))
      : [];

    return NextResponse.json({
      open,
      projectName: meta.projectName ?? activeProjectName,
      projectPath: meta.projectPath ?? activeProjectPath,
      projects: projectNames,
      promptsPath: paths?.promptsJsonPath ?? '',
      gridPaths,
      parsed: blocks,
      gridDescriptions,
      gridApprovals: Array.from(approvals.values()).sort((a, b) => a - b),
      imageApprovals,
      scriptText,
      gridImages,
      extractedShots,
      shotSources,
      shotAssignments: (metadata as any).shotAssignments || {},
      characters,
      generatedVideos,
      videoSources: (metadata as any).videoSources || {},
      videoOriginalSources: (metadata as any).videoOriginalSources || {},
      videoPrompts: (metadata as any).videoPrompts || {},
      hasGptConversation: !!(metadata as any).gptConversationUrl,
      gptResponse: raw,
    });

}


export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { projectName?: string; action?: string };
    const projectName = (body.projectName ?? '').trim();

    if (!projectName) {
      return NextResponse.json({ ok: false, error: 'Project name is required.' }, { status: 400 });
    }

    const paths = await ensureProjectStructure(projectName);
    activeProjectName = projectName;
    activeProjectPath = paths.projectPath;

    if (body.action === 'open') {
      console.log('[open-browser] POST open project locally');
      const scriptPath = path.join(paths.promptsPath, '..', 'script.txt');
      const scriptText = await fs.readFile(scriptPath, 'utf8').catch(() => '');
      return NextResponse.json({ ok: true, projectName, projectPath: paths.projectPath, scriptText });
    }

    console.log('[open-browser] POST create project: triggering AI Flow workspace creation');
    const { projectState, page } = await openAIFlow(projectName);
    const aiFlowUrl = page.url();
    await saveProjectMetadata(paths.metadataPath, { aiFlowUrl });
    
    // Close the newly created project's tab immediately after capturing the URL
    await page.close().catch((err) => console.error('[open-browser] failed to close page', err));
    
    console.log('[open-browser] POST create project success', { projectName, projectPath: paths.projectPath, projectState, aiFlowUrl });
    return NextResponse.json({ ok: true, projectName, projectPath: paths.projectPath, projectState });

  } catch (error) {
    console.error('[open-browser] POST create project failed', error);
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}


export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { 
      action?: string; 
      projectName?: string; 
      gridIndex?: number; 
      filename?: string;
      sourceUrl?: string;
      tweakPrompt?: string;
      targetFilename?: string;
      shotId?: string;
      decision?: 'overwrite' | 'discard';
      previewFilename?: string;
      newUrl?: string;
      minDelay?: number;
      maxDelay?: number;
    };
    const projectName = (body.projectName || activeProjectName || '').trim();

      if (body.action === 'watch-and-download') {
          const gridIndex = typeof body.gridIndex === 'number' ? body.gridIndex : null;
          console.log('[open-browser] PUT watch-and-download START', { projectName, gridIndex });

          if (gridIndex === null || !projectName) {
              return NextResponse.json({ ok: false, error: 'Missing projectName or gridIndex.' }, { status: 400 });
          }

          const paths = getProjectPaths(projectName);
          const metadata = await readProjectMetadata(paths.metadataPath);
          const { page } = await openAIFlow(projectName, metadata.aiFlowUrl);

          // Read the target prompt for strict verification
          const gridFilePath = path.join(paths.gridsPath, `grid-${gridIndex + 1}-raw.txt`);
          let targetPrompt = await fs.readFile(gridFilePath, 'utf8').catch(() => '');

          console.log('[open-browser] watch-and-download: polling and verifying grid generation...');
          const { watchAndDownloadGrid } = await import('@/app/BrowserManager');
          
          const savedPaths = await watchAndDownloadGrid(page, gridIndex, paths.gridsPath, targetPrompt, 120000);

          if (savedPaths.length === 0) {
              return NextResponse.json({ ok: false, error: `Grid ${gridIndex + 1} did not generate 2 variations or verify successfully within timeout.` }, { status: 408 });
          }

          const updatedMetadata = {
              ...metadata,
              flowTitles: { ...((metadata as any).flowTitles || {}), [gridIndex]: `Grid ${gridIndex + 1}` }
          };
          await saveProjectMetadata(paths.metadataPath, updatedMetadata as any);

          console.log('[open-browser] watch-and-download: complete', { savedPaths });
          return NextResponse.json({ ok: true, savedPaths, matchCount: savedPaths.length, flowTitle: `Grid ${gridIndex + 1}` });
      }

      // ── CALL 1: Fill + submit the character prompt, return immediately ──
      if (body.action === 'char-submit') {
          const { characterId } = body as any;
          console.log('[open-browser] PUT char-submit', { projectName, characterId });

          if (!projectName || !characterId) {
              return NextResponse.json({ ok: false, error: 'Missing projectName or characterId.' }, { status: 400 });
          }

          const paths = getProjectPaths(projectName);
          const characters = await readCharacters(paths.charactersJsonPath);
          const char = characters.find(c => c.id === characterId);
          if (!char) return NextResponse.json({ ok: false, error: 'Character not found.' }, { status: 404 });

          const metadata = await readProjectMetadata(paths.metadataPath);
          const { page } = await openAIFlow(projectName, metadata.aiFlowUrl);

          // Save the current URL in case it changed
          const currentUrl = page.url();
          if (currentUrl !== metadata.aiFlowUrl) {
              await saveProjectMetadata(paths.metadataPath, { ...metadata, aiFlowUrl: currentUrl });
          }

          const prompt = [
              `Character reference sheet — 3 panels side by side: front view, side view, 3/4 view.`,
              `Same person across all panels. White or neutral background. No story action — pure reference only.`,
              `High-quality cinematic anime style, sharp linework, consistent face and clothing.`,
              `Character: ${char.description}`,
          ].join('\n');

          const filled = await fillAIFlowPrompt(page, prompt);
          if (!filled) return NextResponse.json({ ok: false, error: 'Could not fill the AI Flow prompt.' }, { status: 500 });

          const submitted = await submitAIFlowPrompt(page);
          if (!submitted) return NextResponse.json({ ok: false, error: 'Could not submit the AI Flow prompt.' }, { status: 500 });

          console.log('[open-browser] char-submit: prompt submitted for', char.name);
          return NextResponse.json({ ok: true, characterName: char.name });
      }

      // ── CALL 2: Wait until generation is done, download 2 variations ──
      if (body.action === 'char-watch-download') {
          const { characterId } = body as any;
          console.log('[open-browser] PUT char-watch-download', { projectName, characterId });

          if (!projectName || !characterId) {
              return NextResponse.json({ ok: false, error: 'Missing projectName or characterId.' }, { status: 400 });
          }

          const paths = getProjectPaths(projectName);
          const characters = await readCharacters(paths.charactersJsonPath);
          const char = characters.find(c => c.id === characterId);
          if (!char) return NextResponse.json({ ok: false, error: 'Character not found.' }, { status: 404 });

          const metadata = await readProjectMetadata(paths.metadataPath);
          const { page } = await openAIFlow(projectName, metadata.aiFlowUrl);

          const charId = char.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          const charactersImagesPath = path.join(paths.projectPath, 'characters');
          await fs.mkdir(charactersImagesPath, { recursive: true });

          const targetPrompt = [
              `Character reference sheet — 3 panels side by side: front view, side view, 3/4 view.`,
              `Same person across all panels. White or neutral background. No story action — pure reference only.`,
              `High-quality cinematic anime style, sharp linework, consistent face and clothing.`,
              `Character: ${char.description}`,
          ].join('\n');

          const { watchAndDownloadCharacter } = await import('@/app/BrowserManager');
          
          console.log('[open-browser] char-watch-download: watching and verifying character generation...');
          const savedPaths = await watchAndDownloadCharacter(page, char.name, charId, charactersImagesPath, targetPrompt);

          if (savedPaths.length === 0) {
              return NextResponse.json({ ok: false, error: 'Character generation verification or download failed.' }, { status: 408 });
          }

          const imageFilenames = savedPaths.map(p => path.basename(p));

          // Persist both filenames to characters.json
          char.generated = savedPaths.length > 0;
          (char as any).imagePaths = imageFilenames;         // e.g. ['young_hustler-1.png', 'young_hustler-2.png']
          (char as any).approvedVariation = null;             // reset lock on regenerate
          delete (char as any).imagePath;                     // remove old single-file field
          await saveCharacters(paths.charactersJsonPath, characters);

          console.log('[open-browser] char-watch-download: done', { characterName: char.name, imageFilenames });
          return NextResponse.json({ ok: true, imageFilenames, characters });
      }

      // ── CALL 3: Manual Sync for a character  ──
      if (body.action === 'char-manual-sync') {
          const { characterId } = body as any;
          console.log('[open-browser] PUT char-manual-sync', { projectName, characterId });

          if (!projectName || !characterId) {
              return NextResponse.json({ ok: false, error: 'Missing projectName or characterId.' }, { status: 400 });
          }

          const paths = getProjectPaths(projectName);
          const characters = await readCharacters(paths.charactersJsonPath);
          const char = characters.find(c => c.id === characterId);
          if (!char) return NextResponse.json({ ok: false, error: 'Character not found.' }, { status: 404 });

          const metadata = await readProjectMetadata(paths.metadataPath);
          const { page } = await openAIFlow(projectName, metadata.aiFlowUrl);

          const charId = char.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          const charactersImagesPath = path.join(paths.projectPath, 'characters');
          
          const { manualSyncCharacter } = await import('@/app/BrowserManager');
          
          console.log('[open-browser] char-manual-sync: running manual sync...');
          const savedPaths = await manualSyncCharacter(page, char.name, charId, charactersImagesPath);

          if (savedPaths.length === 0) {
              return NextResponse.json({ ok: false, error: 'Manual sync failed to capture any images.' }, { status: 408 });
          }

          const imageFilenames = savedPaths.map(p => path.basename(p));
          
          char.generated = true;
          // merge with existing images if they exist
          const existingImages: string[] = (char as any).imagePaths || [];
          const newImagesSet = new Set([...existingImages, ...imageFilenames]);
          (char as any).imagePaths = Array.from(newImagesSet);
          
          await saveCharacters(paths.charactersJsonPath, characters);

          console.log('[open-browser] char-manual-sync: done', { characterName: char.name, imageFilenames });
          return NextResponse.json({ ok: true, imageFilenames, characters });
      }


      if (body.action === 'approve-character') {
          const { characterId, approved } = body as any;
          console.log('[open-browser] PUT approve-character', { projectName, characterId, variation: (body as any).variation });

          if (!projectName || !characterId) {
              return NextResponse.json({ ok: false, error: 'Missing projectName or characterId.' }, { status: 400 });
          }

          const paths = getProjectPaths(projectName);
          const characters = await readCharacters(paths.charactersJsonPath);
          const char = characters.find(c => c.id === characterId);
          if (!char) return NextResponse.json({ ok: false, error: 'Character not found.' }, { status: 404 });

          // variation = filename string to lock, null to unlock
          (char as any).approvedVariation = (body as any).variation ?? null;
          await saveCharacters(paths.charactersJsonPath, characters);
          return NextResponse.json({ ok: true, characters });
      }

      if (body.action === 'delete-character') {
          const { characterId } = body as any;
          console.log('[open-browser] PUT delete-character', { projectName, characterId });

          if (!projectName || !characterId) {
              return NextResponse.json({ ok: false, error: 'Missing projectName or characterId.' }, { status: 400 });
          }

          const paths = getProjectPaths(projectName);
          const characters = await readCharacters(paths.charactersJsonPath);
          const char = characters.find(c => c.id === characterId);
          if (!char) return NextResponse.json({ ok: false, error: 'Character not found.' }, { status: 404 });

          const existingImages: string[] = (char as any).imagePaths || [];
          for (const img of existingImages) {
              const imgPath = path.join(paths.projectPath, 'characters', img);
              await fs.unlink(imgPath).catch(() => {});
          }

          const updatedCharacters = characters.filter(c => c.id !== characterId);
          await saveCharacters(paths.charactersJsonPath, updatedCharacters);
          return NextResponse.json({ ok: true, characters: updatedCharacters });
      }

      if (body.action === 'delete-character-image') {
          const { characterId, imageFilename } = body as any;
          console.log('[open-browser] PUT delete-character-image', { projectName, characterId, imageFilename });

          if (!projectName || !characterId || !imageFilename) {
              return NextResponse.json({ ok: false, error: 'Missing projectName, characterId, or imageFilename.' }, { status: 400 });
          }

          const paths = getProjectPaths(projectName);
          const characters = await readCharacters(paths.charactersJsonPath);
          const char = characters.find(c => c.id === characterId);
          if (!char) return NextResponse.json({ ok: false, error: 'Character not found.' }, { status: 404 });

          const imgPath = path.join(paths.projectPath, 'characters', imageFilename);
          await fs.unlink(imgPath).catch(() => {});

          const existingImages: string[] = (char as any).imagePaths || [];
          (char as any).imagePaths = existingImages.filter(f => f !== imageFilename);

          if ((char as any).approvedVariation === imageFilename) {
              (char as any).approvedVariation = null;
          }

          if ((char as any).imagePaths.length === 0) {
              char.generated = false;
          }

          await saveCharacters(paths.charactersJsonPath, characters);
          return NextResponse.json({ ok: true, characters });
      }

      if (body.action === 'add-character') {
          const { characterName, characterDescription } = body as any;
          console.log('[open-browser] PUT add-character', { projectName, characterName });

          if (!projectName || !characterName || !characterDescription) {
              return NextResponse.json({ ok: false, error: 'Missing projectName, characterName, or characterDescription.' }, { status: 400 });
          }

          const paths = getProjectPaths(projectName);
          await fs.mkdir(paths.charactersPath, { recursive: true });
          const characters = await readCharacters(paths.charactersJsonPath);

          const id = (characterName as string).toLowerCase().replace(/[^a-z0-9]+/g, '_');
          if (characters.some(c => c.id === id)) {
              return NextResponse.json({ ok: false, error: `Character @${characterName} already exists.` }, { status: 409 });
          }

          const newChar = { id, name: (characterName as string).trim(), description: (characterDescription as string).trim(), generated: false };
          characters.push(newChar);
          await saveCharacters(paths.charactersJsonPath, characters);
          return NextResponse.json({ ok: true, characters });
      }


      if (body.action === 'open-ai-flow') {

          console.log('[open-browser] PUT open AI Flow requested', { projectName, gridIndex: body.gridIndex ?? null });
          
          if (!projectName) {
              return NextResponse.json({ ok: false, error: 'No active project found. Create or open one first.' }, { status: 400 });
          }

          const paths = getProjectPaths(projectName);
          const [approvals, metadata, allCharacters] = await Promise.all([
              readGridApprovals(paths.gridApprovalsPath),
              readProjectMetadata(paths.metadataPath),
              readCharacters(paths.charactersJsonPath),
          ]);
          
          const sortedApprovals = Array.from(approvals).sort((a, b) => a - b);
          
          let gridText = '';
          let loadedGridIndex: number | null = null;
          const requestedGridIndex = typeof body.gridIndex === 'number' && body.gridIndex >= 0 ? body.gridIndex : null;

          if (requestedGridIndex !== null) {
              loadedGridIndex = requestedGridIndex;
              const gridFilePath = path.join(paths.gridsPath, `grid-${loadedGridIndex + 1}-raw.txt`);
              console.log('[open-browser] attempting to read requested grid file', { gridFilePath });
              gridText = await fs.readFile(gridFilePath, 'utf8').catch(() => '');
              console.log('[open-browser] resolved requested grid', { index: loadedGridIndex, length: gridText.length });
          } else if (sortedApprovals.length > 0) {
              loadedGridIndex = sortedApprovals[0];
              const gridFilePath = path.join(paths.gridsPath, `grid-${loadedGridIndex + 1}-raw.txt`);
              console.log('[open-browser] attempting to read first approved grid file', { gridFilePath });
              gridText = await fs.readFile(gridFilePath, 'utf8').catch(() => '');
              console.log('[open-browser] resolved first approved grid', { index: loadedGridIndex, length: gridText.length });
          } else {
              console.log('[open-browser] no approved grids found to load');
          }

          console.log('[open-browser] openAIFlow', { projectName, savedUrl: metadata.aiFlowUrl });
          const { page, projectState } = await openAIFlow(projectName, metadata.aiFlowUrl);
          
          const currentUrl = page.url();
          if (currentUrl !== metadata.aiFlowUrl) {
              await saveProjectMetadata(paths.metadataPath, { ...metadata, aiFlowUrl: currentUrl });
              console.log('[open-browser] updated AI Flow URL in metadata', currentUrl);
          }

          let generationTriggered = false;
          let generationFailed = false;
          let failureReason = '';
          let failureArtifacts = null as null | { screenshotPath: string; logPath: string };

          // Submit the prompt if available
          if (gridText && loadedGridIndex !== null) {
              let previousFlowTitle = null;
              if (loadedGridIndex > 0) {
                 previousFlowTitle = (metadata as any).flowTitles?.[loadedGridIndex - 1] || null;
              }

              // Find characters referenced in this grid's text
              const characterMap: Record<string, string> = {};
              allCharacters.forEach(c => {
                  if (c.generated && gridText.includes(`@${c.name}`)) {
                      const finalName = (c as any).approvedVariation 
                          ? (c as any).approvedVariation.replace(/\.png$/i, '') 
                          : c.name;
                      characterMap[c.name] = finalName;
                  }
              });

              console.log('[open-browser] injecting character references', { characterMap });
              
              const promptLoaded = await fillAIFlowPrompt(page, gridText, previousFlowTitle, characterMap);
              generationTriggered = promptLoaded ? await submitAIFlowPrompt(page) : false;
              console.log('[open-browser] generation started for grid', { loadedGridIndex: loadedGridIndex + 1, generationTriggered, previousFlowTitle, characterMap });
          }

          return NextResponse.json({
              ok: true,
              projectState,
              loadedGridIndex: loadedGridIndex !== null ? loadedGridIndex + 1 : null,
              generationTriggered,
              generationStarted: generationTriggered,
          });
      }


      if (body.action === 'save-shot-assignments') {
        const { assignments, projectName: pName } = body as any;
        const tgt = pName || activeProjectName;
        if (!tgt) return NextResponse.json({ ok: false, error: 'No active project' }, { status: 400 });
        const p = getProjectPaths(tgt);
        const meta2 = await readProjectMetadata(p.metadataPath);
        await saveProjectMetadata(p.metadataPath, { ...meta2, shotAssignments: assignments } as any);
        console.log('[open-browser] PUT save-shot-assignments saved', { tgt });
        return NextResponse.json({ ok: true });
      }

      if (body.action === 'extract-shot') {
        const { gridIndex, filename, projectName, minDelay, maxDelay, shotAssignments } = body as any;
        const targetProject = projectName || activeProjectName;
        console.log('[open-browser] PUT extract-shot requested', gridIndex, filename, targetProject, { minDelay, maxDelay, assignments: shotAssignments?.length });
        if (typeof gridIndex !== 'number' || !filename || !targetProject) {
           return NextResponse.json({ ok: false, error: 'Missing parameters for Grok extraction' }, { status: 400 });
        }
        
        const paths = getProjectPaths(targetProject);
        const imagePath = path.join(paths.gridsPath, filename);
        const extractedPath = path.join(paths.projectPath, 'extracted');

        // Convert seconds -> ms, default 10s–20s
        const minDelayMs = typeof minDelay === 'number' ? minDelay * 1000 : 10000;
        const maxDelayMs = typeof maxDelay === 'number' ? maxDelay * 1000 : 20000;

        // Build per-shot image path assignments if provided
        const resolvedAssignments: { shotIndex: number; imagePath: string }[] | undefined =
          Array.isArray(shotAssignments)
            ? shotAssignments.map((a: { shotIndex: number; filename: string }) => ({
                shotIndex: a.shotIndex,
                imagePath: path.join(paths.gridsPath, a.filename),
              }))
            : undefined;
        
        const result = await extractShotInGrok(
          targetProject, 
          gridIndex, 
          imagePath, 
          extractedPath,
          async (shotId, url) => {
            const metadata = await readProjectMetadata(paths.metadataPath);
            const updatedMetadata = {
              ...metadata,
              shotSources: { ...((metadata as any).shotSources || {}), [shotId]: url }
            };
            await saveProjectMetadata(paths.metadataPath, updatedMetadata as any);
            console.log(`[open-browser] incrementally saved URL for shot ${shotId}`);
          },
          minDelayMs,
          maxDelayMs,
          resolvedAssignments
        );
        
        console.log('[open-browser] PUT extract-shot success:', result);
        return NextResponse.json({ success: true, paths: result.paths });
      }

      if (body.action === 'edit-shot') {
        const { sourceUrl, tweakPrompt, targetFilename, projectName } = body;
        const targetProject = projectName || activeProjectName;
        console.log('[open-browser] PUT edit-shot requested', { sourceUrl, tweakPrompt, targetFilename, targetProject });

        if (!sourceUrl || !tweakPrompt || !targetFilename || !targetProject) {
          return NextResponse.json({ ok: false, error: 'Missing parameters for edit-shot' }, { status: 400 });
        }

        const paths = getProjectPaths(targetProject);
        const extractedPath = path.join(paths.projectPath, 'extracted');
        const targetPath = path.join(extractedPath, targetFilename);

        const result = await editShotInGrok(sourceUrl, tweakPrompt, targetPath);

        // Update metadata with the new conversation URL
        const metadata = await readProjectMetadata(paths.metadataPath);
        const shotId = targetFilename.split('.')[0];
        const updatedMetadata = {
          ...metadata,
          shotSources: { ...((metadata as any).shotSources || {}), [shotId]: result.newUrl || sourceUrl }
        };
        await saveProjectMetadata(paths.metadataPath, updatedMetadata as any);

        console.log('[open-browser] PUT edit-shot success');
        return NextResponse.json({ ok: true, path: result.path });
      }

      if (body.action === 'redownload-shot') {
        const { sourceUrl, targetFilename, projectName } = body;
        const targetProject = projectName || activeProjectName;
        console.log('[open-browser] PUT redownload-shot requested', { sourceUrl, targetFilename, targetProject });

        if (!sourceUrl || !targetFilename || !targetProject) {
          return NextResponse.json({ ok: false, error: 'Missing parameters for redownload-shot' }, { status: 400 });
        }

        const paths = getProjectPaths(targetProject);
        const extractedPath = path.join(paths.projectPath, 'extracted');
        const targetPath = path.join(extractedPath, targetFilename);

        const result = await downloadShotFromGrok(sourceUrl, targetPath);

        console.log('[open-browser] PUT redownload-shot success');
        return NextResponse.json({ ok: true, path: result.path });
      }

      if (body.action === 'generate-video-shot') {
        const { shotId, compositePrompt, projectName } = body as { shotId: string; compositePrompt: string; projectName?: string };
        const targetProject = projectName || activeProjectName;
        console.log('[open-browser] PUT generate-video-shot requested', { shotId, targetProject });

        if (!shotId || !compositePrompt || !targetProject) {
          return NextResponse.json({ ok: false, error: 'Missing parameters for generate-video-shot' }, { status: 400 });
        }

        const paths = getProjectPaths(targetProject);
        const shotImagePath = path.join(paths.projectPath, 'extracted', `${shotId}.png`);
        const videoOutputPath = path.join(paths.videosPath, `${shotId}.mp4`);

        await fs.mkdir(paths.videosPath, { recursive: true });

        const result = await generateVideoInGrok(shotImagePath, videoOutputPath, compositePrompt);

        // Update metadata with Grok video URL and the prompt used
        const metadata = await readProjectMetadata(paths.metadataPath);
        const updatedMetadata = {
          ...metadata,
          videoSources: { ...((metadata as any).videoSources || {}), [shotId]: result.grokUrl },
          // videoOriginalSources: set ONCE on first generation, never overwritten by edits
          videoOriginalSources: {
            ...((metadata as any).videoOriginalSources || {}),
            // Only store if this shotId has no original yet
            ...( !(metadata as any).videoOriginalSources?.[shotId] ? { [shotId]: result.grokUrl } : {} ),
          },
          videoPrompts: { ...((metadata as any).videoPrompts || {}), [shotId]: compositePrompt },
        };
        await saveProjectMetadata(paths.metadataPath, updatedMetadata as any);

        console.log('[open-browser] PUT generate-video-shot success');
        return NextResponse.json({ ok: true, path: result.path });
      }

      if (body.action === 'edit-video-shot') {
        const { shotId, modificationPrompt, sourceUrl, projectName } = body as { shotId: string; modificationPrompt: string; sourceUrl: string; projectName?: string };
        const targetProject = projectName || activeProjectName;
        console.log('[open-browser] PUT edit-video-shot requested', { shotId, targetProject });

        if (!shotId || !modificationPrompt || !sourceUrl || !targetProject) {
          return NextResponse.json({ ok: false, error: 'Missing parameters for edit-video-shot' }, { status: 400 });
        }

        const paths = getProjectPaths(targetProject);
        const videoOutputPath = path.join(paths.videosPath, `${shotId}.mp4`);

        await fs.mkdir(paths.videosPath, { recursive: true });

        const result = await editVideoInGrok(sourceUrl, videoOutputPath, modificationPrompt);

        // Save new URL and prompt for this shot
        const metadata = await readProjectMetadata(paths.metadataPath);
        const updatedMetadata = {
          ...metadata,
          videoSources: { ...((metadata as any).videoSources || {}), [shotId]: result.grokUrl },
          videoPrompts: { ...((metadata as any).videoPrompts || {}), [shotId]: modificationPrompt },
        };
        await saveProjectMetadata(paths.metadataPath, updatedMetadata as any);

        console.log('[open-browser] PUT edit-video-shot success');
        return NextResponse.json({ ok: true, path: result.path, grokUrl: result.grokUrl });
      }

      if (body.action === 'upscale-video') {
        const { shotId, projectName } = body as { shotId: string; projectName?: string };
        const targetProject = projectName || activeProjectName;
        console.log('[open-browser] PUT upscale-video requested', { shotId, targetProject });

        if (!shotId || !targetProject) {
          return NextResponse.json({ ok: false, error: 'Missing shotId or projectName.' }, { status: 400 });
        }

        const paths = getProjectPaths(targetProject);
        const metadata = await readProjectMetadata(paths.metadataPath);
        const sourceUrl = (metadata as any).videoSources?.[shotId];

        if (!sourceUrl) {
          return NextResponse.json({ ok: false, error: `No saved Grok URL found for shot ${shotId}. Generate the video first.` }, { status: 400 });
        }

        const videoOutputPath = path.join(paths.videosPath, `${shotId}.mp4`);
        await fs.mkdir(paths.videosPath, { recursive: true });

        const result = await upscaleVideoInGrok(sourceUrl, videoOutputPath);

        // Update videoSources with new URL (upscale creates a new post)
        const updatedMetadata = {
          ...metadata,
          videoSources: { ...((metadata as any).videoSources || {}), [shotId]: result.grokUrl },
        };
        await saveProjectMetadata(paths.metadataPath, updatedMetadata as any);

        console.log('[open-browser] PUT upscale-video success', { shotId, path: result.path });
        return NextResponse.json({ ok: true, path: result.path, grokUrl: result.grokUrl });
      }

    console.log('[open-browser] PUT open ChatGPT requested');
    const selectedGptUrl = await readSelectedGptUrl();
    await openChatGPT(selectedGptUrl);
    console.log('[open-browser] PUT open ChatGPT success', { selectedGptUrl });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[open-browser] PUT request failed', error);
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { projectName?: string; action?: string; filename?: string };

    if (body.action === 'reset-profile') {
      console.log('[open-browser] DELETE reset profile requested');
      await resetBrowserProfile();
      console.log('[open-browser] DELETE reset profile success');
      return NextResponse.json({ ok: true });
    }

    const projectName = sanitizeProjectName(body.projectName ?? '');
    if (!projectName) {
      return NextResponse.json({ ok: false, error: 'Project name is required.' }, { status: 400 });
    }

    const paths = getProjectPaths(projectName);

    if (body.action === 'delete-grid-image' && body.filename) {
       const filePath = path.join(paths.gridsPath, body.filename);
       console.log('[open-browser] DELETE grid image requested', { filePath });
       await fs.unlink(filePath).catch(() => {});
       return NextResponse.json({ ok: true, filename: body.filename });
    }

    console.log('[open-browser] DELETE project requested', { projectName, projectPath: paths.projectPath });
    await fs.rm(paths.projectPath, { recursive: true, force: true });
    await clearActiveProjectIfMatches(projectName);
    const projectNames = await listProjectNames();
    console.log('[open-browser] DELETE project success', { projectName, projectPath: paths.projectPath });
    return NextResponse.json({ ok: true, projectName, projectPath: paths.projectPath, projects: projectNames });
  } catch (error) {
    console.error('[open-browser] DELETE request failed', error);
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const paths = requireActiveProject();
    const body = (await request.json()) as { scriptText?: string; gridIndex?: number; gridText?: string; approveGridIndex?: number; approved?: boolean };
    if (typeof body.gridIndex === 'number' && typeof body.gridText === 'string') {
      const filePath = path.join(paths.gridsPath, `grid-${body.gridIndex + 1}-raw.txt`);
      await fs.writeFile(filePath, body.gridText, 'utf8');
      return NextResponse.json({ ok: true, savedPath: filePath });
    }

    if (typeof body.approveGridIndex === 'number') {
      const approvals = await readGridApprovals(paths.gridApprovalsPath).catch(() => new Set<number>());
      if (body.approved === false) {
        approvals.delete(body.approveGridIndex);
      } else {
        approvals.add(body.approveGridIndex);
      }
      await fs.writeFile(paths.gridApprovalsPath, JSON.stringify({ approvedGridIndexes: Array.from(approvals).sort((a, b) => a - b) }, null, 2), 'utf8');
      return NextResponse.json({ ok: true, savedPath: paths.gridApprovalsPath });
    }

    const { approveImageGridIndex, approvedImageFilename } = body as any;
    if (typeof approveImageGridIndex === 'number') {
      const imgApprovals = await readImageApprovals(paths.imageApprovalsPath);
      const key = String(approveImageGridIndex);
      if (approvedImageFilename === null) {
        delete imgApprovals[key]; // Reject
      } else {
        imgApprovals[key] = approvedImageFilename; // Approve
      }
      await fs.writeFile(paths.imageApprovalsPath, JSON.stringify({ imageApprovals: imgApprovals }, null, 2), 'utf8');
      return NextResponse.json({ ok: true, savedPath: paths.imageApprovalsPath });
    }

    const scriptText = body.scriptText ?? '';
    const isFollowUp = (body as any).isFollowUp === true;

    console.log('[open-browser] PATCH send text requested', {
      length: scriptText.length,
      preview: scriptText.replace(/\s+/g, ' ').trim().slice(0, 120),
      projectName: activeProjectName,
      projectPath: activeProjectPath,
      isFollowUp
    });

    const metadata = await readProjectMetadata(paths.metadataPath);
    let targetGptUrl = metadata.gptConversationUrl;
    if (!targetGptUrl || !isFollowUp) {
       targetGptUrl = await readSelectedGptUrl();
    }

    if (isFollowUp) {
      await fs.appendFile(path.join(paths.projectPath, 'script.txt'), '\n\n---\n\n' + scriptText, 'utf8');
    } else {
      await fs.writeFile(path.join(paths.projectPath, 'script.txt'), scriptText, 'utf8');
    }

    console.log('[open-browser] PATCH using GPT URL', targetGptUrl);
    const { response, conversationUrl } = await sendTextToChatGPT(scriptText, targetGptUrl);
    
    // Save the new conversation URL into metadata for future use
    await saveProjectMetadata(paths.metadataPath, { ...metadata, gptConversationUrl: conversationUrl } as any);

    let fullRawOutput = response;
    if (isFollowUp) {
      const existingRaw = await fs.readFile(paths.rawOutputPath, 'utf8').catch(() => '');
      fullRawOutput = existingRaw + '\n\n' + response;
      await fs.writeFile(paths.rawOutputPath, fullRawOutput, 'utf8');
    } else {
      await fs.writeFile(paths.rawOutputPath, response, 'utf8');
    }

    // Save ALL parsed grids so follow-ups generate new grid txt files
    const parsedBlocks = parseGridSections(fullRawOutput);
    if (parsedBlocks.length > 0) {
       await saveGridFiles(parsedBlocks, paths.gridsPath);
    }

    // Parse and save character definitions from the combined output
    const characters = parseCharacterBlock(fullRawOutput);
    if (characters.length > 0) {
      await saveCharacters(paths.charactersJsonPath, characters);
      console.log('[open-browser] PATCH saved characters', { count: characters.length, names: characters.map(c => c.name) });
    }

    console.log('[open-browser] PATCH send text success', {
      length: response.length,
      preview: response.replace(/\s+/g, ' ').trim().slice(0, 200),
      savedTo: paths.rawOutputPath,
    });
    return NextResponse.json({ ok: true, response, fullRawOutput, savedPath: path.join(paths.projectPath, 'script.txt'), characters });
  } catch (error) {
    console.error('[open-browser] PATCH send text failed', error);
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}
