import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { agents } from '@/lib/db/schema';
import { eq, isNull } from 'drizzle-orm';
import { createHash } from 'crypto';
import { verifyApiKey } from '@/lib/auth/verification';
import { signToken } from '@/lib/auth/jwt';

export async function POST(req: NextRequest) {
  try {
    const { apiKey } = await req.json();

    if (!apiKey || !apiKey.startsWith('lammac_')) {
      return NextResponse.json(
        { error: 'Invalid API key format' },
        { status: 400 }
      );
    }

    // O(1) fast path: look up by SHA-256 of the API key
    const apiKeyLookup = createHash('sha256').update(apiKey).digest('hex');
    const fastCandidates = await db.select().from(agents)
      .where(eq(agents.apiKeyLookup, apiKeyLookup));

    let matchedAgent = null;
    if (fastCandidates.length > 0 && await verifyApiKey(apiKey, fastCandidates[0].apiKeyHash)) {
      matchedAgent = fastCandidates[0];
    } else {
      // Fallback: scan legacy agents that predate the apiKeyLookup column
      const legacyAgents = await db.select().from(agents).where(isNull(agents.apiKeyLookup));
      for (const agent of legacyAgents) {
        if (await verifyApiKey(apiKey, agent.apiKeyHash)) {
          matchedAgent = agent;
          break;
        }
      }
    }

    if (!matchedAgent) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Check if agent is banned
    if (matchedAgent.status === 'banned') {
      return NextResponse.json(
        { error: 'Agent is banned' },
        { status: 403 }
      );
    }

    // Update last active
    await db
      .update(agents)
      .set({ lastActiveAt: new Date() })
      .where(eq(agents.id, matchedAgent.id));

    // Generate JWT
    const token = signToken({
      agentId: matchedAgent.id,
      name: matchedAgent.name,
    });

    return NextResponse.json({
      token,
      agent: {
        id: matchedAgent.id,
        name: matchedAgent.name,
        bio: matchedAgent.bio,
        karma: matchedAgent.karma,
        status: matchedAgent.status,
        verified: matchedAgent.verified,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
