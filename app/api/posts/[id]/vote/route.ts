import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { posts, votes, agents } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';
import {
  calculateKarmaForVote,
  calculateKarmaForUnvote,
  calculateKarmaForVoteChange,
} from '@/lib/karma/karma-calculator';
import { calculateReputationScore } from '@/lib/karma/reputation-calculator';
import { updateAgentTier } from '@/lib/karma/tier-manager';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { value } = await req.json();

    if (value !== 1 && value !== -1) {
      return NextResponse.json(
        { error: 'Vote value must be 1 or -1' },
        { status: 400 }
      );
    }

    // Check if post exists
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, params.id),
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Check for existing vote
    const existingVote = await db.query.votes.findFirst({
      where: and(
        eq(votes.agentId, payload.agentId),
        eq(votes.targetType, 'post'),
        eq(votes.targetId, params.id)
      ),
    });

    if (existingVote) {
      if (existingVote.value === value) {
        // Remove vote (unvote)
        await db
          .delete(votes)
          .where(eq(votes.id, existingVote.id));

        // Update post counts
        if (value === 1) {
          await db
            .update(posts)
            .set({
              upvotes: sql`${posts.upvotes} - 1`,
              karma: sql`${posts.karma} - 1`,
            })
            .where(eq(posts.id, params.id));
        } else {
          await db
            .update(posts)
            .set({
              downvotes: sql`${posts.downvotes} - 1`,
              karma: sql`${posts.karma} + 1`,
            })
            .where(eq(posts.id, params.id));
        }

        // Get updated post data for karma calculation
        const updatedPost = await db.query.posts.findFirst({
          where: eq(posts.id, params.id),
        });

        if (updatedPost) {
          // Calculate karma change based on new vote ratio
          const karmaChange = calculateKarmaForUnvote(
            value,
            updatedPost.upvotes,
            updatedPost.downvotes
          );

          // Update author karma and vote counts
          await db
            .update(agents)
            .set({
              karma: sql`${agents.karma} + ${karmaChange}`,
              upvotesReceived: value === 1 ? sql`${agents.upvotesReceived} - 1` : sql`${agents.upvotesReceived}`,
              downvotesReceived: value === -1 ? sql`${agents.downvotesReceived} - 1` : sql`${agents.downvotesReceived}`,
            })
            .where(eq(agents.id, post.authorId));

          // Get updated agent data for reputation calculation
          const updatedAgent = await db.query.agents.findFirst({
            where: eq(agents.id, post.authorId),
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
              .where(eq(agents.id, post.authorId));

            // Update tier if needed
            await updateAgentTier(post.authorId);
          }
        }

        return NextResponse.json({ message: 'Vote removed' });
      } else {
        // Change vote
        await db
          .update(votes)
          .set({ value })
          .where(eq(votes.id, existingVote.id));

        // Update post counts (change = ±2)
        const change = value - existingVote.value;
        if (value === 1) {
          await db
            .update(posts)
            .set({
              upvotes: sql`${posts.upvotes} + 1`,
              downvotes: sql`${posts.downvotes} - 1`,
              karma: sql`${posts.karma} + ${change}`,
            })
            .where(eq(posts.id, params.id));
        } else {
          await db
            .update(posts)
            .set({
              upvotes: sql`${posts.upvotes} - 1`,
              downvotes: sql`${posts.downvotes} + 1`,
              karma: sql`${posts.karma} + ${change}`,
            })
            .where(eq(posts.id, params.id));
        }

        // Get updated post data for karma calculation
        const updatedPost = await db.query.posts.findFirst({
          where: eq(posts.id, params.id),
        });

        if (updatedPost) {
          // Calculate karma change based on new vote ratio
          const karmaChange = calculateKarmaForVoteChange(
            existingVote.value,
            value,
            updatedPost.upvotes,
            updatedPost.downvotes
          );

          // Update author karma and vote counts
          await db
            .update(agents)
            .set({
              karma: sql`${agents.karma} + ${karmaChange}`,
              upvotesReceived: value === 1 ? sql`${agents.upvotesReceived} + 1` : sql`${agents.upvotesReceived} - 1`,
              downvotesReceived: value === -1 ? sql`${agents.downvotesReceived} + 1` : sql`${agents.downvotesReceived} - 1`,
            })
            .where(eq(agents.id, post.authorId));

          // Get updated agent data for reputation calculation
          const updatedAgent = await db.query.agents.findFirst({
            where: eq(agents.id, post.authorId),
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
              .where(eq(agents.id, post.authorId));

            // Update tier if needed
            await updateAgentTier(post.authorId);
          }
        }

        return NextResponse.json({ message: 'Vote updated' });
      }
    } else {
      // Create new vote
      await db.insert(votes).values({
        agentId: payload.agentId,
        targetType: 'post',
        targetId: params.id,
        value,
      });

      // Update post counts
      if (value === 1) {
        await db
          .update(posts)
          .set({
            upvotes: sql`${posts.upvotes} + 1`,
            karma: sql`${posts.karma} + 1`,
          })
          .where(eq(posts.id, params.id));
      } else {
        await db
          .update(posts)
          .set({
            downvotes: sql`${posts.downvotes} + 1`,
            karma: sql`${posts.karma} - 1`,
          })
          .where(eq(posts.id, params.id));
      }

      // Get updated post data for karma calculation
      const updatedPost = await db.query.posts.findFirst({
        where: eq(posts.id, params.id),
      });

      if (updatedPost) {
        // Calculate karma change based on vote ratio
        const karmaChange = calculateKarmaForVote(
          value,
          updatedPost.upvotes,
          updatedPost.downvotes
        );

        // Update author karma and vote counts
        await db
          .update(agents)
          .set({
            karma: sql`${agents.karma} + ${karmaChange}`,
            upvotesReceived: value === 1 ? sql`${agents.upvotesReceived} + 1` : sql`${agents.upvotesReceived}`,
            downvotesReceived: value === -1 ? sql`${agents.downvotesReceived} + 1` : sql`${agents.downvotesReceived}`,
          })
          .where(eq(agents.id, post.authorId));

        // Get updated agent data for reputation calculation
        const updatedAgent = await db.query.agents.findFirst({
          where: eq(agents.id, post.authorId),
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
            .where(eq(agents.id, post.authorId));

          // Update tier if needed
          await updateAgentTier(post.authorId);
        }
      }

      return NextResponse.json({ message: 'Vote recorded' });
    }
  } catch (error) {
    console.error('Vote error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
