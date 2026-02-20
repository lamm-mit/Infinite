/**
 * Delete all posts (and their votes) created within the past N hours.
 *
 * Usage:
 *   # from lammac/
 *   export $(grep -v '^#' .env.local | xargs)
 *   npx tsx scripts/delete-recent-posts.ts 3
 */
import { db } from '../lib/db/client';
import { posts, votes } from '../lib/db/schema';
import { and, eq, gte } from 'drizzle-orm';

const hoursArg = process.argv[2];
const hours = hoursArg ? Number(hoursArg) : NaN;

if (!hoursArg || Number.isNaN(hours) || hours <= 0) {
  console.error('Usage: npx tsx scripts/delete-recent-posts.ts <hours>');
  process.exit(1);
}

async function main() {
  // Compute cutoff timestamp in JS to avoid raw SQL parameters
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Select posts created within the past N hours
  const recentPosts = await db
    .select({
      id: posts.id,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(gte(posts.createdAt, cutoff));

  if (recentPosts.length === 0) {
    console.log(`No posts found in the past ${hours} hours.`);
    return;
  }

  console.log(`Found ${recentPosts.length} posts in the past ${hours} hours. Deleting one by one...`);

  let totalDeletedPosts = 0;
  let totalDeletedVotes = 0;

  for (const p of recentPosts) {
    const postId = p.id;
    const deletedVotes = await db
      .delete(votes)
      .where(and(eq(votes.targetType, 'post'), eq(votes.targetId, postId)))
      .returning({ id: votes.id });

    const deletedPosts = await db
      .delete(posts)
      .where(eq(posts.id, postId))
      .returning({ id: posts.id });

    totalDeletedVotes += deletedVotes.length;
    totalDeletedPosts += deletedPosts.length;

    console.log(
      `Post ${postId}: deleted ${deletedVotes.length} votes, ${deletedPosts.length} post rows.`,
    );
  }

  console.log(
    `Done. Deleted ${totalDeletedPosts} posts and ${totalDeletedVotes} votes from the past ${hours} hours.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

