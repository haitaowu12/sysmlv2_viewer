/**
 * Model Explorer - Tree view of the parsed model
 */

import { useAppStore, getNodeId } from '../store/store';
import type { SysMLNode } from '../parser/types';
import { getNodeIcon } from '../parser/parser';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';

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
    const selectableLabel = `${node.name}, ${node.kind.replace(/Def$/, '').replace(/Usage$/, '')}`;

    const handleSelect = () => {
        selectNode(nodeId, node);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleSelect();
            return;
        }

        if (!hasChildren) return;

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            setExpanded(true);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            setExpanded(false);
        }
    };

    return (
        <div className="tree-item">
            <div
                className={`tree-item-label ${isSelected ? 'selected' : ''}`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                role="treeitem"
                aria-label={selectableLabel}
                aria-selected={isSelected}
                aria-expanded={hasChildren ? expanded : undefined}
                tabIndex={0}
                onClick={handleSelect}
                onKeyDown={handleKeyDown}
            >
                <button
                    type="button"
                    className={`tree-expand ${hasChildren ? '' : 'invisible'}`}
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
                    aria-hidden={!hasChildren}
                    tabIndex={hasChildren ? 0 : -1}
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(!expanded);
                    }}
                >
                    {expanded ? '▾' : '▸'}
                </button>
                <span className="tree-icon" aria-hidden="true">{getNodeIcon(node.kind)}</span>
                <span className="tree-name">{node.name}</span>
                <span className="tree-kind">{node.kind.replace(/Def$/, '').replace(/Usage$/, '')}</span>
            </div>
            {expanded && hasChildren && (
                <div className="tree-children" role="group">
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
            <section className="model-explorer" aria-labelledby="model-explorer-title">
                <div className="explorer-header">
                    <span id="model-explorer-title" className="explorer-title">Model Explorer</span>
                </div>
                <div className="explorer-empty">
                    <p>No model loaded</p>
                    <p className="hint">Edit or import a .sysml file to see the model tree</p>
                </div>
            </section>
        );
    }

    return (
        <section className="model-explorer" aria-labelledby="model-explorer-title">
            <div className="explorer-header">
                <span id="model-explorer-title" className="explorer-title">Model Explorer</span>
                <span className="explorer-count">{model.children.length} items</span>
            </div>

            {parseErrors.length > 0 && (
                <div className="explorer-errors" role="status" aria-live="polite">
                    <span className="error-icon" aria-hidden="true">⚠️</span>
                    <span className="error-count">{parseErrors.length} error(s)</span>
                </div>
            )}

            <div className="explorer-tree" role="tree" aria-label="Model tree">
                {model.children.map((node, i) => (
                    <TreeItem key={`${getNodeId(node)}_${i}`} node={node} />
                ))}
            </div>
        </section>
    );
}
