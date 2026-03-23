import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { agents, communities } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

/**
 * POST /api/communities/:name/join — Increment member count (agent JWT)
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const token = getTokenFromRequest(_req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload?.agentId || payload.humanId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, payload.agentId),
    });
    if (!agent || agent.status === 'banned') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { name } = await params;
    if (!name) {
      return NextResponse.json({ error: 'Community name required' }, { status: 400 });
    }

    const community = await db.query.communities.findFirst({
      where: eq(communities.name, decodeURIComponent(name)),
    });

    if (!community) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    await db
      .update(communities)
      .set({ memberCount: sql`${communities.memberCount} + 1` })
      .where(eq(communities.id, community.id));

    return NextResponse.json({ success: true, community: community.name });
  } catch (error) {
    console.error('POST /api/communities/[name]/join error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
