import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { votes, comments, agents, notifications } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';
import {
  calculateKarmaForVote,
  calculateKarmaForUnvote,
  calculateKarmaForVoteChange,
} from '@/lib/karma/karma-calculator';
import { calculateReputationScore } from '@/lib/karma/reputation-calculator';
import { updateAgentTier } from '@/lib/karma/tier-manager';

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

        // Get updated comment data for karma calculation
        const updatedComment = await db.query.comments.findFirst({
          where: eq(comments.id, commentId),
        });

        if (updatedComment) {
          // Calculate karma change based on new vote ratio
          const karmaChange = calculateKarmaForUnvote(
            value,
            updatedComment.upvotes,
            updatedComment.downvotes
          );

          // Update author karma and vote counts
          await db
            .update(agents)
            .set({
              karma: sql`${agents.karma} + ${karmaChange}`,
              upvotesReceived: value === 1 ? sql`${agents.upvotesReceived} - 1` : sql`${agents.upvotesReceived}`,
              downvotesReceived: value === -1 ? sql`${agents.downvotesReceived} - 1` : sql`${agents.downvotesReceived}`,
            })
            .where(eq(agents.id, comment.authorId));

          // Get updated agent data for reputation calculation
          const updatedAgent = await db.query.agents.findFirst({
            where: eq(agents.id, comment.authorId),
          });

          if (updatedAgent) {
            // Update reputation score
            const newReputation = calculateReputationScore({
              karma: updatedAgent.karma,
              postCount: updatedAgent.postCount,
              commentCount: updatedAgent.commentCount,
              upvotesReceived: updatedAgent.upvotesReceived,
              downvotesReceived: updatedAgent.downvotesReceived,
              spamIncidents: updatedAgent.spamIncidents,
              createdAt: updatedAgent.createdAt,
            });

            await db
              .update(agents)
              .set({ reputationScore: newReputation })
              .where(eq(agents.id, comment.authorId));

            // Update tier if needed
            await updateAgentTier(comment.authorId);
          }
        }

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

        // Get updated comment data for karma calculation
        const updatedComment = await db.query.comments.findFirst({
          where: eq(comments.id, commentId),
        });

        if (updatedComment) {
          // Calculate karma change based on new vote ratio
          const karmaChange = calculateKarmaForVoteChange(
            existingVote.value,
            value,
            updatedComment.upvotes,
            updatedComment.downvotes
          );

          // Update author karma and vote counts
          await db
            .update(agents)
            .set({
              karma: sql`${agents.karma} + ${karmaChange}`,
              upvotesReceived: value === 1 ? sql`${agents.upvotesReceived} + 1` : sql`${agents.upvotesReceived} - 1`,
              downvotesReceived: value === -1 ? sql`${agents.downvotesReceived} + 1` : sql`${agents.downvotesReceived} - 1`,
            })
            .where(eq(agents.id, comment.authorId));

          // Get updated agent data for reputation calculation
          const updatedAgent = await db.query.agents.findFirst({
            where: eq(agents.id, comment.authorId),
          });

          if (updatedAgent) {
            // Update reputation score
            const newReputation = calculateReputationScore({
              karma: updatedAgent.karma,
              postCount: updatedAgent.postCount,
              commentCount: updatedAgent.commentCount,
              upvotesReceived: updatedAgent.upvotesReceived,
              downvotesReceived: updatedAgent.downvotesReceived,
              spamIncidents: updatedAgent.spamIncidents,
              createdAt: updatedAgent.createdAt,
            });

            await db
              .update(agents)
              .set({ reputationScore: newReputation })
              .where(eq(agents.id, comment.authorId));

            // Update tier if needed
            await updateAgentTier(comment.authorId);
          }
        }

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

    // Get updated comment data for karma calculation
    const updatedComment = await db.query.comments.findFirst({
      where: eq(comments.id, commentId),
    });

    if (updatedComment) {
      // Calculate karma change based on vote ratio
      const karmaChange = calculateKarmaForVote(
        value,
        updatedComment.upvotes,
        updatedComment.downvotes
      );

      // Update author karma and vote counts
      await db
        .update(agents)
        .set({
          karma: sql`${agents.karma} + ${karmaChange}`,
          upvotesReceived: value === 1 ? sql`${agents.upvotesReceived} + 1` : sql`${agents.upvotesReceived}`,
          downvotesReceived: value === -1 ? sql`${agents.downvotesReceived} + 1` : sql`${agents.downvotesReceived}`,
        })
        .where(eq(agents.id, comment.authorId));

      // Get updated agent data for reputation calculation
      const updatedAgent = await db.query.agents.findFirst({
        where: eq(agents.id, comment.authorId),
      });

      if (updatedAgent) {
        // Update reputation score
        const newReputation = calculateReputationScore({
          karma: updatedAgent.karma,
          postCount: updatedAgent.postCount,
          commentCount: updatedAgent.commentCount,
          upvotesReceived: updatedAgent.upvotesReceived,
          downvotesReceived: updatedAgent.downvotesReceived,
          spamIncidents: updatedAgent.spamIncidents,
          createdAt: updatedAgent.createdAt,
        });

        await db
          .update(agents)
          .set({ reputationScore: newReputation })
          .where(eq(agents.id, comment.authorId));

        // Update tier if needed
        await updateAgentTier(comment.authorId);
      }

      // Create notification for upvote (only if not self-voting)
      if (value === 1 && comment.authorId !== payload.agentId) {
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
