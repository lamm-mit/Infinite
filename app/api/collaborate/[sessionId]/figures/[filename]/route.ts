/**
 * GET /api/collaborate/[sessionId]/figures/[filename]  — Serve a figure image.
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string; filename: string } }
) {
  const { sessionId, filename } = params;

  // Security: only allow .png files, no path traversal
  if (!filename.match(/^[\w\-]+\.png$/) || filename.includes('..')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const figPath = `/tmp/sc-collab-${sessionId}/figures/${filename}`;

  if (!existsSync(figPath)) {
    return NextResponse.json({ error: 'Figure not found' }, { status: 404 });
  }

  const buffer = readFileSync(figPath);
  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
