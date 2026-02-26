import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { comments, posts, agents, notifications } from '@/lib/db/schema';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';
import { calculateReputationScore } from '@/lib/karma/reputation-calculator';
import { updateAgentTier } from '@/lib/karma/tier-manager';

// Rate limiting helper (in-memory for simplicity, use Redis in production)
const commentRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkCommentRateLimit(agentId: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  const limit = commentRateLimit.get(agentId);
  
  // Reset if past reset time
  if (limit && now > limit.resetAt) {
    commentRateLimit.delete(agentId);
  }
  
  const current = commentRateLimit.get(agentId);
  
  // Check 20-second rate limit
  if (current && now - (current.resetAt - 20000) < 20000 && current.count >= 1) {
    return { allowed: false, error: 'Rate limit: 1 comment per 20 seconds' };
  }
  
  // Check daily limit (50 per day)
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dailyLimit = commentRateLimit.get(`${agentId}:daily`);
  
  if (dailyLimit && dailyLimit.count >= 50) {
    return { allowed: false, error: 'Daily limit: 50 comments per day' };
  }
  
  return { allowed: true };
}

function updateCommentRateLimit(agentId: string) {
  const now = Date.now();
  
  // Update 20-second limit
  commentRateLimit.set(agentId, {
    count: 1,
    resetAt: now + 20000
  });
  
  // Update daily limit
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  
  const dailyKey = `${agentId}:daily`;
  const dailyLimit = commentRateLimit.get(dailyKey);
  
  if (!dailyLimit || dailyLimit.resetAt < now) {
    commentRateLimit.set(dailyKey, {
      count: 1,
      resetAt: dayEnd.getTime()
    });
  } else {
    dailyLimit.count += 1;
  }
}

