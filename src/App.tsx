/**
 * SysML v2 Visual Editor — Main App Component
 */

import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useAppStore, type ViewType } from './store/store';
import { ErrorBoundary, PanelErrorBoundary } from './components/ErrorBoundary';
import CodeEditor from './components/CodeEditor';
import ModelExplorer from './components/ModelExplorer';
import LibraryPanel from './components/LibraryPanel';
import PropertyPanel from './components/PropertyPanel';
import CreationModal from './components/CreationModal';
import { RelationshipModalContainer } from './components/RelationshipModal';
import AiChatPanel from './components/AiChatPanel';
import GeneralView from './views/GeneralView';
import InterconnectionView from './views/InterconnectionView';
import ActionFlowView from './views/ActionFlowView';
import StateTransitionView from './views/StateTransitionView';
import RequirementsView from './views/RequirementsView';
import ViewpointsView from './views/ViewpointsView';
import LoadingSpinner from './components/LoadingSpinner';

const DrawioBridgeView = lazy(() => import('./components/DrawioBridgeView'));
import KeyboardShortcuts from './components/KeyboardShortcuts';
import ResizablePanel from './components/ResizablePanel';
import ToastContainer from './components/Toast';
import {
  FolderOpen,
  Download,
  PanelLeft,
  PanelRight,
  MessageSquare,
  Sun,
  Moon,
  Undo2,
  Redo2,
  Box,
  Link,
  Zap,
  RefreshCw,
  ClipboardList,
  Eye,
  Puzzle,
  AlertTriangle,
  CheckCircle,
  FileText,
} from 'lucide-react';
import {
  openFileDialog,
  downloadBlob,
  downloadFile,
  setupDragDrop,
  svgToPngBlob,
} from './utils/fileIO';

import type { LucideIcon } from 'lucide-react';

type ExportFormat = 'sysml' | 'drawio' | 'svg' | 'png';

const viewTabs: { id: ViewType; label: string; icon: LucideIcon; description: string }[] = [
  { id: 'general', label: 'General', icon: Box, description: 'Block Definition Diagram' },
  { id: 'interconnection', label: 'Interconnection', icon: Link, description: 'Internal Block Diagram' },
  { id: 'actionFlow', label: 'Action Flow', icon: Zap, description: 'Activity Diagram' },
  { id: 'stateTransition', label: 'State Transition', icon: RefreshCw, description: 'State Machine Diagram' },
  { id: 'requirements', label: 'Requirements', icon: ClipboardList, description: 'Requirements Diagram' },
  { id: 'viewpoints', label: 'Viewpoints', icon: Eye, description: 'Viewpoint Diagram' },
  { id: 'drawio', label: 'Draw.io', icon: Puzzle, description: 'Interactive Draw.io Bridge' },
];

function DiagramArea() {
  const activeView = useAppStore((s) => s.activeView);

  switch (activeView) {
    case 'general':
      return <GeneralView />;
    case 'interconnection':
      return <InterconnectionView />;
    case 'actionFlow':
      return <ActionFlowView />;
    case 'stateTransition':
      return <StateTransitionView />;
    case 'requirements':
      return <RequirementsView />;
    case 'viewpoints':
      return <ViewpointsView />;
    case 'drawio':
      return (
        <Suspense fallback={<LoadingSpinner size={32} label="Loading Draw.io Bridge..." />}>
          <DrawioBridgeView />
        </Suspense>
      );
    default:
      return <GeneralView />;
  }
}

