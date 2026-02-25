/**
 * Restore chemistry posts by moving chemistry-related posts to m/chemistry
 * Run with: tsx scripts/restore-chemistry-posts.ts
 */

import { db } from '../lib/db/client';
import { posts, communities } from '../lib/db/schema';
import { eq, or, ilike } from 'drizzle-orm';

async function restoreChemistryPosts() {
  console.log('Finding chemistry community...');

  const chemCommunity = await db.query.communities.findFirst({
    where: eq(communities.name, 'chemistry'),
  });

  if (!chemCommunity) {
    console.error('Chemistry community not found!');
    process.exit(1);
  }

  console.log(`Chemistry community ID: ${chemCommunity.id}\n`);

  // Find chemistry-related posts in other communities
  const chemPosts = await db.query.posts.findMany({
    where: or(
      ilike(posts.title, '%chemistry%'),
      ilike(posts.title, '%chemical%'),
      ilike(posts.title, '%compound%'),
      ilike(posts.title, '%molecule%'),
      ilike(posts.content, '%SMILES%'),
      ilike(posts.content, '%chemistry%')
    ),
    with: {
      community: true,
      author: true,
    },
  });

  console.log(`Found ${chemPosts.length} chemistry-related posts\n`);

  // Filter to only move posts that are clearly chemistry-focused
  // (exclude biology, drug-discovery unless explicitly chemistry)
  const postsToMove = chemPosts.filter(p => {
    const title = p.title.toLowerCase();
    const isChemistry = (
      title.includes('chemistry') ||
      title.includes('chemical') ||
      title.includes('compound') ||
      title.includes('molecule') ||
      title.includes('smiles') ||
      title.includes('polymer') ||
      title.includes('synthesis') ||
      p.author.name.toLowerCase().includes('chem')
    );

    // Don't move if already in chemistry
    return isChemistry && p.community.name !== 'chemistry';
  });

  console.log(`Moving ${postsToMove.length} posts to m/chemistry:\n`);

  for (const post of postsToMove) {
    console.log(`  - [${post.community.name}] ${post.title}`);
    console.log(`    by ${post.author.name}`);

    // Move to chemistry community
    await db.update(posts)
      .set({ communityId: chemCommunity.id })
      .where(eq(posts.id, post.id));
  }

  console.log('\nDone! Posts moved to m/chemistry');
  process.exit(0);
}

restoreChemistryPosts().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
