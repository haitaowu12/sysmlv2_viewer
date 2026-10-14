// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(() => vi.unstubAllGlobals())

async function harness(workflow = false) {
  delete (window as any).labWorkflow
  delete (window as any).scopeWorkbench
  const html = readFileSync('tools/reference-pilot/lab.html', 'utf8')
  document.documentElement.innerHTML = html
  const dialog = document.getElementById('scope-dialog') as HTMLDialogElement
  dialog.close = () => { dialog.open = false }
  dialog.showModal = () => { dialog.open = true }
  localStorage.clear()
  window.HTMLDialogElement.prototype.close = function () { this.open = false }
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  const dom = { window }
  const calls: Array<{ source: string; url: string; payload: Record<string, unknown>; resolve: (r: unknown) => void }> = []
  const timers: Array<() => void> = []
  const mocks = {
    fetch: (url: string, options?: { body: string }) => url === '/initial'
      ? Promise.resolve({ json: async () => ({ source: 'baseline', presets: [{ id: 'context', names: ['Pump'], view: 'TREE', styles: [] }] }) })
      : new Promise(resolve => calls.push({ source: JSON.parse(options!.body).source, url, payload: JSON.parse(options!.body), resolve })),
    setTimeout: (callback: () => void) => { timers.push(callback); return timers.length },
    requestAnimationFrame: (callback: () => void) => { timers.push(callback); return timers.length },
    clearTimeout: (id: number) => { if (id) timers[id - 1] = () => {} },
  }
  for (const [key, value] of Object.entries(mocks)) vi.stubGlobal(key, value)
  new Function(html.match(/<script nonce="__TOKEN__">([\s\S]*?)<\/script>/)![1]! + '\n' + readFileSync('tools/reference-pilot/scope.js', 'utf8') + (workflow ? '\n' + readFileSync('tools/reference-pilot/workflow.js', 'utf8') : ''))()
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  const answer = async (index: number, valid = true, extra: Record<string, unknown> = {}) => {
    calls[index]!.resolve({ json: async () => ({ source: calls[index]!.source, sourceSha256: 'a'.repeat(64), reportIntegrity: { status: 'verified-managed', reportSha256: 'b'.repeat(64) }, staticChecksPassed: valid,
      diagnostics: [], elements: [{ sessionElementId: 'motor', name: 'motor', qualifiedName: 'Pump::motor', metaclass: 'PartUsage', line: 1, source: 'part motor;' }], views: [{ id: 'context', view: 'DEFAULT', targets: ['Pump'], svg: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><a href="psysml:motor"><text>MODEL</text></a></svg>', stakeholder: { title: 'System overview', scopeLabel: 'Pump', omissions: ['Internal details hidden.'] }, stakeholderSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>PLAIN MODEL</text></svg>' }], ...extra }) }); await flush()
  }
  const edit = (text: string) => { const input = dom.window.document.getElementById('source') as HTMLTextAreaElement; input.value = text; input.dispatchEvent(new dom.window.Event('input')) }
  await flush()
  return { dom, calls, answer, edit, flush, tick: () => { const pending = timers.splice(0); pending.forEach(f => f()) } }
}

describe('reference lab automatic propagation', () => {
  it('invalidates all prior views immediately and regenerates after a source edit', async () => {
    const h = await harness(); await h.answer(0)
    expect(document.getElementById('diagnostics')!.textContent).toBe('')
    expect(h.dom.window.document.querySelector('svg')).not.toBeNull()
    h.edit('changed'); expect(h.dom.window.document.querySelector('svg')).toBeNull()
    expect(h.dom.window.document.getElementById('views')!.childElementCount).toBe(0)
    h.tick(); expect(h.calls[1]!.source).toBe('changed'); await h.answer(1)
    expect(h.dom.window.document.querySelector('svg')).not.toBeNull()
  })
  it('discards an in-flight result when a later edit arrives, and keeps editing enabled', async () => {
    const h = await harness()
    expect((h.dom.window.document.getElementById('source') as HTMLTextAreaElement).disabled).toBe(false)
    h.edit('latest'); h.tick(); await h.answer(0)
    expect(h.dom.window.document.querySelector('svg')).toBeNull()
    h.tick(); expect(h.calls[1]!.source).toBe('latest'); await h.answer(1)
    expect(h.dom.window.document.querySelector('svg')).not.toBeNull()
  })
  it('cannot resurrect the old report after a failed render request', async () => {
    const h = await harness(); await h.answer(0)
    h.edit('new draft'); h.tick()
    h.calls[1]!.resolve({ json: async () => ({ error: 'timeout' }) }); await h.flush()
    h.dom.window.document.getElementById('reference')!.click()
    expect(h.dom.window.document.querySelector('svg')).toBeNull()
    expect(h.dom.window.document.getElementById('target')!.childElementCount).toBe(0)
  })

  it('switches audience on the same result without a second model request and invalidates both', async () => {
    const h = await harness(); await h.answer(0)
    const audience = h.dom.window.document.getElementById('audience') as HTMLSelectElement
    audience.value = 'stakeholder'; audience.dispatchEvent(new h.dom.window.Event('change'))
    expect(h.dom.window.document.getElementById('canvas')!.textContent).toBe('PLAIN MODEL')
    expect(h.dom.window.document.getElementById('explanation')!.textContent).toContain('Internal details hidden.')
    expect(h.calls).toHaveLength(1)
    audience.value = 'engineering'; audience.dispatchEvent(new h.dom.window.Event('change'))
    expect(h.dom.window.document.getElementById('canvas')!.textContent).toBe('MODEL')
    audience.value = 'stakeholder'; audience.dispatchEvent(new h.dom.window.Event('change'))
    h.edit('new revision')
    expect(h.dom.window.document.querySelector('svg')).toBeNull()
    expect(h.dom.window.document.getElementById('explanation')!.textContent).toBe('')
    h.tick(); await h.answer(1)
    expect(audience.value).toBe('stakeholder')
    expect(h.dom.window.document.getElementById('canvas')!.textContent).toBe('PLAIN MODEL')
  })

  it('does not display diagrams included in a failed validation response', async () => {
    const h = await harness(); await h.answer(0, false)
    expect(h.dom.window.document.querySelector('svg')).toBeNull()
    expect(h.dom.window.document.getElementById('views')!.childElementCount).toBe(0)
  })
})


