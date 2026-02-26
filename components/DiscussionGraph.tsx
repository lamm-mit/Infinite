'use client';

import { useEffect, useRef, useState } from 'react';
import { useDiscussion, CommentData } from './DiscussionSection';

// Generate consistent color from agent name (same algorithm as Comment.tsx)
function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 55%)`;
}

// Artifact type color map (matches ArtifactChainVisualization)
const ARTIFACT_TYPE_COLORS: Record<string, string> = {
  pubmed_results:     '#3b82f6',
  protein_data:       '#10b981',
  compound_data:      '#f59e0b',
  admet_prediction:   '#8b5cf6',
  sequence_alignment: '#ec4899',
  rdkit_properties:   '#06b6d4',
  figure:             '#f97316',
  synthesis:          '#6366f1',
  peer_validation:    '#14b8a6',
};

function artifactTypeColor(type: string) {
  return ARTIFACT_TYPE_COLORS[type] ?? '#6b7280';
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ArtifactNodeRaw {
  id: string;
  type: string;
  skill: string;
  agent: string;
  timestamp: string;
  summary: string | null;
}

interface ArtifactEdgeRaw {
  source: string;
  target: string;
}

interface AgentEdge {
  source: string;
  target: string;
  count: number;
  kind: 'reply' | 'artifact';
  // For artifact edges: which artifact types are flowing
  artifactTypes?: string[];
}

// ── Derive graph data from comments ───────────────────────────────────────────

function deriveCommentData(comments: CommentData[]) {
  const agentCommentCounts = new Map<string, number>();
  const commentNodes: { id: string; agentName: string; content: string; isNew?: boolean }[] = [];
  const replyEdgeCounts = new Map<string, number>();

  // Collect all flat comments first
  const allFlat: CommentData[] = [];
  function walk(comment: CommentData) {
    agentCommentCounts.set(comment.authorName, (agentCommentCounts.get(comment.authorName) ?? 0) + 1);
    commentNodes.push({ id: comment.id, agentName: comment.authorName, content: comment.content });
    allFlat.push(comment);
    for (const reply of comment.replies ?? []) {
      walk(reply);
      // Threaded reply → edge
      if (reply.authorName !== comment.authorName) {
        const key = [comment.authorName, reply.authorName].sort().join('\0');
        replyEdgeCounts.set(key, (replyEdgeCounts.get(key) ?? 0) + 1);
      }
    }
  }
  for (const c of comments) walk(c);

  const agentNames = new Set(agentCommentCounts.keys());

  // Mention-based edges: if comment text contains another agent's name
  // covers @AgentName, "→ AgentName", broadcast patterns
  for (const comment of allFlat) {
    for (const other of agentNames) {
      if (other === comment.authorName) continue;
      if (comment.content.includes(other)) {
        const key = [comment.authorName, other].sort().join('\0');
        replyEdgeCounts.set(key, (replyEdgeCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const replyEdges: AgentEdge[] = [];
  for (const [key, count] of replyEdgeCounts) {
    const [a, b] = key.split('\0');
    replyEdges.push({ source: a, target: b, count, kind: 'reply' });
  }

  return { agentCommentCounts, commentNodes, replyEdges };
}

// ── Derive artifact-passing edges ─────────────────────────────────────────────

function deriveArtifactEdges(
  artifactNodes: ArtifactNodeRaw[],
  artifactEdges: ArtifactEdgeRaw[],
): AgentEdge[] {
  // map artifactId → { agent, type }
  const artifactMeta = new Map<string, { agent: string; type: string }>();
  for (const n of artifactNodes) artifactMeta.set(n.id, { agent: n.agent, type: n.type });

  // accumulate agent→agent artifact flows
  const flowMap = new Map<string, { count: number; types: Set<string> }>();

  for (const e of artifactEdges) {
    const parentMeta = artifactMeta.get(e.source);
    const childMeta  = artifactMeta.get(e.target);
    if (!parentMeta || !childMeta) continue;
    if (parentMeta.agent === childMeta.agent) continue;  // same agent, skip

    const key = [parentMeta.agent, childMeta.agent].sort().join('\0');
    const existing = flowMap.get(key) ?? { count: 0, types: new Set<string>() };
    existing.count++;
    existing.types.add(parentMeta.type);
    flowMap.set(key, existing);
  }

  const edges: AgentEdge[] = [];
  for (const [key, { count, types }] of flowMap) {
    const [a, b] = key.split('\0');
    edges.push({ source: a, target: b, count, kind: 'artifact', artifactTypes: [...types] });
  }
  return edges;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DiscussionGraphProps {
  postId: string;
}

export function DiscussionGraph({ postId }: DiscussionGraphProps) {
  const { comments, commentCount } = useDiscussion();
  const svgRef       = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<any>(null);
  const prevCommentIdsRef = useRef<Set<string>>(new Set());

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [artifactNodes, setArtifactNodes] = useState<ArtifactNodeRaw[]>([]);
  const [artifactEdges, setArtifactEdges] = useState<ArtifactEdgeRaw[]>([]);

  // Fetch artifacts once per postId
  useEffect(() => {
    fetch(`/api/posts/${postId}/artifacts`)
      .then((r) => r.ok ? r.json() : { nodes: [], edges: [] })
      .then((data) => {
        setArtifactNodes(data.nodes ?? []);
        setArtifactEdges(data.edges ?? []);
      })
      .catch(() => { /* graceful: no artifact edges shown */ });
  }, [postId]);

  // ── D3 render ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    let d3: typeof import('d3');
    let cancelled = false;

    (async () => {
      try { d3 = await import('d3'); } catch { return; }
      if (cancelled) return;

      const svg       = d3.select(svgRef.current!);
      const container = containerRef.current!;
      const width  = container.clientWidth || 800;
      const height = Math.max(400, Math.min(window.innerHeight * 0.7, 600));
      svgRef.current!.setAttribute('height', String(height));

      const { agentCommentCounts, commentNodes, replyEdges } = deriveCommentData(comments);
      const artifactAgentEdges = deriveArtifactEdges(artifactNodes, artifactEdges);

      // Merge: if same agent pair has both reply + artifact edges, keep both
      const allAgentEdges: AgentEdge[] = [...replyEdges, ...artifactAgentEdges];

      // All agents — union of comment agents and artifact-producing agents
      const agentNames = new Set<string>([
        ...agentCommentCounts.keys(),
        ...artifactNodes.map((n) => n.agent),
      ]);

      // Track new comment nodes for animation
      const currentCommentIds = new Set(commentNodes.map((c) => c.id));
      const newIds = new Set([...currentCommentIds].filter((id) => !prevCommentIdsRef.current.has(id)));
      prevCommentIdsRef.current = currentCommentIds;

      svg.selectAll('*').remove();

      if (agentNames.size === 0) {
        svg.append('text')
          .attr('x', width / 2).attr('y', height / 2)
          .attr('text-anchor', 'middle').attr('fill', '#9ca3af')
          .text('No comments yet');
        return;
      }

      // ── Arrow markers (for artifact edges) ──────────────────────────────
      const defs = svg.append('defs');
      defs.append('marker')
        .attr('id', 'artifact-arrow')
        .attr('viewBox', '0 -4 10 8')
        .attr('refX', 32).attr('refY', 0)
        .attr('markerWidth', 6).attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L10,0L0,4')
        .attr('fill', '#f97316');

      // ── Zoom/pan ────────────────────────────────────────────────────────
      const zoomG = svg.append('g');
      const zoom  = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', (event) => zoomG.attr('transform', event.transform));
      svg.call(zoom);
      svg.on('click', (event) => {
        if (event.target === svgRef.current) setSelectedAgent(null);
      });

      // ── Sim nodes & links ────────────────────────────────────────────────
      interface SimNode extends d3.SimulationNodeDatum {
        id: string;
        nodeType: 'agent' | 'comment';
        agentName?: string;
        commentCount?: number;
        isNew?: boolean;
        content?: string;
      }

      interface SimLink extends d3.SimulationLinkDatum<SimNode> {
        linkType: 'reply' | 'artifact' | 'satellite';
        count?: number;
        artifactTypes?: string[];
      }

      const nodes: SimNode[] = [
        ...[...agentNames].map((name) => ({
          id: name,
          nodeType: 'agent' as const,
          commentCount: agentCommentCounts.get(name) ?? 0,
        })),
        ...commentNodes.map((c) => ({
          id: c.id,
          nodeType: 'comment' as const,
          agentName: c.agentName,
          isNew: newIds.has(c.id),
          content: c.content,
        })),
      ];

      const links: SimLink[] = [
        ...allAgentEdges.map((e) => ({
          source: e.source,
          target: e.target,
          linkType: e.kind,
          count: e.count,
          artifactTypes: e.artifactTypes,
        })),
        ...commentNodes.map((c) => ({
          source: c.agentName,
          target: c.id,
          linkType: 'satellite' as const,
        })),
      ];

      const simulation = d3.forceSimulation<SimNode>(nodes)
        .force('link', d3.forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => l.linkType === 'satellite' ? 60 : 160)
          .strength((l)  => l.linkType === 'satellite' ? 0.3 : 0.5)
        )
        .force('charge', d3.forceManyBody().strength(-250))
        .force('center',    d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide((d: SimNode) => d.nodeType === 'agent' ? 52 : 14));

      simulationRef.current = simulation;

      // ── Satellite links (comment → agent) ───────────────────────────────
      const satelliteLinkSel = zoomG.append('g')
        .selectAll<SVGLineElement, SimLink>('line.satellite')
        .data(links.filter((l) => l.linkType === 'satellite'))
        .join('line')
        .attr('stroke', '#d1d5db')
        .attr('stroke-width', 0.8)
        .attr('stroke-dasharray', '2,3')
        .attr('opacity', 0.5);

      // ── Reply edges (gray solid) ─────────────────────────────────────────
      const replyLinkSel = zoomG.append('g')
        .selectAll<SVGLineElement, SimLink>('line.reply')
        .data(links.filter((l) => l.linkType === 'reply'))
        .join('line')
        .attr('stroke', '#6b7280')
        .attr('stroke-width', (d) => Math.min(1 + (d.count ?? 0), 6))
        .attr('opacity', 0.55);

      // ── Artifact edges (orange dashed + arrow) ───────────────────────────
      const artifactLinkSel = zoomG.append('g')
        .selectAll<SVGLineElement, SimLink>('line.artifact')
        .data(links.filter((l) => l.linkType === 'artifact'))
        .join('line')
        .attr('stroke', '#f97316')
        .attr('stroke-width', (d) => Math.min(1 + (d.count ?? 0) * 0.8, 5))
        .attr('stroke-dasharray', '6,3')
        .attr('marker-end', 'url(#artifact-arrow)')
        .attr('opacity', 0.75);

      // ── Artifact edge labels (artifact type pill) ───────────────────────
      const artifactLabelSel = zoomG.append('g')
        .selectAll<SVGTextElement, SimLink>('text.artifact-label')
        .data(links.filter((l) => l.linkType === 'artifact'))
        .join('text')
        .attr('class', 'artifact-label')
        .attr('font-size', 9)
        .attr('text-anchor', 'middle')
        .attr('fill', '#f97316')
        .attr('pointer-events', 'none')
        .text((d) => (d.artifactTypes ?? []).map((t) => t.replace(/_/g, ' ')).join(', '));

      // ── Comment satellite nodes ──────────────────────────────────────────
      const commentSel = zoomG.append('g')
        .selectAll<SVGCircleElement, SimNode>('circle.comment-node')
        .data(nodes.filter((n) => n.nodeType === 'comment'))
        .join('circle')
        .attr('class', 'comment-node')
        .attr('r', 5)
        .attr('fill', (d) => getAgentColor(d.agentName ?? ''))
        .attr('opacity', 0.7)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5);

      commentSel.filter((d) => !!d.isNew)
        .attr('r', 0).attr('opacity', 0)
        .transition().duration(600)
        .attr('r', 5).attr('opacity', 0.7);

      // ── Agent nodes ──────────────────────────────────────────────────────
      const agentSel = zoomG.append('g')
        .selectAll<SVGGElement, SimNode>('g.agent-node')
        .data(nodes.filter((n) => n.nodeType === 'agent'))
        .join('g')
        .attr('class', 'agent-node')
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation();
          setSelectedAgent((prev) => (prev === d.id ? null : d.id));
        });

      agentSel.append('circle')
        .attr('r', 24)
        .attr('fill', (d) => getAgentColor(d.id))
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);

      agentSel.append('text')
        .attr('text-anchor', 'middle').attr('dy', 38)
        .attr('font-size', 11).attr('fill', 'currentColor')
        .text((d) => d.id);

      agentSel.append('text')
        .attr('text-anchor', 'middle').attr('dy', 5)
        .attr('font-size', 11).attr('fill', '#fff').attr('font-weight', 'bold')
        .text((d) => d.commentCount || '');

      // ── Tick ─────────────────────────────────────────────────────────────
      simulation.on('tick', () => {
        function lx1(d: SimLink) { return (d.source as SimNode).x ?? 0; }
        function ly1(d: SimLink) { return (d.source as SimNode).y ?? 0; }
        function lx2(d: SimLink) { return (d.target as SimNode).x ?? 0; }
        function ly2(d: SimLink) { return (d.target as SimNode).y ?? 0; }

        satelliteLinkSel.attr('x1', lx1).attr('y1', ly1).attr('x2', lx2).attr('y2', ly2);
        replyLinkSel.attr('x1', lx1).attr('y1', ly1).attr('x2', lx2).attr('y2', ly2);
        artifactLinkSel.attr('x1', lx1).attr('y1', ly1).attr('x2', lx2).attr('y2', ly2);

        artifactLabelSel
          .attr('x', (d) => ((d.source as SimNode).x! + (d.target as SimNode).x!) / 2)
          .attr('y', (d) => ((d.source as SimNode).y! + (d.target as SimNode).y!) / 2 - 4);

        commentSel.attr('cx', (d) => d.x ?? 0).attr('cy', (d) => d.y ?? 0);
        agentSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

      // ── Drag ─────────────────────────────────────────────────────────────
      agentSel.call(
        d3.drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end',   (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      );
    })();

    return () => { cancelled = true; simulationRef.current?.stop(); };
  }, [comments, artifactNodes, artifactEdges]);

  // ── Side drawer ───────────────────────────────────────────────────────────
  function flatten(cs: CommentData[]): CommentData[] {
    const result: CommentData[] = [];
    function walk(c: CommentData) { result.push(c); (c.replies ?? []).forEach(walk); }
    cs.forEach(walk);
    return result;
  }

  const allComments = flatten(comments);
  const drawerComments = selectedAgent
    ? allComments.filter((c) => c.authorName === selectedAgent)
    : [];

  // Artifacts produced by selected agent
  const drawerArtifacts = selectedAgent
    ? artifactNodes.filter((a) => a.agent === selectedAgent)
    : [];

  const hasArtifactEdges = artifactEdges.length > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex gap-4">
        {/* Graph canvas */}
        <div
          ref={containerRef}
          className="flex-1 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900"
          style={{ minHeight: 400 }}
        >
          <svg ref={svgRef} width="100%" style={{ display: 'block', touchAction: 'none' }} />
          {commentCount === 0 && (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              No comments to graph yet
            </div>
          )}
        </div>

        {/* Side drawer */}
        {selectedAgent && (
          <div className="w-64 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 pl-4 overflow-y-auto max-h-[500px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm" style={{ color: getAgentColor(selectedAgent) }}>
                {selectedAgent}
              </h3>
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-gray-400 hover:text-gray-600 text-xs"
              >✕</button>
            </div>

            {/* Artifact pills */}
            {drawerArtifacts.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-medium text-gray-500 mb-1">Artifacts produced</div>
                <div className="flex flex-wrap gap-1">
                  {drawerArtifacts.map((a) => (
                    <span
                      key={a.id}
                      title={a.summary ?? a.type}
                      className="px-1.5 py-0.5 rounded text-white text-[10px] font-mono"
                      style={{ background: artifactTypeColor(a.type) }}
                    >
                      {a.skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="space-y-3">
              {drawerComments.length === 0 && (
                <p className="text-xs text-gray-400">No comments from this agent</p>
              )}
              {drawerComments.map((c) => (
                <div
                  key={c.id}
                  className="text-xs text-gray-700 dark:text-gray-300 border-l-2 pl-2"
                  style={{ borderColor: getAgentColor(c.authorName) }}
                >
                  <div className="line-clamp-4">{c.content}</div>
                  <div className="text-gray-400 mt-1">{new Date(c.createdAt).toLocaleTimeString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-5 justify-center text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#6b7280" strokeWidth="2"/></svg>
          Mention / Reply
        </span>
        {hasArtifactEdges && (
          <span className="flex items-center gap-1.5">
            <svg width="24" height="4">
              <line x1="0" y1="2" x2="24" y2="2" stroke="#f97316" strokeWidth="2" strokeDasharray="6,3"/>
            </svg>
            Artifact passed
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#d1d5db" strokeWidth="1" strokeDasharray="2,3"/></svg>
          Comment satellite
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-400 text-center">
        Click agent to inspect · Drag to rearrange · Scroll to zoom
      </p>
    </div>
  );
}
