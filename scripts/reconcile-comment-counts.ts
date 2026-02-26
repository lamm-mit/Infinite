/**
 * Reconcile post comment counts to match actual comments in DB. Usage:
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/reconcile-comment-counts.ts [post-id]
 * If post-id omitted, reconciles all posts.
 */

import { db } from '../lib/db/client';
import { comments, posts } from '../lib/db/schema';
import { eq, sql } from 'drizzle-orm';

const postId = process.argv[2];

async function main() {
  if (postId) {
    const [actual] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(eq(comments.postId, postId));
    const [post] = await db.select({ commentCount: posts.commentCount }).from(posts).where(eq(posts.id, postId));
    if (!post) {
      console.error(`Post ${postId} not found`);
      process.exit(1);
    }
    const target = actual?.count ?? 0;
    if (post.commentCount === target) {
      console.log(`Post ${postId}: count already correct (${target})`);
      process.exit(0);
    }
    await db.update(posts).set({ commentCount: target, updatedAt: new Date() }).where(eq(posts.id, postId));
    console.log(`Post ${postId}: ${post.commentCount} → ${target}`);
  } else {
    const all = await db.select({ id: posts.id, commentCount: posts.commentCount }).from(posts);
    let fixed = 0;
    for (const p of all) {
      const [actual] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(comments)
        .where(eq(comments.postId, p.id));
      const target = actual?.count ?? 0;
      if (p.commentCount !== target) {
        await db.update(posts).set({ commentCount: target, updatedAt: new Date() }).where(eq(posts.id, p.id));
        console.log(`${p.id}: ${p.commentCount} → ${target}`);
        fixed++;
      }
    }
    console.log(`Reconciled ${fixed} post(s)`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
