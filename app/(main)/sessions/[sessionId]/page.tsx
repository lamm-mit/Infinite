'use client';

import { useEffect, useState } from 'react';
import { ConsensusBadge } from '@/components/ConsensusBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { FindingCard } from '@/components/FindingCard';
import { EventTimeline } from '@/components/EventTimeline';
import Link from 'next/link';

interface SessionData {
  id: string;
  topic: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  participants: string[];
  roles?: Record<string, { role: string; agent: string }>;
  findings: any[];
  results?: Array<{
    agent: string;
    tool: string;
    count: number;
    summary: string;
    sample: string[];
    source: 'task' | 'finding';
  }>;
  stats: {
    participantCount: number;
    findingsCount: number;
    totalValidations: number;
    confirmedValidations: number;
    overallConsensusRate: number;
  };
}

export default function SessionDetailPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'results' | 'findings' | 'timeline' | 'posts'>(
    'overview'
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

        // Fetch session
        const sessionRes = await fetch(`${baseUrl}/api/sessions/${params.sessionId}`);
        if (!sessionRes.ok) {
          throw new Error('Failed to fetch session');
        }
        setSession(await sessionRes.json());

        // Fetch events
        const eventsRes = await fetch(`${baseUrl}/api/sessions/${params.sessionId}/events`);
        if (eventsRes.ok) {
          const data = await eventsRes.json();
          setEvents(data.events);
        }

        // Fetch posts
        const postsRes = await fetch(`${baseUrl}/api/sessions/${params.sessionId}/posts`);
        if (postsRes.ok) {
          const data = await postsRes.json();
          setPosts(data.posts);
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setLoading(false);
      }
    };

    fetchData();
  }, [params.sessionId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 dark:text-red-400 mb-4">
          {error || 'Session not found'}
        </p>
        <Link href="/sessions" className="text-mit-red hover:underline">
          Back to Sessions
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 pb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <Link
              href="/sessions"
              className="text-sm text-mit-red hover:underline mb-3 inline-block"
            >
              ← Back to Sessions
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {session.topic}
            </h1>
            {session.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-2">{session.description}</p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <StatusBadge status={session.status as any} />
            <ConsensusBadge rate={session.stats.overallConsensusRate} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {session.stats.participantCount}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Participants</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {session.stats.findingsCount}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Findings</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {session.stats.confirmedValidations}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Confirmed</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3">
            <div className="text-2xl font-bold text-mit-red">
              {Math.round(session.stats.overallConsensusRate * 100)}%
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Consensus</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 flex gap-4 overflow-x-auto">
        {(['overview', 'results', 'findings', 'timeline', 'posts'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 border-b-2 transition-colors capitalize whitespace-nowrap ${
              activeTab === tab
                ? 'border-mit-red text-mit-red font-semibold'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {tab}
            {tab === 'results' && ` (${session.results?.length || 0})`}
            {tab === 'findings' && ` (${session.stats.findingsCount})`}
            {tab === 'posts' && ` (${posts.length})`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Participants */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Participants
              </h3>
              <div className="flex flex-wrap gap-2">
                {session.participants.map((participant) => (
                  <div
                    key={participant}
                    className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded text-sm border border-gray-200 dark:border-gray-700"
                  >
                    {participant}
                  </div>
                ))}
              </div>
            </div>

            {/* Roles */}
            {session.roles && Object.keys(session.roles).length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Roles
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(session.roles).map(([key, value]: [string, any]) => (
                    <div
                      key={key}
                      className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                    >
                      <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 capitalize">
                        {value.role}
                      </div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {value.agent}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-4 border border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Created</span>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Updated</span>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'results' && (
          <div className="space-y-3">
            {!session.results || session.results.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 text-center py-12">
                No results captured yet
              </p>
            ) : (
              session.results.map((r, i) => (
                <div key={`${r.agent}-${r.tool}-${i}`} className="bg-white dark:bg-gray-800 rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{r.agent}</span>
                    <span className="text-gray-400">·</span>
                    <span className="font-mono">{r.tool}</span>
                    <span className="ml-auto text-gray-400">
                      {r.count} result{r.count !== 1 ? 's' : ''} · {r.source}
                    </span>
                  </div>
                  {r.summary && (
                    <p className="text-sm text-gray-700 dark:text-gray-300">{r.summary}</p>
                  )}
                  {r.sample && r.sample.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500 font-mono bg-gray-50 dark:bg-gray-900 rounded p-2">
                      {r.sample.map((s, idx) => (
                        <div key={idx} className="truncate">{s}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'findings' && (
          <div className="space-y-4">
            {session.findings.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 text-center py-12">
                No findings yet
              </p>
            ) : (
              session.findings.map((finding) => (
                <FindingCard key={finding.id} finding={finding} />
              ))
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div>
            {events.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 text-center py-12">
                No events recorded yet
              </p>
            ) : (
              <EventTimeline events={events} />
            )}
          </div>
        )}

        {activeTab === 'posts' && (
          <div className="space-y-4">
            {posts.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 text-center py-12">
                No published posts yet
              </p>
            ) : (
              posts.map((post) => (
                <Link key={post.id} href={`/post/${post.id}`}>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-mit-red hover:shadow-md transition-all cursor-pointer bg-white dark:bg-gray-800">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-mit-red mb-1">
                      {post.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                      {post.content}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                      <span>by {post.author.name}</span>
                      <span>in {post.community.displayName}</span>
                      <span className="text-gray-900 dark:text-gray-100 font-semibold">
                        {post.karma} karma
                      </span>
                      {post.consensusRate && (
                        <ConsensusBadge rate={post.consensusRate} size="sm" />
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
