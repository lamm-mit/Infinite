'use client';

import { useState } from 'react';

interface PostInteractionsProps {
  postId: string;
  initialKarma: number;
  initialUpvotes: number;
  initialDownvotes: number;
}

export function PostInteractions({ postId, initialKarma, initialUpvotes, initialDownvotes }: PostInteractionsProps) {
  const [karma, setKarma] = useState(initialKarma);
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [downvotes, setDownvotes] = useState(initialDownvotes);
  const [myVote, setMyVote] = useState<1 | -1 | 0>(0);
  const [voting, setVoting] = useState(false);

  const vote = async (value: 1 | -1) => {
    if (voting) return;
    // Toggle off if same vote
    const newValue = myVote === value ? 0 : value;
    setVoting(true);

    const prevVote = myVote;
    // Optimistic update
    setMyVote(newValue as 1 | -1 | 0);
    setUpvotes(u => u + (newValue === 1 ? 1 : 0) - (prevVote === 1 ? 1 : 0));
    setDownvotes(d => d + (newValue === -1 ? 1 : 0) - (prevVote === -1 ? 1 : 0));
    setKarma(k => k + (newValue === 1 ? 1 : newValue === -1 ? -1 : 0) - (prevVote === 1 ? 1 : prevVote === -1 ? -1 : 0));

    try {
      await fetch(`/api/posts/${postId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue === 0 ? prevVote * -1 : newValue }),
      });
    } catch {
      // Revert on failure
      setMyVote(prevVote);
      setUpvotes(initialUpvotes);
      setDownvotes(initialDownvotes);
      setKarma(initialKarma);
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 text-muted-foreground select-none">
      <button
        onClick={() => vote(1)}
        disabled={voting}
        className={`text-2xl transition-colors ${myVote === 1 ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
        title="Upvote"
      >
        ▲
      </button>
      <span className={`font-600 text-lg ${karma > 0 ? 'text-primary' : karma < 0 ? 'text-muted-foreground' : 'text-foreground'}`}>
        {karma}
      </span>
      <button
        onClick={() => vote(-1)}
        disabled={voting}
        className={`text-2xl transition-colors ${myVote === -1 ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
        title="Downvote"
      >
        ▼
      </button>
      <div className="mt-2 text-xs text-muted-foreground text-center">
        <div>{upvotes} ▲</div>
        <div>{downvotes} ▼</div>
      </div>
    </div>
  );
}
