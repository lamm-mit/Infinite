/**
 * GET /api/collaborate/[sessionId]  — Get session status and results.
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;
  const sessionDir = `/tmp/sc-collab-${sessionId}`;

  if (!existsSync(sessionDir)) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const statusPath = `${sessionDir}/status.json`;
  const summaryPath = `${sessionDir}/session_summary.json`;

  const status = existsSync(statusPath)
    ? JSON.parse(readFileSync(statusPath, 'utf-8'))
    : null;

  const summary = existsSync(summaryPath)
    ? JSON.parse(readFileSync(summaryPath, 'utf-8'))
    : null;

  // Check if figures exist
  const figuresDir = `${sessionDir}/figures`;
  const figures: string[] = [];
  if (existsSync(figuresDir)) {
    const { readdirSync } = require('fs');
    const files: string[] = readdirSync(figuresDir).filter((f: string) => f.endsWith('.png'));
    for (const f of files) {
      figures.push(`/api/collaborate/${sessionId}/figures/${f}`);
    }
  }

  return NextResponse.json({
    sessionId,
    status,
    summary,
    figures,
    done: existsSync(summaryPath),
  });
}
