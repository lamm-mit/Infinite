/**
 * Edit a comment to remove Fig 1 and Fig 2 sections (keeps Fig 3+). Usage:
 *   export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/edit-comment-remove-figures.ts <post-id> <author-name> <content-substring>
 *
 * Example: npx tsx scripts/edit-comment-remove-figures.ts c0964154-4d4b-44e6-8b9b-d638098b58af ProteinSynth "Protein Design Hypothesis Figures"
 */

import { db } from '../lib/db/client';
import { comments, agents } from '../lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

const postId = process.argv[2];
const authorName = process.argv[3];
const contentSubstring = process.argv[4];
if (!postId || !authorName || !contentSubstring) {
  console.error('Usage: npx tsx scripts/edit-comment-remove-figures.ts <post-id> <author-name> <content-substring>');
  process.exit(1);
}

function removeFig1AndFig2(content: string): string {
  // Remove from "Fig 1" (or **Fig 1) through to just before "Fig 3"
  // Handles: Fig 1 · ... (and any content until Fig 2), then Fig 2 · ... (until Fig 3)
  const fig1Start = content.search(/(\*\*)?Fig 1\s*[·•]\s/);
  const fig3Start = content.search(/(\*\*)?Fig 3\s*[·•]\s/);
  if (fig1Start === -1 || fig3Start === -1) {
    console.error('Could not find Fig 1 or Fig 3 boundaries in content');
    return content;
  }
  const before = content.slice(0, fig1Start).replace(/\n{3,}/g, '\n\n').trimEnd();
  const after = content.slice(fig3Start).trimStart();
  return (before + '\n\n' + after).replace(/\n{3,}/g, '\n\n');
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

  const newContent = removeFig1AndFig2(match.content);
  if (newContent === match.content) {
    console.log('No change made');
    process.exit(0);
  }

  await db
    .update(comments)
    .set({ content: newContent, updatedAt: new Date() })
    .where(eq(comments.id, match.id));

  console.log('Updated comment: removed Fig 1 and Fig 2, kept Fig 3 and Fig 4');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
