// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(() => vi.unstubAllGlobals())

async function harness() {
  const html = readFileSync('tools/reference-pilot/lab.html', 'utf8')
  document.documentElement.innerHTML = html
  const dialog = document.getElementById('scope-dialog') as HTMLDialogElement
  dialog.close = () => { dialog.open = false }
  dialog.showModal = () => { dialog.open = true }
  localStorage.clear()
  const dom = { window } 
  const calls: Array<{ source: string; url: string; payload: Record<string, unknown>; resolve: (r: unknown) => void }> = []
  const timers: Array<() => void> = []
  const mocks = {
    fetch: (url: string, options?: { body: string }) => url === '/initial'
      ? Promise.resolve({ json: async () => ({ source: 'baseline', presets: [] }) })
      : new Promise(resolve => calls.push({ source: JSON.parse(options!.body).source, url, payload: JSON.parse(options!.body), resolve })),
    setTimeout: (callback: () => void) => { timers.push(callback); return timers.length },
    requestAnimationFrame: (callback: () => void) => { timers.push(callback); return timers.length },
    clearTimeout: (id: number) => { if (id) timers[id - 1] = () => {} },
  }
  for (const [key, value] of Object.entries(mocks)) vi.stubGlobal(key, value)
  new Function(html.match(/<script nonce="__TOKEN__">([\s\S]*?)<\/script>/)![1]! + '\n' + readFileSync('tools/reference-pilot/scope.js', 'utf8'))()
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  const answer = async (index: number, valid = true, extra: Record<string, unknown> = {}) => {
    calls[index]!.resolve({ json: async () => ({ source: calls[index]!.source, sourceSha256: 'a'.repeat(64), staticChecksPassed: valid,
      diagnostics: [], elements: [{ sessionElementId: 'motor', name: 'motor', qualifiedName: 'Pump::motor', metaclass: 'PartUsage', line: 1, source: 'part motor;' }], views: [{ id: 'context', view: 'DEFAULT', targets: ['Pump'], svg: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><a href="psysml:motor"><text>MODEL</text></a></svg>', stakeholder: { title: 'System overview', scopeLabel: 'Pump', omissions: ['Internal details hidden.'] }, stakeholderSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>PLAIN MODEL</text></svg>' }], ...extra }) }); await flush()
  }
  const edit = (text: string) => { const input = dom.window.document.getElementById('source') as HTMLTextAreaElement; input.value = text; input.dispatchEvent(new dom.window.Event('input')) }
  await flush()
  return { dom, calls, answer, edit, flush, tick: () => { const pending = timers.splice(0); pending.forEach(f => f()) } }
}

describe('reference lab automatic propagation', () => {
  it('invalidates all prior views immediately and regenerates after a source edit', async () => {
    const h = await harness(); await h.answer(0)
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
  traces: [{ kind: 'satisfy', sourceId: 'motor', targetId: 'req', elementId: 'satisfy' }, { kind: 'verify', sourceId: 'check', targetId: 'req', elementId: 'check' }],
}
const scopeRelations = [
  { key: 'c', kind: 'connection', elementId: 'connection', name: 'command', item: '', source: { node: 'Pump/controller', port: 'out' }, target: { node: 'Pump/motor', port: 'in' } },
  { key: 'f', kind: 'flow', elementId: 'flow', name: 'command', item: 'Start', source: { node: 'Pump/controller', port: 'out' }, target: { node: 'Pump/motor', port: 'in' } },
]
async function perspectiveHarness() {
  const h = await harness()
  await h.answer(0, true, { catalogue: scopeCatalog, elements: ['motor', 'controller', 'connection', 'flow', 'req', 'unlinked', 'satisfy', 'check'].map(id => ({ sessionElementId: id, name: id, qualifiedName: 'Pump::' + id, metaclass: 'PartUsage', line: 1, source: id })) })
  document.getElementById('customize')!.click()
  document.getElementById('apply-scope')!.click()
  const composed = async (index = 1, extra: Record<string, unknown> = {}) => {
    h.calls[index]!.resolve({ json: async () => ({ sourceSha256: 'a'.repeat(64), nodes: scopeCatalog.nodes, relations: scopeRelations, crossing: [], warnings: [], hiddenCount: 0, filteredRelations: 0, svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>CUSTOM</text></svg>', graphSources: {}, ...extra }) })
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
    expect(document.getElementById('saved-perspectives')!.textContent).toContain('Motor review')
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
  it('clears stale graphics and warns when a regenerated model changes the review basis', async () => {
    const h = await harness(); await h.answer(0, true, { views, reviews })
    const audience = document.getElementById('audience') as HTMLSelectElement
    audience.value = 'stakeholder'; audience.dispatchEvent(new Event('change'))
    const route = document.getElementById('review-route') as HTMLSelectElement
    route.value = 'assure'; route.dispatchEvent(new Event('change'))
    h.edit('new'); expect(document.querySelector('#canvas svg')).toBeNull()
    expect(document.getElementById('review-route-control')!.hidden).toBe(true)
    h.tick(); await h.answer(1, true, { views, reviews: { ...reviews, status: 'review-basis-changed' } })
    expect(document.querySelector('.review-basis-warning')!.textContent).toContain('Model changed')
    expect(route.value).toBe('assure')
    expect(document.getElementById('view-title')!.textContent).toBe('requirement')
  })
})
