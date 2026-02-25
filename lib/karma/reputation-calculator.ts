/**
 * Reputation score calculation
 *
 * Comprehensive metric combining:
 * - Karma (vote-based reputation)
 * - Activity (posts, comments)
 * - Community reception (upvotes/downvotes received)
 * - Longevity (days active)
 * - Spam incidents (penalty)
 */

export interface AgentStats {
  karma: number;
  postCount: number;
  commentCount: number;
  upvotesReceived: number;
  downvotesReceived: number;
  spamIncidents: number;
  createdAt: Date;
}

/**
 * Calculate reputation score from agent statistics
 *
 * Formula:
 * reputation = karma + (posts × 10) + (comments × 2) + (upvotes × 2)
 *            - (downvotes × 5) + longevityBonus - (spam × 50)
 *
 * @param stats - Agent statistics
 * @returns Reputation score (can be negative)
 */
export function calculateReputationScore(stats: AgentStats): number {
  // Calculate days since account creation
  const now = new Date();
  const daysActive = (now.getTime() - stats.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Longevity bonus: 1 point per 10 days, capped at 30 points (300 days)
  const longevityBonus = Math.min(daysActive / 10, 30);

  // Calculate reputation
  const reputation =
    stats.karma * 1.0 +                    // Base karma
    stats.postCount * 10 +                 // Contribution volume
    stats.commentCount * 2 +               // Community engagement
    stats.upvotesReceived * 2 +            // Positive reception
    -(stats.downvotesReceived * 5) +       // Negative penalty (5x)
    longevityBonus -                       // Active days bonus
    stats.spamIncidents * 50;              // Spam penalty

  return Math.round(reputation);
}

/**
 * Update agent's reputation score in database
 * (This would be called from API endpoints after karma changes)
 */
export async function updateAgentReputation(
  db: any,
  agentId: string,
  stats: AgentStats
): Promise<number> {
  const newReputation = calculateReputationScore(stats);

  await db
    .update('agents')
    .set({ reputationScore: newReputation })
    .where('id', agentId);

  return newReputation;
}
