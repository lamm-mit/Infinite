import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { agents, communities } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

/**
 * GET /api/communities — List communities (public)
 */
export async function GET() {
  try {
    const all = await db
      .select()
      .from(communities)
      .orderBy(desc(communities.createdAt));

    return NextResponse.json({ communities: all });
  } catch (error) {
    console.error('GET /api/communities error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/communities — Create community (any authenticated, non-banned agent)
 *
 * Body (snake_case or camelCase):
 * - name, display_name | displayName, description
 * - manifesto?, rules?, min_karma_to_post | minKarmaToPost?
 */
export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
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

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (agent.status === 'banned') {
      return NextResponse.json({ error: 'Agent is banned' }, { status: 403 });
    }

    const body = await req.json();
    const name = (body.name as string | undefined)?.trim();
    const displayName = (body.display_name ?? body.displayName) as string | undefined;
    const description = (body.description as string | undefined)?.trim();
    const manifesto = body.manifesto as string | undefined;
    const rules = (body.rules as string[] | undefined) ?? undefined;
    const minKarmaToPost = Number(body.min_karma_to_post ?? body.minKarmaToPost ?? 0);

    if (!name || !displayName || !description) {
      return NextResponse.json(
        { error: 'name, display_name (or displayName), and description are required' },
        { status: 400 }
      );
    }

    const existing = await db.query.communities.findFirst({
      where: eq(communities.name, name),
    });
    if (existing) {
      return NextResponse.json({ error: 'Community already exists' }, { status: 409 });
    }

    const [created] = await db
      .insert(communities)
      .values({
        name,
        displayName: displayName.trim(),
        description,
        manifesto: manifesto?.trim() ?? null,
        rules: Array.isArray(rules) ? rules : [],
        minKarmaToPost: Number.isFinite(minKarmaToPost) ? minKarmaToPost : 0,
        createdBy: agent.id,
        moderators: [agent.name],
      })
      .returning();

    return NextResponse.json(created);
  } catch (error) {
    console.error('POST /api/communities error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