describe('model exploration interactions', () => {
  it('filters viewpoints without changing the current model or losing its selection', async () => {
    const h = await harness(); await h.answer(0)
    const search = document.getElementById('view-search') as HTMLInputElement
    search.value = 'missing'; search.dispatchEvent(new Event('input'))
    expect(document.querySelector<HTMLButtonElement>('#views button')!.hidden).toBe(true)
    expect(document.getElementById('no-views')!.hidden).toBe(false)
    expect(document.querySelector('svg')).not.toBeNull()
    search.value = ''; search.dispatchEvent(new Event('input'))
    expect(document.querySelector('#views button')!.getAttribute('aria-current')).toBe('true')
    expect(h.calls).toHaveLength(1)
  })
  it('supports Space activation, source navigation and clearing selection on a view switch', async () => {
    const h = await harness(); await h.answer(0)
    const link = document.querySelector('svg a')!
    link.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(document.getElementById('inspector')!.hidden).toBe(false)
    expect(link.classList.contains('is-selected')).toBe(true)
    expect(document.getElementById('snippet')!.textContent).toBe('part motor;')
    document.getElementById('jump-source')!.click()
    expect((document.getElementById('editor') as HTMLDetailsElement).open).toBe(true)
    expect(document.activeElement!.id).toBe('source')
    expect((document.getElementById('source') as HTMLTextAreaElement).selectionEnd).toBe(8)
    document.querySelector<HTMLButtonElement>('#views button')!.click()
    expect(document.getElementById('selected')!.textContent).toBe('Nothing selected')
  })
  it('Fit resets explicit zoom sizing instead of retaining an old zoom width', async () => {
    const h = await harness(); await h.answer(0)
    document.getElementById('plus')!.click()
    expect(document.querySelector('svg')!.style.width).toBe('1000px')
    expect(document.getElementById('zoom-label')!.textContent).toBe('125%')
    document.getElementById('fit')!.click()
    expect(document.querySelector('svg')!.style.width).toBe('')
    expect(document.getElementById('zoom-label')!.textContent).toBe('')
  })
  it('can undo a baseline restore without silently discarding the prior draft', async () => {
    const h = await harness(); await h.answer(0)
    ;(document.getElementById('automatic') as HTMLInputElement).checked = false
    h.edit('retained draft'); document.getElementById('reload')!.click()
    expect(h.calls[1]!.source).toBe('baseline'); await h.answer(1)
    expect(document.getElementById('undo-restore')!.hidden).toBe(false)
    document.getElementById('undo-restore')!.click()
    expect(h.calls[2]!.source).toBe('retained draft'); await h.answer(2)
    expect((document.getElementById('source') as HTMLTextAreaElement).value).toBe('retained draft')
  })
  it('opens the retained editor on invalid input and announces a recoverable error', async () => {
    const h = await harness(); await h.answer(0, false, { diagnostics: [{ severity: 'error', line: 1, message: 'Unknown type' }] })
    expect((document.getElementById('editor') as HTMLDetailsElement).open).toBe(true)
    expect(document.getElementById('status')!.dataset.state).toBe('error')
    expect(document.getElementById('diagnostics')!.textContent).toContain('Unknown type')
    expect((document.getElementById('source') as HTMLTextAreaElement).value).toBe('baseline')
  })
})

