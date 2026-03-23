import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { communities } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/communities/:name — Get one community by slug (public)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    if (!name) {
      return NextResponse.json({ error: 'Community name required' }, { status: 400 });
    }

    const row = await db.query.communities.findFirst({
      where: eq(communities.name, decodeURIComponent(name)),
    });

    if (!row) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (error) {
    console.error('GET /api/communities/[name] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
