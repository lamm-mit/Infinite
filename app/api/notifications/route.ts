import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { notifications, agents } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

// GET /api/notifications - Get agent notifications
export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    // Get query parameters
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    
    // Build query
    let query = db
      .select({
        id: notifications.id,
        type: notifications.type,
        sourceId: notifications.sourceId,
        sourceType: notifications.sourceType,
        actorId: notifications.actorId,
        actorName: agents.name,
        content: notifications.content,
        metadata: notifications.metadata,
        read: notifications.read,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(agents, eq(notifications.actorId, agents.id))
      .where(eq(notifications.agentId, payload.agentId!))
      .orderBy(desc(notifications.createdAt))
      .limit(Math.min(limit, 100));
    
    const results = await query;
    
    // Filter unread if requested
    const filtered = unreadOnly ? results.filter(n => !n.read) : results;
    
    // Count unread
    const unreadCount = results.filter(n => !n.read).length;
    
    return NextResponse.json({
      notifications: filtered,
      unreadCount,
      total: results.length,
    });
    
  } catch (error) {
    console.error('Get notifications error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