const scopeCatalog = {
  roots: ['Pump'], sourceSha256: 'a'.repeat(64), warnings: [], limits: {},
  nodes: [
    { key: 'Pump/controller', root: 'Pump', parent: 'Pump', depth: 1, name: 'controller', elementId: 'controller' },
    { key: 'Pump/motor', root: 'Pump', parent: 'Pump', depth: 1, name: 'motor', elementId: 'motor' },
  ],
  requirements: [{ elementId: 'req', name: 'Capacity', qualifiedName: 'Pump::Capacity' }, { elementId: 'unlinked', name: 'Unlinked', qualifiedName: 'Pump::Unlinked' }],
  traces: [{ kind: 'satisfy', polarity: 'positive', sourceId: 'motor', targetId: 'req', elementId: 'satisfy' }, { kind: 'verify', sourceId: 'check', targetId: 'req', elementId: 'check' }],
}
const scopeRelations = [
  { key: 'c', kind: 'connection', elementId: 'connection', name: 'command', item: '', source: { node: 'Pump/controller', port: 'out' }, target: { node: 'Pump/motor', port: 'in' } },
  { key: 'f', kind: 'flow', elementId: 'flow', name: 'command', item: 'Start', source: { node: 'Pump/controller', port: 'out' }, target: { node: 'Pump/motor', port: 'in' } },
]
async function perspectiveHarness(workflow = false) {
  const h = await harness(workflow)
  await h.answer(0, true, { catalogue: scopeCatalog, elements: ['motor', 'controller', 'connection', 'flow', 'req', 'unlinked', 'satisfy', 'check'].map(id => ({ sessionElementId: id, name: id, qualifiedName: 'Pump::' + id, metaclass: 'PartUsage', line: 1, source: id })) })
  document.getElementById('customize')!.click()
  document.getElementById('apply-scope')!.click()
  const composed = async (index = 1, extra: Record<string, unknown> = {}) => {
    h.calls[index]!.resolve({ json: async () => ({ sourceSha256: 'a'.repeat(64), reportSha256: 'b'.repeat(64), nodes: scopeCatalog.nodes, relations: scopeRelations, crossing: [], warnings: [], hiddenCount: 0, filteredRelations: 0, svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>CUSTOM</text></svg>', graphSources: {}, ...extra }) })
    await h.flush()
  }
  return { ...h, composed }
}

describe('custom perspectives and linked analytical tables', () => {
  it('composes a view without resubmitting model source and stores only a named recipe', async () => {
    const h = await perspectiveHarness()
    expect(h.calls[1]!.url).toBe('/compose'); expect(h.calls[1]!.payload.source).toBeUndefined()
    await h.composed()
    expect(document.getElementById('canvas')!.textContent).toBe('CUSTOM')
    ;(document.getElementById('perspective-name') as HTMLInputElement).value = 'Motor review'
    document.getElementById('save-perspective')!.click()
    expect(document.getElementById('views')!.textContent).toContain('Motor review')
    const stored = JSON.parse(localStorage.getItem('sysml-perspectives-v1:unassigned')!)
    expect(stored[0].recipe.schemaVersion).toBe(1); expect(stored[0].source).toBeUndefined()
  })
  it('keeps matrix direction and exposes the actual supporting records', async () => {
    const h = await perspectiveHarness(); await h.composed()
    document.querySelector<HTMLButtonElement>('[data-surface="interfaces"]')!.click()
    const cells = Array.from(document.querySelectorAll<HTMLButtonElement>('.matrix-cell button'))
    expect(cells.map(b => b.textContent)).toEqual(['C 1 · F 1', 'C 1'])
    cells[0]!.click(); expect(document.getElementById('snippet')!.textContent).toContain('Pump/controller / out → Pump/motor / in · Start')
    expect(document.getElementById('snippet')!.textContent).toContain('Inspect connection source')
    document.querySelector<HTMLButtonElement>('#snippet button')!.click()
    expect(document.getElementById('snippet')!.textContent).toBe('connection')
    expect(document.activeElement).toBe(document.getElementById('jump-source'))
    expect((document.getElementById('fit') as HTMLButtonElement).disabled).toBe(true)
    document.querySelector<HTMLButtonElement>('#views button')!.click()
    for (const id of ['fit', 'minus', 'plus', 'actual', 'reference']) {
      expect((document.getElementById(id) as HTMLButtonElement).disabled).toBe(false)
    }
  })
  it('retains unlinked requirements and distinguishes verification planning', async () => {
    const h = await perspectiveHarness(); await h.composed()
    document.querySelector<HTMLButtonElement>('[data-surface="requirements"]')!.click()
    expect(document.getElementById('canvas')!.textContent).toContain('Pump::Unlinked')
    expect(document.getElementById('canvas')!.textContent).toContain('No extracted satisfy link')
    const kind = document.getElementById('trace-kind') as HTMLSelectElement; kind.value = 'verify'; kind.dispatchEvent(new Event('change'))
    expect(document.getElementById('canvas')!.textContent).toContain('V · planned')
    expect(document.getElementById('canvas')!.textContent).toContain('do not establish executed tests')
  })
  it('keeps an occurrence-specific assertion out of repeated sibling coverage', async () => {
    const h = await harness()
    const motor = { ...scopeCatalog.nodes[1]!, key: 'Pump/area0/motor' }
    const sibling = { ...motor, key: 'Pump/area1/motor' }
    const catalog = { ...scopeCatalog, nodes: [motor, sibling], traces: [{ ...scopeCatalog.traces[0]!, sourceOccurrences: [motor.key] }] }
    await h.answer(0, true, { catalogue: catalog })
    document.getElementById('customize')!.click(); document.getElementById('apply-scope')!.click()
    h.calls[1]!.resolve({ json: async () => ({ sourceSha256: 'a'.repeat(64), reportSha256: 'b'.repeat(64), nodes: [sibling], relations: [], crossing: [], warnings: [], hiddenCount: 1, filteredRelations: 0, svg: '<svg/>' }) }); await h.flush()
    document.querySelector<HTMLButtonElement>('[data-surface="requirements"]')!.click()
    expect(document.getElementById('canvas')!.textContent).toContain('1 outside component scope')
    expect(document.getElementById('canvas')!.textContent).not.toContain('S · asserted')
  })
  it('cannot resurrect a custom response after the source changes', async () => {
    const h = await perspectiveHarness(); h.edit('new revision'); await h.composed()
    expect(document.querySelector('#canvas svg')).toBeNull()
    expect((document.getElementById('scope-surfaces') as HTMLElement).hidden).toBe(true)
  })
  it('reapplies the selected recipe against the next accepted source revision', async () => {
    const h = await perspectiveHarness(); await h.composed(); h.edit('revised'); h.tick()
    await h.answer(2, true, { catalogue: scopeCatalog })
    expect(h.calls[3]!.url).toBe('/compose')
    expect(h.calls[3]!.payload.recipe).toEqual(h.calls[1]!.payload.recipe)
  })
})


describe('browse-first interaction refinements', () => {
  it('separates source editing from browse without losing the draft', async () => {
    const h = await harness(); await h.answer(0)
    document.getElementById('edit-toggle')!.click()
    expect(document.body.classList.contains('editing')).toBe(true)
    expect(document.getElementById('edit-toggle')!.textContent).toBe('Back to view')
    document.getElementById('edit-toggle')!.click()
    expect(document.body.classList.contains('editing')).toBe(false)
    expect((document.getElementById('source') as HTMLTextAreaElement).value).toBe('baseline')
  })
  it('keeps advanced scope changes pending until Apply and preserves rules across searches', async () => {
    const h = await perspectiveHarness(); await h.composed()
    document.getElementById('edit-perspective')!.click()
    expect((document.getElementById('scope-advanced') as HTMLDetailsElement).open).toBe(false)
    const rule = document.querySelector<HTMLSelectElement>('[aria-label="Rule for Pump/motor"]')!
    rule.value = 'include'; rule.dispatchEvent(new Event('change'))
    expect(document.getElementById('scope-exceptions')!.textContent).toContain('1 included · 0 hidden')
    const search = document.getElementById('scope-find') as HTMLInputElement
    search.value = 'controller'; search.dispatchEvent(new Event('input'))
    document.getElementById('apply-scope')!.click()
    expect((h.calls[2]!.payload.recipe as { pinned: string[] }).pinned).toEqual(['Pump/motor'])
    expect(h.calls[2]!.payload.source).toBeUndefined()
  })
  it('cancel leaves the current accepted perspective unchanged', async () => {
    const h = await perspectiveHarness(); await h.composed()
    document.getElementById('edit-perspective')!.click()
    ;(document.getElementById('scope-depth') as HTMLSelectElement).value = '4'
    document.getElementById('cancel-scope')!.click()
    expect(h.calls).toHaveLength(2)
    expect(document.getElementById('canvas')!.textContent).toBe('CUSTOM')
  })
  it('reveals crossing endpoints without editing source or changing the presentation', async () => {
    const h = await perspectiveHarness(); await h.composed(1, { crossing: scopeRelations })
    document.querySelector<HTMLButtonElement>('[data-surface="interfaces"]')!.click()
    const disclosure = document.getElementById('scope-info') as HTMLDetailsElement
    disclosure.open = true
    Array.from(document.querySelectorAll<HTMLButtonElement>('#scope-summary button')).find(b => b.textContent === 'Show crossing endpoints')!.click()
    expect(disclosure.open).toBe(false)
    expect((h.calls[2]!.payload.recipe as { pinned: string[] }).pinned).toEqual(['Pump/controller', 'Pump/motor'])
    expect(h.calls[2]!.payload.source).toBeUndefined()
    await h.composed(2)
    expect(document.querySelector('[data-surface="interfaces"]')!.getAttribute('aria-pressed')).toBe('true')
  })
  it('focuses a searched occurrence while preserving the presentation and contextual identity', async () => {
    const h = await perspectiveHarness(); await h.composed()
    document.querySelector<HTMLButtonElement>('[data-surface="interfaces"]')!.click()
    document.getElementById('nav-model')!.click()
    const search = document.getElementById('model-search') as HTMLInputElement
    search.value='motor'; search.dispatchEvent(new Event('input'))
    document.querySelector<HTMLButtonElement>('[aria-label="Focus Pump/motor"]')!.click()
    expect((h.calls[2]!.payload.recipe as { focus: string }).focus).toBe('Pump/motor')
    await h.composed(2)
    expect(document.querySelector('[data-surface="interfaces"]')!.getAttribute('aria-pressed')).toBe('true')
  })
  it('offers arrow-key matrix navigation and Enter evidence inspection with return focus', async () => {
    const h = await perspectiveHarness(); await h.composed()
    document.querySelector<HTMLButtonElement>('[data-surface="interfaces"]')!.click()
    const cells = Array.from(document.querySelectorAll<HTMLTableCellElement>('.matrix-cell'))
    cells[0]!.focus(); cells[0]!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))
    expect(document.activeElement).toBe(cells[1])
    cells[1]!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))
    expect(document.getElementById('snippet')!.textContent).toContain('Inspect flow source')
    document.getElementById('close-inspector')!.click()
    expect(document.activeElement).toBe(cells[1])
  })
  it('uses readable relationship terms in stakeholder mode while preserving inspection records', async () => {
    const h = await perspectiveHarness(); await h.composed()
    document.querySelector<HTMLButtonElement>('[data-surface="interfaces"]')!.click()
    document.querySelector<HTMLButtonElement>('.matrix-cell button')!.click()
    const audience=document.getElementById('audience') as HTMLSelectElement
    audience.value='stakeholder'; audience.dispatchEvent(new Event('change'))
    expect(document.getElementById('canvas')!.textContent).toContain('1 connection · 1 transfer')
    expect(document.getElementById('snippet')!.textContent).toContain('Inspect flow source')
    expect(h.calls).toHaveLength(2)
  })
})


