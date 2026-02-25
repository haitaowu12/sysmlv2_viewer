import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/store';
import type { SyncPatch } from '../bridge/semantic-types';

const DRAWIO_EMBED_URL =
  'https://embed.diagrams.net/?embed=1&spin=1&proto=json&ui=min&libraries=1&saveAndExit=0&autosave=1';

function patchLabel(patch: SyncPatch): string {
  const reason = typeof patch.payload.reason === 'string' ? ` (${patch.payload.reason})` : '';
  return `${patch.op} → ${patch.targetId}${reason}`;
}

export default function DrawioBridgeView() {
  const drawioXml = useAppStore((state) => state.drawioXml);
  const syncState = useAppStore((state) => state.syncState);
  const pendingPatchReview = useAppStore((state) => state.pendingPatchReview);
  const setDrawioXml = useAppStore((state) => state.setDrawioXml);
  const syncFromSysml = useAppStore((state) => state.syncFromSysml);
  const syncFromDrawio = useAppStore((state) => state.syncFromDrawio);
  const applyPatch = useAppStore((state) => state.applyPatch);
  const rejectPatch = useAppStore((state) => state.rejectPatch);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedXmlRef = useRef<string>('');
  const [isReady, setIsReady] = useState(false);
  const [manualXml, setManualXml] = useState(drawioXml);

  const summary = useMemo(() => {
    if (syncState.conflict) return syncState.conflict;
    if (pendingPatchReview.length > 0) return `${pendingPatchReview.length} patch(es) waiting for review`;
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
        <button className="toolbar-btn" onClick={syncFromSysml} title="Regenerate Draw.io from SysML source">
          Regenerate from SysML
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
        <span className={`drawio-sync-pill ${syncState.conflict ? 'conflict' : 'ok'}`}>{summary}</span>
      </div>

      <div className="drawio-frame-container">
        <iframe
          ref={iframeRef}
          src={DRAWIO_EMBED_URL}
          className="drawio-frame"
          title="Draw.io Bridge"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        />
      </div>

      <details className="drawio-fallback-panel">
        <summary>Fallback XML Editor</summary>
        <textarea
          value={manualXml}
          onChange={(event) => setManualXml(event.target.value)}
          className="drawio-fallback-textarea"
        />
      </details>

      {pendingPatchReview.length > 0 && (
        <div className="drawio-review-panel">
          <div className="drawio-review-title">Review Required Patches</div>
          <div className="drawio-review-list">
            {pendingPatchReview.map((patch) => (
              <div key={patch.id} className="drawio-review-item">
                <div className="drawio-review-text">{patchLabel(patch)}</div>
                <div className="drawio-review-actions">
                  <button className="toolbar-btn" onClick={() => applyPatch(patch.id)}>
                    Apply
                  </button>
                  <button className="toolbar-btn" onClick={() => rejectPatch(patch.id)}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
