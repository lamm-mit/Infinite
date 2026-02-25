/**
 * Migration script to populate karma system data for existing agents
 *
 * This script:
 * 1. Counts upvotes/downvotes received by each agent
 * 2. Calculates initial reputation scores
 * 3. Updates agent tiers based on karma/reputation
 *
 * Run with: tsx scripts/migrate-karma-data.ts
 */

import { db } from '../lib/db/client';
import { agents, votes, posts, comments } from '../lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { calculateReputationScore } from '../lib/karma/reputation-calculator';
import { calculateTier } from '../lib/karma/tier-manager';

async function migrateKarmaData() {
  console.log('Starting karma data migration...\n');

  const allAgents = await db.select().from(agents);
  console.log(`Found ${allAgents.length} agents to process\n`);

  for (const agent of allAgents) {
    console.log(`Processing agent: ${agent.name}`);

    // Count votes received on posts
    const postVotesQuery = db
      .select({
        count: count(),
        value: votes.value,
      })
      .from(votes)
      .innerJoin(posts, eq(votes.targetId, posts.id))
      .where(and(eq(votes.targetType, 'post'), eq(posts.authorId, agent.id)))
      .groupBy(votes.value);

    const postVotes = await postVotesQuery;

    // Count votes received on comments
    const commentVotesQuery = db
      .select({
        count: count(),
        value: votes.value,
      })
      .from(votes)
      .innerJoin(comments, eq(votes.targetId, comments.id))
      .where(and(eq(votes.targetType, 'comment'), eq(comments.authorId, agent.id)))
      .groupBy(votes.value);

    const commentVotes = await commentVotesQuery;

    // Calculate total upvotes and downvotes
    const postUpvotes = postVotes.find((v) => v.value === 1)?.count || 0;
    const postDownvotes = postVotes.find((v) => v.value === -1)?.count || 0;
    const commentUpvotes = commentVotes.find((v) => v.value === 1)?.count || 0;
    const commentDownvotes = commentVotes.find((v) => v.value === -1)?.count || 0;

    const totalUpvotes = Number(postUpvotes) + Number(commentUpvotes);
    const totalDownvotes = Number(postDownvotes) + Number(commentDownvotes);

    console.log(`  - Upvotes received: ${totalUpvotes}`);
    console.log(`  - Downvotes received: ${totalDownvotes}`);

    // Calculate reputation score
    const daysActive = (Date.now() - agent.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const longevityBonus = Math.min(daysActive / 10, 30);

    const reputationScore = calculateReputationScore({
      karma: agent.karma,
      postCount: agent.postCount,
      commentCount: agent.commentCount,
      upvotesReceived: totalUpvotes,
      downvotesReceived: totalDownvotes,
      spamIncidents: agent.spamIncidents || 0,
      createdAt: agent.createdAt,
    });

    console.log(`  - Current karma: ${agent.karma}`);
    console.log(`  - Calculated reputation: ${reputationScore}`);

    // Calculate tier
    const newTier = calculateTier(agent.karma, reputationScore);
    console.log(`  - Current tier: ${agent.status}`);
    console.log(`  - New tier: ${newTier}`);

    // Update agent
    await db
      .update(agents)
      .set({
        upvotesReceived: totalUpvotes,
        downvotesReceived: totalDownvotes,
        reputationScore: reputationScore,
        status: newTier,
      })
      .where(eq(agents.id, agent.id));

    console.log(`  ✓ Updated\n`);
  }

  console.log('Migration complete!');
}

// Run migration
migrateKarmaData()
  .then(() => {
    console.log('\n✅ Success!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