describe('stakeholder discussion experience', () => {
  const story = {viewKind:'context',title:'System context',question:'Who interacts with the system?',takeaway:'Two components are connected.',discussion:'Is the boundary agreed?',scopeElementId:'motor',omissions:[],legendItems:['Lines: connections'],rows:[],components:[]}
  async function storyHarness(){
    const h=await harness()
    const views=[{id:'context',targets:['Pump'],view:'INTERCONNECTION',svg:'<svg xmlns="http://www.w3.org/2000/svg"/>',stakeholder:story,stakeholderPortraitSvg:'<svg xmlns="http://www.w3.org/2000/svg"><text>Portrait graph</text></svg>',stakeholderSvg:'<svg xmlns="http://www.w3.org/2000/svg"><text>Context graph</text></svg>'},{id:'decomposition',targets:['Pump'],view:'TREE',svg:'<svg xmlns="http://www.w3.org/2000/svg"/>',stakeholder:{...story,viewKind:'decomposition',title:'System breakdown'},stakeholderSvg:'<svg xmlns="http://www.w3.org/2000/svg"><text>Hierarchy graph</text></svg>'}]
    await h.answer(0,true,{views})
    const audience=document.getElementById('audience') as HTMLSelectElement;audience.value='stakeholder';audience.dispatchEvent(new Event('change'))
    return h
  }
  it('keeps a distinct discussion view and its evidence attached to the same model',async()=>{
    const h=await storyHarness()
    expect(document.getElementById('view-title')!.textContent).toBe('System context')
    expect(document.querySelector('.story-stage')!.textContent).toBe('Context graph')
    expect(document.querySelector('.story-notes')!.textContent).toContain('Is the boundary agreed?')
    expect((document.getElementById('diagram-key') as HTMLDetailsElement).open).toBe(false)
    expect(document.querySelector('.story-stage')!.textContent).not.toContain('Lines: connections')
    document.getElementById('next-view')!.click()
    expect(document.getElementById('view-title')!.textContent).toBe('System breakdown')
    expect(document.querySelector('.story-stage')!.textContent).toBe('Hierarchy graph')
    document.querySelector<HTMLButtonElement>('.evidence-action')!.click()
    expect(document.getElementById('snippet')!.textContent).toBe('part motor;')
    expect(h.calls).toHaveLength(1)
  })
  it('uses a portrait graph on narrow screens and closes mobile browsing after selection',async()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{}}))
    await storyHarness()
    expect(document.querySelector('.story-stage')!.textContent).toBe('Portrait graph')
    document.getElementById('browse-toggle')!.click()
    expect(document.body.classList.contains('mobile-browse')).toBe(true)
    document.getElementById('present-view')!.click()
    document.getElementById('next-view')!.click()
    expect(document.body.classList.contains('presenting')).toBe(true)
    expect(document.body.classList.contains('mobile-browse')).toBe(false)
    expect(document.getElementById('review-position')!.textContent).toBe('2 / 2')
  })
  it('exits presentation on Escape or source invalidation without stale discussion content',async()=>{
    const h=await storyHarness();document.getElementById('present-view')!.click()
    expect(document.body.classList.contains('presenting')).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))
    expect(document.body.classList.contains('presenting')).toBe(false)
    h.edit('invalid draft')
    expect(document.querySelector('.story-notes')).toBeNull()
    expect((document.getElementById('review-tools') as HTMLElement).hidden).toBe(true)
  })
})

describe('objective-led review routes', () => {
  const views = ['context', 'breakdown', 'requirement'].map(id => ({
    id, targets: ['Pump'], view: 'TREE', svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>TECH</text></svg>',
    stakeholder: { viewKind: id, title: id, takeaway: 'Model facts', discussion: 'Default question', omissions: [], legendItems: [], scopeElementId: 'motor' },
    stakeholderSvg: `<svg xmlns="http://www.w3.org/2000/svg"><text>${id}</text></svg>`,
  }))
  const reviews = { status: 'source-matches-review-basis', routes: [{ id: 'assure', title: 'Design assurance', audience: 'Reviewers', objective: 'Check the obligation and its structure', steps: [{ viewId: 'requirement', question: 'Is this obligation agreed?' }, { viewId: 'breakdown', question: 'What supports the declaration?' }] }] }
  it('uses the route order and questions on the same report without model requests', async () => {
    const h = await harness(); await h.answer(0, true, { views, reviews })
    const audience = document.getElementById('audience') as HTMLSelectElement
    audience.value = 'stakeholder'; audience.dispatchEvent(new Event('change'))
    const route = document.getElementById('review-route') as HTMLSelectElement
    route.value = 'assure'; route.dispatchEvent(new Event('change'))
    expect(document.getElementById('view-title')!.textContent).toBe('requirement')
    expect(document.getElementById('canvas')!.textContent).toContain('Is this obligation agreed?')
    expect(document.querySelectorAll('#views button')).toHaveLength(2)
    expect(document.getElementById('review-position')!.textContent).toBe('1 / 2')
    document.getElementById('next-view')!.click()
    expect(document.getElementById('view-title')!.textContent).toBe('breakdown')
    expect(document.getElementById('canvas')!.textContent).toContain('What supports the declaration?')
    expect(document.querySelector('#views button[aria-current="true"]')!.getAttribute('aria-label')).toBe('breakdown')
    expect(h.calls).toHaveLength(1)
    route.value = ''; route.dispatchEvent(new Event('change'))
    expect(document.querySelectorAll('#views button')).toHaveLength(3)
  })
  it('keeps legacy routes usable while showing their missing view basis', async () => {
    const h = await harness(); await h.answer(0, true, { views, reviews: { ...reviews, status: 'review-view-basis-missing' } })
    const audience = document.getElementById('audience') as HTMLSelectElement
    audience.value = 'stakeholder'; audience.dispatchEvent(new Event('change'))
    const route = document.getElementById('review-route') as HTMLSelectElement
    route.value = 'assure'; route.dispatchEvent(new Event('change'))
    expect(document.querySelector('.review-basis-warning')!.textContent).toContain('no recorded view recipe')
    expect(document.querySelector('#canvas svg')).not.toBeNull()
  })
  it('clears stale graphics and warns when a regenerated model changes the review basis', async () => {
    const h = await harness(); await h.answer(0, true, { views, reviews })
    const audience = document.getElementById('audience') as HTMLSelectElement
    audience.value = 'stakeholder'; audience.dispatchEvent(new Event('change'))
    const route = document.getElementById('review-route') as HTMLSelectElement
    route.value = 'assure'; route.dispatchEvent(new Event('change'))
    h.edit('new'); expect(document.querySelector('#canvas svg')).toBeNull()
    expect(document.getElementById('review-route-control')!.hidden).toBe(true)
    h.tick(); await h.answer(1, true, { views, reviews: { ...reviews, status: 'review-basis-changed' } })
    expect(document.querySelector('.review-basis-warning')!.textContent).toContain('Model or view changed')
    expect(route.value).toBe('assure')
    expect(document.getElementById('view-title')!.textContent).toBe('requirement')
  })
})

describe('semantic integrity in human projections', () => {
  it('keeps negative and unknown satisfaction distinct in matrices and trace lists', async () => {
    const h = await harness()
    const signedCatalog = { ...scopeCatalog, traces: [
      { kind: 'satisfy', polarity: 'positive', sourceId: 'motor', targetId: 'req', elementId: 'satisfy' },
      { kind: 'satisfy', polarity: 'negative', sourceId: 'motor', targetId: 'req', elementId: 'negative' },
      { kind: 'satisfy', sourceId: 'motor', targetId: 'req', elementId: 'unknown' },
    ] }
    await h.answer(0, true, { catalogue: signedCatalog })
    document.getElementById('customize')!.click(); document.getElementById('apply-scope')!.click()
    h.calls[1]!.resolve({ json: async () => ({ sourceSha256: 'a'.repeat(64), reportSha256: 'b'.repeat(64), nodes: scopeCatalog.nodes, relations: [], crossing: [], warnings: [], hiddenCount: 0, filteredRelations: 0, svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }) }); await h.flush()
    for (const surface of ['requirements', 'traces']) {
      document.querySelector<HTMLButtonElement>(`[data-surface="${surface}"]`)!.click()
      const text = document.getElementById('canvas')!.textContent!
      expect(text).toContain('S · asserted')
      expect(text).toContain('Not satisfied · asserted')
      expect(text).toContain('Satisfaction polarity unknown')
    }
  })
  it('rejects a perspective from another report even when the source hash matches', async () => {
    const h = await perspectiveHarness()
    expect(h.calls[1]!.payload.reportSha256).toBe('b'.repeat(64))
    await h.composed(1, { reportSha256: 'c'.repeat(64) })
    expect(document.querySelector('#canvas svg')).toBeNull()
    expect(document.getElementById('canvas')!.textContent).toContain('report revision mismatch')
  })
  it('puts a supported material consequence before the stakeholder discussion', async () => {
    const h = await harness()
    await h.answer(0, true, { views: [{ id: 'capacity', targets: ['Pump'], svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', stakeholderSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', stakeholder: { viewKind: 'requirement', title: 'Required outcome', takeaway: 'One obligation', scopeElementId: 'motor', omissions: [], legendItems: [], discussion: 'Review the change.', changeSummary: [{ text: 'Required minimum: 2 → 3. Declared count: 2 (unchanged).', consequence: 'Declared design shortfall. Physical verification: not evaluated.' }] } }] })
    const audience = document.getElementById('audience') as HTMLSelectElement
    audience.value = 'stakeholder'; audience.dispatchEvent(new Event('change'))
    const notes = document.querySelector('.story-notes')!
    expect(notes.firstElementChild!.textContent).toBe('What changed')
    expect(notes.textContent).toContain('Declared count: 2 (unchanged)')
    expect(notes.textContent).toContain('Physical verification: not evaluated')
  })
})


