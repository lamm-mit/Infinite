/**
 * Karma calculation based on vote ratios
 *
 * Core principle: Posts/comments with high upvote ratios earn bonus karma,
 * while high downvote ratios reduce karma earned from all votes.
 */

export interface VoteData {
  upvotes: number;
  downvotes: number;
}

/**
 * Calculate karma multiplier based on upvote/downvote ratio
 *
 * @param upvotes - Current upvote count
 * @param downvotes - Current downvote count
 * @returns Multiplier between 0.0 (all downvotes) and 2.0 (all upvotes)
 *
 * Examples:
 * - 90% upvotes → 1.8x multiplier
 * - 50% upvotes → 1.0x multiplier (neutral)
 * - 10% upvotes → 0.2x multiplier
 */
export function calculateVoteRatioMultiplier(upvotes: number, downvotes: number): number {
  const totalVotes = upvotes + downvotes;

  // No votes yet, neutral multiplier
  if (totalVotes === 0) {
    return 1.0;
  }

  const upvoteRatio = upvotes / totalVotes;

  if (upvoteRatio >= 0.5) {
    // Positive correlation: more upvotes = more karma
    // Maps 0.5-1.0 ratio to 1.0-2.0x multiplier
    return 1.0 + (upvoteRatio - 0.5) * 2;
  } else {
    // Negative correlation: more downvotes = less karma
    // Maps 0.0-0.5 ratio to 0.0-1.0x multiplier
    return upvoteRatio * 2;
  }
}

/**
 * Calculate karma change for a new vote
 *
 * @param voteValue - 1 for upvote, -1 for downvote
 * @param currentUpvotes - Current upvote count (after the new vote)
 * @param currentDownvotes - Current downvote count (after the new vote)
 * @returns Karma change to apply to author
 */
export function calculateKarmaForVote(
  voteValue: number,
  currentUpvotes: number,
  currentDownvotes: number
): number {
  const multiplier = calculateVoteRatioMultiplier(currentUpvotes, currentDownvotes);
  return voteValue * multiplier;
}

/**
 * Calculate karma change when a vote is removed (unvote)
 *
 * @param originalVoteValue - Original vote value being removed (1 or -1)
 * @param upvotesAfterRemoval - Upvote count after removal
 * @param downvotesAfterRemoval - Downvote count after removal
 * @returns Negative karma change (to subtract from author)
 */
export function calculateKarmaForUnvote(
  originalVoteValue: number,
  upvotesAfterRemoval: number,
  downvotesAfterRemoval: number
): number {
  const multiplier = calculateVoteRatioMultiplier(upvotesAfterRemoval, downvotesAfterRemoval);
  return -(originalVoteValue * multiplier);
}

/**
 * Calculate karma change when a vote is changed (e.g., upvote → downvote)
 *
 * @param oldVoteValue - Previous vote value (1 or -1)
 * @param newVoteValue - New vote value (1 or -1)
 * @param currentUpvotes - Current upvote count (after the change)
 * @param currentDownvotes - Current downvote count (after the change)
 * @returns Net karma change to apply
 */
export function calculateKarmaForVoteChange(
  oldVoteValue: number,
  newVoteValue: number,
  currentUpvotes: number,
  currentDownvotes: number
): number {
  const multiplier = calculateVoteRatioMultiplier(currentUpvotes, currentDownvotes);
  const netChange = newVoteValue - oldVoteValue;
  return netChange * multiplier;
}
