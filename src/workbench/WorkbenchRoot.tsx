import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import {
  HttpWorkbenchTransport,
  WorkbenchClient,
  pairLoopbackService,
} from '../../packages/workbench-client-sdk/src/index.js'
import type { LoadedWorkspace } from './gateway.js'
import { WorkbenchShell } from './WorkbenchShell.js'
import {
  consumeCompanionBootstrap,
  isFramedWorkbench,
  type CompanionBootstrap,
} from './companion-bootstrap.js'
import './workbench.css'

const LegacyViewer = lazy(() => import('../App.js'))
const framedWorkbench =
  typeof window !== 'undefined' && isFramedWorkbench(window)
const initialCompanionBootstrap: CompanionBootstrap | null =
  typeof window === 'undefined' || framedWorkbench
    ? null
    : consumeCompanionBootstrap(window.location, window.history)
let automaticCompanionBootstrapStarted = false

export default function WorkbenchRoot() {
  if (framedWorkbench) {
    return (
      <main className="workbench-welcome">
        <section className="welcome-card" aria-labelledby="framed-title">
          <p className="eyebrow">SECURITY BOUNDARY</p>
          <h1 id="framed-title">Open the workbench in a top-level window</h1>
          <p className="welcome-summary">
            Embedded frames cannot pair with a local companion or display
            privileged engineering workflows.
          </p>
        </section>
      </main>
    )
  }
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
  const desktop = isTauri()
  const pagesCompanion =
    import.meta.env.VITE_WORKBENCH_PROFILE === 'pages-companion'
  const [serviceOrigin, setServiceOrigin] = useState(
    initialCompanionBootstrap?.serviceOrigin ?? 'http://127.0.0.1:4317',
  )
  const [pairingCode, setPairingCode] = useState(
    initialCompanionBootstrap?.pairingCode ?? '',
  )
  const [workspaceFile, setWorkspaceFile] = useState('')
  const [session, setSession] = useState<{
    client: WorkbenchClient
    workspace: LoadedWorkspace
  } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const connect = useCallback(
    async (
      origin = serviceOrigin,
      code = pairingCode,
      workspace = workspaceFile,
    ) => {
      setBusy(true)
      setError('')
      try {
        const credentials = await pairLoopbackService(origin, code)
        const selectedWorkspace = workspace || credentials.workspaceHandle
        if (!selectedWorkspace) {
          throw new Error(
            'Choose a workspace in the companion or enter its workspace file path.',
          )
        }
        const client = new WorkbenchClient(new HttpWorkbenchTransport({
          endpoint: new URL('/rpc', origin).href,
          token: credentials.token,
          csrf: credentials.csrf,
        }))
        await client.initialize({ name: 'workbench-product-shell', version: '0.1.0' })
        const status = await client.openWorkspace(selectedWorkspace)
        const [snapshot, diagnostics, views] = await Promise.all([
          client.semanticSnapshot(status.workspaceId),
          client.diagnostics(status.workspaceId),
          client.listViews(status.workspaceId),
        ])
        setSession({ client, workspace: { status, snapshot, diagnostics, views } })
        setPairingCode('')
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Workspace connection failed')
      } finally {
        setBusy(false)
      }
    },
    [pairingCode, serviceOrigin, workspaceFile],
  )

  useEffect(() => {
    if (
      desktop ||
      !initialCompanionBootstrap ||
      automaticCompanionBootstrapStarted
    ) {
      return
    }
    automaticCompanionBootstrapStarted = true
    void connect(
      initialCompanionBootstrap.serviceOrigin,
      initialCompanionBootstrap.pairingCode,
      '',
    )
  }, [connect, desktop])

  const chooseDesktopWorkspace = async () => {
    setBusy(true)
    setError('')
    try {
      const selection = await open({
        multiple: false,
        directory: false,
        title: 'Open SysML Engineering Workspace',
        filters: [{ name: 'SysML workspace', extensions: ['yaml'] }],
      })
      if (typeof selection !== 'string') return
      const bootstrap = await invoke<{
        serviceOrigin: string
        pairingCode: string
        pairingExpiresAt: string
        workspaceFile: string
      }>('start_desktop_service', { workspaceFile: selection })
      setServiceOrigin(bootstrap.serviceOrigin)
      setPairingCode(bootstrap.pairingCode)
      setWorkspaceFile(bootstrap.workspaceFile)
      await connect(
        bootstrap.serviceOrigin,
        bootstrap.pairingCode,
        bootstrap.workspaceFile,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
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
        <p className="eyebrow">
          {pagesCompanion
            ? 'GITHUB PAGES · LOCAL COMPANION'
            : 'LOCAL ENGINEERING ENVIRONMENT'}
        </p>
        <h1 id="welcome-title">SysML Engineering Workbench</h1>
        <p className="welcome-summary">
          {pagesCompanion
            ? 'Connect this public workbench shell to the qualified companion on your machine. Model content is not sent to GitHub.'
            : 'Open a source-canonical workspace through the qualified local language service. Model content remains on this machine.'}
        </p>
        {pagesCompanion && (
          <p className="welcome-summary">
            When prompted, allow Local Network Access for this GitHub Pages
            origin. The permission is used only to reach the loopback companion
            on this machine.
          </p>
        )}
        {desktop ? (
          <button
            type="button"
            className="primary-action"
            disabled={busy}
            onClick={() => void chooseDesktopWorkspace()}
          >
            {busy ? 'Opening workspace…' : 'Choose workspace…'}
          </button>
        ) : (
          <>
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
              disabled={busy || !pairingCode}
              onClick={() => void connect()}
            >
              {busy ? 'Opening workspace…' : 'Open workspace'}
            </button>
          </>
        )}
        {error && <p role="alert" className="error-banner">{error}</p>}
        <p className="compatibility-link">
          {pagesCompanion ? 'No companion installed? ' : 'Need the retired single-file workflow? '}
          <a href="?legacy=1">Explore the read-only compatibility sample</a>.
        </p>
      </section>
    </main>
  )
}