describe('custom-view continuity regressions', () => {
  it('keeps new and saved views in the filtered main selector across audiences and every presentation', async () => {
    const h = await perspectiveHarness(); await h.composed()
    expect(document.querySelector('#views [data-custom]')).not.toBeNull()
    const audience = document.getElementById('audience') as HTMLSelectElement
    for (const mode of ['engineering', 'stakeholder']) {
      audience.value = mode; audience.dispatchEvent(new Event('change'))
      for (const surface of ['diagram','interfaces','register','requirements','traces','responsibilities']) {
        document.querySelector<HTMLButtonElement>(`[data-surface="${surface}"]`)!.click()
        expect(document.getElementById('canvas')!.textContent!.length).toBeGreaterThan(0)
        expect(document.querySelector(`[data-surface="${surface}"]`)!.getAttribute('aria-pressed')).toBe('true')
        expect(document.querySelector('#views [data-custom][aria-current="true"]')).not.toBeNull()
      }
    }
    const search = document.getElementById('view-search') as HTMLInputElement
    search.value = 'not-a-view'; search.dispatchEvent(new Event('input'))
    expect(document.querySelector<HTMLButtonElement>('#views [data-custom]')!.hidden).toBe(true)
    expect(document.getElementById('canvas')!.textContent).toContain('Responsibilities')
  })
  it('starts creation with a question and a searchable subject while preserving advanced scope', async () => {
    const h = await perspectiveHarness(); await h.composed()
    document.getElementById('customize')!.click()
    expect(document.getElementById('scope-question')).not.toBeNull()
    expect((document.getElementById('scope-advanced') as HTMLDetailsElement).open).toBe(false)
    expect(document.getElementById('scope-dialog-title')!.textContent).toBe('Create a view')
  })
})

describe('complete local project workflow', () => {
  const currentHash = 'a'.repeat(64), nextHash = 'c'.repeat(64)
  const requirement = { sessionElementId: 'req', name: 'capacity', qualifiedName: 'Pump::capacity', metaclass: 'RequirementUsage', line: 1, source: 'requirement capacity { doc /* Two units. */ require constraint { count >= 2 } }' }
  it('stages a validated proposal, applies it once against its exact base, records its basis, and undoes it', async () => {
    const h = await harness(true); await h.answer(0, true, { elements: [requirement] })
    document.querySelector<HTMLButtonElement>('.project-toolbar button:nth-child(2)')!.click()
    ;(document.querySelector('[aria-label="Required minimum"]') as HTMLInputElement).value = '3'
    ;(document.querySelector('[aria-label="Complete requirement statement"]') as HTMLTextAreaElement).value = 'Three units.'
    ;(document.querySelector('[aria-label="Source quotation or decision supporting this change"]') as HTMLTextAreaElement).value = 'Decision from the brief.'
    Array.from(document.querySelectorAll<HTMLButtonElement>('#project-dialog button')).find(b => b.textContent === 'Prepare change')!.click()
    expect(h.calls[1].url).toBe('/prepare')
    expect(h.calls[1].payload.baseSourceSha256).toBe(currentHash)
    const proposal = { target: requirement.qualifiedName, description: 'Minimum 2 → 3; design retains two units.', reason: 'Decision from the brief.', before: 'two', after: 'three', baseSourceSha256: currentHash, candidateSourceSha256: nextHash }
    h.calls[1].resolve({ json: async () => ({ source: 'candidate', views: [{id:'context',names:['Pump'],view:'TREE',styles:[]}], proposal, changeSummary: [], validated: true }) }); await h.flush()
    expect((document.getElementById('source') as HTMLTextAreaElement).value).toBe('baseline')
    Array.from(document.querySelectorAll<HTMLButtonElement>('#project-dialog button')).find(b => b.textContent === 'Apply to project')!.click()
    expect(h.calls[2].payload.expectedBase).toBe(currentHash)
    await h.answer(2, true, { sourceSha256: nextHash, elements: [requirement] })
    expect((window as any).labWorkflow.snapshot().history).toHaveLength(1)
    document.querySelector<HTMLButtonElement>('.project-toolbar button:nth-child(3)')!.click()
    expect(document.getElementById('project-dialog')!.textContent).toContain('design retains two units')
    Array.from(document.querySelectorAll<HTMLButtonElement>('#project-dialog button')).find(b => b.textContent === 'Undo last engineering change')!.click()
    await h.answer(3, true, { elements: [requirement] })
    expect((document.getElementById('source') as HTMLTextAreaElement).value).toBe('baseline')
    expect((window as any).labWorkflow.snapshot().history).toHaveLength(0)
  })
  it('retains the current project on an invalid import, then reopens a validated project with its custom views', async () => {
    const h = await harness(true); await h.answer(0)
    const before = (window as any).labWorkflow.snapshot()
    const search=document.getElementById('view-search') as HTMLInputElement
    search.value='previous project';search.dispatchEvent(new Event('input'))
    const imported = { ...before, title: 'Other system', source: 'different', baselineSource: 'different', customViews: [{name:'Other view',recipe:{schemaVersion:1,root:'Pump',focus:'Pump/motor',depth:1,neighbors:0,kinds:['flow'],pinned:[],hidden:[]},surface:'register'}], history:[] }
    const rejected = (window as any).labWorkflow.openProject(imported)
    expect(document.getElementById('project-dialog')!.getAttribute('aria-busy')).toBe('true')
    const assertion = expect(rejected).rejects.toThrow('Imported model failed')
    await h.answer(1, false); await assertion
    expect(document.getElementById('project-dialog')!.hasAttribute('aria-busy')).toBe(false)
    expect(document.getElementById('status')!.dataset.state).toBe('error')
    expect((window as any).labWorkflow.snapshot().source).toBe('baseline')
    expect(search.value).toBe('previous project')
    const opened = (window as any).labWorkflow.openProject(imported)
    await h.answer(2, true); await h.flush(); await h.answer(3, true)
    await opened
    expect(search.value).toBe('')
    expect(document.querySelector<HTMLButtonElement>('#views button')!.hidden).toBe(false)
    expect((window as any).labWorkflow.snapshot().title).toBe('Other system')
    expect(document.querySelector('#views [data-custom]')!.textContent).toBe('Other view')
    h.edit('further change'); h.tick(); await h.answer(4, true)
    expect(document.querySelector('#views [data-custom]')!.textContent).toBe('Other view')
  })
})

describe('component exploration preserves orientation', () => {
  it('returns to the previous named scope without retaining the child title', async () => {
    const h = await perspectiveHarness(); await h.composed()
    const originalTitle = document.getElementById('view-title')!.textContent
    ;(window as any).scopeWorkbench.selection('motor')
    document.querySelector<HTMLButtonElement>('#explore-selection button')!.click()
    expect(h.calls[2].payload.recipe).toMatchObject({ focus: 'Pump/motor' })
    await h.composed(2)
    expect(document.getElementById('view-title')!.textContent).toBe('Motor review')
    Array.from(document.querySelectorAll<HTMLButtonElement>('#scope-trail button')).find(b => b.textContent === 'Back to previous scope')!.click()
    await h.composed(3)
    expect(document.getElementById('view-title')!.textContent).toBe(originalTitle)
    expect(h.calls[3].payload.recipe).toMatchObject({ focus: 'Pump/controller' })
  })
})

