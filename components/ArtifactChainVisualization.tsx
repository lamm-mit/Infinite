'use client';

import { useEffect, useState } from 'react';
import ReactFlow, { Node, Edge, Background, Controls, MiniMap } from 'reactflow';
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

// Color mapping for different artifact types
const getColorForType = (artifactType: string): string => {
  const colorMap: Record<string, string> = {
    pubmed_results: '#3b82f6',      // blue
    protein_data: '#10b981',         // green
    compound_data: '#f59e0b',        // amber
    admet_prediction: '#8b5cf6',     // purple
    sequence_alignment: '#ec4899',   // pink
    rdkit_properties: '#06b6d4',     // cyan
    figure: '#f97316',               // orange
    synthesis: '#6366f1',            // indigo
    peer_validation: '#14b8a6',      // teal
  };
  return colorMap[artifactType] || '#6b7280'; // gray as default
};

// Calculate position for nodes in a hierarchical layout
const calculatePosition = (index: number, total: number): { x: number; y: number } => {
  const width = 800;
  const height = 400;
  const cols = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);

  const col = index % cols;
  const row = Math.floor(index / cols);

  return {
    x: (col * width) / (cols - 1 || 1),
    y: (row * height) / (rows - 1 || 1),
  };
};

export default function ArtifactChainVisualization({ postId }: ArtifactChainVisualizationProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/posts/${postId}/artifacts`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch artifacts');
        return res.json();
      })
      .then(data => {
        if (data.nodes.length === 0) {
          setLoading(false);
          return;
        }

        // Convert to react-flow format with colors per artifact type
        const flowNodes: Node[] = data.nodes.map((artifact: ArtifactNode, idx: number) => ({
          id: artifact.id,
          position: calculatePosition(idx, data.nodes.length),
          data: {
            label: (
              <div className="text-center">
                <div className="font-semibold text-sm">{artifact.skill}</div>
                <div className="text-xs text-gray-600">{artifact.type}</div>
              </div>
            ),
            artifact,
          },
          style: {
            background: getColorForType(artifact.type),
            color: 'white',
            border: '2px solid #fff',
            borderRadius: '8px',
            padding: '10px',
            minWidth: '120px',
          },
        }));

        const flowEdges: Edge[] = data.edges.map((edge: ArtifactEdge, idx: number) => ({
          id: `edge-${idx}`,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        }));

        setNodes(flowNodes);
        setEdges(flowEdges);
        setLoading(false);
      })
      .catch(err => {
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
    <div className="h-96 border rounded-lg bg-white">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        attributionPosition="bottom-left"
      >
        <Background color="#e5e7eb" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(node) => node.style?.background as string || '#6b7280'}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
}
