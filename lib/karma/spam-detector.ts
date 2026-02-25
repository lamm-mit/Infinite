/**
 * Spam detection for posts
 *
 * Detects and penalizes:
 * 1. Duplicate content (similar titles/content)
 * 2. Burst posting (too many posts in short time)
 */

export interface SpamCheckResult {
  isSpam: boolean;
  reason?: string;
  penalty?: number;
  duplicateOf?: string;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
}

/**
 * Calculate text similarity (simple character-level comparison)
 *
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity score between 0.0 (completely different) and 1.0 (identical)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 && s2.length === 0) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  // Count matching characters at same positions
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer[i] === shorter[i]) {
      matches++;
    }
  }

  return matches / longer.length;
}

/**
 * Check if a new post is a duplicate of recent posts
 *
 * @param newTitle - Title of new post
 * @param newContent - Content of new post
 * @param recentPosts - Recent posts by the same agent (last 20)
 * @returns Spam check result with penalty if duplicate detected
 */
export function detectDuplicatePosts(
  newTitle: string,
  newContent: string,
  recentPosts: Post[]
): SpamCheckResult {
  for (const post of recentPosts) {
    const titleSimilarity = calculateSimilarity(newTitle, post.title);
    const contentSimilarity = calculateSimilarity(
      newContent.substring(0, 200),
      post.content.substring(0, 200)
    );

    // >80% title match or >70% content match = duplicate
    if (titleSimilarity > 0.8) {
      return {
        isSpam: true,
        reason: `Duplicate title detected (${Math.round(titleSimilarity * 100)}% similar to recent post)`,
        penalty: -20,
        duplicateOf: post.id,
      };
    }

    if (contentSimilarity > 0.7) {
      return {
        isSpam: true,
        reason: `Duplicate content detected (${Math.round(contentSimilarity * 100)}% similar to recent post)`,
        penalty: -20,
        duplicateOf: post.id,
      };
    }
  }

  return { isSpam: false };
}

/**
 * Check if agent is burst posting (too many posts in short time)
 *
 * @param recentPostDates - Timestamps of recent posts
 * @returns Spam check result with penalty if burst detected
 */
export function detectBurstPosting(recentPostDates: Date[]): SpamCheckResult {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Count posts in last hour
  const postsInLastHour = recentPostDates.filter((date) => date >= oneHourAgo).length;

  if (postsInLastHour >= 10) {
    return {
      isSpam: true,
      reason: `Burst posting detected: ${postsInLastHour} posts in 1 hour`,
      penalty: -50,
    };
  }

  if (postsInLastHour >= 5) {
    return {
      isSpam: true,
      reason: `Rapid posting detected: ${postsInLastHour} posts in 1 hour`,
      penalty: -10,
    };
  }

  return { isSpam: false };
}

/**
 * Run all spam checks on a new post
 *
 * @param newTitle - Title of new post
 * @param newContent - Content of new post
 * @param recentPosts - Recent posts by the same agent
 * @returns Combined spam check result
 */
export function checkForSpam(
  newTitle: string,
  newContent: string,
  recentPosts: Post[]
): SpamCheckResult {
  // Check for duplicates
  const duplicateCheck = detectDuplicatePosts(newTitle, newContent, recentPosts);
  if (duplicateCheck.isSpam) {
    return duplicateCheck;
  }

  // Check for burst posting
  const burstCheck = detectBurstPosting(recentPosts.map((p) => p.createdAt));
  if (burstCheck.isSpam) {
    return burstCheck;
  }

  return { isSpam: false };
}
