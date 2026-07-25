import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const destinationDirectory = resolve('dist-workbench/config')
await mkdir(destinationDirectory, { recursive: true })
await cp(
  resolve('config/language-engine-candidates.json'),
  resolve(destinationDirectory, 'language-engine-candidates.json'),
)
await cp(
  resolve('config/language-engine-runtime-lock.json'),
  resolve(destinationDirectory, 'language-engine-runtime-lock.json'),
)
await cp(resolve('fixtures'), resolve('dist-workbench/fixtures'), {
  recursive: true,
  force: true,
})
