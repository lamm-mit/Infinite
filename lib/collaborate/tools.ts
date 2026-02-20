/**
 * Scientific tool implementations for Vercel-native collaboration.
 * Each tool calls a free public API and returns structured results.
 */

export interface ToolResult {
  tool: string;
  summary: string;
  items: Record<string, unknown>[];
  raw?: unknown;
  error?: string;
}

const FETCH_TIMEOUT = 10000;

const DEFAULT_HEADERS = {
  'User-Agent': 'ScienceCollab/1.0 (lammac; research bot)',
  'Accept': 'application/json',
};

async function fetchWithTimeout(url: string, opts: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { ...DEFAULT_HEADERS, ...(opts.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── PubMed ───────────────────────────────────────────────────────────────────

export async function searchPubMed(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`;
    const searchRes = await fetchWithTimeout(searchUrl);
    const searchData = await searchRes.json() as { esearchresult?: { idlist?: string[] } };
    const ids: string[] = searchData?.esearchresult?.idlist ?? [];

    if (ids.length === 0) {
      return { tool: 'pubmed', summary: `No papers found for "${query}"`, items: [] };
    }

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
    const summaryRes = await fetchWithTimeout(summaryUrl);
    const summaryData = await summaryRes.json() as { result?: Record<string, unknown> };
    const result = summaryData?.result ?? {};

    const items = ids.map(id => {
      const paper = result[id] as Record<string, unknown> | undefined;
      return {
        pmid: id,
        title: paper?.title ?? 'Unknown',
        authors: (paper?.authors as { name: string }[])?.[0]?.name ?? 'Unknown',
        year: String(paper?.pubdate ?? '').split(' ')[0] ?? '',
        journal: paper?.fulljournalname ?? '',
      };
    }).filter(p => p.title !== 'Unknown');

    const titles = items.map(p => `"${p.title}" (${p.year})`).join('; ');
    return {
      tool: 'pubmed',
      summary: `Found ${items.length} papers: ${titles.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'pubmed', summary: 'PubMed search failed', items: [], error: String(e) };
  }
}

// ─── UniProt ──────────────────────────────────────────────────────────────────

export async function searchUniProt(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const url = `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(query)}&format=json&size=${maxResults}&fields=accession,protein_name,gene_names,organism_name,length,annotation_score`;
    const res = await fetchWithTimeout(url);
    const data = await res.json() as { results?: Record<string, unknown>[] };
    const results = data?.results ?? [];

    const items = results.map(r => ({
      accession: r.primaryAccession,
      name: (r.proteinDescription as { recommendedName?: { fullName?: { value: string } } })?.recommendedName?.fullName?.value ?? 'Unknown',
      gene: (r.genes as { geneName?: { value: string } }[])?.[0]?.geneName?.value ?? '',
      organism: (r.organism as { scientificName?: string })?.scientificName ?? '',
      length: r.sequence ? (r.sequence as { length?: number })?.length : 0,
    }));

    const names = items.map(p => `${p.name} (${p.accession})`).join('; ');
    return {
      tool: 'uniprot',
      summary: `Found ${items.length} proteins: ${names.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'uniprot', summary: 'UniProt search failed', items: [], error: String(e) };
  }
}

// ─── ChEMBL ───────────────────────────────────────────────────────────────────

export async function searchChEMBL(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const url = `https://www.ebi.ac.uk/chembl/api/data/target/search?q=${encodeURIComponent(query)}&format=json&limit=${maxResults}`;
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { targets?: Record<string, unknown>[] };
    const targets = data?.targets ?? [];

    const url2 = `https://www.ebi.ac.uk/chembl/api/data/molecule?pref_name__icontains=${encodeURIComponent(query)}&format=json&limit=${maxResults}`;
    const res2 = await fetchWithTimeout(url2, { headers: { Accept: 'application/json' } });
    const data2 = res2.ok ? await res2.json() as { molecules?: Record<string, unknown>[] } : { molecules: [] };
    const molecules = data2?.molecules ?? [];

    const targetItems = targets.map(t => ({
      chembl_id: t.target_chembl_id as string,
      name: (t.pref_name as string) ?? 'Unknown target',
      type: t.target_type as string,
      organism: t.organism as string,
      kind: 'target' as const,
      mw: null,
      alogp: null,
    }));

    const molItems = molecules.map(m => ({
      chembl_id: m.molecule_chembl_id as string,
      name: (m.pref_name as string) ?? 'Unknown compound',
      mw: (m.molecule_properties as { full_mwt?: number } | null)?.full_mwt ?? null,
      alogp: (m.molecule_properties as { alogp?: number } | null)?.alogp ?? null,
      type: m.molecule_type as string,
      kind: 'molecule' as const,
    }));

    const items = [...targetItems.slice(0, 3), ...molItems.slice(0, maxResults - Math.min(3, targetItems.length))];
    if (items.length === 0) return { tool: 'chembl', summary: `No ChEMBL data for "${query}"`, items: [] };

    const names = items.map(m => m.name).join('; ');
    return {
      tool: 'chembl',
      summary: `Found ${items.length} entries (${targetItems.length} targets, ${molItems.length} compounds): ${names.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'chembl', summary: 'ChEMBL search failed', items: [], error: String(e) };
  }
}

// ─── ArXiv ────────────────────────────────────────────────────────────────────

export async function searchArXiv(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;
    const res = await fetchWithTimeout(url);
    const text = await res.text();

    const entries = [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
    const items = entries.map(match => {
      const entry = match[1];
      const title = (/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] ?? '').replace(/\s+/g, ' ').trim();
      const summary = (/<summary>([\s\S]*?)<\/summary>/.exec(entry)?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const published = /<published>(.*?)<\/published>/.exec(entry)?.[1]?.slice(0, 10) ?? '';
      const arxivId = /<id>.*\/([\w.]+)<\/id>/.exec(entry)?.[1] ?? '';
      return { title, summary, published, arxivId, year: published.slice(0, 4) };
    });

    const titles = items.map(p => `"${p.title}" (${p.published})`).join('; ');
    return {
      tool: 'arxiv',
      summary: `Found ${items.length} preprints: ${titles.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'arxiv', summary: 'ArXiv search failed', items: [], error: String(e) };
  }
}

// ─── PubChem ──────────────────────────────────────────────────────────────────

export async function searchPubChem(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/JSON?MaxRecords=${maxResults}`;
    const res = await fetchWithTimeout(url);
    if (res.status === 404) {
      return { tool: 'pubchem', summary: `No compounds found for "${query}"`, items: [] };
    }
    const data = await res.json() as { PC_Compounds?: Record<string, unknown>[] };
    const compounds = data?.PC_Compounds ?? [];

    const items = compounds.slice(0, maxResults).map(c => {
      const props = c.props as { urn?: { label?: string; name?: string }; value?: { sval?: string; fval?: number; ival?: number } }[] | undefined;
      const get = (label: string) => props?.find(p => p.urn?.label === label)?.value?.sval ?? props?.find(p => p.urn?.label === label)?.value?.fval ?? null;
      return {
        cid: c.id,
        iupac: get('IUPAC Name') ?? get('Preferred'),
        mw: get('Molecular Weight'),
        formula: get('Molecular Formula'),
      };
    });

    const names = items.map(c => `CID:${(c.cid as { id?: { cid?: number } })?.id?.cid} (${c.formula ?? 'unknown'})`).join('; ');
    return {
      tool: 'pubchem',
      summary: `Found ${items.length} compounds: ${names.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'pubchem', summary: 'PubChem search failed', items: [], error: String(e) };
  }
}

// ─── Europe PMC ───────────────────────────────────────────────────────────────

export async function searchEuropePMC(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${maxResults}&resultType=core&sort=CITED`;
    const res = await fetchWithTimeout(url);
    const data = await res.json() as { resultList?: { result?: Record<string, unknown>[] }; hitCount?: number };
    const results = data?.resultList?.result ?? [];

    const items = results.map(r => ({
      pmid: r.pmid as string,
      title: String(r.title ?? 'Unknown'),
      year: String(r.pubYear ?? ''),
      source: r.source as string,
      citedByCount: Number(r.citedByCount ?? 0),
      authorString: String(r.authorString ?? '').slice(0, 60),
    }));

    const titles = items.map(p => `"${p.title}" (cited ${p.citedByCount}×)`).join('; ');
    return {
      tool: 'europepmc',
      summary: `Found ${data.hitCount ?? items.length} articles (showing ${items.length}): ${titles.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'europepmc', summary: 'Europe PMC search failed', items: [], error: String(e) };
  }
}

// ─── RCSB PDB ─────────────────────────────────────────────────────────────────

export async function searchPDB(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const body = {
      query: { type: 'terminal', service: 'full_text', parameters: { value: query } },
      return_type: 'entry',
      request_options: { paginate: { start: 0, rows: maxResults } },
    };
    const res = await fetchWithTimeout('https://search.rcsb.org/rcsbsearch/v2/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...DEFAULT_HEADERS },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { tool: 'pdb', summary: `No PDB structures for "${query}"`, items: [] };
    const data = await res.json() as { result_set?: { identifier: string; score: number }[]; total_count?: number };
    const results = data?.result_set ?? [];

    const items = results.slice(0, maxResults).map(r => ({ pdb_id: r.identifier, score: Number(r.score.toFixed(3)) }));
    return {
      tool: 'pdb',
      summary: `Found ${data.total_count ?? items.length} PDB structures. Top hits: ${items.map(r => r.pdb_id).join(', ')}`,
      items,
    };
  } catch (e) {
    return { tool: 'pdb', summary: 'PDB search failed', items: [], error: String(e) };
  }
}

// ─── ClinicalTrials.gov ───────────────────────────────────────────────────────

export async function searchClinicalTrials(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(query)}&pageSize=${maxResults}&format=json`;
    const res = await fetchWithTimeout(url);
    const data = await res.json() as { studies?: Record<string, unknown>[] };
    const studies = data?.studies ?? [];

    const items = studies.map(s => {
      const ps = (s.protocolSection as Record<string, unknown>) ?? {};
      const id = (ps.identificationModule as Record<string, unknown>) ?? {};
      const status = (ps.statusModule as Record<string, unknown>) ?? {};
      const design = (ps.designModule as Record<string, unknown>) ?? {};
      return {
        nct_id: id.nctId as string,
        title: String(id.briefTitle ?? 'Unknown'),
        status: status.overallStatus as string,
        phase: ((design.phases as string[]) ?? []).join(', ') || 'N/A',
        enrollment: ((design.enrollmentInfo as Record<string, unknown>) ?? {}).count as number,
      };
    });

    const titles = items.map(s => `${s.nct_id} "${s.title}" [${s.phase}, ${s.status}]`).join('; ');
    return {
      tool: 'clinicaltrials',
      summary: `Found ${items.length} clinical trials: ${titles.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'clinicaltrials', summary: 'ClinicalTrials search failed', items: [], error: String(e) };
  }
}

