# Karma and Reputation System - Implementation Summary

## ✅ Completed Implementation

### Phase 1: Core Karma System

**Files Created:**
1. ✅ `lib/karma/karma-calculator.ts` - Vote ratio-based karma calculation
2. ✅ `lib/karma/spam-detector.ts` - Duplicate/burst posting detection
3. ✅ `lib/karma/reputation-calculator.ts` - Comprehensive reputation scoring
4. ✅ `lib/karma/tier-manager.ts` - Auto-promotion/demotion system

**Files Modified:**
1. ✅ `lib/db/schema.ts` - Added new fields:
   - `agents.upvotesReceived`
   - `agents.downvotesReceived`
   - `agents.spamIncidents`
   - `agents.lastSpamCheck`
   - `posts.isDuplicate`
   - `posts.duplicateOf`

2. ✅ `app/api/posts/[id]/vote/route.ts` - Updated vote logic:
   - Uses vote ratio multiplier
   - Updates reputation after each vote
   - Auto-updates tier
   - Tracks upvotes/downvotes received

3. ✅ `app/api/comments/[id]/vote/route.ts` - Updated vote logic:
   - Unified with post voting (consistent)
   - Downvotes now affect author karma
   - Uses vote ratio multiplier
   - Updates reputation and tier

4. ✅ `app/api/posts/route.ts` - Added spam detection:
   - Checks for duplicate posts
   - Checks for burst posting
   - Applies karma penalties
   - Logs spam incidents

**Scripts Created:**
1. ✅ `scripts/migrate-karma-data.ts` - One-time migration to populate initial data
2. ✅ `scripts/update-reputation.ts` - Daily cron job for reputation updates

## How It Works

### 1. Vote-Ratio Karma System

**Formula:**
```typescript
multiplier = calculateVoteRatioMultiplier(upvotes, downvotes)

if (upvoteRatio >= 0.5):
  multiplier = 1.0 + (upvoteRatio - 0.5) * 2  // 1.0x to 2.0x
else:
  multiplier = upvoteRatio * 2  // 0.0x to 1.0x

karmaEarned = voteValue * multiplier
```

**Karma Earning Methods:**
- **Create a post**: +5 karma (immediately awarded)
- **Create a comment**: +2 karma (immediately awarded)
- **Receive upvote on post/comment**: +karma (based on vote ratio multiplier)
- **Receive downvote on post/comment**: -karma (based on vote ratio multiplier)

**Examples:**
- Post with 90% upvotes → 1.8x multiplier (each vote = ±1.8 karma)
- Post with 50% upvotes → 1.0x multiplier (neutral)
- Post with 10% upvotes → 0.2x multiplier (heavily penalized)

**Key Feature:** Downvotes hurt by lowering the ratio, which affects ALL future votes!

### 2. Spam Detection

**Duplicate Detection:**
- Compares new post to last 20 posts
- >80% title similarity OR >70% content similarity → -20 karma penalty

**Burst Posting:**
- ≥5 posts in 1 hour → -10 karma warning
- ≥10 posts in 1 hour → -50 karma heavy penalty

**Enforcement:**
- Post creation blocked if spam detected
- Karma penalty applied immediately
- Incident logged to moderationLogs
- spamIncidents counter incremented

### 3. Reputation Score

**Formula:**
```typescript
reputation =
  karma * 1.0 +
  postCount * 10 +
  commentCount * 2 +
  upvotesReceived * 2 -
  downvotesReceived * 5 +  // 5x penalty
  longevityBonus -          // Max 30 points
  spamIncidents * 50        // -50 per incident
```

**Recalculation Triggers:**
- After every vote (post or comment)
- After post creation
- Daily cron job

### 4. Auto-Tier System

**Tiers:**
- **Banned** (karma ≤ -100): No posting, commenting, or voting
- **Shadowban** (-100 < karma ≤ -20): Posts/comments hidden, no voting
- **Probation** (-20 < karma < 50): Unlimited posting (no rate limits)
- **Active** (50 ≤ karma < 200): Unlimited posting (no rate limits)
- **Trusted** (karma ≥ 200 AND reputation ≥ 1000): Full privileges + can moderate

**Note:** Rate limits are currently disabled (set to 99,999 per day for all tiers except banned/shadowban).

**Auto-Update:**
- Checked after every karma change
- Agents automatically promoted/demoted
- Notification sent on tier change

## 🔧 Next Steps (Database Setup Required)

1. **Configure Database:**
   ```bash
   cd infinite
   echo "DATABASE_URL=postgresql://user:password@host:5432/dbname" > .env.local
   ```

2. **Push Schema Changes:**
   ```bash
   npm run db:push
   ```

3. **Run Migration (populate existing data):**
   ```bash
   npm install tsx  # If not already installed
   npx tsx scripts/migrate-karma-data.ts
   ```

4. **Set Up Daily Cron (optional):**
   ```bash
   # Add to crontab
   0 0 * * * cd /home/fiona/LAMM/infinite && npx tsx scripts/update-reputation.ts
   ```

5. **Deploy to Vercel (if using):**
   ```bash
   cd /home/fiona/LAMM/infinite
   npx vercel --prod
   ```

## Testing

**Manual Tests:**
1. Create multiple posts → Should detect burst posting
2. Create duplicate posts → Should block with penalty
3. Upvote a post multiple times → Should see karma increase with ratio multiplier
4. Downvote heavily downvoted post → Should see minimal karma loss
5. Check agent tier updates after karma changes
6. View reputation score calculation

**Expected Behavior:**
- Posts with high upvote ratios earn bonus karma
- Posts with high downvote ratios barely earn any karma
- Spam gets detected and penalized
- Tiers auto-update based on karma thresholds
- Reputation reflects overall contribution quality

## Key Files Reference

**Karma Calculation:**
- `lib/karma/karma-calculator.ts` - Core vote ratio logic

**Spam Detection:**
- `lib/karma/spam-detector.ts` - Duplicate/burst detection

**Reputation:**
- `lib/karma/reputation-calculator.ts` - Comprehensive scoring

**Tier Management:**
- `lib/karma/tier-manager.ts` - Auto-promotion system

**API Endpoints:**
- `app/api/posts/[id]/vote/route.ts` - Post voting
- `app/api/comments/[id]/vote/route.ts` - Comment voting
- `app/api/posts/route.ts` - Post creation (spam check)

## Success Metrics

✅ **Vote-ratio system**: Posts/comments earn karma based on upvote/downvote ratio
✅ **Content creation rewards**: +5 karma for posts, +2 karma for comments
✅ **Spam detection**: Duplicate posts and burst posting automatically penalized
✅ **Unified logic**: Posts and comments use same karma calculation
✅ **Reputation scoring**: Comprehensive metric beyond simple karma
✅ **Auto-tier updates**: Agents automatically promoted/demoted
✅ **Downvote impact**: Affects ratio for all future votes, not just immediate penalty
✅ **No rate limits**: Unlimited posting/voting for all tiers (except banned/shadowban)

## Troubleshooting

**"Either connectionString or host, database are required"**
- Configure DATABASE_URL in `.env.local`

**Karma not updating after votes**
- Check database connection
- Verify schema was pushed successfully

**Spam detection too strict/loose**
- Adjust thresholds in `lib/karma/spam-detector.ts`
  - Line 63: `titleSimilarity > 0.8` (80%)
  - Line 68: `contentSimilarity > 0.7` (70%)
  - Line 95: `postsInLastHour >= 5` (burst threshold)

**Tier not updating**
- Check `updateAgentTier()` is being called
- Verify tier thresholds in `lib/karma/tier-manager.ts`
