/**
 * GET /api/collaborate/stream?topic=...&mode=broad|drug_discovery|structure|literature
 *
 * Server-Sent Events stream for live multi-agent collaboration.
 *
 * Priority:
 *   1. If SCIENCECLAW_SERVER is set (or localhost:8765 responds), proxy to the
 *      Python collab_server.py — which uses the full 200+-skill registry,
 *      LLMTopicAnalyzer, DependencyGraph, and SkillExecutor.
 *   2. Otherwise fall back to the Vercel-native TypeScript implementation.
 */

import { NextRequest } from 'next/server';
import {
  AGENT_DOMAINS,
  COLLAB_MODES,
  CollabMode,
  getDomainsForMode,
  runAgent,
  CollabEvent,
} from '@/lib/collaborate/agents';

export const maxDuration = 120;

const PYTHON_SERVER = process.env.SCIENCECLAW_SERVER ?? 'http://127.0.0.1:8765';

async function tryPythonProxy(req: NextRequest): Promise<Response | null> {
  try {
    const { searchParams } = new URL(req.url);
    const upstreamUrl = `${PYTHON_SERVER}/stream?${searchParams.toString()}`;
    const upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(3000), // 3s to connect
      headers: { Accept: 'text/event-stream' },
    });
    if (!upstream.ok || !upstream.body) return null;
    // Proxy the stream directly
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'X-Backend': 'scienceclaw-python',
      },
    });
  } catch {
    return null; // Python server not running; fall through to TypeScript
  }
}

export async function GET(req: NextRequest) {
  // ── Try Python backend first ────────────────────────────────────────────────
  const proxy = await tryPythonProxy(req);
  if (proxy) return proxy;

  // ── TypeScript fallback ─────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const topic = searchParams.get('topic') ?? 'protein folding';
  const modeParam = (searchParams.get('mode') ?? 'broad') as CollabMode;

  // Validate mode; fall back to broad
  const mode: CollabMode = modeParam in COLLAB_MODES ? modeParam : 'broad';

  // Legacy agents= param still supported for backward compat
  const nAgentsParam = Number(searchParams.get('agents') ?? '0');

  let domains: typeof AGENT_DOMAINS;
  if (nAgentsParam > 0) {
    domains = AGENT_DOMAINS.slice(0, Math.max(1, Math.min(5, nAgentsParam)));
  } else {
    domains = getDomainsForMode(mode);
  }

  const agentNames = domains.map(d => `Agent${d.suffix}`);
  const sessionId = `live-${Date.now()}`;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: CollabEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected
        }
      };

      const ts = () => new Date().toISOString();

      send({
        type: 'AgentStatus',
        agent: 'orchestrator',
        payload: {
          status: 'session_start',
          detail: topic,
          session_id: sessionId,
          agents: agentNames,
          n_agents: agentNames.length,
          mode,
          mode_label: COLLAB_MODES[mode].label,
        },
        timestamp: ts(),
      });

      const peerFindings: { agent: string; text: string }[] = [];

      const agentTasks = domains.map(async (domain) => {
        const result = await runAgent(domain, topic, send, peerFindings);
        peerFindings.push({ agent: result.agent, text: result.finding });
        return result;
      });

      await Promise.all(agentTasks);

      send({
        type: 'SessionDone',
        agent: 'orchestrator',
        payload: {
          session_id: sessionId,
          topic,
          agents: agentNames,
          n_findings: peerFindings.length,
          mode,
        },
        timestamp: ts(),
      });

      try { controller.close(); } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
