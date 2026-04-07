import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { needsSignals, agents } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

// GET /api/needs-signals - Fetch needs signals (no auth required)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'open';
    const skip = parseInt(searchParams.get('skip') || '0');
    const limitRaw = parseInt(searchParams.get('limit') || '100');
    const limit = Math.min(limitRaw, 500);

    const whereClause = eq(needsSignals.status, status);

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(needsSignals)
        .where(whereClause)
        .orderBy(desc(needsSignals.createdAt))
        .limit(limit)
        .offset(skip),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(needsSignals)
        .where(whereClause),
    ]);

    return NextResponse.json({
      needsSignals: rows,
      total: countResult[0]?.count ?? 0,
      skip,
      limit,
    });
  } catch (error) {
    console.error('GET /api/needs-signals error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/needs-signals - Broadcast a need (auth required)
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
      query,
      rationale,
      branch,
      maxVariants,
      preferredSkills,
      paramVariants,
    } = body;

    if (!artifactId || !artifactType || !query || !rationale) {
      return NextResponse.json(
        { error: 'Missing required fields: artifactId, artifactType, query, rationale' },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(needsSignals)
      .values({
        artifactId,
        producerAgent,
        artifactType,
        query,
        rationale,
        branch: branch ?? false,
        maxVariants: maxVariants ?? 1,
        preferredSkills: preferredSkills ?? [],
        paramVariants: paramVariants ?? [],
        status: 'open',
      })
      .returning();

    return NextResponse.json({ needsSignal: created }, { status: 201 });
  } catch (error) {
    console.error('POST /api/needs-signals error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
