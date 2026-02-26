'use client';

import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { CommentsSection } from './CommentsSection';

export interface CommentData {
  id: string;
  authorName: string;
  content: string;
  karma: number;
  createdAt: string;
  replies: CommentData[];
  depth: number;
  parentId?: string | null;
}

interface DiscussionContextValue {
  comments: CommentData[];
  isLoading: boolean;
  error: string | null;
  commentCount: number;
  postId: string;
  onCommentAdded: () => void;
}

export const DiscussionContext = createContext<DiscussionContextValue | null>(null);

export function useDiscussion() {
  const ctx = useContext(DiscussionContext);
  if (!ctx) throw new Error('useDiscussion must be used inside DiscussionSection');
  return ctx;
}

type Mode = 'comments' | 'graph';

interface DiscussionSectionProps {
  postId: string;
  initialCount: number;
}

export function DiscussionSection({ postId, initialCount }: DiscussionSectionProps) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(initialCount);
  const [mode, setMode] = useState<Mode>('comments');

  // Lazy-load DiscussionGraph to allow graceful fallback if D3 fails
  const [GraphComponent, setGraphComponent] = useState<React.ComponentType<{ postId: string }> | null>(null);
  const [graphLoadFailed, setGraphLoadFailed] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/posts/${postId}/comments`);
      if (!response.ok) throw new Error('Failed to load comments');
      const data = await response.json();
      setComments(data.comments);
      setCommentCount(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchComments();
    const interval = setInterval(fetchComments, 10000);
    return () => clearInterval(interval);
  }, [fetchComments]);

  // Lazily import DiscussionGraph when switching to graph mode
  useEffect(() => {
    if (mode === 'graph' && !GraphComponent && !graphLoadFailed) {
      import('./DiscussionGraph')
        .then((mod) => setGraphComponent(() => mod.DiscussionGraph))
        .catch(() => {
          setGraphLoadFailed(true);
          setMode('comments');
        });
    }
  }, [mode, GraphComponent, graphLoadFailed]);

  const showToggle = commentCount > 0 && !graphLoadFailed;

  const ctx: DiscussionContextValue = {
    comments,
    isLoading,
    error,
    commentCount,
    postId,
    onCommentAdded: fetchComments,
  };

  return (
    <DiscussionContext.Provider value={ctx}>
      <div className="mt-6">
        {showToggle && (
          <div className="flex justify-end mb-3">
            <div className="inline-flex rounded-full border border-gray-300 dark:border-gray-600 overflow-hidden text-sm font-medium">
              <button
                onClick={() => setMode('comments')}
                className={`px-4 py-1.5 transition-colors ${
                  mode === 'comments'
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Comments
              </button>
              <button
                onClick={() => setMode('graph')}
                className={`px-4 py-1.5 transition-colors ${
                  mode === 'graph'
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Graph
              </button>
            </div>
          </div>
        )}

        {mode === 'comments' && <CommentsSection />}
        {mode === 'graph' && GraphComponent && <GraphComponent postId={postId} />}
      </div>
    </DiscussionContext.Provider>
  );
}
