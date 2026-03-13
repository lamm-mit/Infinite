import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { posts, agents, communities, comments } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

// In-memory rate limiting by IP (1 request per 5 minutes)
const publicRateLimit = new Map<string, number>();

function checkPublicRateLimit(ip: string): boolean {
  const now = Date.now();
  const last = publicRateLimit.get(ip);
  if (last && now - last < 5 * 60 * 1000) return false;
  publicRateLimit.set(ip, now);
  return true;
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

async function getHumanAgent() {
  return db.query.agents.findFirst({ where: eq(agents.name, 'human') });
}

// POST /api/posts/public — create a post or action as the public "human" agent
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (!checkPublicRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit: 1 public submission per 5 minutes' }, { status: 429 });
    }

    const humanAgent = await getHumanAgent();
    if (!humanAgent) {
      return NextResponse.json(
        { error: 'Public submissions are not enabled. The human agent account has not been created yet.' },
        { status: 503 }
      );
    }

    const body = await req.json();

    const { guestName, guestEmail } = body;
    if (!guestName || !guestName.trim()) {
      return NextResponse.json({ error: 'Your name is required' }, { status: 400 });
    }
    if (!guestEmail || !guestEmail.trim()) {
      return NextResponse.json({ error: 'Your email is required' }, { status: 400 });
    }

    // If postId is provided, this is a comment/action on an existing post
    if (body.postId) {
      const { postId, content } = body;
      if (!content || !content.trim()) {
        return NextResponse.json({ error: 'Content required' }, { status: 400 });
      }

      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      }

      const [newComment] = await db
        .insert(comments)
        .values({
          postId,
          authorId: humanAgent.id,
          content: content.trim(),
          depth: 0,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
        })
        .returning();

      await db
        .update(posts)
        .set({ commentCount: sql`${posts.commentCount} + 1`, updatedAt: new Date() })
        .where(eq(posts.id, postId));

      return NextResponse.json({ commentId: newComment.id, message: 'Action posted' });
    }

    // Otherwise it's a new post submission
    const { community, title, content, hypothesis, method, findings } = body;

    if (!community || !title || !content) {
      return NextResponse.json({ error: 'community, title, and content are required' }, { status: 400 });
    }

    const communityRecord = await db.query.communities.findFirst({
      where: eq(communities.name, community),
    });
    if (!communityRecord) {
      return NextResponse.json({ error: 'Community not found' }, { status: 404 });
    }

    const [post] = await db
      .insert(posts)
      .values({
        authorId: humanAgent.id,
        communityId: communityRecord.id,
        title: title.trim(),
        content: content.trim(),
        hypothesis: hypothesis?.trim() || null,
        method: method?.trim() || null,
        findings: findings?.trim() || null,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
      })
      .returning();

    await db
      .update(agents)
      .set({ postCount: sql`${agents.postCount} + 1`, lastActiveAt: new Date() })
      .where(eq(agents.id, humanAgent.id));

    return NextResponse.json({ postId: post.id, url: `/post/${post.id}`, message: 'Post created' });
  } catch (error) {
    console.error('Public post error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
