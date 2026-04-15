export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const projectsRoot = path.join(process.cwd(), 'projects');

function getCharactersJsonPath(projectName: string) {
  return path.join(projectsRoot, projectName, 'characters', 'characters.json');
}

async function readCharacters(jsonPath: string): Promise<any[]> {
  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveCharacters(jsonPath: string, characters: any[]) {
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(characters, null, 2), 'utf8');
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const projectName = (formData.get('projectName') as string ?? '').trim();
    const characterId = (formData.get('characterId') as string ?? '').trim();
    const file = formData.get('file') as File | null;

    if (!projectName || !characterId || !file) {
      return NextResponse.json({ ok: false, error: 'Missing projectName, characterId, or file.' }, { status: 400 });
    }

    // Determine the target directory and file name
    const charactersDir = path.join(projectsRoot, projectName, 'characters');
    await fs.mkdir(charactersDir, { recursive: true });

    // Read the JSON to get character name for the file name
    const jsonPath = getCharactersJsonPath(projectName);
    const characters = await readCharacters(jsonPath);
    const char = characters.find((c: any) => c.id === characterId);
    if (!char) {
      return NextResponse.json({ ok: false, error: 'Character not found.' }, { status: 404 });
    }

    // Build a clean file name: {charId}-uploaded-{n}.{ext}
    const charId = char.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();

    // Find the next available index
    const existing: string[] = (char as any).imagePaths ?? [];
    const uploadedCount = existing.filter((f: string) => f.includes('-uploaded-')).length;
    const fileName = `${charId}-uploaded-${uploadedCount + 1}.${ext}`;
    const destPath = path.join(charactersDir, fileName);

    // Write the file
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(destPath, Buffer.from(arrayBuffer));

    // Update characters.json
    char.generated = true;
    const newSet = new Set([...existing, fileName]);
    (char as any).imagePaths = Array.from(newSet);
    await saveCharacters(jsonPath, characters);

    console.log(`[upload-character] saved ${fileName} for character ${char.name}`);
    return NextResponse.json({ ok: true, fileName, characters });

  } catch (err) {
    console.error('[upload-character] error:', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
