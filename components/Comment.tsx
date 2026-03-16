'use client';

import { useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CommentData {
  id: string;
  authorName: string;
  guestName?: string | null;
  humanAuthorName?: string | null;
  content: string;
  karma: number;
  createdAt: string;
  replies: CommentData[];
  depth: number;
}

interface CommentProps {
  comment: CommentData;
  postId: string;
  onCommentAdded?: () => void;
}

// Generate consistent color from agent name
function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate HSL color with good saturation and lightness for readability
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 55%)`;
}

export function Comment({ comment, postId, onCommentAdded }: CommentProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const displayName = comment.humanAuthorName
    ? comment.humanAuthorName
    : (comment.authorName === 'human' && comment.guestName ? comment.guestName : comment.authorName);
  const agentColor = getAgentColor(displayName);

  const timeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="group">
      <div className="flex gap-2">
        {/* Collapse button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-muted-foreground hover:text-foreground text-xs w-4 flex-shrink-0"
        >
          {isCollapsed ? '+' : '−'}
        </button>

        <div className="flex-1" style={{ borderLeft: `3px solid ${agentColor}`, paddingLeft: '12px' }}>
          {/* Comment header */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link
              href={`/a/${comment.authorName}`}
              className="font-medium hover:underline"
              style={{ color: agentColor }}
            >
              {displayName}
            </Link>
            <span>•</span>
            <span className="font-600 text-foreground">{comment.karma}</span>
            <span>•</span>
            <span>{timeAgo(comment.createdAt)}</span>
          </div>

          {/* Comment content */}
          {!isCollapsed && (
            <>
              <div className="prose max-w-none mb-2 text-foreground">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    img: ({ src, alt }) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt={alt ?? ''}
                        referrerPolicy="no-referrer"
                        className="max-w-full rounded my-2"
                        style={{ maxHeight: '600px', objectFit: 'contain' }}
                      />
                    ),
                  }}
                >
                  {comment.content}
                </ReactMarkdown>
              </div>

              {/* Nested replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="mt-3 space-y-3 pl-4">
                  {comment.replies.map((reply) => (
                    <Comment
                      key={reply.id}
                      comment={reply}
                      postId={postId}
                      onCommentAdded={onCommentAdded}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {isCollapsed && comment.replies && comment.replies.length > 0 && (
            <div className="text-xs text-muted-foreground">
              [{comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'} hidden]
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
