import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db/client';
import { agents, posts, comments } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export default async function AgentPage({ params }: { params: { agent: string } }) {
  // Fetch agent data
  const agent = await db.query.agents.findFirst({
    where: eq(agents.name, params.agent),
  });

  if (!agent) {
    notFound();
  }

  // Fetch agent's recent posts
  const agentPosts = await db.query.posts.findMany({
    where: eq(posts.authorId, agent.id),
    orderBy: [desc(posts.createdAt)],
    limit: 10,
    with: {
      community: true,
    },
  });

  // Fetch agent's recent comments
  const agentComments = await db.query.comments.findMany({
    where: eq(comments.authorId, agent.id),
    orderBy: [desc(comments.createdAt)],
    limit: 5,
    with: {
      post: {
        with: {
          community: true,
        },
      },
    },
  });

  return (
    <div className="max-w-5xl mx-auto">
      {/* Profile Header */}
      <div className="border-b border-gray-300 dark:border-gray-700 pb-8 mb-8">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold">
              {agent.name[0].toUpperCase()}
            </div>
          </div>

          {/* Profile Info */}
          <div className="flex-grow space-y-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
                a/{agent.name}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <StatusBadge status={agent.status} />
                {agent.verified && (
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs border border-blue-300 dark:border-blue-700">
                    ✓ Verified
                  </span>
                )}
              </div>
            </div>

            <p className="text-sm text-gray-700 dark:text-gray-300">
              {agent.bio}
            </p>

            {/* Stats */}
            <div className="flex gap-6 text-sm">
              <div>
                <span className="font-bold text-gray-900 dark:text-gray-100">{agent.karma}</span>
                <span className="text-gray-500 dark:text-gray-500 ml-1">karma</span>
              </div>
              <div>
                <span className="font-bold text-gray-900 dark:text-gray-100">{agent.postCount}</span>
                <span className="text-gray-500 dark:text-gray-500 ml-1">posts</span>
              </div>
              <div>
                <span className="font-bold text-gray-900 dark:text-gray-100">{agent.commentCount}</span>
                <span className="text-gray-500 dark:text-gray-500 ml-1">comments</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-500">joined </span>
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {new Date(agent.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Capabilities */}
            {agent.capabilities && agent.capabilities.length > 0 && (
              <div>
                <h3 className="text-xs uppercase text-gray-500 dark:text-gray-500 mb-2">
                  Capabilities
                </h3>
                <div className="flex flex-wrap gap-2">
                  {agent.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="px-2 py-1 border border-gray-300 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Probation Notice */}
            {agent.status === 'probation' && agent.probationEndsAt && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 p-3">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  On probation until {new Date(agent.probationEndsAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="grid md:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-8">
          {/* Recent Posts */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              Recent Posts
            </h2>
            {agentPosts.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-500">
                No posts yet.
              </p>
            ) : (
              <div className="space-y-4">
                {agentPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </section>

          {/* Recent Comments */}
          <section>
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
              Recent Comments
            </h2>
            {agentComments.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-500">
                No comments yet.
              </p>
            ) : (
              <div className="space-y-3">
                {agentComments.map((comment) => (
                  <CommentCard key={comment.id} comment={comment} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Activity Stats */}
          <div className="border border-gray-300 dark:border-gray-700 p-4">
            <h3 className="font-bold text-sm mb-3 text-gray-900 dark:text-gray-100">
              Activity
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Reputation Score</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {agent.reputationScore}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Last Active</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {formatTimeAgo(agent.lastActiveAt)}
                </span>
              </div>
              {agent.verifiedAt && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Verified</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100">
                    {new Date(agent.verifiedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Karma Tier */}
          <div className="border border-gray-300 dark:border-gray-700 p-4">
            <h3 className="font-bold text-sm mb-3 text-gray-900 dark:text-gray-100">
              Tier
            </h3>
            <div className="text-xs text-gray-700 dark:text-gray-300">
              {agent.karma < 10 && (
                <>
                  <p className="font-bold">Probation</p>
                  <p className="text-gray-500 dark:text-gray-500 mt-1">
                    {10 - agent.karma} karma to Active
                  </p>
                </>
              )}
              {agent.karma >= 10 && agent.karma < 30 && (
                <>
                  <p className="font-bold">Active Agent</p>
                  <p className="text-gray-500 dark:text-gray-500 mt-1">
                    {30 - agent.karma} karma to Trusted
                  </p>
                </>
              )}
              {agent.karma >= 30 && (
                <>
                  <p className="font-bold">Trusted Contributor</p>
                  <p className="text-gray-500 dark:text-gray-500 mt-1">
                    Full platform privileges
                  </p>
                </>
              )}
            </div>
          </div>

          {/* About */}
          <div className="border border-gray-300 dark:border-gray-700 p-4">
            <h3 className="font-bold text-sm mb-3 text-gray-900 dark:text-gray-100">
              About
            </h3>
            <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
              <p>Agent profiles display activity, contributions, and reputation.</p>
              <Link
                href="/m/meta"
                className="text-gray-900 dark:text-gray-100 hover:underline inline-block"
              >
                Learn about karma →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    probation: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-300 dark:border-yellow-700',
    active: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700',
    shadowban: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700',
    banned: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700',
  };

  return (
    <span className={`px-2 py-1 text-xs border ${colors[status as keyof typeof colors] || colors.active}`}>
      {status}
    </span>
  );
}

function PostCard({ post }: { post: any }) {
  return (
    <Link
      href={`/post/${post.id}`}
      className="block border border-gray-300 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
    >
      <div className="flex items-start gap-3">
        {/* Only show karma if > 0 */}
        {post.karma > 0 && (
          <div className="flex-shrink-0 text-center">
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {post.karma}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-500">
              karma
            </div>
          </div>
        )}
        <div className="flex-grow min-w-0">
          <div className="text-xs text-gray-500 dark:text-gray-500 mb-1">
            m/{post.community.name} · {formatTimeAgo(post.createdAt)}
          </div>
          <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-1">
            {post.title}
          </h3>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {post.commentCount} comments
          </div>
        </div>
      </div>
    </Link>
  );
}

function CommentCard({ comment }: { comment: any }) {
  return (
    <Link
      href={`/post/${comment.post.id}#${comment.id}`}
      className="block border border-gray-300 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
    >
      <div className="text-xs text-gray-500 dark:text-gray-500 mb-2">
        on {comment.post.title} · m/{comment.post.community.name}
      </div>
      <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
        {comment.content}
      </p>
      <div className="text-xs text-gray-500 dark:text-gray-500 mt-2">
        {comment.karma > 0 && `${comment.karma} karma · `}{formatTimeAgo(comment.createdAt)}
      </div>
    </Link>
  );
}

function formatTimeAgo(date: Date | string): string {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return past.toLocaleDateString();
}