describe('reader artifact integrity', () => {
  it('exports UTF-8, escaped notes and only real requirements, excluding verification aliases', async () => {
    const { Blob: NodeBlob } = await import('node:buffer')
    let output: Blob | undefined
    vi.stubGlobal('Blob', NodeBlob)
    vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { output = blob; return 'blob:review' }, revokeObjectURL: () => {} })
    const click = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const h = await harness(true)
    await h.answer(0, true, { catalogue: { ...scopeCatalog, requirements: [scopeCatalog.requirements[0]] }, elements: [
      { sessionElementId:'req',qualifiedName:'Pump::Capacity',metaclass:'RequirementUsage',source:'requirement capacity { doc /* Three units. */ }' },
      { sessionElementId:'alias',qualifiedName:'Pump::Check::ObjectiveAlias',metaclass:'RequirementUsage',source:'verify capacity;' },
    ] })
    document.querySelector<HTMLButtonElement>('.project-toolbar button')!.click()
    const title = document.querySelector<HTMLInputElement>('[aria-label="Project name"]')!
    title.value = 'Study → review'; title.dispatchEvent(new Event('input'))
    const brief = document.querySelector<HTMLTextAreaElement>('[aria-label="Brief and source basis"]')!
    brief.value = 'Quoted <script>bad()</script> remains data.'; brief.dispatchEvent(new Event('input'))
    Array.from(document.querySelectorAll<HTMLButtonElement>('#project-dialog button')).find(b=>b.textContent==='Export reader review')!.click()
    const html = await output!.text(), doc = new DOMParser().parseFromString(html,'text/html')
    expect(doc.querySelector('meta[charset]')!.getAttribute('charset')).toBe('utf-8')
    expect(doc.querySelector('h1')!.textContent).toBe('Study → review')
    expect(doc.querySelectorAll('script')).toHaveLength(0)
    expect(doc.body.textContent).toContain('Quoted <script>bad()</script> remains data.')
    const register = Array.from(doc.querySelectorAll('section')).find(s=>s.querySelector('h2')?.textContent==='Requirements register')!
    expect(register.querySelectorAll('h3')).toHaveLength(1)
    expect(register.textContent).toContain('Pump::Capacity')
    expect(register.textContent).not.toContain('ObjectiveAlias')
    click.mockRestore()
  })
})

describe('view creation cancellation', () => {
  it('preserves a named view when another view of the same subject is created and exported', async () => {
    const h=await perspectiveHarness();await h.composed()
    document.getElementById('save-perspective')!.click()
    const original=structuredClone((window as any).scopeWorkbench.export()[0])
    document.getElementById('customize')!.click()
    const question=document.getElementById('scope-question') as HTMLSelectElement
    question.value='responsibilities';question.dispatchEvent(new Event('change'))
    document.getElementById('apply-scope')!.click();await h.composed(2)
    const views=(window as any).scopeWorkbench.export()
    expect(views.find((v:any)=>v.name===original.name)).toEqual(original)
    expect(views).toHaveLength(2)
    expect(document.getElementById('view-title')!.textContent).not.toBe(original.name)
    document.getElementById('edit-perspective')!.click()
    expect(document.getElementById('scope-dialog-title')!.textContent).toBe('Edit view scope')
    expect(document.getElementById('apply-scope')!.textContent).toBe('Apply changes')
  })
  it('retains the current named view when a new-view dialog is cancelled', async () => {
    const h=await perspectiveHarness();await h.composed()
    const title=document.getElementById('view-title')!.textContent
    document.getElementById('customize')!.click();document.getElementById('cancel-scope')!.click()
    document.querySelector<HTMLButtonElement>('[data-surface="interfaces"]')!.click()
    expect(document.getElementById('view-title')!.textContent).toBe(title)
    expect(document.querySelector('#views [data-custom][aria-current="true"]')!.textContent).toBe(title)
    expect(h.calls).toHaveLength(2)
  })
})

describe('larger-model working navigation', () => {
  it('pages component, subject, exception and advanced-scope matches without changing the active view', async () => {
    const nodes=Array.from({length:125},(_,i)=>({key:`Pump/unit${String(i).padStart(3,'0')}`,root:'Pump',parent:'Pump',depth:1,name:`unit${String(i).padStart(3,'0')}`,elementId:`u${i}`}))
    const h=await harness();await h.answer(0,true,{catalogue:{...scopeCatalog,nodes},elements:nodes.map(n=>({sessionElementId:n.elementId,qualifiedName:n.key,name:n.name,metaclass:'PartUsage',source:'part '+n.name+';'}))})
    document.getElementById('nav-model')!.click()
    const search=document.getElementById('model-search') as HTMLInputElement
    search.value='unit';search.dispatchEvent(new Event('input'))
    expect(document.getElementById('model-tree')!.textContent).toContain('1–60 of 125 matches')
    document.querySelector<HTMLButtonElement>('[aria-label="Next components"]')!.click()
    expect(document.querySelector('[aria-label="Focus Pump/unit095"]')).not.toBeNull()
    document.getElementById('customize')!.click()
    document.querySelector<HTMLButtonElement>('[aria-label="Next subjects"]')!.click()
    expect([...document.querySelectorAll<HTMLOptionElement>('#scope-focus option')].some(o=>o.value==='Pump/unit095')).toBe(true)
    document.querySelector<HTMLButtonElement>('[aria-label="Next element rules"]')!.click()
    expect(document.querySelector('[aria-label="Rule for Pump/unit095"]')).not.toBeNull()
    document.getElementById('cancel-scope')!.click()
    const target=document.getElementById('target-find') as HTMLInputElement
    target.value='unit';target.dispatchEvent(new Event('input'))
    document.querySelector<HTMLButtonElement>('[aria-label="Next model scopes"]')!.click()
    expect([...document.querySelectorAll<HTMLOptionElement>('#target option')].some(o=>o.value==='Pump/unit095')).toBe(true)
    expect(h.calls).toHaveLength(1);expect(document.getElementById('canvas')!.textContent).toContain('MODEL')
  })
  it('preserves named views through more than thirty exploratory scopes and saves a chosen one', async () => {
    const h=await perspectiveHarness();await h.composed()
    const original=structuredClone((window as any).scopeWorkbench.export())
    document.querySelector<HTMLButtonElement>('[data-surface="register"]')!.click()
    for(let i=0;i<35;i++){
      ;(window as any).scopeWorkbench.selection('motor');document.querySelector<HTMLButtonElement>('#explore-selection button')!.click();await h.composed(i+2)
    }
    expect((window as any).scopeWorkbench.export()).toHaveLength(1)
    expect((window as any).scopeWorkbench.export()[0].recipe).toEqual(original[0].recipe)
    expect(document.getElementById('canvas')!.textContent).toContain('Interface register')
    ;(document.getElementById('perspective-name') as HTMLInputElement).value='Saved unit detail'
    document.getElementById('save-perspective')!.click()
    expect((window as any).scopeWorkbench.export().map((v:any)=>v.name)).toContain('Saved unit detail')
    expect((window as any).scopeWorkbench.export()).toHaveLength(2)
  })
})

