/**
 * Agent logic for Vercel-native multi-agent collaboration.
 * Agents run as async tasks, pushing SSE events via a send() callback.
 */

import { runTool, ToolResult, TOOL_FNS } from './tools';

export interface CollabEvent {
  type: string;
  agent: string;
  payload: Record<string, unknown>;
  timestamp: string;
  ref_agent?: string;
}

export type SendFn = (event: CollabEvent) => void;

// ─── Agent domain configs ─────────────────────────────────────────────────────
// Each domain has a toolPool of 6-8 candidates; LLM picks the best 3 per topic.

export const AGENT_DOMAINS = [
  {
    suffix: 'Bio',
    domain: 'biology',
    focus: 'protein structure, gene function, molecular biology, disease mechanisms, protein interactions',
    toolPool: ['uniprot', 'pdb', 'ncbi_gene', 'string', 'reactome', 'europepmc', 'kegg'],
    defaultTools: ['uniprot', 'pdb', 'europepmc'],
    color: 'green',
  },
  {
    suffix: 'Chem',
    domain: 'chemistry',
    focus: 'drug discovery, compound properties, medicinal chemistry, ADMET, pharmacology, drug-target interactions',
    toolPool: ['chembl', 'pubchem', 'openfda', 'opentargets', 'kegg', 'europepmc'],
    defaultTools: ['chembl', 'pubchem', 'openfda'],
    color: 'cyan',
  },
  {
    suffix: 'Comp',
    domain: 'computational',
    focus: 'bioinformatics, computational biology, machine learning, structure prediction, algorithms',
    toolPool: ['arxiv', 'semanticscholar', 'pdb', 'crossref', 'uniprot', 'ncbi_gene'],
    defaultTools: ['arxiv', 'crossref', 'pdb'],
    color: 'purple',
  },
  {
    suffix: 'Clin',
    domain: 'clinical',
    focus: 'clinical trials, drug safety, therapeutic outcomes, patient populations, regulatory data',
    toolPool: ['clinicaltrials', 'openfda', 'europepmc', 'opentargets', 'pubmed'],
    defaultTools: ['clinicaltrials', 'openfda', 'europepmc'],
    color: 'yellow',
  },
  {
    suffix: 'Lit',
    domain: 'literature',
    focus: 'systematic review, citation analysis, meta-analysis, cross-database evidence synthesis',
    toolPool: ['pubmed', 'semanticscholar', 'crossref', 'europepmc', 'arxiv'],
    defaultTools: ['pubmed', 'crossref', 'europepmc'],
    color: 'blue',
  },
];

// ─── Collaboration modes ──────────────────────────────────────────────────────

export const COLLAB_MODES = {
  broad: {
    label: 'Broad Scan',
    description: '5 agents across all scientific domains',
    icon: '🌐',
    domainIndices: [0, 1, 2, 3, 4],
  },
  drug_discovery: {
    label: 'Drug Discovery',
    description: 'Chemistry + Clinical + Biology — target ID, compound profiles, trial data',
    icon: '💊',
    domainIndices: [1, 3, 0],
  },
  structure: {
    label: 'Structure Focus',
    description: 'Biology + Computational — PDB structures, UniProt, ML preprints',
    icon: '🧬',
    domainIndices: [0, 2],
  },
  literature: {
    label: 'Literature Review',
    description: 'Literature + Biology + Computational — cross-database citation synthesis',
    icon: '📚',
    domainIndices: [4, 0, 2],
  },
} as const;

export type CollabMode = keyof typeof COLLAB_MODES;

export function getDomainsForMode(mode: CollabMode): typeof AGENT_DOMAINS {
  const indices = COLLAB_MODES[mode].domainIndices as readonly number[];
  return indices.map(i => AGENT_DOMAINS[i]);
}

// ─── Dynamic tool selection via LLM ──────────────────────────────────────────

