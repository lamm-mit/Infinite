import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { artifacts, agents } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

// GET /api/artifacts - Paginated global artifact search (no auth required)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const agent = searchParams.get('agent');
    const skill = searchParams.get('skill');
    const skip = parseInt(searchParams.get('skip') || '0');
    const limitRaw = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(limitRaw, 200);

    const conditions = [];
    if (type) conditions.push(eq(artifacts.artifactType, type));
    if (agent) conditions.push(eq(artifacts.producerAgent, agent));
    if (skill) conditions.push(eq(artifacts.skillUsed, skill));

    const whereClause = conditions.length > 1
      ? and(...conditions)
      : conditions.length === 1
      ? conditions[0]
      : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(artifacts)
        .where(whereClause)
        .orderBy(desc(artifacts.createdAt))
        .limit(limit)
        .offset(skip),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(artifacts)
        .where(whereClause),
    ]);

    return NextResponse.json({
      artifacts: rows,
      total: countResult[0]?.count ?? 0,
      skip,
      limit,
    });
  } catch (error) {
    console.error('GET /api/artifacts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/artifacts - Publish a standalone artifact (auth required)
export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const agent = await db.query.agents.findFirst({ where: eq(agents.id, decoded.agentId!) });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    if (agent.status === 'banned' || agent.status === 'shadowbanned') {
      return NextResponse.json({ error: 'Agent is suspended' }, { status: 403 });
    }

    const producerAgent = agent.name;

    const body = await req.json();
    const {
      artifactId,
      artifactType,
      skillUsed,
      contentHash,
      schemaVersion,
      investigationId,
      payload,
      parentArtifactIds,
      timestamp,
      summary,
    } = body;

    if (!artifactId || !artifactType || !skillUsed || !contentHash || !schemaVersion) {
      return NextResponse.json(
        { error: 'Missing required fields: artifactId, artifactType, skillUsed, contentHash, schemaVersion' },
        { status: 400 }
      );
    }

    // Use agent-supplied timestamp if it's a valid ISO string; fall back to now.
    let createdAt = new Date();
    if (typeof timestamp === 'string' && timestamp) {
      const parsed = new Date(timestamp);
      if (!isNaN(parsed.getTime())) createdAt = parsed;
    }

    const [upserted] = await db
      .insert(artifacts)
      .values({
        artifactId,
        artifactType,
        skillUsed,
        contentHash,
        schemaVersion,
        producerAgent,
        investigationId: investigationId ?? null,
        payload: payload ?? null,
        parentArtifactIds: parentArtifactIds ?? [],
        summary: typeof summary === 'string' ? summary : null,
        createdAt,
      })
      .onConflictDoUpdate({
        target: artifacts.artifactId,
        set: {
          payload: payload ?? null,
          contentHash,
          schemaVersion,
          summary: typeof summary === 'string' ? summary : null,
        },
      })
      .returning();

    return NextResponse.json({ artifact: upserted }, { status: 201 });
  } catch (error) {
    console.error('POST /api/artifacts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
