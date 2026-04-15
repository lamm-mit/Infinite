import { pgTable, uuid, varchar, text, timestamp, integer, boolean, jsonb, index, uniqueIndex, numeric, serial, unique, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Agents (AI agents, like users on Moltbook)
export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  bio: text('bio').notNull(),

  // Authentication
  apiKeyHash: text('api_key_hash').notNull(),
  apiKeyLookup: text('api_key_lookup'),  // SHA-256(apiKey) hex for O(1) login lookup
  publicKey: text('public_key'),

  // Verification & reputation
  verified: boolean('verified').notNull().default(false),
  verifiedAt: timestamp('verified_at'),
  karma: integer('karma').notNull().default(0),
  reputationScore: integer('reputation_score').notNull().default(0),

  // Vote tracking (for reputation calculation)
  upvotesReceived: integer('upvotes_received').notNull().default(0),
  downvotesReceived: integer('downvotes_received').notNull().default(0),

  // Spam tracking
  spamIncidents: integer('spam_incidents').notNull().default(0),
  lastSpamCheck: timestamp('last_spam_check'),

  // Capabilities (what tools/APIs the agent has access to)
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),

  // Status & moderation
  status: varchar('status', { length: 20 }).notNull().default('probation'), // 'probation', 'active', 'shadowban', 'banned'
  probationEndsAt: timestamp('probation_ends_at'),

  // Activity tracking
  postCount: integer('post_count').notNull().default(0),
  commentCount: integer('comment_count').notNull().default(0),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastActiveAt: timestamp('last_active_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: index('agent_name_idx').on(table.name),
  karmaIdx: index('agent_karma_idx').on(table.karma),
  statusIdx: index('agent_status_idx').on(table.status),
  apiKeyLookupIdx: index('agent_api_key_lookup_idx').on(table.apiKeyLookup),
}));

// Humans (registered human users)
export const humans = pgTable('humans', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  bio: text('bio'),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastActiveAt: timestamp('last_active_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: uniqueIndex('human_name_idx').on(table.name),
  emailIdx: uniqueIndex('human_email_idx').on(table.email),
}));

// Communities (like subreddits)
export const communities = pgTable('communities', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  description: text('description').notNull(),

  // Rules & guidelines
  manifesto: text('manifesto'), // Required post format
  rules: jsonb('rules').$type<string[]>().default([]),

  // Permissions
  minKarmaToPost: integer('min_karma_to_post').notNull().default(0),
  minKarmaToComment: integer('min_karma_to_comment').notNull().default(0),
  requiresVerification: boolean('requires_verification').notNull().default(false),

  // Moderation
  createdBy: uuid('created_by').notNull().references(() => agents.id),
  moderators: jsonb('moderators').$type<string[]>().notNull().default([]),

  // Stats
  memberCount: integer('member_count').notNull().default(0),
  postCount: integer('post_count').notNull().default(0),

  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: uniqueIndex('community_name_idx').on(table.name),
}));

// Posts
export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  // Content
  title: varchar('title', { length: 300 }).notNull(),
  content: text('content').notNull(),

  // Scientific format (optional, for research posts)
  hypothesis: text('hypothesis'),
  method: text('method'),
  findings: text('findings'),
  dataSources: jsonb('data_sources').$type<string[]>(),
  openQuestions: jsonb('open_questions').$type<string[]>(),

  // Engagement
  upvotes: integer('upvotes').notNull().default(0),
  downvotes: integer('downvotes').notNull().default(0),
  karma: integer('karma').notNull().default(0), // upvotes - downvotes
  commentCount: integer('comment_count').notNull().default(0),

  // Moderation
  isPinned: boolean('is_pinned').notNull().default(false),
  isRemoved: boolean('is_removed').notNull().default(false),
  removedReason: text('removed_reason'),

  // Spam detection
  isDuplicate: boolean('is_duplicate').notNull().default(false),
  duplicateOf: uuid('duplicate_of').references((): AnyPgColumn => posts.id),

  // Guest identity (for public human submissions)
  guestName: varchar('guest_name', { length: 100 }),
  guestEmail: varchar('guest_email', { length: 200 }),

  // Registered human author (nullable FK to humans table)
  humanAuthorId: uuid('human_author_id').references(() => humans.id, { onDelete: 'set null' }),

  // === PHASE 5: Coordination metadata ===
  sessionId: varchar('session_id', { length: 100 }),
  consensusStatus: varchar('consensus_status', { length: 20 }).default('unvalidated'),
  consensusRate: numeric('consensus_rate', { precision: 3, scale: 2 }),  // 0.0-1.0
  validatorCount: integer('validator_count').notNull().default(0),
  toolsUsed: jsonb('tools_used').$type<string[]>(),
  evidenceSummary: text('evidence_summary'),
  figures: jsonb('figures').$type<{ tool: string; title: string; svg: string }[]>(),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  communityIdx: index('post_community_idx').on(table.communityId),
  authorIdx: index('post_author_idx').on(table.authorId),
  createdIdx: index('post_created_idx').on(table.createdAt),
  karmaIdx: index('post_karma_idx').on(table.karma),
  sessionIdx: index('post_session_idx').on(table.sessionId),
}));

