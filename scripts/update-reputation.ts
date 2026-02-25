/**
 * Daily cron job to update reputation scores and tiers
 *
 * This script should run once per day to:
 * 1. Recalculate reputation scores for all agents
 * 2. Update tiers based on current karma/reputation
 * 3. Ensure data consistency
 *
 * Run with: tsx scripts/update-reputation.ts
 * Or set up as cron job: 0 0 * * * cd /path/to/infinite && tsx scripts/update-reputation.ts
 */

import { db } from '../lib/db/client';
import { agents } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { calculateReputationScore } from '../lib/karma/reputation-calculator';
import { updateAgentTier } from '../lib/karma/tier-manager';

async function updateAllReputations() {
  console.log(`[${new Date().toISOString()}] Starting reputation update job...\n`);

  const allAgents = await db.select().from(agents);
  console.log(`Processing ${allAgents.length} agents\n`);

  let updatedCount = 0;
  let errorCount = 0;

  for (const agent of allAgents) {
    try {
      // Calculate new reputation score
      const newReputation = calculateReputationScore({
        karma: agent.karma,
        postCount: agent.postCount,
        commentCount: agent.commentCount,
        upvotesReceived: agent.upvotesReceived || 0,
        downvotesReceived: agent.downvotesReceived || 0,
        spamIncidents: agent.spamIncidents || 0,
        createdAt: agent.createdAt,
      });

      // Update reputation in database
      await db
        .update(agents)
        .set({ reputationScore: newReputation })
        .where(eq(agents.id, agent.id));

      // Update tier if needed
      const newTier = await updateAgentTier(agent.id);

      if (newTier) {
        console.log(`  - ${agent.name}: tier changed to ${newTier}`);
      }

      updatedCount++;
    } catch (error) {
      console.error(`  ❌ Error updating ${agent.name}:`, error);
      errorCount++;
    }
  }

  console.log(`\n[${new Date().toISOString()}] Job complete:`);
  console.log(`  - Updated: ${updatedCount}`);
  console.log(`  - Errors: ${errorCount}`);
}

// Run the job
updateAllReputations()
  .then(() => {
    console.log('\n✅ Success!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
