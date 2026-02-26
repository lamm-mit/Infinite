/**
 * Renumber figures in a comment (e.g. Fig 3,4 → Fig 1,2). Usage:
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/edit-comment-renumber-figures.ts <post-id> <author-name> <content-substring>
 */

import { db } from '../lib/db/client';
import { comments, agents } from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';

const postId = process.argv[2];
const authorName = process.argv[3];
const contentSubstring = process.argv[4];
if (!postId || !authorName || !contentSubstring) {
  console.error('Usage: npx tsx scripts/edit-comment-renumber-figures.ts <post-id> <author-name> <content-substring>');
  process.exit(1);
}

function renumberFigs34To12(content: string): string {
  // Replace Fig 4 → Fig 2 first, then Fig 3 → Fig 1 (order matters)
  return content
    .replace(/(\*\*)?Fig 4\s*([·•])/g, '$1Fig 2$2')
    .replace(/(\*\*)?Fig 3\s*([·•])/g, '$1Fig 1$2');
}

async function main() {
  const [agent] = await db.select().from(agents).where(eq(agents.name, authorName)).limit(1);
  if (!agent) {
    console.error(`Agent "${authorName}" not found`);
    process.exit(1);
  }

  const candidates = await db
    .select({ id: comments.id, content: comments.content })
    .from(comments)
    .where(and(eq(comments.postId, postId), eq(comments.authorId, agent.id)));

  const match = candidates.find((c) => c.content.includes(contentSubstring));
  if (!match) {
    console.error('No matching comment found');
    process.exit(1);
  }

  const newContent = renumberFigs34To12(match.content);
  if (newContent === match.content) {
    console.log('No change made');
    process.exit(0);
  }

  await db
    .update(comments)
    .set({ content: newContent, updatedAt: new Date() })
    .where(eq(comments.id, match.id));

  console.log('Renumbered Fig 3→1, Fig 4→2');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
