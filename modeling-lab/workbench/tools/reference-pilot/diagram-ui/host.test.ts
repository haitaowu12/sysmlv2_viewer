import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { adaptDiagram, type SDKView } from './adapter';
import { mountDiagram } from './host';

const origin = { file: 'vehicle.sysml', startLine: 12, startCol: 4, endLine: 16, endCol: 5 };
function model(): SDKView {
  return { view: 'Vehicle wiring', kind: 'interconnection', nodes: [
    { id: 'v', name: 'vehicle', kind: 'part', parent: '', origin, geometry: { x: 0, y: 0, width: 0, height: 0, hasSize: false } },
    { id: 'engine', name: 'engine', kind: 'part', parent: 'v', origin, ports: [{ id: 'shaft', name: 'shaft', type: 'Mechanical', direction: 'out' }] },
    { id: 'wheel', name: 'wheel', kind: 'part', parent: 'v', origin, ports: [{ id: 'axle', name: 'axle', direction: 'in' }] },
    { id: 'rotor', name: 'rotor', kind: 'part', parent: 'engine', origin },
  ], edges: [
    { kind: 'connection', from: 'engine', to: 'wheel', fromPort: 'shaft', toPort: 'axle', label: 'drive', origin },
    { kind: 'flow', from: 'rotor', to: 'wheel', label: 'deep', origin },
  ], notices: [], notes: [{ text: 'Keep the mechanical boundary visible.', anchor: 'engine', origin }] };
}
test('presentation depth preserves ancestor and port-endpoint integrity without changing input', () => {
  const view = model(), before = JSON.stringify(view);
  const adapted = adaptDiagram(view, 1);
  assert.deepEqual(adapted.result.nodes.map(node => node.id), ['v', 'engine', 'wheel']);
  assert.equal(adapted.result.nodes[1].parent, 'v');
  assert.equal(adapted.result.edges.length, 1);
  assert.equal(adapted.result.edges[0].fromPort, 'shaft');
  assert.equal(adapted.result.edges[0].toPort, 'axle');
  assert.equal(adapted.summary.omittedNodes, 1); assert.equal(adapted.summary.omittedEdges, 1);
  assert.equal(adapted.result.nodes[0].width, undefined); assert.equal(adapted.result.nodes[0].parent, undefined);
  assert.equal(adapted.result.nodes[1].fqn, undefined);
  assert.equal(JSON.stringify(view), before);
});
test('dangling ports are disclosed; ownership cycles and colliding node IDs reject', () => {
  const view = model(); view.edges = [...view.edges!, { kind: 'connection', from: 'engine', to: 'wheel', fromPort: 'missing' }];
  assert.equal(adaptDiagram(view).summary.invalidEdges, 1);
  assert.throws(() => adaptDiagram({ ...model(), nodes: [{ id: 'x', kind: 'part', parent: 'y' }, { id: 'y', kind: 'part', parent: 'x' }] }), /cycle/);
  assert.throws(() => adaptDiagram({ ...model(), nodes: [{ id: 'x', kind: 'part' }, { id: 'x', kind: 'part' }] }), /repeated/);
});
test('stated collapsed owners omit their descendants and incident relationships honestly', () => {
  const view = model(); view.nodes = view.nodes!.map(node => node.id === 'engine' ? { ...node, geometry: { x: 0, y: 0, hasSize: false, collapsed: true } } : node);
  const adapted = adaptDiagram(view);
  assert.deepEqual(adapted.result.nodes.map(node => node.id), ['v', 'engine', 'wheel']);
  assert.equal(adapted.summary.omittedNodes, 1); assert.equal(adapted.summary.visibleEdges, 1);
});
test('donor host draws ports and typed edge markers, selects exact origins, zooms, fits and disposes', async () => {
  const dom = new JSDOM('<!doctype html><main></main>', { pretendToBeVisual: true });
  const previous = globalThis.document;
  Object.assign(globalThis, { document: dom.window.document });
  const host = dom.window.document.querySelector('main')!;
  const selected: unknown[][] = [];
  try {
    const diagram = await mountDiagram(host, model(), { depth: 1, onSelect: (...args) => selected.push(args) });
    assert.equal(diagram.svg?.querySelectorAll('g.opensysml-node').length, 3);
    assert.equal(diagram.svg?.querySelectorAll('g.port').length, 2);
    const port = diagram.svg!.querySelector('g.port[data-port="shaft"]')!;
    port.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.equal(selected.length, 1); assert.equal(selected[0][0], origin);
    assert.equal((selected[0][1] as { originOf: string }).originOf, 'owner');
    const edge = diagram.svg!.querySelector('g.opensysml-edge')!;
    edge.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(selected.length, 2); assert.equal(selected[1][0], origin);
    assert.equal(edge.querySelector('.line')!.getAttribute('marker-end'), null);
    assert.match(host.textContent!, /1 elements and 1 relationships are omitted/);
    assert.match(host.textContent!, /Keep the mechanical boundary/);
    assert.equal(diagram.svg!.querySelectorAll('.handles').length, 0);
    assert.equal(diagram.svg!.querySelectorAll('.movable').length, 0);
    const content = diagram.svg!.lastElementChild!, fitted = content.getAttribute('transform');
    diagram.zoom(2); assert.notEqual(content.getAttribute('transform'), fitted);
    const viewport=diagram.captureViewport()!, zoomed=content.getAttribute('transform');
    diagram.fit(); assert.equal(content.getAttribute('transform'), fitted);
    diagram.restoreViewport(viewport); assert.equal(content.getAttribute('transform'), zoomed);
    diagram.restoreViewport({...viewport,scale:NaN}); assert.equal(content.getAttribute('transform'),zoomed,'invalid restored camera does not discard the current viewport');
    diagram.dispose(); diagram.dispose(); assert.equal(host.children.length, 0);
  } finally { Object.assign(globalThis, { document: previous }); dom.window.close(); }
});
test('flow and typing preserve their different arrow semantics and marker IDs are mount-local', async () => {
  const dom = new JSDOM('<!doctype html><main></main><aside></aside>');
  const previous = globalThis.document; Object.assign(globalThis, { document: dom.window.document });
  const view: SDKView = { view: 'Types', kind: 'tree', nodes: [{ id: 'a', name: 'A', kind: 'part def' }, { id: 'b', name: 'B', kind: 'part' }], edges: [{ from: 'a', to: 'b', kind: 'typing' }] };
  try {
    const first = await mountDiagram(dom.window.document.querySelector('main')!, view);
    const second = await mountDiagram(dom.window.document.querySelector('aside')!, view);
    const marker = (svg: SVGSVGElement) => svg.querySelector('.typing .line')!.getAttribute('marker-end');
    assert.match(marker(first.svg!)!, /triangle-hollow/); assert.notEqual(marker(first.svg!), marker(second.svg!));
    first.dispose(); second.dispose();
  } finally { Object.assign(globalThis, { document: previous }); dom.window.close(); }
});
test('Read labels reaches actual size on a tall diagram, supports bounded pan and keeps Home as overview', async () => {
  const dom = new JSDOM('<!doctype html><main></main>');
  const previous = globalThis.document; Object.assign(globalThis, { document: dom.window.document });
  // Deliberately taller than a full model overview: a four-times-fit ceiling
  // would still leave the donor's 13px labels smaller than 3 screen pixels.
  const view: SDKView = { view: 'Tall architecture', kind: 'tree', nodes: Array.from({ length: 26 }, (_, index) => ({
    id: `unit-${index}`, name: `Unit ${index}`, kind: 'part', origin,
    geometry: { x: 0, y: index * 400, width: 200, height: 70, hasSize: true },
  })), edges: [] };
  try {
    const host = dom.window.document.querySelector('main')!;
    const diagram = await mountDiagram(host, view);
    const stage = host.querySelector('.diagram-stage')!;
    const content = diagram.svg!.lastElementChild!;
    function camera() {
      const match = content.getAttribute('transform')!.match(/translate\(([^ ]+) ([^)]+)\) scale\(([^)]+)\)/)!;
      return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
    }
    const overview = camera(); assert.ok(overview.scale < .1);
    [...host.querySelectorAll('button')].find(button => button.textContent === 'Read labels')!.click();
    const readable = camera(); assert.ok(readable.scale >= 1); assert.ok(readable.scale > overview.scale * 4);
    assert.ok(readable.x > 0, 'the narrower axis remains centered');
    stage.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaX: 5000, deltaY: 200, bubbles: true, cancelable: true }));
    const panned = camera(); assert.equal(panned.x, readable.x, 'panning cannot expose blank horizontal gutters');
    assert.ok(panned.y < readable.y, 'the tall axis remains navigable at reading size');
    stage.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: -1000000, bubbles: true, cancelable: true }));
    assert.equal(camera().y, 0, 'pan stops at the actual top of the diagram');
    stage.dispatchEvent(new dom.window.WheelEvent('wheel', { ctrlKey: true, deltaY: -100, clientX: 400, clientY: 250, bubbles: true, cancelable: true }));
    assert.ok(camera().scale > readable.scale, 'wheel zoom can continue beyond reading size');
    stage.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    assert.deepEqual(camera(), overview);
    stage.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaX: 1000, deltaY: 1000, bubbles: true, cancelable: true }));
    assert.deepEqual(camera(), overview, 'the fitted content stays centered on both axes');
    diagram.dispose();
  } finally { Object.assign(globalThis, { document: previous }); dom.window.close(); }
});

