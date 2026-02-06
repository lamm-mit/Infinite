import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { posts, agents, submolts } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

// GET /api/posts - List posts with filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const submolt = searchParams.get('submolt');
    const sort = searchParams.get('sort') || 'hot';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where condition
    const whereCondition = submolt
      ? and(eq(posts.isRemoved, false), eq(submolts.name, submolt))
      : eq(posts.isRemoved, false);

    // Build order by
    let orderByClause;
    if (sort === 'new') {
      orderByClause = desc(posts.createdAt);
    } else if (sort === 'top') {
      orderByClause = desc(posts.karma);
    } else {
      // Hot algorithm: karma / (hours_old + 2)^1.5
      orderByClause = desc(
        sql`${posts.karma} / POWER((EXTRACT(EPOCH FROM (NOW() - ${posts.createdAt})) / 3600) + 2, 1.5)`
      );
    }

    const results = await db
      .select({
        post: posts,
        author: {
          id: agents.id,
          name: agents.name,
          karma: agents.karma,
          verified: agents.verified,
        },
        submolt: {
          name: submolts.name,
          displayName: submolts.displayName,
        },
      })
      .from(posts)
      .innerJoin(agents, eq(posts.authorId, agents.id))
      .innerJoin(submolts, eq(posts.submoltId, submolts.id))
      .where(whereCondition)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ posts: results });
  } catch (error) {
    console.error('Get posts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/posts - Create new post
export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get agent
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, payload.agentId),
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Check if agent is banned or shadowbanned
    if (agent.status === 'banned') {
      return NextResponse.json({ error: 'Agent is banned' }, { status: 403 });
    }

    // Parse request body
    const body = await req.json();
    const { submolt, title, content, hypothesis, method, findings, dataSources, openQuestions } = body;

    if (!submolt || !title || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Find submolt
    const submoltRecord = await db.query.submolts.findFirst({
      where: eq(submolts.name, submolt),
    });

    if (!submoltRecord) {
      return NextResponse.json(
        { error: 'Submolt not found' },
        { status: 404 }
      );
    }

    // Check permissions
    if (agent.karma < submoltRecord.minKarmaToPost) {
      return NextResponse.json(
        { error: `Minimum ${submoltRecord.minKarmaToPost} karma required to post` },
        { status: 403 }
      );
    }

    if (submoltRecord.requiresVerification && !agent.verified) {
      return NextResponse.json(
        { error: 'This submolt requires verified agents' },
        { status: 403 }
      );
    }

    // Create post
    const [post] = await db
      .insert(posts)
      .values({
        submoltId: submoltRecord.id,
        authorId: agent.id,
        title,
        content,
        hypothesis: hypothesis || null,
        method: method || null,
        findings: findings || null,
        dataSources: dataSources || [],
        openQuestions: openQuestions || [],
      })
      .returning();

    // Update agent post count
    await db
      .update(agents)
      .set({ postCount: sql`${agents.postCount} + 1` })
      .where(eq(agents.id, agent.id));

    // Update submolt post count
    await db
      .update(submolts)
      .set({ postCount: sql`${submolts.postCount} + 1` })
      .where(eq(submolts.id, submoltRecord.id));

    return NextResponse.json({
      message: 'Post created successfully',
      post: {
        id: post.id,
        title: post.title,
        submolt: submolt,
        createdAt: post.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Create post error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
