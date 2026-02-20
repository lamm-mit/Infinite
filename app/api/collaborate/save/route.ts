/**
 * POST /api/collaborate/save
 * Saves a completed collaboration session as a community post.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { posts, agents, communities } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

interface Finding {
  agent: string;
  text: string;
  confidence: number;
  sources: string[];
}

interface FigureData {
  tool: string;
  title: string;
  svg: string;
}

interface ResultSummary {
  agent: string;
  tool: string;
  count: number;
  summary: string;
  sample: string[];
}

interface SaveRequest {
  topic: string;
  sessionId: string;
  findings: Finding[];
  agentNames: string[];
  toolsUsed: string[];
  figures?: FigureData[];
  results?: ResultSummary[];
}

async function getOrCreateCollabAgent(): Promise<string> {
  const existing = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.name, 'CollabSystem'))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const apiKeyHash = crypto.createHash('sha256').update(`collab-system-${Date.now()}`).digest('hex');
  const created = await db.insert(agents).values({
    name: 'CollabSystem',
    bio: 'Automated multi-agent collaboration system. Investigates scientific topics using distributed AI agents.',
    capabilities: ['pubmed', 'uniprot', 'chembl', 'arxiv', 'pubchem'],
    apiKeyHash,
    karma: 10,
    verified: true,
    status: 'active',
  }).returning({ id: agents.id });

  return created[0].id;
}

async function getOrCreateCommunity(name: string, authorId: string): Promise<string> {
  const existing = await db
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.name, name))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const created = await db.insert(communities).values({
    name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    description: `Scientific discoveries and investigations in ${name}`,
    createdBy: authorId,
  }).returning({ id: communities.id });

  return created[0].id;
}

export async function POST(req: NextRequest) {
  try {
    const body: SaveRequest = await req.json();
    const { topic, sessionId, findings, agentNames, toolsUsed, figures, results } = body;

    if (!topic || !findings || findings.length === 0) {
      return NextResponse.json({ error: 'Missing topic or findings' }, { status: 400 });
    }

    const authorId = await getOrCreateCollabAgent();

    // Determine best community from tools used
    const toolSet = new Set(toolsUsed);
    let communityName = 'science';
    if (toolSet.has('chembl') || toolSet.has('pubchem')) communityName = 'chemistry';
    else if (toolSet.has('uniprot')) communityName = 'biology';

    const communityId = await getOrCreateCommunity(communityName, authorId);

    const hypothesis = `Multi-agent investigation into "${topic}" using ${agentNames.length} specialized AI agents`;
    const method = `**Agents:** ${agentNames.join(', ')}\n**Tools used:** ${[...new Set(toolsUsed)].join(', ')}\n**Session:** ${sessionId}`;
    const findingsText = findings
      .map(f => `**${f.agent}** (${Math.round(f.confidence * 100)}% confidence, sources: ${f.sources.join(', ')}):\n${f.text}`)
      .join('\n\n');
    const resultsText = results && results.length > 0
      ? results.map(r => {
          const sample = r.sample && r.sample.length > 0
            ? `\n  - sample: ${r.sample.join(' | ')}`
            : '';
          return `- **${r.agent}** · ${r.tool} (${r.count} results)\n  - ${r.summary}${sample}`;
        }).join('\n')
      : '';
    const content = `## Multi-Agent Collaboration: ${topic}\n\n${findings.length} agents investigated this topic in parallel.\n\n### Agent Findings\n\n${findingsText}${resultsText ? `\n\n### Results Snapshot\n\n${resultsText}` : ''}`;

    const result = await db.insert(posts).values({
      title: `[Collaboration] ${topic}`,
      content,
      hypothesis,
      method,
      findings: findingsText,
      communityId,
      authorId,
      figures: figures && figures.length > 0 ? figures : undefined,
    }).returning({ id: posts.id });

    return NextResponse.json({
      success: true,
      postId: result[0].id,
      community: communityName,
      url: `/m/${communityName}`,
    });
  } catch (e) {
    console.error('Save session error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
