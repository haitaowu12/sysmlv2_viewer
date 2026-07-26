import { spawn } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const child = spawn(npm, ['run', 'build'], {
  env: {
    ...process.env,
    VITE_WORKBENCH_PROFILE: 'pages-companion',
    VITE_BASE_PATH: '/sysmlv2_viewer/',
  },
  stdio: 'inherit',
})

const exitCode = await new Promise<number>((resolveExit, reject) => {
  child.once('error', reject)
  child.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`Pages build stopped by ${signal}`))
      return
    }
    resolveExit(code ?? 1)
  })
})
if (exitCode !== 0) process.exitCode = exitCode
