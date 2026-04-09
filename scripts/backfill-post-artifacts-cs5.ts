/**
 * Backfill a curated artifact DAG for the CS5 materials thread.
 *
 * Usage:
 *   export $(grep -v '^#' .env.local | xargs)
 *   npx tsx scripts/backfill-post-artifacts-cs5.ts --dry-run
 *   npx tsx scripts/backfill-post-artifacts-cs5.ts --apply
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import postgres from 'postgres';

const POST_ID = '59e8e485-8a5a-40d5-834f-eaadd25c8723';
const INVESTIGATION_ID = 'cs5_hydrogen_superconductors';
const DERIVED_PHONON_ID = 'thread-59e8e485-phonon-stability-panel';

type StoreArtifact = {
  artifact_id: string;
  artifact_type: string;
  producer_agent: string;
  skill_used: string;
  parent_artifact_ids?: string[];
  timestamp?: string;
  summary?: string | null;
  content_hash?: string | null;
  schema_version?: string | null;
  payload?: unknown;
  investigation_id?: string | null;
};

type ManifestEntry =
  | {
      artifactId: string;
      parentArtifactIds: string[];
      summary: string;
      source: 'store';
    }
  | {
      artifactId: string;
      parentArtifactIds: string[];
      summary: string;
      source: 'derived';
      artifactType: string;
      producerAgent: string;
      skillUsed: string;
      createdAt: string;
      payload: Record<string, unknown>;
    };

function sha256Json(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function loadStoreArtifacts(): Map<string, StoreArtifact> {
  const storeRoot = path.join(os.homedir(), '.scienceclaw', 'artifacts');
  const resolved = new Map<string, StoreArtifact>();

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'store.jsonl') {
        const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const artifact = JSON.parse(trimmed) as StoreArtifact;
          if (artifact.investigation_id !== INVESTIGATION_ID) continue;
          resolved.set(artifact.artifact_id, artifact);
        }
      }
    }
  }

  walk(storeRoot);
  return resolved;
}

const manifest: ManifestEntry[] = [
  {
    artifactId: '736bc0ce-933b-4358-a357-34175bd9248a',
    source: 'store',
    parentArtifactIds: [],
    summary: 'Materials screen: 14 La-H, Y-H, and Ca-H hydride candidates collected for the thread.',
  },
  {
    artifactId: '10ede395-5dc8-4c2e-9da0-618394222143',
    source: 'store',
    parentArtifactIds: ['736bc0ce-933b-4358-a357-34175bd9248a'],
    summary: 'Structure enumeration: 19 substituted hydride variants generated from LaH20, CaH3, and CaH2 prototypes.',
  },
  {
    artifactId: '729d3a5a-a079-4e64-85a6-372e03e48049',
    source: 'store',
    parentArtifactIds: [
      '736bc0ce-933b-4358-a357-34175bd9248a',
      '10ede395-5dc8-4c2e-9da0-618394222143',
    ],
    summary: 'Enumeration synthesis note: prototype mappings, stability questions, and Tc follow-up targets.',
  },
  {
    artifactId: 'dcfaf996-b3ec-42c4-9103-c6c7eace10d1',
    source: 'store',
    parentArtifactIds: ['736bc0ce-933b-4358-a357-34175bd9248a'],
    summary: 'Relaxation intake set: the same 14-candidate hydride panel prepared for UMA relaxation.',
  },
  {
    artifactId: '04589c87-f65c-491c-945e-ed7c23a1d26a',
    source: 'store',
    parentArtifactIds: [
      'dcfaf996-b3ec-42c4-9103-c6c7eace10d1',
      '10ede395-5dc8-4c2e-9da0-618394222143',
    ],
    summary: 'UMA relaxation results: 5 candidate structures relaxed with energies, steps, and CIF outputs.',
  },
  {
    artifactId: '779264cd-a52c-42fb-ba8a-5521d206144c',
    source: 'store',
    parentArtifactIds: [
      '04589c87-f65c-491c-945e-ed7c23a1d26a',
      DERIVED_PHONON_ID,
      '61fa56ff-c1ba-4010-a8bb-27f42e8e2e6e',
    ],
    summary: 'Tc benchmark bundle: Allen-Dynes estimates for LaH10, YH9, CaH6, and H3S using literature lambda and omega_log.',
  },
  {
    artifactId: DERIVED_PHONON_ID,
    source: 'derived',
    parentArtifactIds: ['04589c87-f65c-491c-945e-ed7c23a1d26a'],
    summary: 'Phonon stability panel: 5 UMA-relaxed structures analyzed, 4 dynamically stable and 1 unstable.',
    artifactType: 'computational_results',
    producerAgent: 'PhononAnalyst',
    skillUsed: 'phonon',
    createdAt: '2026-04-09T06:09:30.000Z',
    payload: {
      structures_analyzed: 5,
      dynamically_stable: 4,
      unstable: 1,
      stable_formulas: ['LaH20', 'CaH3', 'CaH2 (Pnma)', 'CaH2 (Cmcm)'],
      unstable_formulas: ['CaH2 (P63/mmc)'],
      note: 'Derived from the public CS5 thread and report tables to represent the phonon analysis stage.',
    },
  },
  {
    artifactId: '0b9a239e-4ab1-4022-92ff-50950af44e52',
    source: 'store',
    parentArtifactIds: ['61fa56ff-c1ba-4010-a8bb-27f42e8e2e6e'],
    summary: 'Phonon literature set: arXiv papers covering LaH10 stability, substitution, and superconducting hydride trends.',
  },
  {
    artifactId: '0f7cbe5f-18f0-43c1-a4b9-7345294d1097',
    source: 'store',
    parentArtifactIds: [],
    summary: 'Experimental benchmark set: OpenAlex references for LaH10, CeH9, and related clathrate superhydrides.',
  },
  {
    artifactId: 'cae16d0d-7ce9-4f63-8d17-d459d307297c',
    source: 'store',
    parentArtifactIds: ['0f7cbe5f-18f0-43c1-a4b9-7345294d1097'],
    summary: 'Targeted PubMed set: superconducting hydride benchmarks and quantum structural fluxion context.',
  },
  {
    artifactId: '61fa56ff-c1ba-4010-a8bb-27f42e8e2e6e',
    source: 'store',
    parentArtifactIds: [],
    summary: 'Theory and doping literature: arXiv papers on LaH10 substitution, pressure windows, and Tc theory.',
  },
  {
    artifactId: 'b59a0fb7-17af-4a0a-9dc4-c52658376413',
    source: 'store',
    parentArtifactIds: [
      '779264cd-a52c-42fb-ba8a-5521d206144c',
      '0f7cbe5f-18f0-43c1-a4b9-7345294d1097',
      '0b9a239e-4ab1-4022-92ff-50950af44e52',
      'cae16d0d-7ce9-4f63-8d17-d459d307297c',
    ],
    summary: 'Synthesis computation bundle: final report-side calculations assembled for ranking and discussion.',
  },
  {
    artifactId: '820cd1ce-8231-4219-b5e8-5027d6df45f5',
    source: 'store',
    parentArtifactIds: ['b59a0fb7-17af-4a0a-9dc4-c52658376413'],
    summary: 'Report figure artifact: scientific visualization output attached to the final CS5 report comment.',
  },
];

function buildRows(storeArtifacts: Map<string, StoreArtifact>) {
  const unresolved: string[] = [];
  const rows = manifest.map((entry) => {
    if (entry.source === 'derived') {
      return {
        artifactId: entry.artifactId,
        postId: POST_ID,
        artifactType: entry.artifactType,
        skillUsed: entry.skillUsed,
        producerAgent: entry.producerAgent,
        parentArtifactIds: entry.parentArtifactIds,
        createdAt: new Date(entry.createdAt),
        summary: entry.summary,
        contentHash: sha256Json(entry.payload),
        schemaVersion: '1.0',
        payload: entry.payload,
        investigationId: INVESTIGATION_ID,
      };
    }

    const source = storeArtifacts.get(entry.artifactId);
    if (!source) {
      unresolved.push(entry.artifactId);
      return null;
    }

    return {
      artifactId: source.artifact_id,
      postId: POST_ID,
      artifactType: source.artifact_type,
      skillUsed: source.skill_used,
      producerAgent: source.producer_agent,
      parentArtifactIds: entry.parentArtifactIds,
      createdAt: new Date(source.timestamp ?? new Date().toISOString()),
      summary: entry.summary,
      contentHash: source.content_hash ?? sha256Json(source.payload ?? {}),
      schemaVersion: source.schema_version ?? '1.0',
      payload: source.payload ?? null,
      investigationId: INVESTIGATION_ID,
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null);

  return { rows, unresolved };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const viaApi = args.has('--via-api');
  const dryRun = args.has('--dry-run') || !apply;
  if (apply && dryRun && args.size > 1) {
    console.error('Pass either --dry-run or --apply');
    process.exit(1);
  }

  const storeArtifacts = loadStoreArtifacts();
  const { rows, unresolved } = buildRows(storeArtifacts);

  console.log(`Loaded ${storeArtifacts.size} store artifacts for ${INVESTIGATION_ID}.`);
  console.log(`Manifest entries: ${manifest.length}`);
  console.log(`Resolved rows: ${rows.length}`);
  console.log(`Store-backed rows: ${manifest.filter((entry) => entry.source === 'store').length}`);
  console.log(`Derived rows: ${manifest.filter((entry) => entry.source === 'derived').length}`);

  if (unresolved.length > 0) {
    console.error('Unresolved artifact IDs:');
    for (const artifactId of unresolved) {
      console.error(`  - ${artifactId}`);
    }
    process.exit(1);
  }

  for (const row of rows) {
    console.log(
      `${row.producerAgent.padEnd(18)} ${row.skillUsed.padEnd(24)} ${row.artifactType.padEnd(22)} ${row.artifactId}`
    );
  }

  if (dryRun) {
    console.log('Dry run complete. Re-run with --apply to write the curated DAG.');
    return;
  }

  if (viaApi) {
    const apiBase = process.env.INFINITE_API_BASE;
    const token = process.env.INFINITE_TOKEN;
    if (!apiBase || !token) {
      console.error('INFINITE_API_BASE and INFINITE_TOKEN are required for --via-api');
      process.exit(1);
    }

    const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/posts/${POST_ID}/artifacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        artifacts: rows.map((row) => ({
          artifact_id: row.artifactId,
          artifact_type: row.artifactType,
          skill_used: row.skillUsed,
          producer_agent: row.producerAgent,
          parent_artifact_ids: row.parentArtifactIds,
          timestamp: row.createdAt.toISOString(),
          summary: row.summary,
        })),
      }),
    });

    if (!response.ok) {
      console.error(`Artifact API write failed: ${response.status} ${response.statusText}`);
      console.error(await response.text());
      process.exit(1);
    }

    console.log(await response.text());
    console.log(`Applied ${rows.length} curated artifacts to post ${POST_ID} via API.`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required for --apply');
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL, {
    connection: { search_path: 'public' },
    max: 1,
  });

  for (const row of rows) {
    await sql`
      insert into artifacts (
        artifact_id,
        post_id,
        artifact_type,
        skill_used,
        producer_agent,
        parent_artifact_ids,
        created_at,
        summary
      ) values (
        ${row.artifactId},
        ${row.postId},
        ${row.artifactType},
        ${row.skillUsed},
        ${row.producerAgent},
        ${sql.json(row.parentArtifactIds)},
        ${row.createdAt},
        ${row.summary}
      )
      on conflict (artifact_id) do update set
        post_id = excluded.post_id,
        artifact_type = excluded.artifact_type,
        skill_used = excluded.skill_used,
        producer_agent = excluded.producer_agent,
        parent_artifact_ids = excluded.parent_artifact_ids,
        created_at = excluded.created_at,
        summary = excluded.summary
    `;
  }

  await sql.end({ timeout: 5 });

  console.log(`Applied ${rows.length} curated artifacts to post ${POST_ID}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
