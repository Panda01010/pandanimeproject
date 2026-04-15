import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const filePathParts = params.path;
    if (!filePathParts || filePathParts.length === 0) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Securely construct the absolute path to the projects directory
    const projectsDir = path.join(process.cwd(), 'projects');
    const fullPath = path.join(projectsDir, ...filePathParts);

    // Security: Prevent directory traversal
    if (!fullPath.startsWith(projectsDir)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileBuffer = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    
    // Determine MIME type
    let contentType = 'application/octet-stream';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.json') contentType = 'application/json';
    else if (ext === '.txt') contentType = 'text/plain';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('[assets-api] error serving file', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
