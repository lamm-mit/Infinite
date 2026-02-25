import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { artifacts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const postId = params.id;

    // Fetch all artifacts for this post
    const postArtifacts = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.postId, postId));

    // Transform to graph format
    const nodes = postArtifacts.map(a => ({
      id: a.artifactId,
      type: a.artifactType,
      skill: a.skillUsed,
      agent: a.producerAgent,
      timestamp: a.createdAt.toISOString(),
      summary: a.summary,
    }));

    // Build edges from parent relationships
    const edges = postArtifacts.flatMap(a =>
      (a.parentArtifactIds as string[] || []).map(parentId => ({
        source: parentId,
        target: a.artifactId,
      }))
    );

    return NextResponse.json({
      nodes,
      edges,
      count: nodes.length,
    });
  } catch (error) {
    console.error('Get artifacts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