describe('revision-bound deferred source inspection', () => {
  const view={id:'context',targets:['Pump'],svg:'<svg xmlns="http://www.w3.org/2000/svg"><a href="psysml:deferred"><text>WITNESS</text></a></svg>'}
  const witness=(sha='b'.repeat(64))=>({sourceSha256:'a'.repeat(64),reportSha256:sha,element:{sessionElementId:'deferred',metaclass:'FeatureMembership',source:'exact source witness',line:1}})
  const click=()=>document.querySelector('svg a')!.dispatchEvent(new MouseEvent('click',{bubbles:true}))
  it('loads and caches the exact witness rather than requiring the full report up front', async () => {
    const h=await harness();await h.answer(0,true,{views:[view]});click()
    expect(h.calls[1].url).toBe('/element')
    expect(h.calls[1].payload).toMatchObject({sourceSha256:'a'.repeat(64),reportSha256:'b'.repeat(64),elementId:'deferred'})
    h.calls[1].resolve({json:async()=>witness()});await h.flush()
    expect(document.getElementById('snippet')!.textContent).toBe('exact source witness')
    click();expect(h.calls).toHaveLength(2)
  })
  it('rejects another report and discards an in-flight witness after a source edit', async () => {
    const h=await harness();await h.answer(0,true,{views:[view]});click()
    h.calls[1].resolve({json:async()=>witness('wrong')});await h.flush()
    expect(document.getElementById('selected')!.textContent).toBe('Source evidence unavailable')
    click();h.edit('new draft');h.calls[2].resolve({json:async()=>witness()});await h.flush()
    expect(document.getElementById('selected')!.textContent).toBe('Nothing selected')
    expect(document.getElementById('snippet')!.textContent).toBe('')
  })
})

describe('exploration back navigation',()=>{
  it('restores the previous named presentation instead of carrying the child presentation back',async()=>{
    const h=await perspectiveHarness();await h.composed()
    const title=document.getElementById('view-title')!.textContent
    ;(window as any).scopeWorkbench.selection('motor');document.querySelector<HTMLButtonElement>('#explore-selection button')!.click();await h.composed(2)
    document.querySelector<HTMLButtonElement>('[data-surface="register"]')!.click()
    Array.from(document.querySelectorAll<HTMLButtonElement>('#scope-trail button')).find(b=>b.textContent==='Back to previous scope')!.click();await h.composed(3)
    expect(document.getElementById('view-title')!.textContent).toBe(title)
    expect(document.querySelector('[data-surface="diagram"]')!.getAttribute('aria-pressed')).toBe('true')
  })
})


describe('readable endpoints and explicit view lifecycle', () => {
  it('renames the active view without duplicates and rejects another view name', async () => {
    const h = await perspectiveHarness(); await h.composed()
    const names = () => (window as any).scopeWorkbench.export().map((v: any) => v.name)
    const original = names()[0]
    const input = document.getElementById('perspective-name') as HTMLInputElement
    input.value = 'Local interfaces'; document.getElementById('save-perspective')!.click()
    expect(names()).toEqual(['Local interfaces']); expect(names()).not.toContain(original)
    document.getElementById('save-view-copy')!.click()
    expect(names().sort()).toEqual(['Local interfaces', 'Local interfaces copy'])
    const before = JSON.stringify((window as any).scopeWorkbench.export())
    input.value = 'Local interfaces'; document.getElementById('save-perspective')!.click()
    expect(document.getElementById('view-save-feedback')!.textContent).toContain('different view already uses this name')
    expect(JSON.stringify((window as any).scopeWorkbench.export())).toBe(before)
  })
  it('keeps the saved original presentation and recipe when changed work is saved as a new view', async () => {
    const h=await perspectiveHarness();await h.composed()
    const name=document.getElementById('perspective-name') as HTMLInputElement
    name.value='Original';document.getElementById('save-perspective')!.click()
    const original=structuredClone((window as any).scopeWorkbench.export()[0])
    document.querySelector<HTMLButtonElement>('[data-surface="responsibilities"]')!.click()
    name.value='Responsibility copy';document.getElementById('save-view-copy')!.click()
    const views=(window as any).scopeWorkbench.export()
    expect(views.find((v:any)=>v.name==='Original')).toEqual(original)
    expect(views.find((v:any)=>v.name==='Responsibility copy').surface).toBe('responsibilities')
    expect(JSON.parse(localStorage.getItem('sysml-perspectives-v1:unassigned')!).find((v:any)=>v.name==='Original')).toEqual(original)
  })
  it('labels a retained recipe consistently after selecting it and marks changed presentations unsaved', async () => {
    const h=await perspectiveHarness();await h.composed()
    document.getElementById('save-perspective')!.click()
    document.querySelector<HTMLButtonElement>('#views [data-custom]')!.click();await h.composed(2)
    expect(document.querySelector('#views [data-custom]')!.getAttribute('title')).toBe('Custom view · saved recipe')
    document.querySelector<HTMLButtonElement>('[data-surface="responsibilities"]')!.click()
    expect(document.querySelector('#views [data-custom]')!.getAttribute('title')).toBe('Custom view · unsaved view changes')
  })
  it('keeps repeated endpoint context, port and exact paths available without raw primary labels', async () => {
    const h = await harness()
    const nodes = ['area0', 'area1'].map((area, i) => ({ key: `Study::plant/${area}/temperatureConditioningUnit_00`, parent: `Study::plant/${area}`, root: 'Study::plant', name: 'temperatureConditioningUnit_00', elementId: 'shared', depth: 2 }))
    const relation = { ...scopeRelations[0], name: 'primary_0_1', source: { node: nodes[0].key, port: 'outReading' }, target: { node: nodes[1].key, port: 'input' } }
    await h.answer(0, true, { catalogue: { ...scopeCatalog, roots: ['Study::plant'], nodes, relations: [relation] } })
    document.getElementById('customize')!.click(); document.getElementById('apply-scope')!.click()
    h.calls[1].resolve({ json: async () => ({ sourceSha256: 'a'.repeat(64), reportSha256: 'b'.repeat(64), nodes, relations: [relation], crossing: [], warnings: [], hiddenCount: 0, filteredRelations: 0 }) }); await h.flush()
    document.querySelector<HTMLButtonElement>('[data-surface="register"]')!.click()
    const filter = document.querySelector<HTMLInputElement>('[aria-label="Filter rows"]')!; filter.value = '0 1'; filter.dispatchEvent(new Event('input'))
    const cards = [...document.querySelectorAll('.endpoint')]
    expect(cards.map(c => c.querySelector('strong')!.textContent)).toEqual(['Temperature Conditioning Unit 00', 'Temperature Conditioning Unit 00'])
    expect(cards.map(c => c.querySelector('.endpoint-context')!.textContent)).toEqual(['Area 0', 'Area 1'])
    expect(cards[0].querySelector('.endpoint-port')!.textContent).toBe('Port · Out Reading')
    expect(cards[0].querySelector('code')!.textContent).toBe(nodes[0].key + ' / outReading')
    expect((cards[0].querySelector('details') as HTMLDetailsElement).open).toBe(false)
  })
  it('shows project-file state and enables saving after validation, then marks edits unsaved', async () => {
    const h = await harness(true); await h.answer(0)
    const workflow = (window as any).labWorkflow
    expect(document.getElementById('edit-toggle')!.textContent).toBe('Edit SysML source')
    expect(document.getElementById('project-file-state')!.textContent).toContain('No project file saved')
    expect(document.querySelector<HTMLButtonElement>('.project-context button')!.disabled).toBe(false)
    const data = workflow.snapshot(); const opening = workflow.openProject(data)
    await h.answer(1); await h.flush(); await h.answer(2); await opening
    expect(document.getElementById('project-file-state')!.textContent).toContain('Project file current')
    h.edit('changed draft')
    expect(document.getElementById('project-file-state')!.textContent).toContain('Changes since last project file')
    expect(document.querySelector<HTMLButtonElement>('.project-context button')!.disabled).toBe(true)
  })
})


