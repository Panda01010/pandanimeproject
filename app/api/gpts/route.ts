export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const gptsFilePath = path.join(process.cwd(), 'gpts.json');
const selectedGptFilePath = path.join(process.cwd(), 'selected-gpt.txt');

interface SavedGpt {
  id: string;
  name: string;
  url: string;
}

const DEFAULT_GPT: SavedGpt = {
  id: 'default',
  name: 'Anime Script Generator (Default)',
  url: 'https://chatgpt.com/g/g-69cae55e4efc8191926d2ca7dfe6ee6c-script-anime-photo-generator',
};

async function readGpts(): Promise<SavedGpt[]> {
  try {
    const raw = await fs.readFile(gptsFilePath, 'utf8');
    const parsed = JSON.parse(raw) as SavedGpt[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [DEFAULT_GPT];
    return parsed;
  } catch {
    return [DEFAULT_GPT];
  }
}

async function writeGpts(gpts: SavedGpt[]) {
  await fs.writeFile(gptsFilePath, JSON.stringify(gpts, null, 2), 'utf8');
}

async function readSelectedId(): Promise<string> {
  try {
    return (await fs.readFile(selectedGptFilePath, 'utf8')).trim();
  } catch {
    return 'default';
  }
}

async function writeSelectedId(id: string) {
  await fs.writeFile(selectedGptFilePath, id, 'utf8');
}

// GET — return all GPTs + selected ID
export async function GET() {
  const gpts = await readGpts();
  const selectedId = await readSelectedId();
  const selected = gpts.find(g => g.id === selectedId) ?? gpts[0];
  return NextResponse.json({ gpts, selectedId: selected.id, selectedUrl: selected.url });
}

// POST — add a new GPT { name, url }
export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; url?: string };
    const name = (body.name ?? '').trim();
    const url = (body.url ?? '').trim();

    if (!name || !url) {
      return NextResponse.json({ ok: false, error: 'Name and URL are required.' }, { status: 400 });
    }

    if (!url.startsWith('https://chatgpt.com/')) {
      return NextResponse.json({ ok: false, error: 'URL must start with https://chatgpt.com/' }, { status: 400 });
    }

    const gpts = await readGpts();
    const id = `gpt_${Date.now()}`;
    const newGpt: SavedGpt = { id, name, url };
    gpts.push(newGpt);
    await writeGpts(gpts);
    // Auto-select the newly added GPT
    await writeSelectedId(id);

    return NextResponse.json({ ok: true, gpt: newGpt, selectedId: id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// PATCH — set selected GPT { selectedId }
export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { selectedId?: string };
    const selectedId = (body.selectedId ?? '').trim();
    if (!selectedId) {
      return NextResponse.json({ ok: false, error: 'selectedId is required.' }, { status: 400 });
    }
    const gpts = await readGpts();
    const found = gpts.find(g => g.id === selectedId);
    if (!found) {
      return NextResponse.json({ ok: false, error: 'GPT not found.' }, { status: 404 });
    }
    await writeSelectedId(selectedId);
    return NextResponse.json({ ok: true, selectedId, selectedUrl: found.url });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// DELETE — remove a GPT { id }
export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { id?: string };
    const id = (body.id ?? '').trim();
    if (!id || id === 'default') {
      return NextResponse.json({ ok: false, error: 'Cannot delete the default GPT.' }, { status: 400 });
    }
    let gpts = await readGpts();
    gpts = gpts.filter(g => g.id !== id);
    if (gpts.length === 0) gpts = [DEFAULT_GPT];
    await writeGpts(gpts);

    // If deleted was selected, fall back to first
    const currentSelected = await readSelectedId();
    if (currentSelected === id) {
      await writeSelectedId(gpts[0].id);
    }
    return NextResponse.json({ ok: true, gpts });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
