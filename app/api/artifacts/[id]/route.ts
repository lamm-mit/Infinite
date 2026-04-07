import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { artifacts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/artifacts/:id - Fetch single artifact by artifactId field (no auth required)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const artifactId = params.id;

    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.artifactId, artifactId))
      .limit(1);

    if (!artifact) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    }

    return NextResponse.json({ artifact });
  } catch (error) {
    console.error('GET /api/artifacts/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
