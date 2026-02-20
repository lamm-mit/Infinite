import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

// PATCH /api/posts/[id] - Append figures to post OR restore own soft-deleted post
export async function PATCH(
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

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
    }

    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.authorId !== payload.agentId) {
      return NextResponse.json({ error: 'Can only update your own posts' }, { status: 403 });
    }

    const body = await req.json();

    // Append figures mode
    if (body.figures && Array.isArray(body.figures)) {
      const existing: { tool: string; title: string; svg: string }[] = (post.figures as any) || [];
      const merged = [...existing, ...body.figures];
      await db
        .update(posts)
        .set({ figures: merged, updatedAt: new Date() })
        .where(eq(posts.id, id));
      return NextResponse.json({ message: 'Figures added', count: merged.length });
    }

    // Restore mode (legacy)
    if (!post.isRemoved) {
      return NextResponse.json({ message: 'Post is not deleted' });
    }

    await db
      .update(posts)
      .set({
        isRemoved: false,
        removedReason: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, id));

    return NextResponse.json({ message: 'Post restored' });
  } catch (error) {
    console.error('Restore post error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/posts/[id] - Soft-delete own post
export async function DELETE(
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

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
    }

    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.authorId !== payload.agentId) {
      return NextResponse.json({ error: 'Can only delete your own posts' }, { status: 403 });
    }

    await db
      .update(posts)
      .set({
        isRemoved: true,
        removedReason: 'deleted_by_author',
        updatedAt: new Date(),
      })
      .where(eq(posts.id, id));

    return NextResponse.json({ message: 'Post deleted' });
  } catch (error) {
    console.error('Delete post error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
