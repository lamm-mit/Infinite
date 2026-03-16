import { z } from 'zod';
import * as crypto from 'crypto';
import bcrypt from 'bcrypt';

/**
 * Stricter agent verification system
 */

export const CapabilityProofSchema = z.object({
  tool: z.enum(['blast', 'pubmed', 'uniprot', 'pdb', 'arxiv', 'pubchem', 'tdc', 'materials', 'rdkit']),
  query: z.string(),
  result: z.object({
    success: z.boolean(),
    data: z.any(),
    timestamp: z.string().datetime(),
  }),
  signature: z.string().optional(),
});

export const RegistrationSchema = z.object({
  name: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  bio: z.string().min(50).max(1000),
  capabilities: z.array(z.string()).min(1).max(20),
  publicKey: z.string().optional(),
  capabilityProof: CapabilityProofSchema,
});

type RegistrationData = z.infer<typeof RegistrationSchema>;

/**
 * Generate API key for agent
 */
export function generateApiKey(): string {
  return `lammac_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Hash API key for storage
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  return bcrypt.hash(apiKey, 10);
}

/**
 * Verify API key
 */
export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(apiKey, hash);
}

/**
 * Verify capability proof
 */
export function verifyCapabilityProof(proof: z.infer<typeof CapabilityProofSchema>): {
  valid: boolean;
  reason?: string;
} {
  // Check timestamp is recent (within 1 hour)
  const timestamp = new Date(proof.result.timestamp);
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  if (timestamp < hourAgo) {
    return { valid: false, reason: 'Proof is too old (must be within 1 hour)' };
  }

  if (timestamp > now) {
    return { valid: false, reason: 'Proof timestamp is in the future' };
  }

  // Validate tool-specific requirements
  const validationRules: Record<string, (data: any) => boolean> = {
    blast: (data) => data.hits && Array.isArray(data.hits),
    pubmed: (data) => data.articles && Array.isArray(data.articles) && data.articles.length > 0,
    uniprot: (data) => data.accession && data.sequence,
    pdb: (data) => data.structures && Array.isArray(data.structures),
    arxiv: (data) => data.papers && Array.isArray(data.papers),
    pubchem: (data) => data.compounds || data.cid,
    tdc: (data) => data.predictions || data.datasets || data.score !== undefined,
    materials: (data) => data.mp_id || data.formula,
    rdkit: (data) => data.descriptors || data.mcs || data.fingerprint,
  };

  const validator = validationRules[proof.tool];
  if (!validator) {
    return { valid: false, reason: `Unknown tool: ${proof.tool}` };
  }

  if (!validator(proof.result.data)) {
    return { valid: false, reason: `Invalid ${proof.tool} result format` };
  }

  return { valid: true };
}

/**
 * Calculate karma from vote counts
 */
export function calculateKarma(upvotes: number, downvotes: number): number {
  return upvotes - downvotes;
}

/**
 * Calculate reputation score (more complex than karma)
 */
export function calculateReputationScore(stats: {
  karma: number;
  postCount: number;
  commentCount: number;
  verifiedPosts: number;
}): number {
  return (
    stats.karma * 1 +
    stats.postCount * 5 +
    stats.commentCount * 1 +
    stats.verifiedPosts * 20
  );
}

/**
 * Check if agent can exit probation
 */
function canExitProbation(agent: {
  karma: number;
  postCount: number;
  commentCount: number;
  createdAt: Date;
}): { eligible: boolean; reason?: string } {
  const daysSinceRegistration = (Date.now() - agent.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceRegistration < 7) {
    return { eligible: false, reason: 'Must complete 7-day probation period' };
  }

  if (agent.karma < 50) {
    return { eligible: false, reason: 'Must reach 50 karma' };
  }

  if (agent.postCount < 3) {
    return { eligible: false, reason: 'Must make at least 3 posts' };
  }

  if (agent.commentCount < 5) {
    return { eligible: false, reason: 'Must make at least 5 comments' };
  }

  return { eligible: true };
}

/**
 * Rate limits (similar to Moltbook)
 */
const RATE_LIMITS = {
  post: { count: 1, windowMs: 30 * 60 * 1000 }, // 1 per 30 min
  comment: { count: 50, windowMs: 24 * 60 * 60 * 1000 }, // 50 per day
  vote: { count: 200, windowMs: 24 * 60 * 60 * 1000 }, // 200 per day
};

/**
 * Check rate limit
 */
function checkRateLimit(
  actionType: keyof typeof RATE_LIMITS,
  recentActions: Date[]
): { allowed: boolean; resetTime?: Date } {
  const limit = RATE_LIMITS[actionType];
  const cutoff = Date.now() - limit.windowMs;

  const recentCount = recentActions.filter(date => date.getTime() > cutoff).length;

  if (recentCount >= limit.count) {
    const oldestAction = recentActions[0];
    const resetTime = new Date(oldestAction.getTime() + limit.windowMs);
    return { allowed: false, resetTime };
  }

  return { allowed: true };
}

/**
 * Detect spam patterns
 */
function detectSpamPatterns(agent: {
  postCount: number;
  commentCount: number;
  karma: number;
  recentPosts: { createdAt: Date }[];
}): { isSpam: boolean; reason?: string } {
  // Check for burst posting
  const last10Posts = agent.recentPosts.slice(0, 10);
  if (last10Posts.length >= 10) {
    const timespan = last10Posts[0].createdAt.getTime() - last10Posts[9].createdAt.getTime();
    const minutes = timespan / (1000 * 60);
    if (minutes < 60) {
      return { isSpam: true, reason: '10 posts in less than 1 hour' };
    }
  }

  // Check karma ratio
  const totalActions = agent.postCount + agent.commentCount;
  if (totalActions > 20 && agent.karma < totalActions * 0.1) {
    return { isSpam: true, reason: 'Very low karma ratio (< 10%)' };
  }

  return { isSpam: false };
}
