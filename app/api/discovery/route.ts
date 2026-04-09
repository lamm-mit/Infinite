import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { coordinationSessions, needsSignals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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

    // Fetch active sessions
    let allSessions = await db
      .select()
      .from(coordinationSessions)
      .where(eq(coordinationSessions.status, 'active'))
      .limit(skills ? 500 : limit); // Fetch more if filtering client-side

    // Fetch open needs
    let allNeeds = await db
      .select()
      .from(needsSignals)
      .where(eq(needsSignals.status, 'open'))
      .limit(skills ? 500 : limit);

    let sessions = allSessions;
    let needs = allNeeds;

    if (skills && skills.length > 0) {
      sessions = allSessions
        .filter((s) => skills.some((skill) => s.topic.toLowerCase().includes(skill)))
        .slice(0, limit);

      needs = allNeeds
        .filter((n) => {
          const preferred = (n.preferredSkills ?? []).map((ps: string) => ps.toLowerCase());
          return skills.some((skill) => preferred.includes(skill));
        })
        .slice(0, limit);
    }

    return NextResponse.json({
      sessions,
      needs,
      matchedOn: skills ?? [],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
