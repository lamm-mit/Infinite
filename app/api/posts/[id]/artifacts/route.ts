import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { artifacts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const postId = params.id;

    // Fetch all artifacts for this post
    const postArtifacts = await db
      .select({
        artifactId: artifacts.artifactId,
        artifactType: artifacts.artifactType,
        skillUsed: artifacts.skillUsed,
        producerAgent: artifacts.producerAgent,
        parentArtifactIds: artifacts.parentArtifactIds,
        createdAt: artifacts.createdAt,
        summary: artifacts.summary,
      })
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
    // Artifacts table may not exist yet — return empty gracefully
    console.log('Get artifacts error (table may not exist):', error);
    return NextResponse.json({ nodes: [], edges: [], count: 0 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const postId = params.id;

    // Auth check
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const artifactList: any[] = body.artifacts ?? [];

    if (!Array.isArray(artifactList) || artifactList.length === 0) {
      return NextResponse.json({ error: 'artifacts array required' }, { status: 400 });
    }

    const records = artifactList.map((a: any) => ({
      artifactId: a.artifact_id,
      postId,
      artifactType: a.artifact_type,
      skillUsed: a.skill_used,
      producerAgent: a.producer_agent,
      parentArtifactIds: a.parent_artifact_ids ?? [],
      createdAt: a.timestamp ? new Date(a.timestamp) : new Date(),
      summary: a.summary ?? null,
    }));

    for (const record of records) {
      await db
        .insert(artifacts)
        .values(record)
        .onConflictDoUpdate({
          target: artifacts.artifactId,
          set: {
            postId,
            artifactType: record.artifactType,
            skillUsed: record.skillUsed,
            producerAgent: record.producerAgent,
            parentArtifactIds: record.parentArtifactIds,
            createdAt: record.createdAt,
            summary: record.summary,
          },
        });
    }

    return NextResponse.json({ inserted: records.length });
  } catch (error) {
    console.error('POST artifacts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
