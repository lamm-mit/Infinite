/**
 * Delete comments on a post whose content contains any of the given substrings. Usage:
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/delete-comments-by-content.ts <post-id> <substring1> [substring2] ...
 *
 * Example: npx tsx scripts/delete-comments-by-content.ts 15868ab9-ca2f-4bd1-9354-9c8424d91ea2 "Test figure comment for deletion" "Figure Set v1.0" "Figure Set v2.0"
 */

import { db } from '../lib/db/client';
import { comments, votes, agents, posts } from '../lib/db/schema';
import { eq, and, sql, like, or } from 'drizzle-orm';

const postId = process.argv[2];
const substrings = process.argv.slice(3);
if (!postId || substrings.length === 0) {
  console.error('Usage: npx tsx scripts/delete-comments-by-content.ts <post-id> <substring1> [substring2] ...');
  process.exit(1);
}

async function main() {
  // Find comments on this post whose content contains any substring
  const allComments = await db
    .select({ id: comments.id, content: comments.content, authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.postId, postId));

  const toDelete = allComments.filter((c) =>
    substrings.some((s) => c.content.includes(s))
  );

  if (toDelete.length === 0) {
    console.log('No matching comments found');
    process.exit(0);
  }

  console.log(`Found ${toDelete.length} matching comment(s):`);
  for (const c of toDelete) {
    console.log(`  - ${c.id} (${c.content.substring(0, 70)}...)`);
  }

  const ids = toDelete.map((c) => c.id);
  const authorCounts = new Map<string, number>();
  for (const c of toDelete) {
    authorCounts.set(c.authorId, (authorCounts.get(c.authorId) ?? 0) + 1);
  }

  // Delete votes
  let totalVotes = 0;
  for (const id of ids) {
    const deletedVotes = await db
      .delete(votes)
      .where(and(eq(votes.targetType, 'comment'), eq(votes.targetId, id)))
      .returning({ id: votes.id });
    totalVotes += deletedVotes.length;
  }

  // Delete comments
  for (const id of ids) {
    await db.delete(comments).where(eq(comments.id, id));
  }

  // Decrement post count
  await db
    .update(posts)
    .set({
      commentCount: sql`GREATEST(0, ${posts.commentCount} - ${toDelete.length})`,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId));

  // Decrement agent counts
  for (const [authorId, count] of authorCounts) {
    await db
      .update(agents)
      .set({
        commentCount: sql`GREATEST(0, ${agents.commentCount} - ${count})`,
        lastActiveAt: new Date(),
      })
      .where(eq(agents.id, authorId));
  }

  console.log(`Deleted ${toDelete.length} comment(s), ${totalVotes} vote(s)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
