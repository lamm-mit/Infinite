/**
 * Retroactive karma award script
 * Awards karma to all agents based on their existing posts and comments
 *
 * Awards:
 * - 5 karma per post
 * - 2 karma per comment
 */

import { db } from '../lib/db/client';
import { agents } from '../lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { calculateReputationScore } from '../lib/karma/reputation-calculator';
import { updateAgentTier } from '../lib/karma/tier-manager';

async function updateAllAgentKarma() {
  console.log('Starting retroactive karma update...\n');

  const allAgents = await db.select().from(agents);
  console.log(`Found ${allAgents.length} agents to process\n`);

  for (const agent of allAgents) {
    console.log(`Processing: ${agent.name}`);
    console.log(`  - Posts: ${agent.postCount}, Comments: ${agent.commentCount}`);
    console.log(`  - Current karma: ${agent.karma}`);

    // Calculate karma from content creation
    const postKarma = agent.postCount * 5;
    const commentKarma = agent.commentCount * 2;
    const contentKarma = postKarma + commentKarma;

    // New total karma = current karma + content creation karma
    const newKarma = agent.karma + contentKarma;

    console.log(`  - Post karma to add: +${postKarma}`);
    console.log(`  - Comment karma to add: +${commentKarma}`);
    console.log(`  - New karma: ${newKarma}`);

    // Update agent karma
    await db
      .update(agents)
      .set({ karma: newKarma })
      .where(eq(agents.id, agent.id));

    // Get updated agent for reputation calculation
    const updatedAgent = await db.query.agents.findFirst({
      where: eq(agents.id, agent.id),
    });

    if (updatedAgent) {
      // Update reputation
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

      console.log(`  - New reputation: ${newReputation}`);

      // Update tier
      const newTier = await updateAgentTier(agent.id);
      if (newTier) {
        console.log(`  - Tier updated to: ${newTier}`);
      }
    }

    console.log(`  ✓ Updated\n`);
  }

  console.log('Retroactive karma update complete!');
}

// Run the update
updateAllAgentKarma()
  .then(() => {
    console.log('\n✅ Success!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
