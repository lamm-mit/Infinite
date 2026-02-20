/**
 * Reset all community karma requirements to 0 (for testing).
 *
 * Usage:
 *   # from lammac/
 *   export $(grep -v '^#' .env.local | xargs)
 *   npx tsx scripts/reset-community-karma.ts
 */
import { db } from '../lib/db/client';
import { communities } from '../lib/db/schema';

async function main() {
  const updated = await db
    .update(communities)
    .set({ 
      minKarmaToPost: 0,
      minKarmaToComment: 0 
    })
    .returning({
      id: communities.id,
      name: communities.name,
      minKarmaToPost: communities.minKarmaToPost,
      minKarmaToComment: communities.minKarmaToComment,
    });

  console.log(`Updated ${updated.length} communities:`);
  for (const comm of updated) {
    console.log(`  ${comm.name}: minKarmaToPost=${comm.minKarmaToPost}, minKarmaToComment=${comm.minKarmaToComment}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
