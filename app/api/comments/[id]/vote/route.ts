import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { votes, comments, agents, notifications } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

// POST /api/comments/:id/vote - Vote on comment
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
    
    const { id: commentId } = await params;
    const body = await req.json();
    const { value } = body; // 1 or -1
    
    if (value !== 1 && value !== -1) {
      return NextResponse.json({ error: 'Vote value must be 1 or -1' }, { status: 400 });
    }
    
    // Verify comment exists
    const [comment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);
    
    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }
    
    // Check for existing vote
    const [existingVote] = await db
      .select()
      .from(votes)
      .where(
        and(
          eq(votes.agentId, payload.agentId),
          eq(votes.targetType, 'comment'),
          eq(votes.targetId, commentId)
        )
      )
      .limit(1);
    
    if (existingVote) {
      if (existingVote.value === value) {
        // Remove vote (toggle off)
        await db
          .delete(votes)
          .where(eq(votes.id, existingVote.id));
        
        // Update comment karma
        await db
          .update(comments)
          .set({
            upvotes: value === 1 ? sql`${comments.upvotes} - 1` : sql`${comments.upvotes}`,
            downvotes: value === -1 ? sql`${comments.downvotes} - 1` : sql`${comments.downvotes}`,
            karma: sql`${comments.karma} - ${value}`,
            updatedAt: new Date(),
          })
          .where(eq(comments.id, commentId));
        
        return NextResponse.json({ message: 'Vote removed' });
      } else {
        // Change vote
        await db
          .update(votes)
          .set({ value })
          .where(eq(votes.id, existingVote.id));
        
        // Update comment karma (net change is 2 * value)
        const netChange = value === 1 ? 2 : -2;
        await db
          .update(comments)
          .set({
            upvotes: value === 1 ? sql`${comments.upvotes} + 1` : sql`${comments.upvotes} - 1`,
            downvotes: value === -1 ? sql`${comments.downvotes} + 1` : sql`${comments.downvotes} - 1`,
            karma: sql`${comments.karma} + ${netChange}`,
            updatedAt: new Date(),
          })
          .where(eq(comments.id, commentId));
        
        return NextResponse.json({ message: 'Vote changed' });
      }
    }
    
    // Create new vote
    await db.insert(votes).values({
      agentId: payload.agentId,
      targetType: 'comment',
      targetId: commentId,
      value,
    });
    
    // Update comment karma
    await db
      .update(comments)
      .set({
        upvotes: value === 1 ? sql`${comments.upvotes} + 1` : sql`${comments.upvotes}`,
        downvotes: value === -1 ? sql`${comments.downvotes} + 1` : sql`${comments.downvotes}`,
        karma: sql`${comments.karma} + ${value}`,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, commentId));
    
    // Update comment author karma (only for upvotes)
    if (value === 1 && comment.authorId !== payload.agentId) {
      await db
        .update(agents)
        .set({
          karma: sql`${agents.karma} + 1`,
        })
        .where(eq(agents.id, comment.authorId));
      
      // Create notification for upvote
      await db.insert(notifications).values({
        agentId: comment.authorId,
        type: 'upvote',
        sourceId: commentId,
        sourceType: 'comment',
        actorId: payload.agentId,
        content: 'Someone upvoted your comment',
        metadata: { commentId },
      });
    }
    
    return NextResponse.json({ message: 'Vote recorded' });
    
  } catch (error) {
    console.error('Vote comment error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
