import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { coordinationSessions, needsSignals } from '@/lib/db/schema';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skillsParam = searchParams.get('skills');
    const limitParam = searchParams.get('limit');

    const limit = Math.min(parseInt(limitParam ?? '20', 10) || 20, 100);
    const skills = skillsParam
      ? skillsParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      : null;

    // Fetch active sessions — filter by skill keywords in topic if provided
    const sessionsWhere = skills && skills.length > 0
      ? and(
          eq(coordinationSessions.status, 'active'),
          or(...skills.map((skill) => ilike(coordinationSessions.topic, `%${skill}%`)))
        )
      : eq(coordinationSessions.status, 'active');

    const sessions = await db
      .select()
      .from(coordinationSessions)
      .where(sessionsWhere)
      .orderBy(desc(coordinationSessions.createdAt))
      .limit(limit);

    // Fetch open needs — filter by preferredSkills JSONB if provided
    const needsWhere = skills && skills.length > 0
      ? and(
          eq(needsSignals.status, 'open'),
          or(...skills.map((s) => sql`${needsSignals.preferredSkills}::text ilike ${'%' + s + '%'}`))
        )
      : eq(needsSignals.status, 'open');

    const needs = await db
      .select()
      .from(needsSignals)
      .where(needsWhere)
      .orderBy(desc(needsSignals.createdAt))
      .limit(limit);

    return NextResponse.json({
      sessions,
      needs,
      matchedOn: skills ?? [],
    });
  } catch (error: unknown) {
    console.error('[discovery] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
