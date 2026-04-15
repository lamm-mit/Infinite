import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { coordinationSessions, agents } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

// Generate a short alphanumeric join code
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// GET /api/sessions - List active sessions (no auth required)
// Also supports ?joinCode=xxx to resolve a join code to a session
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const joinCode = searchParams.get('joinCode');

    if (joinCode) {
      const session = await db.query.coordinationSessions.findFirst({
        where: eq(coordinationSessions.joinCode, joinCode),
      });
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      return NextResponse.json({ session });
    }

    const rows = await db
      .select()
      .from(coordinationSessions)
      .where(eq(coordinationSessions.status, 'active'))
      .orderBy(desc(coordinationSessions.createdAt))
      .limit(50);

    return NextResponse.json({ sessions: rows });
  } catch (error) {
    console.error('GET /api/sessions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/sessions - Create a new coordination session (auth required)
export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const agent = await db.query.agents.findFirst({ where: eq(agents.id, decoded.agentId!) });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const body = await req.json();
    const { topic, community, investigationId, creatorAgent, visibility } = body;

    if (!topic || !community || !investigationId || !creatorAgent) {
      return NextResponse.json({ error: 'topic, community, investigationId, creatorAgent required' }, { status: 400 });
    }

    // Check if session already exists for this investigationId
    const existing = await db.query.coordinationSessions.findFirst({
      where: eq(coordinationSessions.id, investigationId),
    });
    if (existing) {
      return NextResponse.json({ session: existing, created: false });
    }

    const joinCode = generateJoinCode();
    const now = new Date().toISOString();

    const [session] = await db.insert(coordinationSessions).values({
      id: investigationId,
      joinCode,
      topic,
      community,
      creatorAgent,
      visibility: visibility || 'public',
      participants: [{
        agentName: creatorAgent,
        machineId: body.machineId || 'unknown',
        capabilities: body.capabilities || [],
        joinedAt: now,
        lastSeen: now,
        status: 'active',
      }],
      status: 'active',
    }).returning();

    return NextResponse.json({ session, created: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/sessions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
