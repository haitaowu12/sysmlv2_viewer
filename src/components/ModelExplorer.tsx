/**
 * Model Explorer - Tree view of the parsed model
 */

import { useAppStore, getNodeId } from '../store/store';
import type { SysMLNode } from '../parser/types';
import { getNodeIcon } from '../parser/parser';
import { useState } from 'react';

function TreeItem({ node, depth = 0 }: { node: SysMLNode; depth?: number }) {
    const [expanded, setExpanded] = useState(depth < 2);
    const selectedNodeId = useAppStore(s => s.selectedNodeId);
    const selectNode = useAppStore(s => s.selectNode);

    const nodeId = getNodeId(node);
    const hasChildren = node.children.length > 0;
    const isSelected = selectedNodeId === nodeId;
    const displayChildren = node.children.filter(c =>
        c.kind !== 'Doc' && c.kind !== 'Comment' && c.kind !== 'Import'
    );

    return (
        <div className="tree-item">
            <div
                className={`tree-item-label ${isSelected ? 'selected' : ''}`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={() => {
                    selectNode(nodeId, node);
                }}
            >
                <span
                    className={`tree-expand ${hasChildren ? '' : 'invisible'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(!expanded);
                    }}
                >
                    {expanded ? '▾' : '▸'}
                </span>
                <span className="tree-icon">{getNodeIcon(node.kind)}</span>
                <span className="tree-name">{node.name}</span>
                <span className="tree-kind">{node.kind.replace(/Def$/, '').replace(/Usage$/, '')}</span>
            </div>
            {expanded && hasChildren && (
                <div className="tree-children">
                    {displayChildren.map((child, i) => (
                        <TreeItem key={`${getNodeId(child)}_${i}`} node={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ModelExplorer() {
    const model = useAppStore(s => s.model);
    const parseErrors = useAppStore(s => s.parseErrors);

    if (!model) {
        return (
            <div className="model-explorer">
                <div className="explorer-header">
                    <span className="explorer-title">Model Explorer</span>
                </div>
                <div className="explorer-empty">
                    <p>No model loaded</p>
                    <p className="hint">Edit or import a .sysml file to see the model tree</p>
                </div>
            </div>
        );
    }

    return (
        <div className="model-explorer">
            <div className="explorer-header">
                <span className="explorer-title">Model Explorer</span>
                <span className="explorer-count">{model.children.length} items</span>
            </div>

            {parseErrors.length > 0 && (
                <div className="explorer-errors">
                    <span className="error-icon">⚠️</span>
                    <span className="error-count">{parseErrors.length} error(s)</span>
                </div>
            )}

            <div className="explorer-tree">
                {model.children.map((node, i) => (
                    <TreeItem key={`${getNodeId(node)}_${i}`} node={node} />
                ))}
            </div>
        </div>
    );
}
