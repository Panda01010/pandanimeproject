export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const projectsRoot = path.join(process.cwd(), 'projects');

const MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const project = searchParams.get('project');
  const folder = searchParams.get('folder');
  const file = searchParams.get('file');

  if (!project || !folder || !file) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  // Prevent path traversal
  const safeProject = path.basename(project);
  const safeFolder = path.basename(folder);
  const safeFile = path.basename(file);

  const filePath = path.join(projectsRoot, safeProject, safeFolder, safeFile);

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(safeFile).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(data.length),
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
