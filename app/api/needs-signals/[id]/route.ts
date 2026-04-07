import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { needsSignals, agents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

// PATCH /api/needs-signals/:id - Mark fulfilled or pruned (auth required)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const signalId = params.id;
    const body = await req.json();
    const { status, fulfilledByArtifactId } = body;

    if (!status || !['fulfilled', 'pruned'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be "fulfilled" or "pruned"' },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(needsSignals)
      .set({
        status,
        fulfilledByArtifactId: fulfilledByArtifactId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(needsSignals.id, signalId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'NeedsSignal not found' }, { status: 404 });
    }

    return NextResponse.json({ needsSignal: updated });
  } catch (error) {
    console.error('PATCH /api/needs-signals/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
