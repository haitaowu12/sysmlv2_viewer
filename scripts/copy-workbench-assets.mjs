import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve('config/language-engine-candidates.json')
const destinationDirectory = resolve('dist-workbench/config')
await mkdir(destinationDirectory, { recursive: true })
await cp(source, resolve(destinationDirectory, 'language-engine-candidates.json'))