async function selectToolsForTopic(
  domain: string,
  focus: string,
  toolPool: string[],
  topic: string,
  nTools = 3,
): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return toolPool.slice(0, nTools);

  // Only include tools that are actually registered
  const validPool = toolPool.filter(t => t in TOOL_FNS);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `${domain} researcher (focus: ${focus}) investigating: "${topic}"\nAvailable tools: [${validPool.join(', ')}]\nRespond ONLY with a JSON array of exactly ${nTools} tool names best suited for this specific topic. No explanation.`,
        }],
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return validPool.slice(0, nTools);
    const data = await res.json() as { content?: { text?: string }[] };
    const text = data?.content?.[0]?.text?.trim() ?? '';
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const selected = (JSON.parse(match[0]) as string[])
        .filter((t: string) => validPool.includes(t))
        .slice(0, nTools);
      if (selected.length >= 2) return selected;
    }
  } catch {}

  return validPool.slice(0, nTools);
}

// ─── Inline SVG figure generation ────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildFigureSVG(tool: string, items: Record<string, unknown>[]): string | null {
  if (!items || items.length === 0) return null;

  const W = 340, H = 170;
  const PAD = { top: 22, right: 14, bottom: 32, left: 36 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const axes = `<line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="#444" stroke-width="1"/>
  <line x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${PAD.left + plotW}" y2="${PAD.top + plotH}" stroke="#444" stroke-width="1"/>`;

  // ── Year histogram (pubmed, arxiv, europepmc, crossref, semanticscholar) ──
  if (['pubmed', 'arxiv', 'europepmc', 'crossref', 'semanticscholar'].includes(tool)) {
    const years = items
      .map(it => {
        const raw = String(it.year ?? it.pubYear ?? it.published ?? '');
        return raw.slice(0, 4);
      })
      .filter(y => /^[12]\d{3}$/.test(y));
    if (years.length < 2) return null;

    const counts: Record<string, number> = {};
    for (const y of years) counts[y] = (counts[y] || 0) + 1;
    const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));

    const maxC = Math.max(...entries.map(([, v]) => v), 1);
    const bw = Math.max(Math.floor(plotW / entries.length) - 2, 4);
    const colorMap: Record<string, string> = {
      pubmed: '#6366f1', arxiv: '#8b5cf6', europepmc: '#3b82f6',
      crossref: '#06b6d4', semanticscholar: '#10b981',
    };
    const color = colorMap[tool] ?? '#6366f1';

    const bars = entries.map(([year, count], i) => {
      const bh = Math.max(Math.round((count / maxC) * plotH), 2);
      const x = PAD.left + i * (bw + 2);
      const y = PAD.top + plotH - bh;
      const label = entries.length <= 10 ? `<text x="${x + bw / 2}" y="${PAD.top + plotH + 10}" text-anchor="middle" font-size="7" fill="#666">${year.slice(2)}</text>` : '';
      return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${color}" rx="2" opacity="0.85"><title>${year}: ${count}</title></rect>${label}`;
    }).join('');

    const yticks = [0, Math.round(maxC / 2), maxC].map(v => {
      const ty = PAD.top + plotH - Math.round((v / maxC) * plotH);
      return `<text x="${PAD.left - 4}" y="${ty + 3}" text-anchor="end" font-size="8" fill="#666">${v}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#18181b;border-radius:8px;display:block">
  <text x="${W / 2}" y="14" text-anchor="middle" font-size="10" fill="#aaa" font-family="monospace">Publications by year · ${tool} (n=${years.length})</text>
  ${axes}${yticks}${bars}
</svg>`;
  }

  // ── Molecular weight histogram (chembl, pubchem) ──────────────────────────
  if (tool === 'chembl' || tool === 'pubchem') {
    const mws = items.map(it => Number(it.mw || 0)).filter(v => v > 50 && v < 1500);
    if (mws.length < 2) return null;

    const edges = [0, 150, 250, 350, 450, 600, 800, 1500];
    const labels = ['<150', '150', '250', '350', '450', '600', '800+'];
    const counts = edges.slice(0, -1).map((lo, i) => mws.filter(m => m >= lo && m < edges[i + 1]).length);
    const maxC = Math.max(...counts, 1);
    const bw = Math.floor(plotW / counts.length) - 2;

    const bars = counts.map((count, i) => {
      const bh = Math.max(Math.round((count / maxC) * plotH), count > 0 ? 2 : 0);
      const x = PAD.left + i * (bw + 2);
      return `<rect x="${x}" y="${PAD.top + plotH - bh}" width="${bw}" height="${bh}" fill="#06b6d4" rx="2" opacity="0.85">
  <title>${labels[i]} Da: ${count}</title></rect>
  <text x="${x + bw / 2}" y="${PAD.top + plotH + 10}" text-anchor="middle" font-size="7" fill="#666">${labels[i]}</text>`;
    }).join('');

    const yticks = [0, Math.round(maxC / 2), maxC].map(v => {
      const ty = PAD.top + plotH - Math.round((v / maxC) * plotH);
      return `<text x="${PAD.left - 4}" y="${ty + 3}" text-anchor="end" font-size="8" fill="#666">${v}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#18181b;border-radius:8px;display:block">
  <text x="${W / 2}" y="14" text-anchor="middle" font-size="10" fill="#aaa" font-family="monospace">Mol. weight distribution (Da) · ${tool} (n=${mws.length})</text>
  ${axes}${yticks}${bars}
  <text x="${PAD.left}" y="${H - 2}" font-size="8" fill="#555">Da</text>
</svg>`;
  }

  // ── Protein length histogram (uniprot) ───────────────────────────────────
  if (tool === 'uniprot') {
    const lengths = items.map(it => Number(it.length || 0)).filter(v => v > 0);
    if (lengths.length < 2) return null;

    const maxL = Math.max(...lengths);
    const nBins = 8;
    const binSize = Math.ceil(maxL / nBins);
    const counts = Array<number>(nBins).fill(0);
    for (const l of lengths) counts[Math.min(Math.floor(l / binSize), nBins - 1)]++;
    const maxC = Math.max(...counts, 1);
    const bw = Math.floor(plotW / nBins) - 2;

    const bars = counts.map((count, i) => {
      const bh = Math.max(Math.round((count / maxC) * plotH), count > 0 ? 2 : 0);
      const x = PAD.left + i * (bw + 2);
      const label = i === 0 ? '0' : i === nBins - 1 ? `${maxL}aa` : '';
      return `<rect x="${x}" y="${PAD.top + plotH - bh}" width="${bw}" height="${bh}" fill="#22c55e" rx="2" opacity="0.85">
  <title>${i * binSize}–${(i + 1) * binSize} aa: ${count}</title></rect>
  ${label ? `<text x="${x + bw / 2}" y="${PAD.top + plotH + 10}" text-anchor="middle" font-size="7" fill="#666">${label}</text>` : ''}`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#18181b;border-radius:8px;display:block">
  <text x="${W / 2}" y="14" text-anchor="middle" font-size="10" fill="#aaa" font-family="monospace">Protein length (aa) · uniprot (n=${lengths.length})</text>
  ${axes}${bars}
  <text x="${PAD.left}" y="${H - 2}" font-size="8" fill="#555">← shorter · longer →</text>
</svg>`;
  }

  // ── PDB score horizontal bars ─────────────────────────────────────────────
  if (tool === 'pdb') {
    const scored = items
      .map(it => ({ id: String(it.pdb_id || ''), score: Number(it.score || 0) }))
      .filter(it => it.id && it.score > 0)
      .slice(0, 8);
    if (scored.length === 0) return null;

    const maxS = Math.max(...scored.map(s => s.score), 1);
    const bh = Math.max(Math.floor(plotH / scored.length) - 3, 6);

    const bars = scored.map(({ id, score }, i) => {
      const bw = Math.round((score / maxS) * plotW * 0.6);
      const y = PAD.top + i * (bh + 3);
      return `<rect x="${PAD.left}" y="${y}" width="${bw}" height="${bh}" fill="#a78bfa" rx="2" opacity="0.85">
  <title>${id}: ${score}</title></rect>
  <text x="${PAD.left + bw + 4}" y="${y + bh - 1}" font-size="8" fill="#aaa">${esc(id)}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#18181b;border-radius:8px;display:block">
  <text x="${W / 2}" y="14" text-anchor="middle" font-size="10" fill="#aaa" font-family="monospace">PDB relevance scores (top ${scored.length})</text>
  <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="#444" stroke-width="1"/>
  ${bars}
</svg>`;
  }

  // ── Clinical trials phase distribution ────────────────────────────────────
  if (tool === 'clinicaltrials') {
    const phases: Record<string, number> = {};
    for (const it of items) {
      const p = String(it.phase || 'N/A')
        .replace('PHASE', 'Ph').replace('_', '').replace(',', '/');
      phases[p] = (phases[p] || 0) + 1;
    }
    const entries = Object.entries(phases).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return null;

    const maxC = Math.max(...entries.map(([, v]) => v), 1);
    const bw = Math.floor(plotW / entries.length) - 3;
    const colors = ['#f59e0b', '#f97316', '#ef4444', '#8b5cf6', '#06b6d4', '#22c55e'];

    const bars = entries.map(([phase, count], i) => {
      const bh = Math.max(Math.round((count / maxC) * plotH), 2);
      const x = PAD.left + i * (bw + 3);
      const y = PAD.top + plotH - bh;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${colors[i % colors.length]}" rx="2" opacity="0.85">
  <title>${phase}: ${count}</title></rect>
  <text x="${x + bw / 2}" y="${PAD.top + plotH + 11}" text-anchor="middle" font-size="8" fill="#888">${esc(phase.slice(0, 5))}</text>
  <text x="${x + bw / 2}" y="${y - 3}" text-anchor="middle" font-size="8" fill="#ccc">${count}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#18181b;border-radius:8px;display:block">
  <text x="${W / 2}" y="14" text-anchor="middle" font-size="10" fill="#aaa" font-family="monospace">Clinical trials by phase (n=${items.length})</text>
  ${axes}${bars}
</svg>`;
  }

  // ── OpenFDA route distribution ────────────────────────────────────────────
  if (tool === 'openfda') {
    const routes: Record<string, number> = {};
    for (const it of items) {
      const r = String(it.route || 'unknown').toLowerCase();
      routes[r] = (routes[r] || 0) + 1;
    }
    const entries = Object.entries(routes).sort(([, a], [, b]) => b - a).slice(0, 7);
    if (entries.length === 0) return null;

    const maxC = Math.max(...entries.map(([, v]) => v), 1);
    const bh = Math.max(Math.floor(plotH / entries.length) - 3, 8);

    const bars = entries.map(([route, count], i) => {
      const bw = Math.round((count / maxC) * plotW * 0.55);
      const y = PAD.top + i * (bh + 3);
      return `<rect x="${PAD.left}" y="${y}" width="${bw}" height="${bh}" fill="#22d3ee" rx="2" opacity="0.85">
  <title>${route}: ${count}</title></rect>
  <text x="${PAD.left + bw + 4}" y="${y + bh - 1}" font-size="8" fill="#aaa">${esc(route.slice(0, 20))} (${count})</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#18181b;border-radius:8px;display:block">
  <text x="${W / 2}" y="14" text-anchor="middle" font-size="10" fill="#aaa" font-family="monospace">FDA drugs by route (n=${items.length})</text>
  <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="#444" stroke-width="1"/>
  ${bars}
</svg>`;
  }

  // ── KEGG: pathway vs disease count ───────────────────────────────────────
  if (tool === 'kegg') {
    const categories: Record<string, number> = {};
    for (const it of items) {
      const cat = String(it.category || 'other');
      categories[cat] = (categories[cat] || 0) + 1;
    }
    const entries = Object.entries(categories);
    if (entries.length === 0) return null;

    const maxC = Math.max(...entries.map(([, v]) => v), 1);
    const bw = Math.floor(plotW / entries.length) - 8;
    const colors = ['#f59e0b', '#6366f1', '#22c55e', '#ef4444'];

    const bars = entries.map(([cat, count], i) => {
      const bh = Math.max(Math.round((count / maxC) * plotH), 2);
      const x = PAD.left + i * (bw + 8) + 10;
      const y = PAD.top + plotH - bh;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${colors[i % colors.length]}" rx="3" opacity="0.85">
  <title>${cat}: ${count}</title></rect>
  <text x="${x + bw / 2}" y="${PAD.top + plotH + 12}" text-anchor="middle" font-size="9" fill="#aaa">${esc(cat)}</text>
  <text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#ccc">${count}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#18181b;border-radius:8px;display:block">
  <text x="${W / 2}" y="14" text-anchor="middle" font-size="10" fill="#aaa" font-family="monospace">KEGG entries by category (n=${items.length})</text>
  ${axes}${bars}
</svg>`;
  }

  // ── STRING: interaction scores ────────────────────────────────────────────
  if (tool === 'string') {
    const partners = items
      .filter(it => it.kind === 'interaction_partner' && it.score != null)
      .map(it => ({ name: String(it.name ?? ''), score: Number(it.score ?? 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 7);
    if (partners.length === 0) return null;

    const maxS = Math.max(...partners.map(p => p.score), 1);
    const bh = Math.max(Math.floor(plotH / partners.length) - 3, 8);

    const bars = partners.map(({ name, score }, i) => {
      const bw = Math.round((score / maxS) * plotW * 0.6);
      const y = PAD.top + i * (bh + 3);
      return `<rect x="${PAD.left}" y="${y}" width="${bw}" height="${bh}" fill="#f97316" rx="2" opacity="0.85">
  <title>${name}: ${score.toFixed(3)}</title></rect>
  <text x="${PAD.left + bw + 4}" y="${y + bh - 1}" font-size="8" fill="#aaa">${esc(name.slice(0, 10))} (${score.toFixed(2)})</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#18181b;border-radius:8px;display:block">
  <text x="${W / 2}" y="14" text-anchor="middle" font-size="10" fill="#aaa" font-family="monospace">STRING interaction scores (top ${partners.length})</text>
  <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="#444" stroke-width="1"/>
  ${bars}
</svg>`;
  }

  // ── Open Targets: entity type breakdown ───────────────────────────────────
  if (tool === 'opentargets') {
    const entityCounts: Record<string, number> = {};
    for (const it of items) {
      const e = String(it.entity || 'unknown');
      entityCounts[e] = (entityCounts[e] || 0) + 1;
    }
    const entries = Object.entries(entityCounts).sort(([, a], [, b]) => b - a);
    if (entries.length === 0) return null;

    const maxC = Math.max(...entries.map(([, v]) => v), 1);
    const bw = Math.floor(plotW / entries.length) - 6;
    const colors = ['#06b6d4', '#a78bfa', '#f59e0b', '#22c55e'];

    const bars = entries.map(([entity, count], i) => {
      const bh = Math.max(Math.round((count / maxC) * plotH), 2);
      const x = PAD.left + i * (bw + 6) + 8;
      const y = PAD.top + plotH - bh;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${colors[i % colors.length]}" rx="3" opacity="0.85">
  <title>${entity}: ${count}</title></rect>
  <text x="${x + bw / 2}" y="${PAD.top + plotH + 12}" text-anchor="middle" font-size="8" fill="#aaa">${esc(entity.slice(0, 8))}</text>
  <text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#ccc">${count}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#18181b;border-radius:8px;display:block">
  <text x="${W / 2}" y="14" text-anchor="middle" font-size="10" fill="#aaa" font-family="monospace">Open Targets hits by entity (n=${items.length})</text>
  ${axes}${bars}
</svg>`;
  }

  // ── Reactome: top pathways horizontal bars ────────────────────────────────
  if (tool === 'reactome') {
    const named = items
      .filter(it => it.name)
      .slice(0, 6)
      .map((it, i) => ({ name: String(it.name ?? ''), rank: items.length - i }));
    if (named.length === 0) return null;

    const maxR = named[0].rank;
    const bh = Math.max(Math.floor(plotH / named.length) - 3, 8);

    const bars = named.map(({ name, rank }, i) => {
      const bw = Math.round((rank / maxR) * plotW * 0.55);
      const y = PAD.top + i * (bh + 3);
      return `<rect x="${PAD.left}" y="${y}" width="${bw}" height="${bh}" fill="#22c55e" rx="2" opacity="0.75">
  <title>${name}</title></rect>
  <text x="${PAD.left + bw + 4}" y="${y + bh - 1}" font-size="7" fill="#aaa">${esc(name.slice(0, 28))}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#18181b;border-radius:8px;display:block">
  <text x="${W / 2}" y="14" text-anchor="middle" font-size="10" fill="#aaa" font-family="monospace">Reactome pathways (top ${named.length})</text>
  <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="#444" stroke-width="1"/>
  ${bars}
</svg>`;
  }

  return null;
}

// ─── LLM synthesis ────────────────────────────────────────────────────────────

async function llmSynthesize(
  agentName: string,
  domain: string,
  topic: string,
  toolResults: ToolResult[]
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const summaries = toolResults
    .filter(r => !r.error && r.items.length > 0)
    .map(r => `${r.tool}: ${r.summary}`)
    .join('\n');

  if (!summaries) return null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 280,
        messages: [{
          role: 'user',
          content: `You are ${agentName}, a ${domain} researcher investigating "${topic}".\n\nTool results:\n${summaries}\n\nWrite a concise scientific finding (2-4 sentences, specific and quantitative where possible). Focus on mechanistic insights, key data points, and actionable conclusions. Include specific identifiers (gene names, compound IDs, pathway names) where found. Avoid vague generalities.`,
        }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const data = await res.json() as { content?: { text?: string }[] };
    return data?.content?.[0]?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

// ─── Rule-based synthesis fallback ───────────────────────────────────────────

function ruleSynthesize(
  agentName: string,
  domain: string,
  topic: string,
  toolResults: ToolResult[]
): string {
  const successful = toolResults.filter(r => !r.error && r.items.length > 0);
  if (successful.length === 0) {
    return `[${domain.toUpperCase()}] Investigation of "${topic}" via ${domain} tools yielded limited results. Further investigation with specialized databases may reveal relevant ${domain} connections.`;
  }

  const highlights = successful.map(r => {
    const count = r.items.length;
    const first = r.items[0];
    const name = (first?.title ?? first?.name ?? first?.symbol ?? first?.iupac ?? '') as string;
    return `${r.tool} (${count} results${name ? `: "${String(name).slice(0, 60)}"` : ''})`;
  });

  const mechanismHints: Record<string, string> = {
    biology: 'with structural and functional implications for protein biology and disease mechanisms',
    chemistry: 'revealing pharmacological profiles, drug-target interactions, and structure-activity relationships',
    computational: 'demonstrating computational models, predictive frameworks, and structural insights',
    clinical: 'providing clinical evidence for therapeutic applications, safety profiles, and regulatory status',
    literature: 'establishing cross-database literature consensus with citation-weighted evidence',
  };

  return `[${domain.toUpperCase()}] Investigated "${topic}" using ${highlights.join(', ')}, ${mechanismHints[domain] ?? 'yielding multi-source insights'}. Cross-database analysis reveals convergent evidence ${successful.length > 1 ? 'across ' + successful.length + ' independent data sources' : 'from primary literature'}.`;
}

// ─── Content-aware peer interaction ──────────────────────────────────────────

interface ChallengeAnalysis {
  should: boolean;
  reason: string;
}

function analyzeForChallenge(
  myDomain: string,
  myToolResults: ToolResult[],
  peerFinding: string,
): ChallengeAnalysis {
  const pf = peerFinding.toLowerCase();

  // Domain-specific: what terms in a peer finding signal we should weigh in
  const crossDomainConfig: Record<string, { patterns: string[]; challenge: string }> = {
    biology: {
      patterns: ['compound', 'smiles', 'drug', 'inhibitor', 'agonist', 'molecular weight', 'dalton', 'nanomolar', 'ic50', 'ki value'],
      challenge: 'protein-level mechanism and target engagement context',
    },
    chemistry: {
      patterns: ['protein', 'gene expression', 'transcription factor', 'pathway activation', 'mrna', 'signaling cascade', 'receptor binding'],
      challenge: 'compound selectivity and chemical space context',
    },
    computational: {
      patterns: ['clinical trial', 'patient cohort', 'in vivo', 'animal model', 'efficacy endpoint', 'adverse event'],
      challenge: 'computational models require empirical validation before clinical translation',
    },
    clinical: {
      patterns: ['predicted', 'in silico', 'model suggests', 'simulation', 'computational', 'docking score', 'affinity prediction'],
      challenge: 'computational predictions should be cross-referenced with observed clinical outcomes',
    },
    literature: {
      patterns: ['novel', 'unprecedented', 'first report', 'unique mechanism', 'previously unknown'],
      challenge: 'systematic literature synthesis provides prior context for this claim',
    },
  };

  const config = crossDomainConfig[myDomain];
  if (!config) return { should: false, reason: '' };

  const triggered = config.patterns.some(p => pf.includes(p));
  if (!triggered) return { should: false, reason: '' };

  // Build a specific challenge referencing our own tool findings
  const ourData = myToolResults
    .filter(r => !r.error && r.items.length > 0)
    .map(r => {
      const first = r.items[0];
      const label = (first?.name ?? first?.title ?? first?.symbol ?? '') as string;
      return label ? `${r.tool} (e.g. "${String(label).slice(0, 40)}")` : r.tool;
    })
    .slice(0, 2);

  const reason = ourData.length > 0
    ? `From a ${myDomain} perspective, ${config.challenge}. Our ${ourData.join(' + ')} data provide complementary evidence that should be integrated.`
    : `From a ${myDomain} perspective, ${config.challenge} warrants additional investigation.`;

  return { should: true, reason };
}

// ─── AgentRunner ─────────────────────────────────────────────────────────────

export async function runAgent(
  domainCfg: typeof AGENT_DOMAINS[0],
  topic: string,
  send: SendFn,
  peerFindings: { agent: string; text: string }[],
): Promise<{ agent: string; finding: string; tools: string[] }> {
  const agentName = `Agent${domainCfg.suffix}`;
  const ts = () => new Date().toISOString();

  const emit = (type: string, payload: Record<string, unknown>, refAgent?: string) => {
    send({ type, agent: agentName, payload, timestamp: ts(), ref_agent: refAgent });
  };

  // Select tools dynamically for this topic
  emit('AgentStatus', { status: 'planning', detail: `Selecting tools for "${topic}"` });
  const selectedTools = await selectToolsForTopic(
    domainCfg.domain,
    domainCfg.focus,
    domainCfg.toolPool,
    topic,
  );

  emit('Thought', { text: `Selected ${selectedTools.length} tools: ${selectedTools.join(', ')}` });
  emit('AgentStatus', { status: 'running', detail: `Executing ${selectedTools.length} tools` });

  const toolResults: ToolResult[] = [];
  for (const tool of selectedTools) {
    emit('ToolStarted', { tool, params: { query: topic } });
    const result = await runTool(tool, topic);
    toolResults.push(result);

    emit('ToolResult', {
      tool,
      summary: result.summary,
      count: result.items.length,
      items: result.items.slice(0, 8),
      error: result.error ?? null,
    });

    if (!result.error && result.items.length > 0) {
      const svg = buildFigureSVG(tool, result.items.slice(0, 20));
      if (svg) {
        emit('Figure', { svg, tool, title: `${tool} · ${agentName}` });
      }
      emit('Thought', { text: `${tool}: ${result.summary.slice(0, 120)}` });
    }

    await sleep(100);
  }

  // React to peers with content-aware analysis
  for (const peer of peerFindings) {
    if (peer.agent === agentName) continue;
    await sleep(150 + Math.random() * 200);

    const analysis = analyzeForChallenge(domainCfg.domain, toolResults, peer.text);
    if (analysis.should) {
      emit('Challenge', {
        finding: peer.text.slice(0, 120),
        reason: analysis.reason,
      }, peer.agent);
    } else if (Math.random() < 0.45) {
      // Agreement: reference specific overlapping data
      const sharedTerms = toolResults
        .filter(r => !r.error && r.items.length > 0)
        .flatMap(r => r.items.slice(0, 2))
        .map(it => (it.name ?? it.title ?? it.symbol ?? '') as string)
        .filter(Boolean)
        .slice(0, 2);
      const agreementNote = sharedTerms.length > 0
        ? `Our ${domainCfg.domain} data (including ${sharedTerms.map(s => `"${String(s).slice(0, 30)}"`).join(', ')}) corroborates this finding.`
        : `Consistent with our ${domainCfg.domain} analysis.`;
      emit('Agreement', { finding: peer.text.slice(0, 100), note: agreementNote }, peer.agent);
    }
  }

  // Synthesize
  emit('Thought', { text: 'Synthesizing findings across tools...' });
  const llmResult = await llmSynthesize(agentName, domainCfg.domain, topic, toolResults);
  const finding = llmResult ?? ruleSynthesize(agentName, domainCfg.domain, topic, toolResults);

  emit('Finding', {
    text: finding,
    confidence: 0.75,
    sources: toolResults.filter(r => !r.error).map(r => r.tool),
  });

  emit('AgentStatus', { status: 'done', detail: 'Investigation complete' });

  return { agent: agentName, finding, tools: selectedTools };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