test('table views report rows, omit graph zoom controls and retain source selection', async () => {
  const dom=new JSDOM('<!doctype html><main></main>'), previous=globalThis.document;
  Object.assign(globalThis,{document:dom.window.document});
  try {
    const host=dom.window.document.querySelector('main')!, selected:unknown[]=[];
    const diagram=await mountDiagram(host,{kind:'table',columns:['Element','Kind'],rows:[{cells:['pipeline','part'],origin},{cells:['lexer','part'],origin}]},{onSelect:span=>selected.push(span)});
    assert.match(host.querySelector('[role="status"]')!.textContent!,/2 table rows/);
    assert.ok([...host.querySelectorAll('button')].every(button=>button.hidden));
    assert.equal(host.querySelectorAll('tr').length,3);
    host.querySelectorAll('tr')[1].dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    assert.equal(selected[0],origin);assert.equal(diagram.captureViewport(),null);diagram.dispose();
  } finally { Object.assign(globalThis,{document:previous});dom.window.close(); }
});

test('the initial asynchronous resize preserves a restored navigation viewport', async () => {
  const dom=new JSDOM('<!doctype html><main></main>'), previous=globalThis.document, previousObserver=globalThis.ResizeObserver;
  let resize: (()=>void)|undefined;
  Object.assign(globalThis,{document:dom.window.document,ResizeObserver:class { constructor(callback:()=>void){resize=callback} observe(){} disconnect(){} }});
  try {
    const host=dom.window.document.querySelector('main')!, first=await mountDiagram(host,model());
    first.zoom(2);const saved=first.captureViewport()!;first.dispose();
    const next=await mountDiagram(host,model()), group=next.svg!.lastElementChild!;
    next.restoreViewport(saved);const restored=group.getAttribute('transform');
    resize!();assert.equal(group.getAttribute('transform'),restored,'queued initial fit must not overwrite Back camera');
    next.fit();const fitted=group.getAttribute('transform');resize!();assert.equal(group.getAttribute('transform'),fitted,'an explicit Fit still requests the overview');next.dispose();
  } finally { Object.assign(globalThis,{document:previous,ResizeObserver:previousObserver});dom.window.close(); }
});
