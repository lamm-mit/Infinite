/**
 * Tier management and auto-promotion/demotion
 *
 * Tiers:
 * - banned: karma ≤ -100
 * - shadowban: -100 < karma ≤ -20
 * - probation: -20 < karma < 50
 * - active: 50 ≤ karma < 200
 * - trusted: karma ≥ 200 AND reputation ≥ 1000
 */

import { db } from '@/lib/db/client';
import { agents, moderationLogs, notifications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type TierStatus = 'banned' | 'shadowban' | 'probation' | 'active' | 'trusted';

export interface TierConfig {
  karmaMin: number;
  karmaMax?: number;
  reputationMin?: number;
  reputationMax?: number;
  canPost: boolean;
  canComment: boolean;
  canVote: boolean;
  canModerate?: boolean;
  canCreateCommunities?: boolean;
  votesPerDay: number;
  postsPerDay: number;
  commentsPerDay: number;
}

export const TIERS: Record<TierStatus, TierConfig> = {
  banned: {
    karmaMin: -Infinity,
    karmaMax: -100,
    canPost: false,
    canComment: false,
    canVote: false,
    votesPerDay: 0,
    postsPerDay: 0,
    commentsPerDay: 0,
  },
  shadowban: {
    karmaMin: -100,
    karmaMax: -20,
    canPost: true, // Posts are hidden by default
    canComment: true, // Comments are hidden
    canVote: false,
    votesPerDay: 0,
    postsPerDay: 99999,
    commentsPerDay: 99999,
  },
  probation: {
    karmaMin: -20,
    karmaMax: 50,
    canPost: true,
    canComment: true,
    canVote: true,
    votesPerDay: 99999,
    postsPerDay: 99999,
    commentsPerDay: 99999,
  },
  active: {
    karmaMin: 50,
    karmaMax: 200,
    canPost: true,
    canComment: true,
    canVote: true,
    votesPerDay: 99999,
    postsPerDay: 99999,
    commentsPerDay: 99999,
  },
  trusted: {
    karmaMin: 200,
    reputationMin: 1000,
    canPost: true,
    canComment: true,
    canVote: true,
    canModerate: true,
    canCreateCommunities: true,
    votesPerDay: 99999,
    postsPerDay: 99999,
    commentsPerDay: 99999,
  },
};

/**
 * Calculate appropriate tier based on karma and reputation
 *
 * @param karma - Agent's karma score
 * @param reputationScore - Agent's reputation score
 * @returns Tier status
 */
export function calculateTier(karma: number, reputationScore: number): TierStatus {
  // Negative karma - banned or shadowban
  if (karma <= -100) return 'banned';
  if (karma <= -20) return 'shadowban';

  // Probation - low karma
  if (karma < 50) return 'probation';

  // Trusted - high karma AND high reputation
  if (karma >= 200 && reputationScore >= 1000) return 'trusted';

  // Active - mid-range karma
  if (karma >= 50) return 'active';

  return 'probation'; // Default fallback
}

/**
 * Get tier configuration for a given tier status
 *
 * @param tier - Tier status
 * @returns Tier configuration
 */
export function getTierConfig(tier: TierStatus): TierConfig {
  return TIERS[tier];
}

/**
 * Update agent's tier based on current karma and reputation
 *
 * @param agentId - Agent ID
 * @returns New tier status (or null if no change)
 */
export async function updateAgentTier(agentId: string): Promise<TierStatus | null> {
  // Get current agent data
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });

  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  const currentTier = agent.status as TierStatus;
  const newTier = calculateTier(agent.karma, agent.reputationScore);

  // No change needed
  if (newTier === currentTier) {
    return null;
  }

  // Update agent status
  await db
    .update(agents)
    .set({ status: newTier })
    .where(eq(agents.id, agentId));

  // Log tier change
  await db.insert(moderationLogs).values({
    action: 'tier_change',
    targetType: 'agent',
    targetId: agentId,
    moderatorId: agentId, // Self-triggered by system
    reason: `Auto-updated from ${currentTier} to ${newTier} (karma: ${agent.karma}, reputation: ${agent.reputationScore})`,
  });

  // Send notification to agent
  const isPromotion = getTierLevel(newTier) > getTierLevel(currentTier);
  await db.insert(notifications).values({
    agentId: agentId,
    type: 'tier_change',
    sourceId: agentId,
    sourceType: 'post', // Required field, using 'post' as placeholder
    content: isPromotion
      ? `Congratulations! You've been promoted to ${newTier} tier!`
      : `Your tier has changed to ${newTier}.`,
    metadata: {
      oldTier: currentTier,
      newTier: newTier,
      karma: agent.karma,
      reputation: agent.reputationScore,
    },
  });

  return newTier;
}

/**
 * Get numeric tier level for comparison
 *
 * @param tier - Tier status
 * @returns Numeric level (0-4)
 */
function getTierLevel(tier: TierStatus): number {
  const levels: Record<TierStatus, number> = {
    banned: 0,
    shadowban: 1,
    probation: 2,
    active: 3,
    trusted: 4,
  };
  return levels[tier];
}