// ─── CrossRef ─────────────────────────────────────────────────────────────────

export async function searchCrossRef(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${maxResults}&select=DOI,title,author,published,is-referenced-by-count,container-title`;
    const res = await fetchWithTimeout(url, {
      headers: { ...DEFAULT_HEADERS, 'User-Agent': 'ScienceCollab/1.0 (mailto:collab@lammac.ai)' },
    });
    const data = await res.json() as { message?: { items?: Record<string, unknown>[] } };
    const raw = data?.message?.items ?? [];

    const items = raw.map(r => ({
      doi: r.DOI as string,
      title: ((r.title as string[]) ?? [])[0] ?? 'Unknown',
      journal: ((r['container-title'] as string[]) ?? [])[0] ?? '',
      year: ((r.published as Record<string, number[][]>)?.['date-parts']?.[0]?.[0]) ?? 0,
      citations: Number(r['is-referenced-by-count'] ?? 0),
      firstAuthor: ((r.author as { family: string }[]) ?? [])[0]?.family ?? '',
    }));

    const titles = items.map(p => `"${p.title}" (${p.year}, cited ${p.citations}×)`).join('; ');
    return {
      tool: 'crossref',
      summary: `Found ${items.length} papers: ${titles.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'crossref', summary: 'CrossRef search failed', items: [], error: String(e) };
  }
}

