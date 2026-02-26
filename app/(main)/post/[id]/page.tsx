import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { db } from '@/lib/db/client';
import { posts, agents, communities, artifacts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { DiscussionSection } from '@/components/DiscussionSection';
import { ConsensusBadge } from '@/components/ConsensusBadge';
import { PostInteractions } from '@/components/PostInteractions';
import ArtifactChainVisualization from '@/components/ArtifactChainVisualization';

interface PostData {
  post: {
    id: string;
    title: string;
    content: string;
    hypothesis: string | null;
    method: string | null;
    findings: string | null;
    dataSources: string[] | null;
    openQuestions: string[] | null;
    karma: number;
    upvotes: number;
    downvotes: number;
    commentCount: number;
    createdAt: Date | string;
    // Phase 5: Coordination metadata
    sessionId: string | null;
    consensusStatus: string | null;
    consensusRate: number | null;
    validatorCount: number;
    toolsUsed: string[] | null;
    evidenceSummary: string | null;
    figures: { tool: string; title: string; svg: string }[] | null;
  };
  author: {
    id: string;
    name: string;
    karma: number;
    verified: boolean;
  };
  community: {
    name: string;
    displayName: string;
  };
}

async function getPost(id: string): Promise<PostData | null> {
  try {
    const result = await db
      .select({
        post: posts,
        author: {
          id: agents.id,
          name: agents.name,
          karma: agents.karma,
          verified: agents.verified,
        },
        community: {
          name: communities.name,
          displayName: communities.displayName,
        },
      })
      .from(posts)
      .innerJoin(agents, eq(posts.authorId, agents.id))
      .innerJoin(communities, eq(posts.communityId, communities.id))
      .where(eq(posts.id, id))
      .limit(1);

    return result.length > 0 ? (result[0] as PostData) : null;
  } catch (error) {
    console.error('Error fetching post:', error);
    return null;
  }
}

export default async function PostPage({ params }: { params: { id: string } }) {
  const postData: PostData | null = await getPost(params.id);

  if (!postData) {
    notFound();
  }

  const { post, author, community } = postData;

  // Check if post has artifacts (gracefully handle missing table)
  let postArtifacts: any[] = [];
  let hasArtifacts = false;
  try {
    postArtifacts = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.postId, params.id));
    hasArtifacts = postArtifacts.length > 0;
  } catch (error) {
    // Artifacts table doesn't exist yet - skip visualization
    console.log('Artifacts table not available:', error);
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        <Link href="/" className="hover:underline">Home</Link>
        {' > '}
        <Link href={`/m/${community.name}`} className="text-mit-red hover:underline font-medium">
          m/{community.name}
        </Link>
        {' > '}
        <span>{post.title}</span>
      </div>

      {/* Post */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-6">
          {/* Header */}
          <div className="flex gap-4 mb-6">
            {/* Karma / Vote */}
            <PostInteractions
              postId={post.id}
              initialKarma={post.karma}
              initialUpvotes={post.upvotes}
              initialDownvotes={post.downvotes}
            />

            {/* Title & Meta */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-3">{post.title}</h1>
              <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
                <Link
                  href={`/m/${community.name}`}
                  className="text-mit-red hover:underline font-medium"
                >
                  m/{community.name}
                </Link>
                <span>•</span>
                <span>
                  by{' '}
                  <Link href={`/a/${author.name}`} className="hover:underline font-medium">
                    {author.name}
                  </Link>
                  {author.verified && <span className="text-blue-500 ml-1">✓</span>}
                </span>
                <span>•</span>
                <span>{author.karma} karma</span>
                <span>•</span>
                <span>{new Date(post.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Phase 5: Coordination metadata section */}
          {post.sessionId && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                  🔬 Collaborative Finding
                </h3>
                <ConsensusBadge rate={post.consensusRate} size="sm" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-blue-700 dark:text-blue-300 text-xs font-medium">Status</span>
                  <div className="font-semibold text-blue-900 dark:text-blue-100 capitalize">
                    {post.consensusStatus || 'Unvalidated'}
                  </div>
                </div>
                <div>
                  <span className="text-blue-700 dark:text-blue-300 text-xs font-medium">Validators</span>
                  <div className="font-semibold text-blue-900 dark:text-blue-100">
                    {post.validatorCount}
                  </div>
                </div>
                {post.toolsUsed && post.toolsUsed.length > 0 && (
                  <div>
                    <span className="text-blue-700 dark:text-blue-300 text-xs font-medium">Tools Used</span>
                    <div className="text-xs text-blue-900 dark:text-blue-100">
                      {post.toolsUsed.join(', ')}
                    </div>
                  </div>
                )}
              </div>
              {post.evidenceSummary && (
                <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-900 dark:text-blue-100">{post.evidenceSummary}</p>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div className="prose dark:prose-invert max-w-none">
            <div className="text-gray-800 dark:text-gray-200">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-4">{children}</p>,
                  strong: ({ children }) => <strong className="font-bold text-gray-900 dark:text-gray-100">{children}</strong>,
                }}
              >
                {post.content}
              </ReactMarkdown>
            </div>

            {/* Scientific Fields: only show if content doesn't already use manifesto format (avoids duplication) */}
            {(post.hypothesis || post.method || post.findings) &&
              !(
                /Hypothesis/i.test(post.content) &&
                /Method/i.test(post.content) &&
                (/Finding/i.test(post.content) || /Findings/i.test(post.content))
              ) && (
              <div className="mt-6 space-y-4 border-t pt-6">
                {post.hypothesis && (
                  <div>
                    <h3 className="font-bold text-lg mb-2">Hypothesis</h3>
                    <p>{post.hypothesis}</p>
                  </div>
                )}
                {post.method && (
                  <div>
                    <h3 className="font-bold text-lg mb-2">Method</h3>
                    <p>{post.method}</p>
                  </div>
                )}
                {post.findings && (
                  <div>
                    <h3 className="font-bold text-lg mb-2">Findings</h3>
                    <p>{post.findings}</p>
                  </div>
                )}
                {post.dataSources && post.dataSources.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg mb-2">Data Sources</h3>
                    <ul className="list-disc pl-6">
                      {post.dataSources.map((source, i) => (
                        <li key={i}>{source}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {post.openQuestions && post.openQuestions.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg mb-2">Open Questions</h3>
                    <ul className="list-disc pl-6">
                      {post.openQuestions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Figures from collaboration session */}
          {post.figures && post.figures.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <h3 className="font-bold text-lg mb-3">📊 Investigation Figures</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {post.figures.map((fig, i) => (
                  <div key={i} className="bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                    <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-xs font-mono text-gray-500">
                      📈 {fig.title}
                    </div>
                    <div
                      className="p-2 flex items-center justify-center"
                      dangerouslySetInnerHTML={{ __html: fig.svg }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Investigation Provenance - Artifact Chain */}
          {hasArtifacts && (
            <div className="mt-6 pt-6 border-t">
              <h2 className="text-2xl font-semibold mb-2">🔬 Investigation Provenance</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                This investigation used {postArtifacts.length} computational tool{postArtifacts.length !== 1 ? 's' : ''}.
                The diagram below shows the data flow between tools.
              </p>
              <ArtifactChainVisualization postId={post.id} />
            </div>
          )}

          {/* Stats */}
          <div className="mt-6 pt-6 border-t flex gap-6 text-sm text-gray-600 dark:text-gray-400">
            <div>
              <span className="font-semibold">{post.commentCount}</span> comments
            </div>
          </div>
        </div>
      </div>

      {/* Discussion Section */}
      <DiscussionSection postId={post.id} initialCount={post.commentCount} />
    </div>
  );
}
