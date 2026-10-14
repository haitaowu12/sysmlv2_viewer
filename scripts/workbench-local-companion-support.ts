/** Offline candidate reuses the companion inventory and staged runtimes. */
export function localCompanionLauncher(): string {
  return `#!/bin/sh
set -eu
unset NODE_OPTIONS NODE_PATH JAVA_TOOL_OPTIONS JDK_JAVA_OPTIONS _JAVA_OPTIONS
BUNDLE_ROOT=$(CDPATH= cd -- "\${0%/*}/.." && pwd)
NODE="$BUNDLE_ROOT/runtime/node/bin/node"
"$NODE" "$BUNDLE_ROOT/bin/verify-companion.mjs"
exec "$NODE" "$BUNDLE_ROOT/bin/local-workbench.mjs" "$@"
`
}

export function localCompanionEntry(): string {
  return `import { spawn, execFileSync } from 'node:child_process'
import { cp, mkdir, realpath, stat } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const java = resolve(root, 'runtime/java/bin/java')
const spec42 = resolve(root, 'runtime/authoring/spec42')
if (args[0] === '--doctor') {
  execFileSync(java, ['-version'], { stdio: 'inherit' })
  execFileSync(spec42, ['--version'], { stdio: 'inherit' })
  console.log(JSON.stringify({ outcome: 'passed', node: process.version, platform: process.platform + '-' + process.arch, candidateOnly: true, humanCleanMachineAcceptance: false }))
  process.exit(0)
}
let workspace = args[0]
if (workspace === '--sample') {
  if (!args[1]) throw new Error('--sample requires a new destination directory outside the bundle')
  const profileIndex = args.indexOf('--sample-profile')
  const profile = profileIndex < 0 ? 'contributor-pilot' : args[profileIndex + 1]
  if (!['contributor-pilot', 'contributor-phase2'].includes(profile)) throw new Error('Unknown --sample-profile')
  const requested = resolve(args[1])
  const parent = await realpath(dirname(requested))
  const destination = resolve(parent, requested.split('/').at(-1))
  const relation = relative(root, destination)
  if (!relation || (relation !== '..' && !relation.startsWith('../'))) throw new Error('Sample destination must be outside the immutable bundle')
  await mkdir(destination) // Never overwrite a previous workspace.
  await cp(resolve(root, 'samples', profile), destination, { recursive: true, errorOnExist: true, force: false })
  workspace = resolve(destination, 'sysml-workspace.yaml')
}
if (!workspace) throw new Error('Usage: start-local-workbench.sh --doctor | --sample /new/workspace | /workspace/sysml-workspace.yaml [--port 4317]')
workspace = await realpath(resolve(workspace))
if (!(await stat(workspace)).isFile()) throw new Error('Workspace configuration must be a regular file')
const wi = relative(root, workspace)
if (!wi || (wi !== '..' && !wi.startsWith('../'))) throw new Error('Copy the sample outside the immutable bundle before editing')
const pi = args.indexOf('--port')
const portText = pi < 0 ? '4317' : args[pi + 1]
if (!/^\\d+$/.test(portText ?? '') || Number(portText) < 1024 || Number(portText) > 65535) throw new Error('--port must be an integer from 1024 to 65535')
const port = Number(portText)
const origin = 'http://127.0.0.1:' + port
const jar = resolve(root, 'runtime/semantic/sysmlv2-lsp-server.jar')
const env = { ...process.env,
  SYSML_WORKBENCH_SEMANTIC_ARTIFACT: jar,
  SYSML_WORKBENCH_AUTHORING_ARTIFACT: spec42,
  SYSML_WORKBENCH_VINQUT_COMMAND: java,
  SYSML_WORKBENCH_VINQUT_ARGUMENTS_JSON: JSON.stringify(['-jar', jar]),
  SYSML_WORKBENCH_SPEC42_COMMAND: spec42,
  SYSML_WORKBENCH_SPEC42_ARGUMENTS_JSON: JSON.stringify(['lsp', '--stdlib-path', resolve(root, 'runtime/libraries/sysml.library')]) }
const child = spawn(process.execPath, [resolve(root, 'service/apps/workbench-service/src/main.js'), '--loopback', '--qualified-runtime', '--workspace-root', dirname(workspace), '--workspace-file', workspace, '--address', '127.0.0.1', '--port', String(port), '--origin', origin, '--static-root', resolve(root, 'app'), '--candidate-manifest', resolve(root, 'config/language-engine-candidates.json'), '--runtime-lock', resolve(root, 'config/language-engine-runtime-lock.json')], { cwd: dirname(workspace), env, stdio: ['ignore', 'inherit', 'pipe'] })
let buffered = ''
child.stderr.setEncoding('utf8')
child.stderr.on('data', data => {
  buffered += data
  const lines = buffered.split(/\\r?\\n/); buffered = lines.pop() ?? ''
  for (const line of lines) {
    let event
    try { event = JSON.parse(line) } catch { /* Forward ordinary diagnostics. */ }
    if (event?.event === 'workbench-service-ready') {
      const url = new URL(origin)
      url.hash = new URLSearchParams({ service: origin, pairing: event.pairingCode }).toString()
      console.log('Open: ' + url.href)
      console.log('Local candidate ready. Keep this terminal open; Ctrl+C stops it.')
    } else process.stderr.write(line + '\\n')
  }
})
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal))
child.once('error', error => { console.error(error); process.exitCode = 1 })
child.once('exit', code => { if (buffered) process.stderr.write(buffered); process.exitCode = code ?? 1 })
`
}

export function localCompanionReadme(version: string): string {
  return `# SysML Engineering Workbench ${version}: offline runtime candidate

Apple Silicon macOS only. Internal unsigned and unnotarized candidate; this
archive does not adopt the rebuilt runtime as the production default.

1. Extract the archive into a new versioned directory; retain the prior installation.
2. Run \`./bin/start-local-workbench.sh --doctor\` to verify every file and the bundled runtimes.
3. Run \`./bin/start-local-workbench.sh --sample "$HOME/Workbench-pilot" --sample-profile contributor-phase2\` with a new destination.
   Omit the profile to use the original scalar/documentation pilot.
4. Open the printed loopback URL. The UI, sample, Node 22, minimized Java 21,
   Spec42 and official library are included. No npm install or runtime download is needed.

For an existing workspace: \`./bin/start-local-workbench.sh /path/sysml-workspace.yaml\`.
Choose \`--port 4318\` if 4317 is occupied. The launcher does not open an external browser.
It clears inherited Node/Java injection variables and verifies the complete payload before startup.
Do not edit the installation itself. Workspaces and review state live separately.
Git-backed branch and commit operations require Git; basic model editing does not.

Rollback: stop the process, retain the affected workspace and its backup, and
start the previous versioned installation against the compatible backup. Never
overwrite a newer workspace to achieve rollback. No migration is performed by this launcher.

Local isolated HOME/PATH testing is not a separate clean-machine acceptance test.
Signing, notarization, quarantine handling and human installation acceptance
remain release gates. Windows is not qualified. The archive hash supplied with
the qualification record is the external integrity anchor; the included verifier
alone cannot protect against replacement of both payload and manifest.
`
}