export default function App() {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode);
  const showExplorer = useAppStore((s) => s.showExplorer);
  const toggleExplorer = useAppStore((s) => s.toggleExplorer);
  const showPropertyPanel = useAppStore((s) => s.showPropertyPanel);
  const togglePropertyPanel = useAppStore((s) => s.togglePropertyPanel);
  const loadFile = useAppStore((s) => s.loadFile);
  const resetToExample = useAppStore((s) => s.resetToExample);
  const exportSysML = useAppStore((s) => s.exportSysML);
  const exportDrawio = useAppStore((s) => s.exportDrawio);
  const exportSvg = useAppStore((s) => s.exportSvg);
  const fileName = useAppStore((s) => s.fileName);
  const currentModelId = useAppStore((s) => s.currentModelId);
  const isModified = useAppStore((s) => s.isModified);
  const parseErrors = useAppStore((s) => s.parseErrors);
  const model = useAppStore((s) => s.model);
  const removeSelectedNode = useAppStore((s) => s.removeSelectedNode);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.canUndo);
  const canRedo = useAppStore((s) => s.canRedo);
  const focusedNodeId = useAppStore((s) => s.focusedNodeId);
  const setFocusedNode = useAppStore((s) => s.setFocusedNode);

  const [leftTab, setLeftTab] = useState<'explorer' | 'library'>('explorer');
  const [rightTab, setRightTab] = useState<'properties' | 'chat'>('properties');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('sysml');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [codePanelWidth, setCodePanelWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('sysml-code-panel-width');
      return saved ? Number(saved) : 40;
    } catch { return 40; }
  });
  const [isCenterResizing, setIsCenterResizing] = useState(false);
  const appRef = useRef<HTMLDivElement>(null);
  const diagramContainerRef = useRef<HTMLDivElement>(null);

  const viewCycle: ViewType[] = ['general', 'interconnection', 'actionFlow', 'stateTransition', 'requirements', 'viewpoints', 'drawio'];

  useEffect(() => {
    if (appRef.current) {
      setupDragDrop(appRef.current, (name, content) => {
        loadFile(name, content);
      });
    }
  }, [loadFile]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey) {
        if (e.shiftKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          redo();
          return;
        }

        if (!e.shiftKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          undo();
          return;
        }

        if (e.shiftKey && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          setActiveView('drawio');
          return;
        }

        if (e.shiftKey && e.key.toLowerCase() === 'i') {
          e.preventDefault();
          if (!showPropertyPanel) {
            togglePropertyPanel();
          }
          setRightTab('chat');
          return;
        }

        if (e.key.toLowerCase() === 'b') {
          e.preventDefault();
          toggleExplorer();
          return;
        }

        if (e.key.toLowerCase() === 'j') {
          e.preventDefault();
          togglePropertyPanel();
          return;
        }

        if (e.shiftKey && e.key.toLowerCase() === 'l') {
          e.preventDefault();
          toggleExplorer();
          setLeftTab((prev) => (prev === 'explorer' ? 'library' : 'explorer'));
          return;
        }

        if (e.shiftKey && e.key.toLowerCase() === 'v') {
          e.preventDefault();
          const idx = viewCycle.indexOf(activeView);
          const next = viewCycle[(idx + 1) % viewCycle.length];
          setActiveView(next);
          return;
        }

        if (e.key === '/') {
          e.preventDefault();
          setShowShortcuts((v) => !v);
          return;
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
          removeSelectedNode();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removeSelectedNode, undo, redo, showPropertyPanel, toggleExplorer, togglePropertyPanel, setActiveView, setRightTab, activeView]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    try {
      localStorage.setItem('sysml-code-panel-width', String(codePanelWidth));
    } catch {}
  }, [codePanelWidth]);

  const handleOpen = useCallback(async () => {
    const result = await openFileDialog();
    if (result) {
      loadFile(result.name, result.content);
    }
  }, [loadFile]);

  const handleExport = useCallback(async () => {
    const basename = (fileName || 'model').replace(/\.[^.]+$/, '');

    if (exportFormat === 'sysml') {
      downloadFile(exportSysML(), `${basename}.sysml`, 'text/plain');
      return;
    }

    if (exportFormat === 'drawio') {
      downloadFile(exportDrawio(), `${basename}.drawio`, 'application/xml');
      return;
    }

    const svg = exportSvg();
    if (exportFormat === 'svg') {
      downloadFile(svg, `${basename}.svg`, 'image/svg+xml');
      return;
    }

    const pngBlob = await svgToPngBlob(svg);
    downloadBlob(pngBlob, `${basename}.png`);
  }, [exportDrawio, exportFormat, exportSvg, exportSysML, fileName]);

  const handleCenterDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsCenterResizing(true);
    const startX = e.clientX;
    const startPercent = codePanelWidth;
    const container = (e.target as HTMLElement).parentElement;
    const containerWidth = container?.offsetWidth || 1;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const deltaPercent = (delta / containerWidth) * 100;
      const newPercent = Math.min(70, Math.max(15, startPercent + deltaPercent));
      setCodePanelWidth(newPercent);
    };

    const handleMouseUp = () => {
      setIsCenterResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [codePanelWidth]);

  const elementCount = model ? countElements(model.children) : 0;

  return (
    <ErrorBoundary>
    <div ref={appRef} className={`app ${isDarkMode ? 'dark' : 'light'}`}>
      <header className="toolbar">
        <div className="toolbar-left">
          <div className="app-logo">
            <span className="logo-icon">◆</span>
            <span className="logo-text">SysML v2</span>
          </div>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={undo} disabled={!canUndo()} title="Undo (Ctrl/Cmd+Z)">
            <Undo2 size={14} />
          </button>
          <button className="toolbar-btn" onClick={redo} disabled={!canRedo()} title="Redo (Ctrl/Cmd+Shift+Z)">
            <Redo2 size={14} />
          </button>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={handleOpen} title="Open .sysml or .drawio file">
            <FolderOpen size={14} />
          </button>
          <div className="toolbar-btn-group">
            <button className="toolbar-btn" onClick={() => void handleExport()} title="Export model">
              <Download size={14} />
            </button>
            <select
              className="toolbar-select toolbar-select-mini"
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
              title="Export format"
            >
              <option value="sysml">.sysml</option>
              <option value="drawio">.drawio</option>
              <option value="svg">.svg</option>
              <option value="png">.png</option>
            </select>
          </div>
          <div className="toolbar-divider" />
          <select
            className="toolbar-select"
            value={currentModelId}
            onChange={(event) => resetToExample(event.target.value as 'vehicle' | 'mars' | 'radio')}
            title="Load Example"
          >
            <option value="vehicle">Vehicle Demo</option>
            <option value="mars">Mars Rover</option>
            <option value="radio">Radio System</option>
            {currentModelId === 'custom' && <option value="custom">{fileName || 'Imported Model'}</option>}
          </select>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={toggleExplorer} title="Toggle Explorer (Ctrl/Cmd+B)">
            <PanelLeft size={14} />
          </button>
          <button className="toolbar-btn" onClick={togglePropertyPanel} title="Toggle Properties (Ctrl/Cmd+J)">
            <PanelRight size={14} />
          </button>
          <button
            className="toolbar-btn"
            onClick={() => {
              if (!showPropertyPanel) {
                togglePropertyPanel();
              }
              setRightTab('chat');
            }}
            title="Open AI Chat (Ctrl/Cmd+Shift+I)"
          >
            <MessageSquare size={14} />
          </button>
        </div>

        <div className="toolbar-center">
          <div className="view-tabs">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                className={`view-tab ${activeView === tab.id ? 'active' : ''}`}
                onClick={() => setActiveView(tab.id)}
                title={tab.description}
              >
                <tab.icon size={14} className="tab-icon" />
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-right">
          <button className="toolbar-btn theme-toggle" onClick={toggleDarkMode} title="Toggle theme">
            {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      <div className="main-content">
        {showExplorer && (
          <PanelErrorBoundary panelName="left">
          <ResizablePanel defaultWidth={250} minWidth={180} maxWidth={400} side="left" persistKey="sysml-left-panel">
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
          </ResizablePanel>
          </PanelErrorBoundary>
        )}

        <PanelErrorBoundary panelName="center">
        <div className="panel-center">
          <div className={`split-panel ${isCenterResizing ? 'resizing' : ''}`}>
            <div className="split-code" style={{ width: `${codePanelWidth}%` }}>
              <div className="panel-tab-bar">
                <span className="panel-tab active">
                  <FileText size={12} style={{display:'inline',verticalAlign:'middle',marginRight:4}} />
                  {fileName || 'untitled.sysml'}
                  {isModified ? ' •' : ''}
                </span>
              </div>
              <CodeEditor />
            </div>
            <div
              className={`split-divider ${isCenterResizing ? 'active' : ''}`}
              onMouseDown={handleCenterDividerMouseDown}
              onDoubleClick={() => setCodePanelWidth(40)}
            />
            <div
              ref={diagramContainerRef}
              className="split-diagram"
              style={{ position: 'relative' }}
            >
              <div className="panel-tab-bar diagram-tab-bar">
                <span className="panel-tab active">
                  {(() => { const t = viewTabs.find((tab) => tab.id === activeView); return t ? <><t.icon size={12} style={{display:'inline',verticalAlign:'middle',marginRight:4}} /> {t.description}</> : null; })()}
                </span>
              </div>
              <DiagramArea />
              {focusedNodeId && (
                <div className="focused-view-badge">
                  <span className="focused-view-label">Focused View</span>
                  <button
                    className="focused-view-clear-btn"
                    onClick={() => setFocusedNode(null)}
                  >
                    Clear Focus
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        </PanelErrorBoundary>

        {showPropertyPanel && (
          <PanelErrorBoundary panelName="right">
          <ResizablePanel defaultWidth={280} minWidth={200} maxWidth={450} side="right" persistKey="sysml-right-panel">
          <div className="panel-right">
            <div className="panel-tab-bar">
              <button
                className={`panel-tab ${rightTab === 'properties' ? 'active' : ''}`}
                onClick={() => setRightTab('properties')}
              >
                Properties
              </button>
              <button
                className={`panel-tab ${rightTab === 'chat' ? 'active' : ''}`}
                onClick={() => setRightTab('chat')}
              >
                AI Chat
              </button>
            </div>
            {rightTab === 'properties' ? <PropertyPanel /> : <AiChatPanel />}
          </div>
          </ResizablePanel>
          </PanelErrorBoundary>
        )}
      </div>

      <footer className="status-bar">
        <div className="status-left">
          <span className={`status-indicator ${parseErrors.length > 0 ? 'error' : 'ok'}`}>
            {parseErrors.length > 0 ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
          </span>
          <span className="status-text">{parseErrors.length > 0 ? `${parseErrors.length} error(s)` : 'Ready'}</span>
        </div>
        <div className="status-center">
          <span className="status-text">{elementCount} elements</span>
        </div>
        <div className="status-right">
          <span className="status-text">SysML v2</span>
        </div>
      </footer>

      <CreationModal />
      <RelationshipModalContainer />
      <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <ToastContainer />
    </div>
    </ErrorBoundary>
  );
}

function countElements(nodes: import('./parser/types').SysMLNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    count += countElements(node.children);
  }
  return count;
}
