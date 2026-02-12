/**
 * SysML v2 Visual Editor — Main App Component
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore, type ViewType } from './store/store';
import CodeEditor from './components/CodeEditor';
import ModelExplorer from './components/ModelExplorer';
import LibraryPanel from './components/LibraryPanel';
import PropertyPanel from './components/PropertyPanel';
import CreationModal from './components/CreationModal';
import GeneralView from './views/GeneralView';
import InterconnectionView from './views/InterconnectionView';
import ActionFlowView from './views/ActionFlowView';
import StateTransitionView from './views/StateTransitionView';
import RequirementsView from './views/RequirementsView';
import { openFileDialog, downloadFile, setupDragDrop } from './utils/fileIO';

const viewTabs: { id: ViewType; label: string; icon: string; description: string }[] = [
  { id: 'general', label: 'General', icon: '🔷', description: 'Block Definition Diagram' },
  { id: 'interconnection', label: 'Interconnection', icon: '🔗', description: 'Internal Block Diagram' },
  { id: 'actionFlow', label: 'Action Flow', icon: '⚡', description: 'Activity Diagram' },
  { id: 'stateTransition', label: 'State Transition', icon: '🔄', description: 'State Machine Diagram' },
  { id: 'requirements', label: 'Requirements', icon: '📋', description: 'Requirements Diagram' },
];

function DiagramArea() {
  const activeView = useAppStore(s => s.activeView);

  switch (activeView) {
    case 'general': return <GeneralView />;
    case 'interconnection': return <InterconnectionView />;
    case 'actionFlow': return <ActionFlowView />;
    case 'stateTransition': return <StateTransitionView />;
    case 'requirements': return <RequirementsView />;
    default: return <GeneralView />;
  }
}

export default function App() {
  const activeView = useAppStore(s => s.activeView);
  const setActiveView = useAppStore(s => s.setActiveView);
  const isDarkMode = useAppStore(s => s.isDarkMode);
  const toggleDarkMode = useAppStore(s => s.toggleDarkMode);
  const showExplorer = useAppStore(s => s.showExplorer);
  const toggleExplorer = useAppStore(s => s.toggleExplorer);
  const showPropertyPanel = useAppStore(s => s.showPropertyPanel);
  const togglePropertyPanel = useAppStore(s => s.togglePropertyPanel);
  const loadFile = useAppStore(s => s.loadFile);
  const resetToExample = useAppStore(s => s.resetToExample);
  const exportSysML = useAppStore(s => s.exportSysML);
  const fileName = useAppStore(s => s.fileName);
  const isModified = useAppStore(s => s.isModified);
  const parseErrors = useAppStore(s => s.parseErrors);
  const model = useAppStore(s => s.model);
  const openCreationModal = useAppStore(s => s.openCreationModal);
  const removeSelectedNode = useAppStore(s => s.removeSelectedNode);
  const focusedNodeId = useAppStore(s => s.focusedNodeId);
  const setFocusedNode = useAppStore(s => s.setFocusedNode);
  const [leftTab, setLeftTab] = useState<'explorer' | 'library'>('explorer');
  const appRef = useRef<HTMLDivElement>(null);

  // Set up drag-and-drop on mount
  useEffect(() => {
    if (appRef.current) {
      setupDragDrop(appRef.current, (name, content) => {
        loadFile(name, content);
      });
    }
  }, [loadFile]);

  // Delete key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only if not focused on input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
          removeSelectedNode();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removeSelectedNode]);

  // Apply dark mode class
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const handleOpen = useCallback(async () => {
    const result = await openFileDialog();
    if (result) {
      loadFile(result.name, result.content);
    }
  }, [loadFile]);

  const handleExport = useCallback(() => {
    const content = exportSysML();
    const name = fileName || 'model.sysml';
    downloadFile(content, name);
  }, [exportSysML, fileName]);

  const elementCount = model ? countElements(model.children) : 0;

  return (
    <div ref={appRef} className={`app ${isDarkMode ? 'dark' : 'light'}`}>
      {/* Top Toolbar */}
      <header className="toolbar">
        <div className="toolbar-left">
          <div className="app-logo">
            <span className="logo-icon">◆</span>
            <span className="logo-text">SysML v2 Editor</span>
          </div>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={handleOpen} title="Open .sysml file">
            <span className="btn-icon">📂</span>
            <span className="btn-label">Open</span>
          </button>
          <button className="toolbar-btn" onClick={handleExport} title="Export as .sysml">
            <span className="btn-icon">💾</span>
            <span className="btn-label">Export</span>
          </button>
          <div className="toolbar-divider" />
          <select
            className="toolbar-select"
            onChange={(e) => resetToExample(e.target.value as any)}
            defaultValue="vehicle"
            title="Load Example"
          >
            <option value="vehicle">🚗 Vehicle Demo</option>
            <option value="mars">🚀 Mars Rover</option>
            <option value="radio">📡 Radio System</option>
          </select>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={toggleExplorer} title="Toggle explorer">
            <span className="btn-icon">🗂️</span>
          </button>
          <button className="toolbar-btn" onClick={() => setLeftTab('library')} title="Show Library" style={{ display: showExplorer ? 'none' : 'flex' }}>
            <span className="btn-icon">📚</span>
          </button>
          <button className="toolbar-btn" onClick={() => setLeftTab('library')} title="Show Library" style={{ display: showExplorer ? 'none' : 'flex' }}>
            <span className="btn-icon">📚</span>
          </button>
          <button className="toolbar-btn" onClick={togglePropertyPanel} title="Toggle properties">
            <span className="btn-icon">📝</span>
          </button>
        </div>

        <div className="toolbar-center">
          {/* View Tabs */}
          <div className="view-tabs">
            {viewTabs.map(tab => (
              <button
                key={tab.id}
                className={`view-tab ${activeView === tab.id ? 'active' : ''}`}
                onClick={() => setActiveView(tab.id)}
                title={tab.description}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-right">
          <button className="toolbar-btn theme-toggle" onClick={toggleDarkMode} title="Toggle theme">
            <span className="btn-icon">{isDarkMode ? '☀️' : '🌙'}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        {/* Left: Explorer */}
        {showExplorer && (
          <div className="panel-left">
            <div className="panel-tab-bar">
              <button
                className={`panel-tab ${leftTab === 'explorer' ? 'active' : ''}`}
                onClick={() => setLeftTab('explorer')}
              >
                Explorer
              </button>
              <button
                className={`panel-tab ${leftTab === 'library' ? 'active' : ''}`}
                onClick={() => setLeftTab('library')}
              >
                Library
              </button>
            </div>
            {leftTab === 'explorer' ? <ModelExplorer /> : <LibraryPanel />}
          </div>
        )}

        {/* Center: Editor + Diagram (split) */}
        <div className="panel-center">
          <div className="split-panel">
            <div className="split-code">
              <div className="panel-tab-bar">
                <span className="panel-tab active">
                  📄 {fileName || 'untitled.sysml'}{isModified ? ' •' : ''}
                </span>
              </div>
              <CodeEditor />
            </div>
            <div className="split-divider" />
            <div
              className="split-diagram"
              style={{ position: 'relative' }}
              onDragOver={(e) => {
                // If dragging files, let them bubble to the global handler
                if (e.dataTransfer.types.includes('Files')) return;

                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDrop={(e) => {
                const types = Array.from(e.dataTransfer.types);
                if (types.includes('Files')) return;

                const template = e.dataTransfer.getData('application/sysml-template');
                if (template) {
                  e.preventDefault();
                  e.stopPropagation();
                  const kind = e.dataTransfer.getData('application/sysml-kind') || 'Element';
                  // Hit test to find target node
                  const elem = document.elementFromPoint(e.clientX, e.clientY);
                  const nodeElem = elem?.closest('.react-flow__node');
                  let targetId: string | undefined;
                  if (nodeElem && nodeElem instanceof HTMLElement) {
                    targetId = nodeElem.dataset.id;
                  }

                  // Open creation modal
                  openCreationModal(template, kind, targetId);
                }
              }}
            >
              <div className="panel-tab-bar diagram-tab-bar">
                <span className="panel-tab active">
                  {viewTabs.find(t => t.id === activeView)?.icon}{' '}
                  {viewTabs.find(t => t.id === activeView)?.description}
                </span>
              </div>
              <DiagramArea />
              {focusedNodeId && (
                <div style={{
                  position: 'absolute', top: 10, left: 10, zIndex: 5,
                  background: 'var(--bg-elevated)', padding: '8px',
                  borderRadius: '4px', border: '1px solid var(--accent)',
                  display: 'flex', gap: '8px', alignItems: 'center',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Focused View</span>
                  <button
                    onClick={() => setFocusedNode(null)}
                    style={{
                      background: 'var(--accent)', color: 'white', border: 'none',
                      borderRadius: '2px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer'
                    }}
                  >
                    Clear Focus
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Property Panel */}
        {showPropertyPanel && (
          <div className="panel-right">
            <PropertyPanel />
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <footer className="status-bar">
        <div className="status-left">
          <span className={`status-indicator ${parseErrors.length > 0 ? 'error' : 'ok'}`}>
            {parseErrors.length > 0 ? '⚠️' : '✅'}
          </span>
          <span className="status-text">
            {parseErrors.length > 0
              ? `${parseErrors.length} error(s)`
              : 'Ready'}
          </span>
        </div>
        <div className="status-center">
          <span className="status-text">{elementCount} elements</span>
        </div>
        <div className="status-right">
          <span className="status-text">SysML v2</span>
        </div>
      </footer>
      <CreationModal />
    </div>
  );
}

function countElements(nodes: import('./parser/types').SysMLNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count++;
    count += countElements(node.children);
  }
  return count;
}