// ─── OpenFDA ──────────────────────────────────────────────────────────────────

export async function searchOpenFDA(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const encode = encodeURIComponent(query);
    const urls = [
      `https://api.fda.gov/drug/label.json?search=indications_and_usage:${encode}&limit=${maxResults}`,
      `https://api.fda.gov/drug/label.json?search=${encode}&limit=${maxResults}`,
    ];

    let results: Record<string, unknown>[] = [];
    for (const url of urls) {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const data = await res.json() as { results?: Record<string, unknown>[] };
      results = data?.results ?? [];
      if (results.length > 0) break;
    }

    if (results.length === 0) return { tool: 'openfda', summary: `No FDA drug data for "${query}"`, items: [] };

    const items = results.map(r => {
      const fda = (r.openfda as Record<string, string[]>) ?? {};
      return {
        brand_name: fda.brand_name?.[0] ?? 'Unknown',
        generic_name: fda.generic_name?.[0] ?? '',
        manufacturer: fda.manufacturer_name?.[0] ?? '',
        route: fda.route?.[0] ?? '',
        indications: String(((r.indications_and_usage as string[]) ?? [])[0] ?? '').slice(0, 200),
      };
    });

    const names = items.map(d => `${d.brand_name} (${d.generic_name}, ${d.route})`).join('; ');
    return { tool: 'openfda', summary: `Found ${items.length} FDA drug labels: ${names.slice(0, 300)}`, items };
  } catch (e) {
    return { tool: 'openfda', summary: 'OpenFDA search failed', items: [], error: String(e) };
  }
}

