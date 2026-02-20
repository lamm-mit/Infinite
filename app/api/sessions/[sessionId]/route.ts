import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

interface SessionFile {
  id: string;
  topic: string;
  description?: string;
  participants: string[];
  findings: Array<{ id: string; agent: string; result: any; validations?: any[] }>;
  tasks?: Array<any>;
  createdAt: string;
  updatedAt?: string;
  status?: 'active' | 'complete' | 'abandoned';
  roles?: Record<string, { role: string; agent: string }>;
}

interface ResultSummary {
  agent: string;
  tool: string;
  count: number;
  summary: string;
  sample: string[];
  source: 'task' | 'finding';
}

function stringifySample(item: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(item).slice(0, 4)) {
    const val = typeof v === 'string' ? v : JSON.stringify(v);
    parts.push(`${k}=${val}`.slice(0, 64));
  }
  return parts.join(', ');
}

function buildResults(session: SessionFile): ResultSummary[] {
  const results: ResultSummary[] = [];
  const seen = new Set<string>();

  const add = (r: ResultSummary) => {
    const key = `${r.agent}|${r.tool}|${r.summary}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(r);
  };

  // From task results (preferred when available)
  for (const task of session.tasks || []) {
    const taskResults = task?.results;
    const toolResults = taskResults?.tool_results;
    if (!toolResults || typeof toolResults !== 'object') continue;

    const agent = String(taskResults?.agent || task?.agent || 'unknown');
    for (const [tool, tr] of Object.entries(toolResults)) {
      if (!tr || typeof tr !== 'object') continue;
      const t = tr as Record<string, unknown>;
      const listCandidates = (t.results as unknown[]) || (t.findings as unknown[]) || [];
      const count =
        Number(t.count ?? t.total ?? t.hits ?? 0) ||
        (Array.isArray(listCandidates) ? listCandidates.length : 0);
      const summary =
        String(t.analysis || t.summary || t.message || `Tool result for ${tool}`);
      const sample =
        Array.isArray(listCandidates)
          ? listCandidates.slice(0, 2).map((item) =>
              typeof item === 'string' ? item : stringifySample(item as Record<string, unknown>)
            )
          : [];

      add({
        agent,
        tool,
        count,
        summary,
        sample,
        source: 'task',
      });
    }
  }

  // From findings evidence
  for (const finding of session.findings || []) {
    const evidence = (finding as any).evidence;
    const toolOutputs = evidence?.tool_outputs;
    if (!toolOutputs || typeof toolOutputs !== 'object') continue;
    const agent = String((finding as any).agent || 'unknown');

    for (const [tool, output] of Object.entries(toolOutputs)) {
      if (!output || typeof output !== 'object') continue;
      const out = output as Record<string, unknown>;
      const listCandidates = (out.papers as unknown[]) || (out.results as unknown[]) || [];
      const count =
        Number(out.count ?? out.total ?? out.hits ?? 0) ||
        (Array.isArray(listCandidates) ? listCandidates.length : 0);
      const summary =
        String(out.summary || out.message || out.analysis || `Evidence from ${tool}`);
      const sample =
        Array.isArray(listCandidates)
          ? listCandidates.slice(0, 2).map((item) =>
              typeof item === 'string' ? item : stringifySample(item as Record<string, unknown>)
            )
          : [];

      add({
        agent,
        tool,
        count,
        summary,
        sample,
        source: 'finding',
      });
    }
  }

  return results;
}

// GET /api/sessions/[sessionId] - Get session details
export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;

    // Validate session ID format for security
    if (!/^scienceclaw-collab-[a-f0-9]{8}$/.test(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid session ID format' },
        { status: 400 }
      );
    }

    const sessionFile = join(
      homedir(),
      '.infinite',
      'workspace',
      'sessions',
      `${sessionId}.json`
    );

    try {
      const content = await readFile(sessionFile, 'utf-8');
      const session = JSON.parse(content) as SessionFile;

      // Calculate consensus rates for each finding
      const findingsWithConsensus = session.findings?.map((finding) => {
        const validationCount = finding.validations?.length || 0;
        const consensusRate =
          validationCount > 0
            ? finding.validations!.filter((v: any) => v.status === 'confirmed').length /
              validationCount
            : 0;

        return {
          ...finding,
          validationCount,
          consensusRate,
        };
      }) || [];

      // Calculate overall consensus
      const totalValidations = findingsWithConsensus.reduce(
        (sum, f) => sum + (f.validationCount || 0),
        0
      );
      const confirmedValidations = findingsWithConsensus.reduce((sum, f) => {
        const confirmed = f.validations?.filter((v: any) => v.status === 'confirmed').length || 0;
        return sum + confirmed;
      }, 0);

      const overallConsensus =
        totalValidations > 0 ? confirmedValidations / totalValidations : 0;

      const results = buildResults(session);

      return NextResponse.json({
        id: session.id,
        topic: session.topic,
        description: session.description,
        status: session.status || 'active',
        createdAt: session.createdAt,
        updatedAt: session.updatedAt || session.createdAt,
        participants: session.participants,
        roles: session.roles || {},
        findings: findingsWithConsensus,
        results,
        stats: {
          participantCount: session.participants.length,
          findingsCount: findingsWithConsensus.length,
          totalValidations,
          confirmedValidations,
          overallConsensusRate: overallConsensus,
        },
      });
    } catch (err) {
      if ((err as any).code === 'ENOENT') {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('Get session detail error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
