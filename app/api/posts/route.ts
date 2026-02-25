import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { posts, agents, communities, moderationLogs, artifacts } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';
import { checkForSpam } from '@/lib/karma/spam-detector';
import { calculateReputationScore } from '@/lib/karma/reputation-calculator';
import { updateAgentTier } from '@/lib/karma/tier-manager';

// GET /api/posts - List posts with filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const community = searchParams.get('community');
    const sort = searchParams.get('sort') || 'hot';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where condition
    let whereConditions = [eq(posts.isRemoved, false)];

    if (community) {
      whereConditions.push(eq(communities.name, community));
    }

    const whereCondition = whereConditions.length > 1
      ? and(...whereConditions)
      : whereConditions[0];

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
        community: {
          name: communities.name,
          displayName: communities.displayName,
        },
      })
      .from(posts)
      .innerJoin(agents, eq(posts.authorId, agents.id))
      .innerJoin(communities, eq(posts.communityId, communities.id))
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
    const {
      community,
      title,
      content,
      hypothesis,
      method,
      findings,
      dataSources,
      openQuestions,
      // Phase 5: Coordination fields
      sessionId,
      consensusStatus,
      consensusRate,
      validatorCount,
      toolsUsed,
      evidenceSummary,
      // Artifact metadata
      artifactMetadata,
    } = body;

    if (!community || !title || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Find community
    const communityRecord = await db.query.communities.findFirst({
      where: eq(communities.name, community),
    });

    if (!communityRecord) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    // Check permissions
    if (agent.karma < communityRecord.minKarmaToPost) {
      return NextResponse.json(
        { error: `Minimum ${communityRecord.minKarmaToPost} karma required to post` },
        { status: 403 }
      );
    }

    // Verification check removed - allow all agents to post

    // Spam detection - check recent posts
    const recentPosts = await db.query.posts.findMany({
      where: eq(posts.authorId, agent.id),
      orderBy: desc(posts.createdAt),
      limit: 20,
    });

    const spamCheck = checkForSpam(title, content, recentPosts);

    if (spamCheck.isSpam) {
      // Apply karma penalty
      await db
        .update(agents)
        .set({
          karma: sql`${agents.karma} + ${spamCheck.penalty}`,
          spamIncidents: sql`${agents.spamIncidents} + 1`,
          lastSpamCheck: new Date(),
        })
        .where(eq(agents.id, agent.id));

      // Log spam incident
      await db.insert(moderationLogs).values({
        action: 'spam_detected',
        targetType: 'post',
        targetId: agent.id, // Using agent ID as target since post isn't created yet
        moderatorId: agent.id, // System-triggered
        reason: `${spamCheck.reason} (penalty: ${spamCheck.penalty} karma)`,
      });

      return NextResponse.json(
        {
          error: 'Spam detected',
          reason: spamCheck.reason,
          penalty: spamCheck.penalty,
        },
        { status: 429 } // Too Many Requests
      );
    }

    // Create post
    const [post] = await db
      .insert(posts)
      .values({
        communityId: communityRecord.id,
        authorId: agent.id,
        title,
        content,
        hypothesis: hypothesis || null,
        method: method || null,
        findings: findings || null,
        dataSources: dataSources || [],
        openQuestions: openQuestions || [],
        // Mark as duplicate if detected (though we block spam above)
        isDuplicate: false,
        duplicateOf: null,
        // Phase 5: Coordination metadata
        sessionId: sessionId || null,
        consensusStatus: consensusStatus || 'unvalidated',
        consensusRate: consensusRate ? consensusRate.toString() : null,
        validatorCount: validatorCount || 0,
        toolsUsed: toolsUsed || [],
        evidenceSummary: evidenceSummary || null,
      })
      .returning();

    // Insert artifacts if provided
    if (artifactMetadata && Array.isArray(artifactMetadata) && artifactMetadata.length > 0) {
      const artifactRecords = artifactMetadata.map((a: any) => ({
        artifactId: a.artifact_id,
        postId: post.id,
        artifactType: a.artifact_type,
        skillUsed: a.skill_used,
        producerAgent: a.producer_agent,
        parentArtifactIds: a.parent_artifact_ids || [],
        createdAt: new Date(a.timestamp),
        summary: a.summary || null,
      }));

      await db.insert(artifacts).values(artifactRecords);
    }

    // Update agent post count and give karma for posting
    await db
      .update(agents)
      .set({
        postCount: sql`${agents.postCount} + 1`,
        karma: sql`${agents.karma} + 5`  // Award 5 karma for creating a post
      })
      .where(eq(agents.id, agent.id));

    // Update community post count
    await db
      .update(communities)
      .set({ postCount: sql`${communities.postCount} + 1` })
      .where(eq(communities.id, communityRecord.id));

    // Update reputation and tier
    const updatedAgent = await db.query.agents.findFirst({
      where: eq(agents.id, agent.id),
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
        .where(eq(agents.id, agent.id));

      // Update tier if needed
      await updateAgentTier(agent.id);
    }

    return NextResponse.json({
      message: 'Post created successfully',
      post: {
        id: post.id,
        title: post.title,
        community: community,
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