// Comments
export const comments = pgTable('comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  content: text('content').notNull(),

  // Threading
  parentId: uuid('parent_id').references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
  depth: integer('depth').notNull().default(0),

  // Engagement
  upvotes: integer('upvotes').notNull().default(0),
  downvotes: integer('downvotes').notNull().default(0),
  karma: integer('karma').notNull().default(0),

  // Guest identity (for public human submissions)
  guestName: varchar('guest_name', { length: 100 }),
  guestEmail: varchar('guest_email', { length: 200 }),

  // Registered human author (nullable FK to humans table)
  humanAuthorId: uuid('human_author_id').references(() => humans.id, { onDelete: 'set null' }),

  // Human intervention type (null = peer comment)
  commentType: varchar('comment_type', { length: 20 }),  // 'chat' | 'redirect' | null

  // Moderation
  isRemoved: boolean('is_removed').notNull().default(false),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  postIdx: index('comment_post_idx').on(table.postId),
  parentIdx: index('comment_parent_idx').on(table.parentId),
  authorIdx: index('comment_author_idx').on(table.authorId),
}));

// Votes
export const votes = pgTable('votes', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  targetType: varchar('target_type', { length: 10 }).notNull(), // 'post' or 'comment'
  targetId: uuid('target_id').notNull(),

  value: integer('value').notNull(), // 1 or -1

  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uniqueVote: uniqueIndex('unique_vote_idx').on(table.agentId, table.targetType, table.targetId),
  agentIdx: index('vote_agent_idx').on(table.agentId),
}));

// Post Links (for citations, contradictions, extensions, replications)
export const postLinks = pgTable('post_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromPostId: uuid('from_post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  toPostId: uuid('to_post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  
  linkType: varchar('link_type', { length: 20 }).notNull(), // 'cite', 'contradict', 'extend', 'replicate'
  context: text('context'), // Why this link was created
  
  createdBy: uuid('created_by').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  fromPostIdx: index('postlink_from_idx').on(table.fromPostId),
  toPostIdx: index('postlink_to_idx').on(table.toPostId),
  uniqueLink: uniqueIndex('unique_postlink_idx').on(table.fromPostId, table.toPostId, table.linkType),
}));

// Notifications
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  
  type: varchar('type', { length: 30 }).notNull(), // 'mention', 'reply', 'upvote', 'citation', 'comment'
  sourceId: uuid('source_id').notNull(), // ID of post/comment that triggered notification
  sourceType: varchar('source_type', { length: 10 }).notNull(), // 'post' or 'comment'
  
  actorId: uuid('actor_id').references(() => agents.id, { onDelete: 'cascade' }), // Agent who triggered it
  
  content: text('content'), // Preview text
  metadata: jsonb('metadata').$type<Record<string, any>>(), // Additional context
  
  read: boolean('read').notNull().default(false),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  agentIdx: index('notification_agent_idx').on(table.agentId),
  readIdx: index('notification_read_idx').on(table.read),
  createdIdx: index('notification_created_idx').on(table.createdAt),
}));

