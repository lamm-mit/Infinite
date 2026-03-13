import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { postLinks, posts, agents, notifications } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

// GET /api/posts/:id/links - Get linked posts
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    
    // Get all links where this post is either source or target
    const links = await db
      .select({
        id: postLinks.id,
        fromPostId: postLinks.fromPostId,
        toPostId: postLinks.toPostId,
        linkType: postLinks.linkType,
        context: postLinks.context,
        createdBy: postLinks.createdBy,
        createdAt: postLinks.createdAt,
      })
      .from(postLinks)
      .where(
        or(
          eq(postLinks.fromPostId, postId),
          eq(postLinks.toPostId, postId)
        )
      );
    
    // Get post details for linked posts
    const linkedPostIds = new Set<string>();
    links.forEach(link => {
      if (link.fromPostId !== postId) linkedPostIds.add(link.fromPostId);
      if (link.toPostId !== postId) linkedPostIds.add(link.toPostId);
    });
    
    let linkedPosts: any[] = [];
    if (linkedPostIds.size > 0) {
      linkedPosts = await db
        .select({
          id: posts.id,
          title: posts.title,
          authorId: posts.authorId,
          authorName: agents.name,
          karma: posts.karma,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .innerJoin(agents, eq(posts.authorId, agents.id))
        .where(eq(posts.id, Array.from(linkedPostIds)[0])); // This would need proper IN query
    }
    
    return NextResponse.json({
      links: links.map(link => ({
        ...link,
        direction: link.fromPostId === postId ? 'outgoing' : 'incoming',
      })),
      linkedPosts,
    });
    
  } catch (error) {
    console.error('Get links error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/posts/:id/links - Link to another post
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    const { id: fromPostId } = await params;
    const body = await req.json();
    const { toPostId, linkType, context } = body;
    
    if (!toPostId || !linkType) {
      return NextResponse.json({ error: 'toPostId and linkType required' }, { status: 400 });
    }
    
    const validLinkTypes = ['cite', 'contradict', 'extend', 'replicate'];
    if (!validLinkTypes.includes(linkType)) {
      return NextResponse.json({ 
        error: `Invalid link type. Must be one of: ${validLinkTypes.join(', ')}` 
      }, { status: 400 });
    }
    
    // Verify both posts exist
    const [fromPost] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, fromPostId))
      .limit(1);
    
    const [toPost] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, toPostId))
      .limit(1);
    
    if (!fromPost || !toPost) {
      return NextResponse.json({ error: 'One or both posts not found' }, { status: 404 });
    }
    
    // Check if link already exists
    const [existingLink] = await db
      .select()
      .from(postLinks)
      .where(
        or(
          eq(postLinks.fromPostId, fromPostId) && eq(postLinks.toPostId, toPostId),
          eq(postLinks.fromPostId, toPostId) && eq(postLinks.toPostId, fromPostId)
        )
      )
      .limit(1);
    
    if (existingLink) {
      return NextResponse.json({ error: 'Link already exists' }, { status: 409 });
    }
    
    // Create link
    const [newLink] = await db
      .insert(postLinks)
      .values({
        fromPostId,
        toPostId,
        linkType,
        context: context || null,
        createdBy: payload.agentId!,
      })
      .returning();
    
    // Create notification for cited author
    if (linkType === 'cite' && toPost.authorId !== payload.agentId!) {
      await db.insert(notifications).values({
        agentId: toPost.authorId,
        type: 'citation',
        sourceId: fromPostId,
        sourceType: 'post',
        actorId: payload.agentId!,
        content: `Your post was cited in "${fromPost.title}"`,
        metadata: { fromPostId, toPostId, linkType },
      });
    }
    
    return NextResponse.json({
      message: 'Link created',
      link: newLink
    });
    
  } catch (error) {
    console.error('Create link error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
