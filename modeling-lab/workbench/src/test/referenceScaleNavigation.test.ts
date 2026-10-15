// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(() => vi.unstubAllGlobals())
const root = { key: 'Site', root: 'Site', parent: null, depth: 0, name: 'Site', elementId: 'site' }
const segment = { key: 'Site/segment9', root: 'Site', parent: 'Site', depth: 1, name: 'segment9', elementId: 'segment9' }
const units = Array.from({ length: 100 }, (_, i) => ({ key: `Site/segment9/unit${i}`, root: 'Site', parent: segment.key, depth: 2, name: `unit${i}`, elementId: `unit${i}` }))
const nodes = [root, segment, ...units]
const catalogue = { roots: ['Site'], nodes, warnings: [], requirements: [], traces: [], limits: {} }
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>VIEW</text></svg>'
const flush = async () => { for (let i = 0; i < 32; i++) await Promise.resolve() }
const click = (label: string) => { const button = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`); expect(button, label).not.toBeNull(); button!.click() }
const search = (value: string) => { const input = document.getElementById('model-search') as HTMLInputElement; input.value = value; input.dispatchEvent(new Event('input')) }
const pager = () => document.querySelector('[data-pager="children of Site / Segment9"]')?.textContent
async function harness() {
  vi.stubGlobal('crypto', webcrypto)
  delete (window as any).labWorkflow; delete (window as any).scopeWorkbench
  localStorage.clear()
  const html = readFileSync('tools/reference-pilot/lab.html', 'utf8')
  document.documentElement.innerHTML = html
  window.HTMLDialogElement.prototype.close = function () { this.open = false }
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('fetch', async (url: string, options?: { body: string }) => {
    const payload = options ? JSON.parse(options.body) : {}; let data: any
    if (url === '/initial') data = { source: 'model', presets: [{ id: 'context', names: ['Site'], view: 'TREE', styles: [] }] }
    else if (url === '/accept') data = { accepted: true, ...payload }
    else if (url === '/compose') data = { sourceSha256: 'a'.repeat(64), reportSha256: 'b'.repeat(64), nodes: nodes.filter(n => n.key === payload.recipe.focus), relations: [], crossing: [], warnings: [], hiddenCount: 101, filteredRelations: 0, svg, graphSources: {} }
    else data = { source: payload.source, transactionId: payload.transactionId, sourceSha256: 'a'.repeat(64), reportIntegrity: { status: 'verified-managed', reportSha256: 'b'.repeat(64) }, staticChecksPassed: true, viewRecipes: [{ id: 'context', names: ['Site'], view: 'TREE', styles: [] }], diagnostics: [], elements: nodes.map(n => ({ sessionElementId: n.elementId, qualifiedName: n.key, name: n.name, metaclass: 'PartUsage', line: 1, source: `part ${n.name};` })), views: [{ id: 'context', targets: ['Site'], view: 'TREE', svg, stakeholderSvg: svg }], catalogue }
    return { json: async () => data }
  })
  new Function(html.match(/<script nonce="__TOKEN__">([\s\S]*?)<\/script>/)![1]! + '\n' + readFileSync('tools/reference-pilot/scope.js', 'utf8'))()
  await flush()
}
function expandSecondPage() {
  click('Expand Site'); click('Expand Site / Segment9'); click('Next children of Site / Segment9')
  expect(pager()).toContain('61–100 of 100 matches')
}
describe('large-model tree navigation', () => {
  it('retains the child page after focus, Up, Back and view redraw', async () => {
    await harness(); expandSecondPage(); click('Select Site/segment9/unit95');document.getElementById('model-open-component-view')!.click(); await flush()
    expect(pager()).toContain('61–100 of 100 matches')
    expect(document.querySelector('[aria-label="Select Site/segment9/unit95"]')!.getAttribute('aria-current')).toBe('true')
    document.querySelector<HTMLButtonElement>('[data-surface="register"]')!.click()
    expect(pager()).toContain('61–100 of 100 matches')
    Array.from(document.querySelectorAll<HTMLButtonElement>('#scope-trail button')).find(b => b.textContent === 'Up one level')!.click(); await flush()
    expect(pager()).toContain('61–100 of 100 matches')
    Array.from(document.querySelectorAll<HTMLButtonElement>('#scope-trail button')).find(b => b.textContent === 'Back to previous scope')!.click(); await flush()
    expect(document.querySelector('[aria-label="Select Site/segment9/unit95"]')!.getAttribute('aria-current')).toBe('true')
    click('Expand Site / Segment9'); click('Expand Site / Segment9')
    expect(pager()).toContain('61–100 of 100 matches')
    expect(document.querySelectorAll('#model-tree .focus-node').length).toBe(42)
  })
  it('reveals the selected search result in its hierarchy after search is cleared', async () => {
    await harness(); search('unit95')
    expect(document.querySelectorAll('#model-tree .focus-node').length).toBe(1)
    click('Select Site/segment9/unit95');document.getElementById('model-open-component-view')!.click(); await flush(); search('')
    expect(pager()).toContain('61–100 of 100 matches')
    expect(document.querySelector('[aria-label="Select Site/segment9/unit95"]')!.getAttribute('aria-current')).toBe('true')
    expect(document.querySelector('[aria-label="Select Site/segment9/unit0"]')).toBeNull()
  })
  it('keeps broad search bounded and returns its first page when the query changes', async () => {
    await harness(); search('unit')
    expect(document.querySelectorAll('#model-tree .focus-node').length).toBe(60)
    click('Next components'); expect(document.querySelectorAll('#model-tree .focus-node').length).toBe(40)
    search('unit9'); expect(document.querySelectorAll('#model-tree .focus-node').length).toBe(11)
    search('unit'); expect(document.querySelectorAll('#model-tree .focus-node').length).toBe(60)
    expect(document.querySelector('[aria-label="Select Site/segment9/unit0"]')).not.toBeNull()
  })
})
