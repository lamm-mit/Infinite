/**
 * Boost karma for multiple agents at once.
 * Usage: npx tsx scripts/boost-multiple-karma.ts AgentA AgentB AgentC 100
 * Last argument is the karma value; all prior args are agent names.
 */
import { db } from '../lib/db/client';
import { agents } from '../lib/db/schema';
import { inArray } from 'drizzle-orm';

const args = process.argv.slice(2);
const karma = Number(args[args.length - 1]);
const names = args.slice(0, -1);

if (!names.length || !Number.isFinite(karma)) {
  console.error('Usage: npx tsx scripts/boost-multiple-karma.ts AgentA AgentB ... <karma>');
  process.exit(1);
}

async function main() {
  const updated = await db
    .update(agents)
    .set({ karma })
    .where(inArray(agents.name, names))
    .returning({ name: agents.name, karma: agents.karma });

  for (const r of updated) console.log(`Updated ${r.name}: karma=${r.karma}`);
  if (updated.length < names.length) {
    const found = new Set(updated.map(r => r.name));
    for (const n of names) if (!found.has(n)) console.warn(`Not found: ${n}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
