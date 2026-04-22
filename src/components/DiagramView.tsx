/**
 * Reusable base diagram view component.
 * Encapsulates ReactFlow setup, state management, context menu, empty state, and error boundary.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import EmptyState from './EmptyState';
import { ErrorBoundary } from './ErrorBoundary';

export interface DiagramViewProps {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  focusedNodeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
  onNodeContextMenu?: (event: React.MouseEvent, nodeId: string) => void;
  onConnect?: (connection: Connection) => void;
  emptyTitle: string;
  emptyDescription?: string;
  minimapNodeColor?: (node: Node) => string;
  children?: ReactNode;
}

function FocusZoom({ focusedNodeId }: { focusedNodeId: string | null }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (focusedNodeId) {
      fitView({ nodes: [{ id: focusedNodeId }], duration: 800, padding: 0.5 });
    }
  }, [focusedNodeId, fitView]);

  return null;
}

export default function DiagramView({
  nodes: initialNodes,
  edges: initialEdges,
  nodeTypes,
  focusedNodeId = null,
  onNodeClick,
  onNodeContextMenu,
  onConnect,
  emptyTitle,
  emptyDescription,
  minimapNodeColor,
  children,
}: DiagramViewProps) {
  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setFlowEdges, onFlowEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setFlowNodes(initialNodes);
  }, [initialNodes, setFlowNodes]);

  useEffect(() => {
    setFlowEdges(initialEdges);
  }, [initialEdges, setFlowEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(String(node.id));
    },
    [onNodeClick]
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      onNodeContextMenu?.(event, String(node.id));
    },
    [onNodeContextMenu]
  );

  const isEmpty = initialNodes.length === 0;

  const [hasRenderError, setHasRenderError] = useState(false);

  useEffect(() => {
    setHasRenderError(false);
  }, [initialNodes, initialEdges]);

  if (hasRenderError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '32px',
          textAlign: 'center',
          color: 'var(--text-primary, #1a1a2e)',
          background: 'var(--bg-primary, #ffffff)',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '20px' }}>Diagram rendering failed</h2>
        <p style={{ margin: '0 0 20px 0', fontSize: '14px', maxWidth: '400px' }}>
          An error occurred while rendering the diagram. You can try resetting the view or reloading the page.
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setHasRenderError(false)}
            style={{
              padding: '8px 20px',
              background: 'var(--accent, #4a90d9)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Retry
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              background: 'transparent',
              color: 'var(--accent, #4a90d9)',
              border: '1px solid var(--accent, #4a90d9)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      onError={() => setHasRenderError(true)}
    >
      <div className="diagram-container">
        {isEmpty ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onFlowNodesChange}
            onEdgesChange={onFlowEdgesChange}
            onNodeClick={handleNodeClick}
            onNodeContextMenu={handleNodeContextMenu}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} color="var(--grid-color)" />
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              nodeColor={minimapNodeColor ? (n) => minimapNodeColor(n as Node) : undefined}
            />
            <FocusZoom focusedNodeId={focusedNodeId ?? null} />
            {children}
          </ReactFlow>
        )}
      </div>
    </ErrorBoundary>
  );
}
