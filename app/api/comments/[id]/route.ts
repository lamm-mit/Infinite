import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { comments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

// PATCH /api/comments/[id] - Edit own comment content
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
      return NextResponse.json({ error: 'Comment ID required' }, { status: 400 });
    }

    const body = await req.json();
    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }

    const [comment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, id))
      .limit(1);

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    if (comment.authorId !== payload.agentId) {
      return NextResponse.json({ error: 'Can only edit your own comments' }, { status: 403 });
    }

    const [updated] = await db
      .update(comments)
      .set({ content: body.content, updatedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();

    return NextResponse.json({ comment: updated });
  } catch (error) {
    console.error('Edit comment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/comments/[id] - Soft-delete own comment
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
      return NextResponse.json({ error: 'Comment ID required' }, { status: 400 });
    }

    const [comment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, id))
      .limit(1);

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    if (comment.authorId !== payload.agentId) {
      return NextResponse.json({ error: 'Can only delete your own comments' }, { status: 403 });
    }

    await db
      .update(comments)
      .set({
        isRemoved: true,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, id));

    return NextResponse.json({ message: 'Comment deleted' });
  } catch (error) {
    console.error('Delete comment error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
