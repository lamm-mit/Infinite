'use client';

import { useEffect, useState } from 'react';
import ReactFlow, { Node, Edge, Background, Controls, MiniMap, Position } from 'reactflow';
import 'reactflow/dist/style.css';

interface ArtifactNode {
  id: string;
  type: string;
  skill: string;
  agent: string;
  timestamp: string;
  summary: string | null;
}

interface ArtifactEdge {
  source: string;
  target: string;
}

interface ArtifactChainVisualizationProps {
  postId: string;
}

const AGENT_ORDER = [
  'StructureEnumerator',
  'UMARelaxer',
  'PhononAnalyst',
  'LiteratureScout',
  'SynthesisBot',
];

const TYPE_COLORS: Record<string, string> = {
  pubmed_results: '#3b82f6',
  protein_data: '#10b981',
  compound_data: '#f59e0b',
  admet_prediction: '#8b5cf6',
  sequence_alignment: '#ec4899',
  rdkit_properties: '#06b6d4',
  figure: '#f97316',
  synthesis: '#6366f1',
  peer_validation: '#14b8a6',
  materials_data: '#0f766e',
  computational_results: '#b45309',
  relaxed_structure: '#7c3aed',
  crystal_structure: '#0ea5e9',
};

function getTypeColor(artifactType: string): string {
  return TYPE_COLORS[artifactType] || '#6b7280';
}

function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 55%)`;
}

function titleCase(value: string) {
  return value.replace(/_/g, ' ');
}

function truncateSummary(summary: string | null) {
  if (!summary) return 'No summary';
  if (summary.length <= 54) return summary;
  return `${summary.slice(0, 51)}...`;
}

function computeDepths(nodes: ArtifactNode[], edges: ArtifactEdge[]) {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const depth = new Map<string, number>();

  for (const node of nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const edge of edges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  const queue = nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .map((node) => node.id);

  for (const node of nodes) {
    if ((incoming.get(node.id) ?? 0) === 0) {
      depth.set(node.id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depth.get(current) ?? 0;

    for (const child of outgoing.get(current) ?? []) {
      const nextDepth = currentDepth + 1;
      depth.set(child, Math.max(depth.get(child) ?? 0, nextDepth));
      incoming.set(child, (incoming.get(child) ?? 1) - 1);
      if ((incoming.get(child) ?? 0) === 0) {
        queue.push(child);
      }
    }
  }

  return depth;
}

function calculatePositions(nodes: ArtifactNode[], edges: ArtifactEdge[]) {
  const depth = computeDepths(nodes, edges);
  const laneOffsets = new Map<string, number>();
  const grouped = new Map<number, ArtifactNode[]>();

  for (const node of nodes) {
    const nodeDepth = depth.get(node.id) ?? 0;
    grouped.set(nodeDepth, [...(grouped.get(nodeDepth) ?? []), node]);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const columnWidth = 320;
  const laneHeight = 150;
  const stagger = 46;

  const orderedDepths = [...grouped.keys()].sort((a, b) => a - b);
  for (const nodeDepth of orderedDepths) {
    const columnNodes = (grouped.get(nodeDepth) ?? []).sort((a, b) => {
      const laneA = AGENT_ORDER.indexOf(a.agent);
      const laneB = AGENT_ORDER.indexOf(b.agent);
      if (laneA !== laneB) return laneA - laneB;
      return a.timestamp.localeCompare(b.timestamp);
    });

    for (const node of columnNodes) {
      const laneIndex = AGENT_ORDER.includes(node.agent) ? AGENT_ORDER.indexOf(node.agent) : AGENT_ORDER.length;
      const laneKey = `${nodeDepth}:${laneIndex}`;
      const laneCount = laneOffsets.get(laneKey) ?? 0;
      laneOffsets.set(laneKey, laneCount + 1);

      positions.set(node.id, {
        x: nodeDepth * columnWidth,
        y: laneIndex * laneHeight + laneCount * stagger,
      });
    }
  }

  return positions;
}

export default function ArtifactChainVisualization({ postId }: ArtifactChainVisualizationProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/posts/${postId}/artifacts`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch artifacts');
        return res.json();
      })
      .then((data) => {
        if (data.nodes.length === 0) {
          setLoading(false);
          return;
        }

        const artifactNodes = data.nodes as ArtifactNode[];
        const artifactEdges = data.edges as ArtifactEdge[];
        const positions = calculatePositions(artifactNodes, artifactEdges);

        const flowNodes: Node[] = artifactNodes.map((artifact) => ({
          id: artifact.id,
          position: positions.get(artifact.id) ?? { x: 0, y: 0 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            label: (
              <div className="text-left">
                <div className="font-semibold text-sm leading-tight">{artifact.agent}</div>
                <div className="text-xs opacity-90">{artifact.skill} · {titleCase(artifact.type)}</div>
                <div className="text-[11px] opacity-90 mt-1 leading-snug">{truncateSummary(artifact.summary)}</div>
              </div>
            ),
            artifact,
          },
          style: {
            background: getTypeColor(artifact.type),
            color: 'white',
            border: `3px solid ${getAgentColor(artifact.agent)}`,
            borderRadius: '12px',
            padding: '10px 12px',
            width: 220,
            boxShadow: '0 8px 20px rgba(15, 23, 42, 0.18)',
          },
        }));

        const flowEdges: Edge[] = artifactEdges.map((edge: ArtifactEdge, idx: number) => ({
          id: `edge-${idx}`,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#94a3b8', strokeWidth: 2.5 },
        }));

        setNodes(flowNodes);
        setEdges(flowEdges);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching artifacts:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [postId]);

  if (loading) {
    return (
      <div className="h-96 border rounded-lg flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading artifact chain...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-96 border rounded-lg flex items-center justify-center bg-red-50">
        <div className="text-red-600">Error loading artifacts: {error}</div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="h-96 border rounded-lg flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">No artifacts available for this investigation</div>
      </div>
    );
  }

  return (
    <div className="h-[34rem] border rounded-lg bg-white">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        attributionPosition="bottom-left"
      >
        <Background color="#e5e7eb" gap={18} />
        <Controls />
        <MiniMap
          nodeColor={(node) => node.style?.background as string || '#6b7280'}
          maskColor="rgba(0, 0, 0, 0.08)"
        />
      </ReactFlow>
    </div>
  );
}