describe('explicit Fit provides a complete overview', () => {
  it('keeps the readable default but lets a deliberate Fit show smaller labels', async () => {
    const h = await harness()
    const original = (SVGElement.prototype as any).getScreenCTM
    ;(SVGElement.prototype as any).getScreenCTM = () => ({ a: 0.5, b: 0 })
    try {
      await h.answer(0, true, { views: [{ id: 'context', targets: ['Pump'], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 300"><text style="font-size:12px">Long overview</text></svg>' }] })
      expect(document.getElementById('canvas')!.classList.contains('fit')).toBe(false)
      expect(document.getElementById('zoom-label')!.textContent).toContain('Readable')
      document.getElementById('fit')!.click()
      expect(document.getElementById('canvas')!.classList.contains('fit')).toBe(true)
      expect(document.getElementById('zoom-label')!.textContent).toContain('Overview')
      expect(document.querySelector<SVGElement>('#canvas svg')!.style.width).toBe('')
    } finally { if (original) (SVGElement.prototype as any).getScreenCTM = original; else delete (SVGElement.prototype as any).getScreenCTM }
  })
})


describe('reopened stakeholder consequences', () => {
  it('uses the current scoped report comparison when a cached view has no consequence', async () => {
    const h = await harness()
    await h.answer(0, true, { changeSummary: [{ requirement: 'Pump::capacity', text: 'Minimum2 →3; declared2 unchanged.', consequence: 'Declared shortfall; physical verification not evaluated.' }, { requirement: 'Other::capacity', text: 'UNRELATED', consequence: 'Not in this scope' }], views: [{ id: 'capacity', targets: ['Pump::capacity'], svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', stakeholderSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', stakeholder: { viewKind: 'requirement', title: 'Required outcome', scopeElementId: 'motor', omissions: [], legendItems: [], changeSummary: [], takeaway: 'Requirement', discussion: 'Review the declaration' } }] })
    const audience = document.getElementById('audience') as HTMLSelectElement; audience.value = 'stakeholder'; audience.dispatchEvent(new Event('change'))
    expect(document.querySelector('.story-notes')!.textContent).toContain('Minimum2 →3; declared2 unchanged.')
    expect(document.querySelector('.story-notes')!.textContent).not.toContain('UNRELATED')
  })
})


describe('subject choices preserve occurrence versus definition', () => {
  it('distinguishes humanized names that would otherwise look identical', async () => {
    const h = await harness()
    const nodes = [{key:'Study::System',root:'Study::System',parent:null,elementId:'definition',name:'System',depth:0},{key:'Study::system',root:'Study::system',parent:null,elementId:'occurrence',name:'system',depth:0}]
    await h.answer(0, true, { catalogue: {...scopeCatalog, roots:['Study::System','Study::system'],nodes}, elements:[{sessionElementId:'definition',metaclass:'PartDefinition',qualifiedName:'Study::System',name:'System'},{sessionElementId:'occurrence',metaclass:'PartUsage',qualifiedName:'Study::system',name:'system'}] })
    document.getElementById('customize')!.click()
    expect([...document.querySelectorAll('#scope-focus option')].map(o=>o.textContent)).toEqual(['System · definition','System · model occurrence'])
  })
})


describe('readable responsibilities and reader scope', () => {
  const assignment = {sessionElementId:'perform',name:'reviewAlarm',qualifiedName:'Study::Controller::reviewAlarm',metaclass:'PerformActionUsage',source:'perform action reviewAlarm : Study::ReviewTemperatureAlarm;',semantics:{owner:{qualifiedName:'Study::Controller',metaclass:'PartDefinition'},type:[{id:'scenario',name:'ReviewTemperatureAlarm',qualifiedName:'Study::ReviewTemperatureAlarm',metaclass:'ActionDefinition'}]}}
  const elements = [{sessionElementId:'motor',name:'controller',qualifiedName:'Study::Controller',metaclass:'PartDefinition',source:'part def Controller;',semantics:{feature:[{id:'perform'}]}},assignment,{sessionElementId:'scenario',name:'ReviewTemperatureAlarm',qualifiedName:'Study::ReviewTemperatureAlarm',metaclass:'ActionDefinition',source:'action def ReviewTemperatureAlarm;'}]
  it('preserves repeated component contexts and source access without implying step allocation', async () => {
    const h = await harness()
    const nodes = ['coldRoom0','coldRoom1'].map(room=>({key:`Study::system/${room}/controller`,root:'Study::system',parent:`Study::system/${room}`,name:'controller',depth:2,elementId:'motor'}))
    await h.answer(0,true,{elements,catalogue:{...scopeCatalog,roots:['Study::system'],nodes}})
    document.getElementById('customize')!.click();document.getElementById('apply-scope')!.click()
    h.calls[1].resolve({json:async()=>({sourceSha256:'a'.repeat(64),reportSha256:'b'.repeat(64),nodes,relations:[],crossing:[],warnings:[],hiddenCount:0,filteredRelations:0})});await h.flush()
    document.querySelector<HTMLButtonElement>('[data-surface="responsibilities"]')!.click()
    const rows = [...document.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('System / Cold Room 0')
    expect(rows[1].textContent).toContain('System / Cold Room 1')
    expect(rows[0].textContent).toContain('Review Temperature Alarm')
    expect(rows[0].textContent).toContain('Whole scenario; this statement does not assign individual steps.')
    expect(rows[0].querySelector('code')!.textContent).toBe(nodes[0].key)
    ;[...rows[0].querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Inspect assignment')!.click()
    expect(document.getElementById('snippet')!.textContent).toBe(assignment.source)
  })
  it('exports friendly scope and assignment labels with the exact paths and witness retained', async () => {
    const { Blob: NodeBlob } = await import('node:buffer');let output:Blob|undefined
    vi.stubGlobal('Blob',NodeBlob);vi.stubGlobal('URL',{createObjectURL:(blob:Blob)=>{output=blob;return 'blob:review'},revokeObjectURL:()=>{}})
    const click=vi.spyOn(window.HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
    try {
      const h=await harness(true);await h.answer(0,true,{elements,catalogue:{...scopeCatalog,relations:[{...scopeRelations[0],scope:'Study::system/coldRoom0'}]}})
      document.querySelector<HTMLButtonElement>('.project-toolbar button')!.click()
      ;[...document.querySelectorAll<HTMLButtonElement>('#project-dialog button')].find(b=>b.textContent==='Export reader review')!.click()
      const doc=new DOMParser().parseFromString(await output!.text(),'text/html')
      const responsibilities=[...doc.querySelectorAll('section')].find(s=>s.querySelector('h2')?.textContent==='Declared responsibilities')!
      expect([...responsibilities.querySelectorAll('strong')].map(n=>n.textContent)).toEqual(['Controller','Review Temperature Alarm'])
      expect([...responsibilities.querySelectorAll('code')].map(n=>n.textContent)).toEqual(['Study::Controller','Study::ReviewTemperatureAlarm'])
      expect(responsibilities.textContent).toContain(assignment.source)
      expect(responsibilities.textContent).toContain('Whole scenario; this statement does not assign individual steps.')
      const register=[...doc.querySelectorAll('section')].find(s=>s.querySelector('h2')?.textContent==='Interface register')!
      expect(register.querySelector('strong')!.textContent).toBe('Cold Room 0')
      expect(register.querySelector('code')!.textContent).toBe('Study::system/coldRoom0')
    } finally {click.mockRestore()}
  })
})