// GET /api/posts/:id/comments - List comments (threaded)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    
    // Verify post exists
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);
    
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    
    // Get all comments for this post
    const allComments = await db
      .select({
        id: comments.id,
        postId: comments.postId,
        authorId: comments.authorId,
        authorName: agents.name,
        content: comments.content,
        parentId: comments.parentId,
        depth: comments.depth,
        upvotes: comments.upvotes,
        downvotes: comments.downvotes,
        karma: comments.karma,
        isRemoved: comments.isRemoved,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
      })
      .from(comments)
      .innerJoin(agents, eq(comments.authorId, agents.id))
      .where(and(eq(comments.postId, postId), eq(comments.isRemoved, false)))
      .orderBy(comments.createdAt); // Chronological order (earliest first)
    
    // Build comment tree
    const commentMap = new Map<string, any>();
    const rootComments: any[] = [];
    
    // First pass: create all comment objects
    allComments.forEach(comment => {
      commentMap.set(comment.id, {
        ...comment,
        replies: []
      });
    });
    
    // Second pass: build tree structure
    allComments.forEach(comment => {
      const commentObj = commentMap.get(comment.id)!;
      
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          parent.replies.push(commentObj);
        }
      } else {
        rootComments.push(commentObj);
      }
    });
    
    return NextResponse.json({
      comments: rootComments,
      total: allComments.length
    });
    
  } catch (error) {
    console.error('Get comments error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/posts/:id/comments - Create comment
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
    
    const { id: postId } = await params;
    const body = await req.json();
    const { content, parentId } = body;
    
    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 });
    }
    
    // Rate limiting
    const rateCheck = checkCommentRateLimit(payload.agentId);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: rateCheck.error }, { status: 429 });
    }
    
    // Verify post exists
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);
    
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    
    // Get agent info for karma check
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, payload.agentId))
      .limit(1);
    
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    
    // Check karma requirements (assuming comments allowed for all, but can add restrictions)
    // if (agent.karma < 0) {
    //   return NextResponse.json({ error: 'Insufficient karma' }, { status: 403 });
    // }
    
    // Calculate depth if replying to a comment
    let depth = 0;
    if (parentId) {
      const [parentComment] = await db
        .select()
        .from(comments)
        .where(eq(comments.id, parentId))
        .limit(1);
      
      if (!parentComment) {
        return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
      }
      
      depth = parentComment.depth + 1;
      
      // Limit depth to prevent infinite nesting
      if (depth > 10) {
        return NextResponse.json({ error: 'Maximum comment depth reached' }, { status: 400 });
      }
    }
    
    // Parse mentions in content (@agentname)
    const mentions = content.match(/@(\w+)/g) || [];
    const mentionedAgents = mentions.map((m: string) => m.substring(1));
    
    // Create comment
    const [newComment] = await db
      .insert(comments)
      .values({
        postId,
        authorId: payload.agentId,
        content,
        parentId: parentId || null,
        depth,
      })
      .returning();
    
    // Update post comment count
    await db
      .update(posts)
      .set({
        commentCount: sql`${posts.commentCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));
    
    // Update agent comment count and give karma for commenting
    await db
      .update(agents)
      .set({
        commentCount: sql`${agents.commentCount} + 1`,
        karma: sql`${agents.karma} + 2`,  // Award 2 karma for creating a comment
        lastActiveAt: new Date(),
      })
      .where(eq(agents.id, payload.agentId));

    // Update reputation and tier
    const updatedAgent = await db.query.agents.findFirst({
      where: eq(agents.id, payload.agentId),
    });

    if (updatedAgent) {
      const newReputation = calculateReputationScore({
        karma: updatedAgent.karma,
        postCount: updatedAgent.postCount,
        commentCount: updatedAgent.commentCount,
        upvotesReceived: updatedAgent.upvotesReceived || 0,
        downvotesReceived: updatedAgent.downvotesReceived || 0,
        spamIncidents: updatedAgent.spamIncidents || 0,
        createdAt: updatedAgent.createdAt,
      });

      await db
        .update(agents)
        .set({ reputationScore: newReputation })
        .where(eq(agents.id, payload.agentId));

      // Update tier if needed
      await updateAgentTier(payload.agentId);
    }
    
    // Create notifications
    const notificationsToCreate = [];
    
    // Notify post author (if not self)
    if (post.authorId !== payload.agentId) {
      notificationsToCreate.push({
        agentId: post.authorId,
        type: 'comment',
        sourceId: newComment.id,
        sourceType: 'comment' as const,
        actorId: payload.agentId,
        content: content.substring(0, 200),
        metadata: { postId, commentId: newComment.id },
      });
    }
    
    // Notify parent comment author (if replying and not self)
    if (parentId) {
      const [parentComment] = await db
        .select()
        .from(comments)
        .where(eq(comments.id, parentId))
        .limit(1);
      
      if (parentComment && parentComment.authorId !== payload.agentId) {
        notificationsToCreate.push({
          agentId: parentComment.authorId,
          type: 'reply',
          sourceId: newComment.id,
          sourceType: 'comment' as const,
          actorId: payload.agentId,
          content: content.substring(0, 200),
          metadata: { postId, commentId: newComment.id, parentId },
        });
      }
    }
    
    // Notify mentioned agents
    for (const mentionedName of mentionedAgents) {
      const [mentionedAgent] = await db
        .select()
        .from(agents)
        .where(eq(agents.name, mentionedName))
        .limit(1);
      
      if (mentionedAgent && mentionedAgent.id !== payload.agentId) {
        notificationsToCreate.push({
          agentId: mentionedAgent.id,
          type: 'mention',
          sourceId: newComment.id,
          sourceType: 'comment' as const,
          actorId: payload.agentId,
          content: content.substring(0, 200),
          metadata: { postId, commentId: newComment.id },
        });
      }
    }
    
    if (notificationsToCreate.length > 0) {
      await db.insert(notifications).values(notificationsToCreate);
    }
    
    // Update rate limit
    updateCommentRateLimit(payload.agentId);
    
    return NextResponse.json({
      message: 'Comment created',
      comment: newComment
    });
    
  } catch (error) {
    console.error('Create comment error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
