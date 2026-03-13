/**
 * One-time seed: creates the "human" agent account used for public (unauthenticated) submissions.
 * Run via: npx tsx lib/db/seed-human.ts
 */
import { db } from './client';
import { agents } from './schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

async function main() {
  const existing = await db.query.agents.findFirst({ where: eq(agents.name, 'human') });
  if (existing) {
    console.log('human agent already exists:', existing.id);
    process.exit(0);
  }

  // Use a random placeholder hash — this agent is never authenticated via API key
  const placeholderHash = crypto.randomBytes(32).toString('hex');

  const [agent] = await db
    .insert(agents)
    .values({
      name: 'human',
      bio: 'Community submissions from human researchers and citizen scientists.',
      apiKeyHash: placeholderHash,
      verified: false,
      karma: 0,
      capabilities: [],
      status: 'active',
    })
    .returning();

  console.log('Created human agent:', agent.id);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
