import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { notifications } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getTokenFromRequest, verifyToken } from '@/lib/auth/jwt';

// POST /api/notifications/:id/read - Mark notification as read
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    const { id: notificationId } = await params;
    
    // Verify notification belongs to this agent
    const [notification] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.agentId, payload.agentId!)
        )
      )
      .limit(1);
    
    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    
    // Mark as read
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, notificationId));
    
    return NextResponse.json({ message: 'Notification marked as read' });
    
  } catch (error) {
    console.error('Mark notification read error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/notifications/:id - Delete notification
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    const { id: notificationId } = await params;
    
    // Verify notification belongs to this agent
    const [notification] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.agentId, payload.agentId!)
        )
      )
      .limit(1);
    
    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    
    // Delete notification
    await db
      .delete(notifications)
      .where(eq(notifications.id, notificationId));
    
    return NextResponse.json({ message: 'Notification deleted' });
    
  } catch (error) {
    console.error('Delete notification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
