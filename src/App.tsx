/**
 * SysML v2 Visual Editor — Main App Component
 */

import { useCallback, useEffect, useRef, useState, lazy, Suspense, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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
import ToastContainer, { showToast } from './components/Toast';
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

const AUTHOR_URL = 'https://haitaowu12.github.io/tony-wu-home/';

const viewTabs: { id: ViewType; label: string; icon: LucideIcon; description: string }[] = [
  { id: 'general', label: 'General', icon: Box, description: 'Block Definition Diagram' },
  { id: 'interconnection', label: 'Interconnection', icon: Link, description: 'Internal Block Diagram' },
  { id: 'actionFlow', label: 'Action Flow', icon: Zap, description: 'Activity Diagram' },
  { id: 'stateTransition', label: 'State Transition', icon: RefreshCw, description: 'State Machine Diagram' },
  { id: 'requirements', label: 'Requirements', icon: ClipboardList, description: 'Requirements Diagram' },
  { id: 'viewpoints', label: 'Viewpoints', icon: Eye, description: 'Viewpoint Diagram' },
  { id: 'drawio', label: 'Draw.io', icon: Puzzle, description: 'Interactive Draw.io Bridge' },
];

const viewCycle: ViewType[] = ['general', 'interconnection', 'actionFlow', 'stateTransition', 'requirements', 'viewpoints', 'drawio'];
const DEFAULT_CODE_PANEL_WIDTH = 32;
const MIN_CODE_PANEL_WIDTH = 20;
const MAX_CODE_PANEL_WIDTH = 55;

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
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const [leftTab, setLeftTab] = useState<'explorer' | 'library'>('explorer');
  const [rightTab, setRightTab] = useState<'properties' | 'chat'>('properties');
  const [rightPanelPinned, setRightPanelPinned] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('sysml');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [codePanelWidth, setCodePanelWidth] = useState(() => {
    try {
      const saved = localStorage.getItem('sysml-code-panel-width');
      const width = saved ? Number(saved) : DEFAULT_CODE_PANEL_WIDTH;
      return Number.isFinite(width)
        ? Math.min(MAX_CODE_PANEL_WIDTH, Math.max(MIN_CODE_PANEL_WIDTH, width))
        : DEFAULT_CODE_PANEL_WIDTH;
    } catch { return DEFAULT_CODE_PANEL_WIDTH; }
  });
  const [isCenterResizing, setIsCenterResizing] = useState(false);
  const appRef = useRef<HTMLDivElement>(null);
  const diagramContainerRef = useRef<HTMLDivElement>(null);

  const shouldShowRightPanel = showPropertyPanel && (rightPanelPinned || rightTab === 'chat' || Boolean(selectedNodeId));

  const handleTogglePropertiesPanel = useCallback(() => {
    setRightTab('properties');

    if (shouldShowRightPanel && rightTab === 'properties') {
      setRightPanelPinned(false);
      togglePropertyPanel();
      return;
    }

    if (!showPropertyPanel) {
      togglePropertyPanel();
    }
    setRightPanelPinned(true);
  }, [rightTab, shouldShowRightPanel, showPropertyPanel, togglePropertyPanel]);

  useEffect(() => {
    if (!appRef.current) return undefined;
    return setupDragDrop(
      appRef.current,
      (name, content) => {
        loadFile(name, content);
      },
      (message) => showToast(message, 'error'),
    );
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
          setRightPanelPinned(false);
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
          handleTogglePropertiesPanel();
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
  }, [removeSelectedNode, undo, redo, showPropertyPanel, toggleExplorer, handleTogglePropertiesPanel, togglePropertyPanel, setActiveView, setRightTab, activeView]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    try {
      localStorage.setItem('sysml-code-panel-width', String(codePanelWidth));
    } catch {
      // Storage can be disabled in private or locked-down browser contexts.
    }
  }, [codePanelWidth]);

  const handleOpen = useCallback(async () => {
    try {
      const result = await openFileDialog();
      if (result) {
        loadFile(result.name, result.content);
      }
    } catch (error) {
      showToast((error as Error).message, 'error');
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
      const newPercent = Math.min(MAX_CODE_PANEL_WIDTH, Math.max(MIN_CODE_PANEL_WIDTH, startPercent + deltaPercent));
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

  const handleCenterDividerKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 5 : 2;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setCodePanelWidth((width) => Math.max(MIN_CODE_PANEL_WIDTH, width - step));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setCodePanelWidth((width) => Math.min(MAX_CODE_PANEL_WIDTH, width + step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCodePanelWidth(MIN_CODE_PANEL_WIDTH);
    } else if (e.key === 'End') {
      e.preventDefault();
      setCodePanelWidth(MAX_CODE_PANEL_WIDTH);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setCodePanelWidth(DEFAULT_CODE_PANEL_WIDTH);
    }
  }, []);

  const elementCount = model ? countElements(model.children) : 0;

  return (
    <ErrorBoundary>
    <div ref={appRef} className={`app ${isDarkMode ? 'dark' : 'light'}`}>
      <header className="toolbar" role="banner" aria-label="Application toolbar">
        <div className="toolbar-left">
          <div className="app-logo">
            <span className="logo-icon">◆</span>
            <span className="logo-text">SysML v2</span>
          </div>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={undo} disabled={!canUndo()} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
            <Undo2 size={14} />
          </button>
          <button className="toolbar-btn" onClick={redo} disabled={!canRedo()} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">
            <Redo2 size={14} />
          </button>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={handleOpen} title="Open .sysml or .drawio file" aria-label="Open SysML or Draw.io file">
            <FolderOpen size={14} />
          </button>
          <div className="toolbar-btn-group">
            <button className="toolbar-btn" onClick={() => void handleExport()} title="Export model" aria-label={`Export model as ${exportFormat}`}>
              <Download size={14} />
            </button>
            <select
              className="toolbar-select toolbar-select-mini"
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
              title="Export format"
              aria-label="Export format"
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
            aria-label="Load example model"
          >
            <option value="vehicle">Vehicle Demo</option>
            <option value="mars">Mars Rover</option>
            <option value="radio">Radio System</option>
            {currentModelId === 'custom' && <option value="custom">{fileName || 'Imported Model'}</option>}
          </select>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={toggleExplorer} title="Toggle Explorer (Ctrl/Cmd+B)" aria-label="Toggle model explorer" aria-pressed={showExplorer}>
            <PanelLeft size={14} />
          </button>
          <button
            className="toolbar-btn"
            onClick={handleTogglePropertiesPanel}
            title="Toggle Properties (Ctrl/Cmd+J)"
            aria-label="Toggle properties panel"
            aria-pressed={shouldShowRightPanel && rightTab === 'properties'}
          >
            <PanelRight size={14} />
          </button>
          <button
            className="toolbar-btn"
            onClick={() => {
              if (!showPropertyPanel) {
                togglePropertyPanel();
              }
              setRightPanelPinned(false);
              setRightTab('chat');
            }}
            title="Open AI Chat (Ctrl/Cmd+Shift+I)"
            aria-label="Open AI chat"
            aria-pressed={shouldShowRightPanel && rightTab === 'chat'}
          >
            <MessageSquare size={14} />
          </button>
        </div>

        <div className="toolbar-center">
          <div className="view-tabs" role="tablist" aria-label="Diagram view">
            {viewTabs.map((tab) => (
              <button
                key={tab.id}
                className={`view-tab ${activeView === tab.id ? 'active' : ''}`}
                onClick={() => setActiveView(tab.id)}
                title={tab.description}
                role="tab"
                aria-selected={activeView === tab.id}
                aria-label={`${tab.label}: ${tab.description}`}
              >
                <tab.icon size={14} className="tab-icon" />
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-right">
          <a
            className="author-link"
            href={AUTHOR_URL}
            aria-label="Know the author: Tony Wu, systems engineer and builder of this project"
          >
            TW · About
          </a>
          <button className="toolbar-btn theme-toggle" onClick={toggleDarkMode} title="Toggle theme" aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} theme`}>
            {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      <main className="main-content" aria-label="SysML workspace">
        {showExplorer && (
          <PanelErrorBoundary panelName="left">
          <ResizablePanel defaultWidth={250} minWidth={180} maxWidth={400} side="left" persistKey="sysml-left-panel">
          <div className="panel-left">
            <div className="panel-tab-bar" role="tablist" aria-label="Left side panel">
              <button
                className={`panel-tab ${leftTab === 'explorer' ? 'active' : ''}`}
                onClick={() => setLeftTab('explorer')}
                role="tab"
                aria-selected={leftTab === 'explorer'}
              >
                Explorer
              </button>
              <button
                className={`panel-tab ${leftTab === 'library' ? 'active' : ''}`}
                onClick={() => setLeftTab('library')}
                role="tab"
                aria-selected={leftTab === 'library'}
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
              role="separator"
              aria-label="Resize source editor and diagram"
              aria-orientation="vertical"
              aria-valuemin={MIN_CODE_PANEL_WIDTH}
              aria-valuemax={MAX_CODE_PANEL_WIDTH}
              aria-valuenow={Math.round(codePanelWidth)}
              tabIndex={0}
              onMouseDown={handleCenterDividerMouseDown}
              onDoubleClick={() => setCodePanelWidth(DEFAULT_CODE_PANEL_WIDTH)}
              onKeyDown={handleCenterDividerKeyDown}
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
                    aria-label="Clear focused diagram view"
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

        {shouldShowRightPanel && (
          <PanelErrorBoundary panelName="right">
          <ResizablePanel defaultWidth={280} minWidth={200} maxWidth={450} side="right" persistKey="sysml-right-panel">
          <div className="panel-right">
            <div className="panel-tab-bar" role="tablist" aria-label="Right side panel">
              <button
                className={`panel-tab ${rightTab === 'properties' ? 'active' : ''}`}
                onClick={() => setRightTab('properties')}
                role="tab"
                aria-selected={rightTab === 'properties'}
              >
                Properties
              </button>
              <button
                className={`panel-tab ${rightTab === 'chat' ? 'active' : ''}`}
                onClick={() => setRightTab('chat')}
                role="tab"
                aria-selected={rightTab === 'chat'}
              >
                AI Chat
              </button>
            </div>
            {rightTab === 'properties' ? <PropertyPanel /> : <AiChatPanel />}
          </div>
          </ResizablePanel>
          </PanelErrorBoundary>
        )}
      </main>

      <footer className="status-bar" role="status" aria-live="polite">
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
          <span className="status-separator" aria-hidden="true">·</span>
          <a
            className="status-author-link"
            href={AUTHOR_URL}
            aria-label="Know the author: Tony Wu"
          >
            Built by Tony Wu
          </a>
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