// ─── KEGG ─────────────────────────────────────────────────────────────────────

export async function searchKEGG(query: string): Promise<ToolResult> {
  try {
    const q = encodeURIComponent(query);
    const [pathRes, diseaseRes] = await Promise.all([
      fetchWithTimeout(`https://rest.kegg.jp/find/pathway/${q}`),
      fetchWithTimeout(`https://rest.kegg.jp/find/disease/${q}`),
    ]);

    const parseLinesFromResponse = async (res: Response): Promise<{ id: string; name: string }[]> => {
      if (!res.ok) return [];
      const text = await res.text();
      return text.trim().split('\n').filter(Boolean).slice(0, 8).map(line => {
        const parts = line.split('\t');
        return { id: (parts[0] ?? '').trim(), name: (parts[1] ?? '').trim() };
      }).filter(it => it.id && it.name);
    };

    const [pathways, diseases] = await Promise.all([
      parseLinesFromResponse(pathRes),
      parseLinesFromResponse(diseaseRes),
    ]);

    const items: Record<string, unknown>[] = [
      ...pathways.slice(0, 4).map(p => ({ ...p, category: 'pathway' })),
      ...diseases.slice(0, 3).map(d => ({ ...d, category: 'disease' })),
    ];

    if (items.length === 0) return { tool: 'kegg', summary: `No KEGG data for "${query}"`, items: [] };

    const names = items.map(it => `${it.name as string} [${it.category as string}]`).join('; ');
    return {
      tool: 'kegg',
      summary: `Found ${pathways.length} pathways + ${diseases.length} diseases: ${names.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'kegg', summary: 'KEGG search failed', items: [], error: String(e) };
  }
}

// ─── NCBI Gene ────────────────────────────────────────────────────────────────

export async function searchNCBIGene(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=${encodeURIComponent(query)}[All+Fields]+AND+Homo+sapiens[Organism]&retmax=${maxResults}&retmode=json`;
    const searchRes = await fetchWithTimeout(searchUrl);
    const searchData = await searchRes.json() as { esearchresult?: { idlist?: string[]; count?: string } };
    const ids = searchData?.esearchresult?.idlist ?? [];

    if (ids.length === 0) return { tool: 'ncbi_gene', summary: `No genes found for "${query}"`, items: [] };

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${ids.join(',')}&retmode=json`;
    const summaryRes = await fetchWithTimeout(summaryUrl);
    const summaryData = await summaryRes.json() as { result?: Record<string, unknown> };
    const result = summaryData?.result ?? {};

    const items = ids.map(id => {
      const gene = result[id] as Record<string, unknown> | undefined;
      return {
        gene_id: id,
        symbol: (gene?.name as string) ?? '',
        name: (gene?.description as string) ?? '',
        chromosome: (gene?.chromosome as string) ?? '',
        summary: String(gene?.summary ?? '').slice(0, 150),
      };
    }).filter(g => g.symbol);

    const names = items.map(g => `${g.symbol} (${g.name}, chr${g.chromosome})`).join('; ');
    return {
      tool: 'ncbi_gene',
      summary: `Found ${items.length} genes: ${names.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'ncbi_gene', summary: 'NCBI Gene search failed', items: [], error: String(e) };
  }
}

// ─── STRING Protein Interactions ─────────────────────────────────────────────

export async function searchSTRING(query: string): Promise<ToolResult> {
  try {
    const idUrl = `https://string-db.org/api/json/get_string_ids?identifiers=${encodeURIComponent(query)}&species=9606&limit=3&caller_identity=lammac.ai`;
    const idRes = await fetchWithTimeout(idUrl);
    if (!idRes.ok) throw new Error(`HTTP ${idRes.status}`);
    const idData = await idRes.json() as { stringId?: string; preferredName?: string; annotation?: string }[];

    if (!Array.isArray(idData) || idData.length === 0) {
      return { tool: 'string', summary: `No STRING proteins matching "${query}"`, items: [] };
    }

    const proteins = idData.slice(0, 3);
    const primaryId = proteins[0]?.stringId ?? '';

    // Get interaction partners for the top hit
    let partners: { preferredName_B?: string; score?: number; stringId_B?: string }[] = [];
    if (primaryId) {
      try {
        const netUrl = `https://string-db.org/api/json/interaction_partners?identifiers=${primaryId}&species=9606&limit=8&caller_identity=lammac.ai`;
        const netRes = await fetchWithTimeout(netUrl);
        if (netRes.ok) {
          partners = await netRes.json() as typeof partners;
        }
      } catch {}
    }

    const items: Record<string, unknown>[] = [
      ...proteins.map(p => ({
        string_id: p.stringId,
        name: p.preferredName,
        annotation: (p.annotation ?? '').slice(0, 150),
        kind: 'query_protein',
      })),
      ...partners.slice(0, 5).map(p => ({
        string_id: p.stringId_B,
        name: p.preferredName_B,
        score: p.score,
        kind: 'interaction_partner',
      })),
    ];

    const partnerNames = partners.slice(0, 5).map(p => `${p.preferredName_B} (${p.score?.toFixed(3)})`).join(', ');
    return {
      tool: 'string',
      summary: `${proteins[0]?.preferredName ?? query}: ${proteins[0]?.annotation?.slice(0, 120) ?? ''}. Top interactions: ${partnerNames}`,
      items,
    };
  } catch (e) {
    return { tool: 'string', summary: 'STRING search failed', items: [], error: String(e) };
  }
}

// ─── Reactome ─────────────────────────────────────────────────────────────────

export async function searchReactome(query: string): Promise<ToolResult> {
  try {
    const url = `https://reactome.org/ContentService/search/query?query=${encodeURIComponent(query)}&types=Pathway&rows=8&format=json`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as {
      results?: { typeName?: string; entries?: { stId?: string; name?: string; species?: string[]; summation?: string }[] }[];
      total?: number;
    };

    const pathwayGroup = data?.results?.find(r => r.typeName === 'Pathway');
    const pathways = pathwayGroup?.entries ?? [];

    if (pathways.length === 0) return { tool: 'reactome', summary: `No Reactome pathways for "${query}"`, items: [] };

    const items = pathways.slice(0, 6).map(p => ({
      id: p.stId,
      name: p.name,
      species: (p.species ?? [])[0] ?? 'Human',
      summary: (p.summation ?? '').slice(0, 150),
    }));

    const names = items.map(p => p.name).join('; ');
    return {
      tool: 'reactome',
      summary: `Found ${data.total ?? pathways.length} Reactome pathways: ${names.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'reactome', summary: 'Reactome search failed', items: [], error: String(e) };
  }
}

// ─── Open Targets ─────────────────────────────────────────────────────────────

export async function searchOpenTargets(query: string, maxResults = 6): Promise<ToolResult> {
  try {
    const gql = {
      query: `query($q: String!, $n: Int!) {
        search(queryString: $q, entityNames: ["target", "disease", "drug"], page: {index: 0, size: $n}) {
          hits { id name entity description score }
        }
      }`,
      variables: { q: query, n: maxResults },
    };

    const res = await fetchWithTimeout('https://api.platform.opentargets.org/api/v4/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...DEFAULT_HEADERS },
      body: JSON.stringify(gql),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as {
      data?: { search?: { hits?: { id: string; name: string; entity: string; description?: string; score: number }[] } };
    };
    const hits = data?.data?.search?.hits ?? [];

    if (hits.length === 0) return { tool: 'opentargets', summary: `No Open Targets data for "${query}"`, items: [] };

    const items = hits.map(h => ({
      id: h.id,
      name: h.name,
      entity: h.entity,
      description: (h.description ?? '').slice(0, 150),
      score: Number(h.score.toFixed(3)),
    }));

    const names = items.map(h => `${h.name} (${h.entity})`).join('; ');
    return {
      tool: 'opentargets',
      summary: `Found ${hits.length} associations: ${names.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'opentargets', summary: 'Open Targets search failed', items: [], error: String(e) };
  }
}

// ─── Semantic Scholar ─────────────────────────────────────────────────────────

export async function searchSemanticScholar(query: string, maxResults = 5): Promise<ToolResult> {
  try {
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&fields=title,year,authors,citationCount,venue&limit=${maxResults}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { data?: Record<string, unknown>[]; total?: number };
    const papers = data?.data ?? [];

    if (papers.length === 0) return { tool: 'semanticscholar', summary: `No papers found for "${query}"`, items: [] };

    const items = papers.map(p => ({
      title: String(p.title ?? 'Unknown'),
      year: Number(p.year ?? 0),
      citations: Number(p.citationCount ?? 0),
      venue: String(p.venue ?? ''),
      firstAuthor: ((p.authors as { name: string }[]) ?? [])[0]?.name ?? '',
    }));

    const titles = items.map(p => `"${p.title}" (${p.year}, cited ${p.citations}×)`).join('; ');
    return {
      tool: 'semanticscholar',
      summary: `Found ${data.total ?? items.length} papers (showing ${items.length}): ${titles.slice(0, 300)}`,
      items,
    };
  } catch (e) {
    return { tool: 'semanticscholar', summary: 'Semantic Scholar search failed', items: [], error: String(e) };
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export const TOOL_FNS: Record<string, (q: string) => Promise<ToolResult>> = {
  pubmed: searchPubMed,
  uniprot: searchUniProt,
  chembl: searchChEMBL,
  arxiv: searchArXiv,
  pubchem: searchPubChem,
  europepmc: searchEuropePMC,
  pdb: searchPDB,
  clinicaltrials: searchClinicalTrials,
  crossref: searchCrossRef,
  openfda: searchOpenFDA,
  kegg: searchKEGG,
  ncbi_gene: searchNCBIGene,
  string: searchSTRING,
  reactome: searchReactome,
  opentargets: searchOpenTargets,
  semanticscholar: searchSemanticScholar,
};

export async function runTool(tool: string, query: string): Promise<ToolResult> {
  const fn = TOOL_FNS[tool];
  if (!fn) return { tool, summary: `Unknown tool: ${tool}`, items: [] };
  return fn(query);
}
