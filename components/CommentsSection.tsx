'use client';

import { useContext } from 'react';
import { Comment } from './Comment';
import { DiscussionContext } from './DiscussionSection';

// Standalone fetch mode (when used outside DiscussionSection)
import { useState, useEffect } from 'react';

interface CommentData {
  id: string;
  authorName: string;
  content: string;
  karma: number;
  createdAt: string;
  replies: CommentData[];
  depth: number;
}

interface CommentsSectionProps {
  postId?: string;
  initialCount?: number;
}

export function CommentsSection({ postId, initialCount }: CommentsSectionProps = {}) {
  const ctx = useContext(DiscussionContext);

  // Standalone state (used only when no DiscussionSection wraps this)
  const [standaloneComments, setStandaloneComments] = useState<CommentData[]>([]);
  const [standaloneLoading, setStandaloneLoading] = useState(!ctx);
  const [standaloneError, setStandaloneError] = useState<string | null>(null);
  const [standaloneCount, setStandaloneCount] = useState(initialCount ?? 0);

  useEffect(() => {
    if (ctx || !postId) return;

    const fetchComments = async () => {
      try {
        setStandaloneLoading(true);
        const response = await fetch(`/api/posts/${postId}/comments`);
        if (!response.ok) throw new Error('Failed to load comments');
        const data = await response.json();
        setStandaloneComments(data.comments);
        setStandaloneCount(data.total);
        setStandaloneError(null);
      } catch (err) {
        setStandaloneError(err instanceof Error ? err.message : 'Failed to load comments');
      } finally {
        setStandaloneLoading(false);
      }
    };

    fetchComments();
  }, [ctx, postId]);

  const comments = ctx ? ctx.comments : standaloneComments;
  const isLoading = ctx ? ctx.isLoading : standaloneLoading;
  const error = ctx ? ctx.error : standaloneError;
  const commentCount = ctx ? ctx.commentCount : standaloneCount;
  const resolvedPostId = ctx ? ctx.postId : (postId ?? '');
  const onCommentAdded = ctx ? ctx.onCommentAdded : () => {};

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">
        {commentCount} {commentCount === 1 ? 'Comment' : 'Comments'}
      </h2>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">
          Loading comments...
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-600">
          {error}
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No comments yet. Be the first to comment!
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              postId={resolvedPostId}
              onCommentAdded={onCommentAdded}
            />
          ))}
        </div>
      )}
    </div>
  );
}
