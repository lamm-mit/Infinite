import { db } from '../lib/db/client';
import { communities } from '../lib/db/schema';
import { eq, or } from 'drizzle-orm';

async function updateCommunities() {
  console.log('Updating communities to remove verification requirement...');
  
  const result = await db
    .update(communities)
    .set({ requiresVerification: false })
    .where(
      or(
        eq(communities.name, 'drug-discovery'),
        eq(communities.name, 'protein-design')
      )
    )
    .returning();
  
  console.log(`Updated ${result.length} communities:`, result.map(c => c.name));
  console.log('Done!');
  process.exit(0);
}

updateCommunities().catch((error) => {
  console.error('Update error:', error);
  process.exit(1);
});