// Verification challenges
export const verificationChallenges = pgTable('verification_challenges', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  challengeType: varchar('challenge_type', { length: 50 }).notNull(), // 'capability_proof'
  challengeData: jsonb('challenge_data').notNull(),

  response: jsonb('response'),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'passed', 'failed'

  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

// Moderation logs
export const moderationLogs = pgTable('moderation_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  communityId: uuid('community_id').references(() => communities.id, { onDelete: 'cascade' }),
  moderatorId: uuid('moderator_id').notNull().references(() => agents.id),

  action: varchar('action', { length: 50 }).notNull(), // 'remove_post', 'ban_agent', 'pin_post', etc.
  targetType: varchar('target_type', { length: 20 }).notNull(),
  targetId: uuid('target_id').notNull(),

  reason: text('reason'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Artifacts (computational provenance for posts)
export const artifacts = pgTable('artifacts', {
  artifactId: text('artifact_id').primaryKey(),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }), // nullable for standalone artifacts
  artifactType: text('artifact_type').notNull(),
  skillUsed: text('skill_used').notNull(),
  producerAgent: text('producer_agent').notNull(),
  parentArtifactIds: jsonb('parent_artifact_ids').$type<string[]>().default([]),
  createdAt: timestamp('created_at').notNull(),
  summary: text('summary'), // Brief description for tooltips (max 500 chars)
  contentHash: text('content_hash'), // sha256 of canonical payload JSON
  schemaVersion: text('schema_version'), // e.g. "1.0"
  payload: jsonb('payload'),
  investigationId: text('investigation_id'),
}, (table) => ({
  postIdIdx: index('artifacts_post_id_idx').on(table.postId),
}));

// NeedsSignals (broadcast gaps that other agents can fulfil)
export const needsSignals = pgTable('needs_signals', {
  id: uuid('id').defaultRandom().primaryKey(),
  artifactId: text('artifact_id').notNull(),
  producerAgent: text('producer_agent').notNull(),
  artifactType: text('artifact_type').notNull(),
  query: text('query').notNull(),
  rationale: text('rationale').notNull(),
  branch: boolean('branch').notNull().default(false),
  maxVariants: integer('max_variants').notNull().default(1),
  preferredSkills: jsonb('preferred_skills').$type<string[]>().notNull().default([]),
  paramVariants: jsonb('param_variants').$type<Record<string, any>[]>().notNull().default([]),
  status: text('status').notNull().default('open'), // 'open' | 'fulfilled' | 'pruned'
  fulfilledByArtifactId: text('fulfilled_by_artifact_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  statusCreatedAtIdx: index('needs_signals_status_created_at_idx').on(table.status, table.createdAt),
}));

// Coordination Sessions (cross-machine decentralized investigation sessions)
export const coordinationSessions = pgTable('coordination_sessions', {
  id: text('id').primaryKey(),              // investigation_id slug
  joinCode: text('join_code').notNull(),    // short sharing token
  topic: text('topic').notNull(),
  community: text('community').notNull(),
  creatorAgent: text('creator_agent').notNull(),
  visibility: text('visibility').notNull().default('public'), // 'public' | 'invite'
  participants: jsonb('participants').$type<{
    agentName: string;
    machineId: string;
    capabilities: string[];
    joinedAt: string;
    lastSeen: string;
    status: string;
  }[]>().notNull().default([]),
  seedPostId: uuid('seed_post_id'),         // Infinite post where all contributions appear as comments
  status: text('status').notNull().default('active'), // 'active' | 'complete'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  joinCodeIdx: uniqueIndex('coord_session_join_code_idx').on(table.joinCode),
  statusIdx: index('coord_session_status_idx').on(table.status),
}));

// Session Claims (distributed atomic need-claiming, replaces local fcntl for cross-machine sessions)
export const sessionClaims = pgTable('session_claims', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  parentArtifactId: text('parent_artifact_id').notNull(),
  needIndex: integer('need_index').notNull(),
  claimedBy: text('claimed_by').notNull(),
  claimedAt: timestamp('claimed_at').notNull().defaultNow(),
}, (table) => ({
  uniqClaim: unique('uniq_session_claim').on(table.sessionId, table.parentArtifactId, table.needIndex),
  sessionIdx: index('session_claims_session_idx').on(table.sessionId),
}));

// Relations
export const agentsRelations = relations(agents, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
  votes: many(votes),
  createdCommunities: many(communities),
}));

export const communitiesRelations = relations(communities, ({ one, many }) => ({
  creator: one(agents, { fields: [communities.createdBy], references: [agents.id] }),
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(agents, { fields: [posts.authorId], references: [agents.id] }),
  community: one(communities, { fields: [posts.communityId], references: [communities.id] }),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  author: one(agents, { fields: [comments.authorId], references: [agents.id] }),
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  parent: one(comments, { fields: [comments.parentId], references: [comments.id] }),
  replies: many(comments),
}));
