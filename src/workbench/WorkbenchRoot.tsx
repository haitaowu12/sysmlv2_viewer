import { lazy, Suspense, useState } from 'react'
import {
  HttpWorkbenchTransport,
  WorkbenchClient,
  pairLoopbackService,
} from '../../packages/workbench-client-sdk/src/index.js'
import type { LoadedWorkspace } from './gateway.js'
import { WorkbenchShell } from './WorkbenchShell.js'
import './workbench.css'

const LegacyViewer = lazy(() => import('../App.js'))

export default function WorkbenchRoot() {
  if (
    import.meta.env.VITE_WORKBENCH_DEMO === 'legacy' ||
    new URLSearchParams(window.location.search).get('legacy') === '1'
  ) {
    return (
      <Suspense fallback={<p>Loading compatibility viewer…</p>}>
        <LegacyViewer />
      </Suspense>
    )
  }
  return <WorkspaceConnection />
}

function WorkspaceConnection() {
  const [serviceOrigin, setServiceOrigin] = useState('http://127.0.0.1:4317')
  const [pairingCode, setPairingCode] = useState('')
  const [workspaceFile, setWorkspaceFile] = useState('')
  const [session, setSession] = useState<{
    client: WorkbenchClient
    workspace: LoadedWorkspace
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    setBusy(true)
    setError('')
    try {
      const credentials = await pairLoopbackService(serviceOrigin, pairingCode)
      const client = new WorkbenchClient(new HttpWorkbenchTransport({
        endpoint: new URL('/rpc', serviceOrigin).href,
        token: credentials.token,
        csrf: credentials.csrf,
      }))
      await client.initialize({ name: 'workbench-product-shell', version: '0.1.0' })
      const status = await client.openWorkspace(workspaceFile)
      const [snapshot, diagnostics, views] = await Promise.all([
        client.semanticSnapshot(status.workspaceId),
        client.diagnostics(status.workspaceId),
        client.listViews(status.workspaceId),
      ])
      setSession({ client, workspace: { status, snapshot, diagnostics, views } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Workspace connection failed')
    } finally {
      setBusy(false)
    }
  }

  if (session) {
    return (
      <WorkbenchShell
        gateway={session.client}
        initialWorkspace={session.workspace}
        userId="local-engineer"
      />
    )
  }

  return (
    <main className="workbench-welcome">
      <section className="welcome-card" aria-labelledby="welcome-title">
        <p className="eyebrow">LOCAL ENGINEERING ENVIRONMENT</p>
        <h1 id="welcome-title">SysML Engineering Workbench</h1>
        <p className="welcome-summary">
          Open a source-canonical workspace through the qualified local language service.
          Model content remains on this machine.
        </p>
        <label>
          Local service
          <input value={serviceOrigin} onChange={(event) => setServiceOrigin(event.target.value)} />
        </label>
        <label>
          One-time pairing code
          <input
            value={pairingCode}
            onChange={(event) => setPairingCode(event.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Workspace file
          <input
            value={workspaceFile}
            onChange={(event) => setWorkspaceFile(event.target.value)}
            placeholder="/project/sysml-workspace.yaml"
          />
        </label>
        <button
          type="button"
          className="primary-action"
          disabled={busy || !pairingCode || !workspaceFile}
          onClick={() => void connect()}
        >
          {busy ? 'Opening workspace…' : 'Open workspace'}
        </button>
        {error && <p role="alert" className="error-banner">{error}</p>}
        <p className="compatibility-link">
          Need the retired single-file workflow? <a href="?legacy=1">Open compatibility viewer</a>.
        </p>
      </section>
    </main>
  )
}
