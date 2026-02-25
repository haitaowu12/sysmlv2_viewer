import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/store';
import type { DrawioViewMode } from '../bridge/view-partition';
import { describeSyncPatch } from '../bridge/patch-review';

const DRAWIO_EMBED_URL =
  'https://embed.diagrams.net/?embed=1&spin=1&proto=json&ui=min&libraries=1&saveAndExit=0&autosave=1';

export default function DrawioBridgeView() {
  const drawioXml = useAppStore((state) => state.drawioXml);
  const syncState = useAppStore((state) => state.syncState);
  const drawioViewMode = useAppStore((state) => state.drawioViewMode);
  const pendingPatchReview = useAppStore((state) => state.pendingPatchReview);
  const setDrawioXml = useAppStore((state) => state.setDrawioXml);
  const setDrawioViewMode = useAppStore((state) => state.setDrawioViewMode);
  const syncFromSysml = useAppStore((state) => state.syncFromSysml);
  const reflowDrawioLayout = useAppStore((state) => state.reflowDrawioLayout);
  const syncFromDrawio = useAppStore((state) => state.syncFromDrawio);
  const applyPatch = useAppStore((state) => state.applyPatch);
  const rejectPatch = useAppStore((state) => state.rejectPatch);
  const applyAllPatches = useAppStore((state) => state.applyAllPatches);
  const rejectAllPatches = useAppStore((state) => state.rejectAllPatches);
  const openCreationModal = useAppStore((state) => state.openCreationModal);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedXmlRef = useRef<string>('');
  const [isReady, setIsReady] = useState(false);
  const [manualXml, setManualXml] = useState(drawioXml);
  const [showXmlEditor, setShowXmlEditor] = useState(false);
  const [libraryDragActive, setLibraryDragActive] = useState(false);

  const summary = useMemo(() => {
    if (syncState.conflict) return syncState.conflict;
    if (pendingPatchReview.length > 0) return `${pendingPatchReview.length} change(s) waiting for review`;
    return 'Draw.io and SysML are synchronized';
  }, [pendingPatchReview.length, syncState.conflict]);

  useEffect(() => {
    setManualXml(drawioXml);
  }, [drawioXml]);

  const postToFrame = useCallback((payload: Record<string, unknown>) => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage(JSON.stringify(payload), '*');
  }, []);

  const pushXmlToFrame = useCallback(
    (xml: string) => {
      if (!isReady || !xml.trim()) return;
      if (lastLoadedXmlRef.current === xml) return;

      postToFrame({
        action: 'load',
        xml,
        autosave: 1,
        title: 'SysML Draw.io Bridge',
        modified: 'unsavedChanges',
      });
      lastLoadedXmlRef.current = xml;
    },
    [isReady, postToFrame],
  );

  useEffect(() => {
    if (isReady) {
      pushXmlToFrame(drawioXml);
    }
  }, [drawioXml, isReady, pushXmlToFrame]);

  useEffect(() => {
    const onLibraryDragStart = () => setLibraryDragActive(true);
    const onLibraryDragEnd = () => setLibraryDragActive(false);

    window.addEventListener('sysml-library-drag-start', onLibraryDragStart as EventListener);
    window.addEventListener('sysml-library-drag-end', onLibraryDragEnd as EventListener);
    window.addEventListener('dragend', onLibraryDragEnd);
    window.addEventListener('drop', onLibraryDragEnd);

    return () => {
      window.removeEventListener('sysml-library-drag-start', onLibraryDragStart as EventListener);
      window.removeEventListener('sysml-library-drag-end', onLibraryDragEnd as EventListener);
      window.removeEventListener('dragend', onLibraryDragEnd);
      window.removeEventListener('drop', onLibraryDragEnd);
    };
  }, []);

  const handleLibraryDrop = useCallback(
    (event: React.DragEvent) => {
      const template = event.dataTransfer.getData('application/sysml-template');
      if (!template) return;
      event.preventDefault();
      event.stopPropagation();
      const kind = event.dataTransfer.getData('application/sysml-kind') || 'Element';
      openCreationModal(template, kind);
      setLibraryDragActive(false);
    },
    [openCreationModal],
  );

  const handleLibraryDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('application/sysml-template')) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      let payload: unknown = event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }

      if (!payload || typeof payload !== 'object') {
        return;
      }

      const message = payload as Record<string, unknown>;
      const eventType = typeof message.event === 'string' ? message.event : '';

      if (eventType === 'init') {
        setIsReady(true);
        pushXmlToFrame(drawioXml);
        return;
      }

      if (eventType === 'autosave' || eventType === 'save') {
        const xml = typeof message.xml === 'string' ? message.xml : '';
        if (!xml || xml === drawioXml) {
          return;
        }

        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
          setDrawioXml(xml);
          syncFromDrawio(xml);
        }, 350);
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [drawioXml, pushXmlToFrame, setDrawioXml, syncFromDrawio]);

  return (
    <div className="drawio-bridge-view">
      <div className="drawio-bridge-toolbar">
        <select
          className="toolbar-select"
          value={drawioViewMode}
          onChange={(event) => setDrawioViewMode(event.target.value as DrawioViewMode)}
          title="Choose which SysML view to generate in Draw.io"
        >
          <option value="general">General View</option>
          <option value="interconnection">Interconnection View</option>
          <option value="requirements">Requirements View</option>
          <option value="verification">Verification View</option>
          <option value="all">All Elements</option>
        </select>
        <button className="toolbar-btn" onClick={syncFromSysml} title="Regenerate Draw.io from SysML source">
          Regenerate from SysML
        </button>
        <button className="toolbar-btn" onClick={reflowDrawioLayout} title="Recompute clean graph layout from SysML semantics">
          Reflow Layout
        </button>
        <button
          className="toolbar-btn"
          onClick={() => {
            setDrawioXml(manualXml);
            syncFromDrawio(manualXml);
          }}
          title="Apply XML from the fallback editor"
        >
          Apply XML
        </button>
        <button
          className="toolbar-btn"
          onClick={() => setShowXmlEditor((prev) => !prev)}
          title="Show advanced raw XML editor"
        >
          {showXmlEditor ? 'Hide Raw XML' : 'Show Raw XML'}
        </button>
        <span className={`drawio-sync-pill ${syncState.conflict ? 'conflict' : 'ok'}`}>{summary}</span>
      </div>

      <div className="drawio-frame-container" onDragOver={handleLibraryDragOver} onDrop={handleLibraryDrop}>
        <iframe
          ref={iframeRef}
          src={DRAWIO_EMBED_URL}
          className="drawio-frame"
          title="Draw.io Bridge"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        />
        {libraryDragActive && (
          <div className="drawio-drop-overlay" onDragOver={handleLibraryDragOver} onDrop={handleLibraryDrop}>
            Drop to create a SysML element here
          </div>
        )}
      </div>

      {showXmlEditor && (
        <div className="drawio-fallback-panel">
          <div className="drawio-review-title">Advanced Raw XML Editor</div>
          <textarea
            value={manualXml}
            onChange={(event) => setManualXml(event.target.value)}
            className="drawio-fallback-textarea"
          />
        </div>
      )}

      {pendingPatchReview.length > 0 && (
        <div className="drawio-review-panel">
          <div className="drawio-review-header">
            <div className="drawio-review-title">Review Required Changes ({pendingPatchReview.length})</div>
            <div className="drawio-review-bulk-actions">
              <button className="toolbar-btn" onClick={applyAllPatches}>
                Accept All
              </button>
              <button className="toolbar-btn" onClick={rejectAllPatches}>
                Reject All
              </button>
            </div>
          </div>
          <div className="drawio-review-list">
            {pendingPatchReview.map((patch) => {
              const description = describeSyncPatch(patch);
              return (
                <div key={patch.id} className="drawio-review-item">
                  <div className="drawio-review-text">
                    <div className="drawio-review-item-title">{description.title}</div>
                    <div>{description.details}</div>
                  </div>
                  <div className="drawio-review-actions">
                    <button className="toolbar-btn" onClick={() => applyPatch(patch.id)}>
                      Apply
                    </button>
                    <button className="toolbar-btn" onClick={() => rejectPatch(patch.id)}>
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
