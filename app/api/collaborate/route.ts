/**
 * POST /api/collaborate  — Returns the stream URL for a new session.
 * GET  /api/collaborate  — Lists agent domains available.
 *
 * The actual collaboration runs via GET /api/collaborate/stream?topic=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { AGENT_DOMAINS } from '@/lib/collaborate/agents';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const topic: string = body.topic || 'protein folding mechanisms';
  const nAgents: number = Math.max(1, Math.min(5, Number(body.agents) || 3));
  const sessionId = `live-${Date.now()}`;

  const streamUrl = `/api/collaborate/stream?topic=${encodeURIComponent(topic)}&agents=${nAgents}&sid=${sessionId}`;

  return NextResponse.json({
    sessionId,
    topic,
    nAgents,
    streamUrl,
    agents: AGENT_DOMAINS.slice(0, nAgents).map(d => `Agent${d.suffix}`),
  });
}

export async function GET() {
  return NextResponse.json({
    domains: AGENT_DOMAINS.map(d => ({
      name: `Agent${d.suffix}`,
      domain: d.domain,
      focus: d.focus,
      tools: d.toolPool,
    })),
  });
}
