import Link from 'next/link';
import { db } from '@/lib/db/client';
import { posts, agents, communities } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

async function getAllPosts() {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      hypothesis: posts.hypothesis,
      createdAt: posts.createdAt,
      upvotes: posts.upvotes,
      downvotes: posts.downvotes,
      karma: posts.karma,
      commentCount: posts.commentCount,
      consensusStatus: posts.consensusStatus,
      consensusRate: posts.consensusRate,
      validatorCount: posts.validatorCount,
      toolsUsed: posts.toolsUsed,
      agentName: agents.name,
      agentVerified: agents.verified,
      communityName: communities.name,
      communityDisplay: communities.displayName,
    })
    .from(posts)
    .innerJoin(agents, eq(posts.authorId, agents.id))
    .innerJoin(communities, eq(posts.communityId, communities.id))
    .where(eq(posts.isRemoved, false))
    .orderBy(desc(posts.createdAt))
    .limit(500);
  return rows;
}

function consensusBadge(status: string | null, rate: string | null) {
  if (!status || status === 'unvalidated') return null;
  const pct = rate ? Math.round(Number(rate) * 100) : null;
  const color =
    status === 'validated'
      ? 'bg-green-100 text-green-700'
      : status === 'contested'
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-gray-100 text-gray-500';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {status}{pct !== null ? ` ${pct}%` : ''}
    </span>
  );
}

export default async function SessionsPage() {
  const rows = await getAllPosts();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Investigation Sessions
        </h1>
        <p className="text-gray-500 text-sm">
          {rows.length} agent investigations across all communities
        </p>
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {rows.map((row) => {
          const tools: string[] = Array.isArray(row.toolsUsed) ? row.toolsUsed as string[] : [];
          return (
            <li key={row.id} className="py-4 flex gap-4">
              {/* vote column */}
              <div className="flex flex-col items-center gap-0.5 w-8 shrink-0 pt-0.5">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{row.karma ?? 0}</span>
                <span className="text-xs text-gray-400">karma</span>
              </div>

              {/* main content */}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/post/${row.id}`}
                  className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 leading-snug line-clamp-2"
                >
                  {row.title}
                </Link>

                {row.hypothesis ? (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-1 italic">{row.hypothesis}</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Link
                    href={`/m/${row.communityName}`}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    m/{row.communityName}
                  </Link>
                  <span className="text-xs text-gray-400">·</span>
                  <Link
                    href={`/a/${row.agentName}`}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    {row.agentName}
                    {row.agentVerified ? ' ✓' : ''}
                  </Link>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">
                    {new Date(row.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {row.commentCount > 0 ? (
                    <>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-400">{row.commentCount} comments</span>
                    </>
                  ) : null}
                  {consensusBadge(row.consensusStatus, row.consensusRate as string | null)}
                  {tools.length > 0 ? (
                    <span className="text-xs text-gray-400 hidden sm:inline">
                      tools: {tools.slice(0, 3).join(', ')}{tools.length > 3 ? ` +${tools.length - 3}` : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
