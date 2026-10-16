import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { adaptDiagram, type SDKView } from './adapter';
import { mountDiagram, focusArchitecture } from './host';

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
    await diagram.restorePresentation({mode:'diagram',scroll:0,page:0});
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


test('empty table views retain column headers and table controls', async () => {
  const dom=new JSDOM('<!doctype html><main></main>'), previous=globalThis.document;
  Object.assign(globalThis,{document:dom.window.document});
  try {
    const host=dom.window.document.querySelector('main')!;
    const diagram=await mountDiagram(host,{kind:'table',columns:['Element','Kind'],rows:[]});
    assert.equal(host.querySelector('[role="status"]')!.textContent,'0 table rows');
    assert.deepEqual([...host.querySelectorAll('th')].map(cell=>cell.textContent),['Element','Kind']);
    assert.ok([...host.querySelectorAll('button')].every(button=>button.hidden));
    assert.equal(host.querySelector('.diagram-stage'),null);assert.equal(diagram.svg,null);diagram.dispose();
  } finally { Object.assign(globalThis,{document:previous});dom.window.close(); }
});

// Source oracle: OpenSysML self-model pipeline.sysml:728–775. Connections and
// flows are distinct declarations even when their endpoint owners coincide.
function pipeline(): SDKView {
  const names=['AnalysisPipeline','sources','lexer','parser','tree','symbols','resolver','semantics','passes','lowering','runtime','workspace','stdlib','solver','engines','textIn','diagnosticsOut','questionsIn'];
  const nodes=names.map((name,index)=>({id:'n'+index,name,kind:index>14?'port':index?'part':'part def',type:index===2?'Lexer':undefined,parent:index?'n0':undefined,origin:{...origin,file:'pipeline.sysml',startLine:728+index,endLine:728+index},ports:[] as {id:string;name:string}[]}));
  const connections=[['sources.textOut','lexer.textIn','textChannel'],['lexer.tokensOut','parser.tokensIn','tokenChannel'],['parser.treeOut','tree.treeIn','treeChannel'],['tree.treeOut','symbols.treeIn','symbolChannel'],['symbols.indexOut','resolver.indexIn','indexChannel'],['stdlib.indexOut','resolver.indexIn','stdlibChannel'],['resolver.bindingsOut','semantics.bindingsIn','bindingChannel'],['semantics.typesOut','passes.typesIn','typeChannel'],['semantics.typesOut','lowering.typesIn','loweringChannel'],['lowering.irOut','runtime.irIn','irChannel'],['passes.diagnostics','workspace.diagnostics','diagnosticChannel'],['questionsIn','engines.questionsIn','questionChannel'],['engines.runtimeOut','runtime.requests','runChannel'],['engines.solverOut','solver.requests','solveChannel'],['runtime.traceOut','engines.tracesIn','traceChannel']];
  const flows=[['sources.text','lexer.text','SourceText'],['lexer.tokens','parser.tokens','TokenStream'],['parser.tree','tree.tree','SyntaxTree'],['tree.tree','symbols.tree','SyntaxTree'],['symbols.index','resolver.index','SymbolIndex'],['stdlib.index','resolver.index','SymbolIndex'],['resolver.bindings','semantics.bindings','ResolutionTable'],['semantics.types','passes.typed','TypeTable'],['semantics.types','lowering.types','TypeTable'],['lowering.actions','runtime.actionGraph','ActionGraph'],['lowering.states','runtime.stateGraph','StateGraph'],['runtime.trace','engines.trace','ExecutionTrace']];
  const endpoint=(text:string)=>{const [name,port]=text.split('.'),node=nodes.find(node=>node.name===name)!;if(port&&!node.ports.some(item=>item.id===port))node.ports.push({id:port,name:port});return {id:node.id,port}};
  const edges=[...connections,...flows].map(([from,to,label],index)=>{const a=endpoint(from),b=endpoint(to);return {from:a.id,to:b.id,fromPort:a.port,toPort:b.port,label,kind:index<15?'connection':'flow',origin:{...origin,file:'pipeline.sysml',startLine:index<15?748+index:764+index-15,endLine:index<15?748+index:764+index-15}}});
  return {view:'AnalysisPipeline',kind:'interconnection',nodes,edges};
}

test('lexer focus keeps its actual neighbors, parallel connections and flows, ports and source objects',()=>{
 const view=pipeline(),before=JSON.stringify(view),focus=focusArchitecture(view,'n2');
 assert.deepEqual(focus.view.nodes.map(node=>node.name),['AnalysisPipeline','sources','lexer','parser']);
 assert.deepEqual(focus.view.edges.map(edge=>edge.label),['textChannel','tokenChannel','SourceText','TokenStream']);
 assert.deepEqual([...focus.contextIDs].sort(),['n1','n3']);
 for(const node of focus.view.nodes)assert.equal(node,view.nodes!.find(original=>original.id===node.id));
 for(const edge of focus.view.edges){assert.equal(edge,view.edges!.find(original=>original===edge));assert.equal(edge.origin!.file,'pipeline.sysml');assert.ok(focus.view.nodes.some(node=>node.id===edge.from));assert.ok(focus.view.nodes.some(node=>node.id===edge.to));}
 assert.equal(focus.view.edges[0].fromPort,'textOut');assert.equal(focus.view.edges[0].toPort,'textIn');assert.equal(JSON.stringify(view),before);
 assert.equal(focus.omittedNodes,14);assert.equal(focus.omittedEdges,23);
});

test('engines focus preserves the boundary port endpoint and all five declared relationships',()=>{
 const focus=focusArchitecture(pipeline(),'n14');
 assert.deepEqual(focus.view.nodes.map(node=>node.name),['AnalysisPipeline','runtime','solver','engines','questionsIn']);
 assert.deepEqual(focus.view.edges.map(edge=>edge.label),['questionChannel','runChannel','solveChannel','traceChannel','ExecutionTrace']);
 assert.equal(focus.view.edges[0].from,'n17','boundary port is not retargeted to its owner');assert.equal(focus.view.nodes.find(node=>node.id==='n17')!.parent,'n0');assert.equal(focus.view.edges[0].toPort,'questionsIn');
});

test('focus budgets retain ancestor chains, bound edge count and never invent internals',()=>{
 const view:SDKView={view:'Deep',kind:'tree',nodes:[{id:'root',kind:'package'},{id:'left',kind:'part',parent:'root'},{id:'chosen',kind:'part',type:'UnexpandedDefinition',parent:'left'},{id:'inside',kind:'part',parent:'chosen'},{id:'right',kind:'part',parent:'root'},{id:'neighbor',kind:'part',parent:'right'},...Array.from({length:20},(_,i)=>({id:'extra'+i,kind:'part',parent:'root'}))],edges:Array.from({length:30},(_,i)=>({kind:i%2?'flow':'connection',from:'inside',to:'neighbor',label:'Parallel '+i,origin}))};
 const focus=focusArchitecture(view,'chosen');assert.deepEqual(focus.view.nodes.map(node=>node.id),['root','left','chosen','inside','right','neighbor']);assert.equal(focus.view.edges.length,24);assert.equal(focus.omittedEdges,6);assert.equal(focus.omittedNodes,20);assert.ok(focus.contextIDs.has('right'));assert.ok(focus.contextIDs.has('neighbor'));
 assert.equal(focus.view.nodes.find(node=>node.id==='neighbor')!.parent,'right');assert.ok(focus.view.nodes.every(node=>node.parent===undefined||focus.view.nodes.some(parent=>parent.id===node.parent)));
 const tooDeep={...view,nodes:Array.from({length:14},(_,i)=>({id:'d'+i,kind:'part',parent:i?'d'+(i-1):undefined})),edges:[]};assert.equal(focusArchitecture(tooDeep,'d13').available,false);
});

const waitFor=async(check:()=>boolean)=>{for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10))}assert.ok(check(),'asynchronous presentation completed')};
const press=(host:Element,label:string)=>{const button=[...host.querySelectorAll('button')].find(item=>item.textContent===label);assert.ok(button,'button '+label);button.click()};
test('architecture overview shows direct components and readable exact connection rows, opens focus and returns with selection and scroll',async()=>{
 const dom=new JSDOM('<!doctype html><main></main>'),previous=globalThis.document;Object.assign(globalThis,{document:dom.window.document});
 try{const host=dom.window.document.querySelector('main')!,view=pipeline(),selected:unknown[][]=[],diagram=await mountDiagram(host,view,{onSelect:(...args)=>selected.push(args)});
 assert.equal(diagram.svg,null);assert.equal(host.querySelectorAll('.architecture-card').length,14);assert.equal(host.querySelector('[data-node-id="n17"]'),null);assert.match(host.textContent!,/Boundary ports: textIn, diagnosticsOut, questionsIn/);
 (host.querySelector('[data-node-id="n2"]') as HTMLButtonElement).click();assert.equal(host.querySelectorAll('.architecture-connection').length,4);assert.ok(host.querySelector('.architecture-selection>.architecture-context'));assert.match(host.querySelector('[data-node-id="n1"]')!.getAttribute('aria-label')!,/Flow to lexer/);assert.match(host.querySelector('[data-node-id="n3"]')!.getAttribute('aria-label')!,/Flow from lexer/);assert.equal(host.querySelectorAll('.architecture-card.is-neighbor').length,2);assert.match(host.querySelector('.architecture-context')!.textContent!,/part · Lexer/);assert.match(host.querySelector('.architecture-connection')!.textContent!,/sources · textOut — lexer · textIn/);
 (host.querySelector('.architecture-connection') as HTMLButtonElement).click();assert.equal(selected[0][0],view.edges![0].origin);assert.equal((selected[0][1] as {element:unknown}).element,view.edges![0]);
 const stage=host.querySelector('.architecture-overview')! as HTMLElement;stage.scrollTop=123;(host.querySelector('.architecture-components') as HTMLElement).scrollTop=45;(host.querySelector('.architecture-context') as HTMLElement).scrollTop=12;press(host,'Explore connections');await waitFor(()=>!!diagram.svg);
 assert.equal(diagram.capturePresentation().mode,'focus');assert.equal(diagram.svg!.querySelectorAll('g.opensysml-node').length,4);assert.equal(diagram.svg!.querySelectorAll('g.opensysml-edge').length,4);assert.match(host.textContent!,/Context: sources, parser/);assert.equal(diagram.summary.visibleNodes,4);assert.equal(diagram.summary.totalNodes,18);assert.match(host.textContent!,/lexer connections/);assert.match(host.textContent!,/Select a line to show its name/);assert.equal(host.querySelectorAll('.focused-connections .architecture-connection').length,4);assert.ok(host.querySelector('svg.focus-connections'));assert.ok(host.querySelector('.architecture-focus-connections'));const focusedRow=host.querySelector('.focused-connections .architecture-connection') as HTMLButtonElement;focusedRow.click();assert.equal(selected.at(-1)![0],view.edges![0].origin);assert.ok(diagram.svg!.querySelector('g.opensysml-edge.selected'));
 press(host,'Back to overview');assert.equal(diagram.svg,null);assert.equal((host.querySelector('.architecture-overview') as HTMLElement).scrollTop,123);assert.equal(host.querySelector('[aria-pressed=true]')!.getAttribute('data-node-id'),'n2');assert.equal((host.querySelector('.architecture-components') as HTMLElement).scrollTop,45);assert.equal((host.querySelector('.architecture-context') as HTMLElement).scrollTop,12);
 press(host,'Diagram');await waitFor(()=>!!diagram.svg);assert.equal(diagram.svg!.querySelectorAll('g.opensysml-node').length,18);assert.equal(diagram.svg!.querySelectorAll('g.opensysml-edge').length,27);diagram.dispose();assert.equal(host.children.length,0);
 }finally{Object.assign(globalThis,{document:previous});dom.window.close()}
});

test('presentation restoration resolves a unique source witness after SDK IDs reorder and rejects an ambiguous witness',async()=>{
 const dom=new JSDOM('<!doctype html><main></main><aside></aside>'),previous=globalThis.document;Object.assign(globalThis,{document:dom.window.document});
 try{const host=dom.window.document.querySelector('main')!,original=pipeline(),first=await mountDiagram(host,original);(host.querySelector('[data-node-id="n2"]') as HTMLButtonElement).click();let saved=first.capturePresentation();saved={...saved,mode:'focus',scroll:77};first.dispose();
 const remap=(id:string)=>'new-'+id,changed={...original,nodes:original.nodes!.map(node=>({...node,id:remap(node.id),parent:node.parent?remap(node.parent):undefined})),edges:original.edges!.map(edge=>({...edge,from:remap(edge.from),to:remap(edge.to)}))};
 const next=await mountDiagram(host,changed);await next.restorePresentation(saved);assert.equal(next.capturePresentation().selectedID,'new-n2');assert.equal(next.capturePresentation().mode,'focus');assert.equal(next.svg!.querySelectorAll('g.opensysml-node').length,4);await next.restorePresentation({...next.capturePresentation(),mode:'overview'});assert.equal((host.querySelector('.architecture-overview') as HTMLElement).scrollTop,77);next.dispose();
 const ambiguous={...original,nodes:[...original.nodes!,{...original.nodes![2],id:'duplicate'}]};const last=await mountDiagram(host,ambiguous);await last.restorePresentation(saved);assert.equal(last.capturePresentation().mode,'overview');assert.equal(last.capturePresentation().selectedID,undefined);last.dispose();
 }finally{Object.assign(globalThis,{document:previous});dom.window.close()}
});

test('large overview pages components and all connection rows without dropping parallel declarations',async()=>{
 const dom=new JSDOM('<!doctype html><main></main>'),previous=globalThis.document;Object.assign(globalThis,{document:dom.window.document});
 try{const view:SDKView={view:'Large',kind:'package',nodes:[{id:'root',kind:'package',origin},...Array.from({length:61},(_,i)=>({id:'c'+i,name:'Component '+i,kind:'part',parent:'root',origin}))],edges:Array.from({length:63},(_,i)=>({from:'c0',to:'c1',label:'Link '+i,kind:i%2?'flow':'connection',origin}))};const host=dom.window.document.querySelector('main')!,diagram=await mountDiagram(host,view);assert.equal(host.querySelectorAll('.architecture-card').length,50);assert.equal(diagram.summary.visibleNodes,51);assert.equal(diagram.summary.omittedNodes,11);assert.match(diagram.summary.notices.join(' '),/page 1 of 2/);press(host,'Next components');assert.equal(host.querySelectorAll('.architecture-card').length,11);assert.ok(host.querySelector('[data-node-id="c60"]'));press(host,'All relationships');assert.equal(host.querySelectorAll('.architecture-connection').length,50);press(host,'Next relationships');assert.equal(host.querySelectorAll('.architecture-connection').length,13);assert.match(host.textContent!,/Link 62/);assert.match(host.textContent!,/Relationships 51–63 of 63/);const saved=diagram.capturePresentation();assert.equal(saved.allConnections,true);assert.equal(saved.connectionPage,1);diagram.dispose();const restored=await mountDiagram(host,view);await restored.restorePresentation(saved);assert.equal(host.querySelectorAll('.architecture-connection').length,13);assert.match(host.textContent!,/Link 62/);assert.match(host.textContent!,/Relationships 51–63 of 63/);await restored.restorePresentation({...saved,connectionPage:999});assert.equal(restored.capturePresentation().connectionPage,1);assert.equal(host.querySelectorAll('.architecture-connection').length,13);await restored.restorePresentation({...saved,connectionPage:-1});assert.equal(restored.capturePresentation().connectionPage,0);assert.equal(host.querySelectorAll('.architecture-connection').length,50);(host.querySelector('[data-node-id="c60"]') as HTMLButtonElement).click();assert.ok([...host.querySelectorAll('button')].some(button=>button.textContent==='Explore relationships'));restored.dispose();
 }finally{Object.assign(globalThis,{document:previous});dom.window.close()}
});


test('activating a component card keeps keyboard focus on its replacement without moving overview scroll',async()=>{
 const dom=new JSDOM('<!doctype html><main></main>'),previous=globalThis.document;Object.assign(globalThis,{document:dom.window.document});
 try{const host=dom.window.document.querySelector('main')!,diagram=await mountDiagram(host,pipeline()),stage=host.querySelector('.architecture-overview') as HTMLElement,card=host.querySelector('[data-node-id="n2"]') as HTMLButtonElement;
 stage.scrollTop=91;card.focus({preventScroll:true});assert.equal(dom.window.document.activeElement,card);card.click();
 const replacement=host.querySelector('[data-node-id="n2"]') as HTMLButtonElement;assert.notEqual(replacement,card);assert.equal(dom.window.document.activeElement,replacement);assert.equal(replacement.getAttribute('aria-pressed'),'true');assert.equal((host.querySelector('.architecture-overview') as HTMLElement).scrollTop,91);
 diagram.dispose();
 }finally{Object.assign(globalThis,{document:previous});dom.window.close()}
});


test('generic connection endpoint order never becomes a directional flow annotation',async()=>{
 const dom=new JSDOM('<!doctype html><main></main>'),previous=globalThis.document;Object.assign(globalThis,{document:dom.window.document});
 try{const host=dom.window.document.querySelector('main')!,original=pipeline(),connections={...original,edges:original.edges!.filter(edge=>edge.kind==='connection')};
 const annotations: string[][]=[];
 for(const reversed of [false,true]){const view={...connections,edges:connections.edges.map(edge=>reversed?{...edge,from:edge.to,to:edge.from,fromPort:edge.toPort,toPort:edge.fromPort}:edge)},diagram=await mountDiagram(host,view);(host.querySelector('[data-node-id="n2"]') as HTMLButtonElement).click();const labels=[...host.querySelectorAll('.architecture-card.is-neighbor')].map(card=>card.getAttribute('aria-label')!);annotations.push(labels);assert.equal(labels.length,2);assert.ok(labels.every(label=>label.includes('Connected to lexer')));assert.ok(labels.every(label=>!/(sends|receives|flow to|flow from)/i.test(label)));assert.equal(host.querySelectorAll('.architecture-connection').length,2,'connection declarations stay separate in the exact rows');assert.ok([...host.querySelectorAll('.architecture-connection')].every(row=>row.textContent!.includes(' — ')&&!row.textContent!.includes(' → ')),'connection serialization order does not imply direction in readable rows');diagram.dispose()}
 assert.deepEqual(annotations[0],annotations[1],'reversing serialization endpoints cannot change connection-only semantic annotations');
 }finally{Object.assign(globalThis,{document:previous});dom.window.close()}
});


test('connection list highlights the exact edge when an invalid earlier port edge is not drawn',async()=>{
 const dom=new JSDOM('<!doctype html><main></main>'), previous=globalThis.document;Object.assign(globalThis,{document:dom.window.document});
 try {const view=pipeline();view.edges=[{...view.edges![0],fromPort:'unavailable'},...view.edges!.slice(1)];const host=dom.window.document.querySelector('main')!,selected:unknown[]=[];const diagram=await mountDiagram(host,view,{onSelect:(_origin,context)=>selected.push(context.element)});
 host.querySelector<HTMLButtonElement>('[aria-label="Select lexer"]')!.click();press(host,'Explore connections');await waitFor(()=>!!diagram.svg);
 const row=[...host.querySelectorAll<HTMLButtonElement>('.architecture-focus-connections button')].find(button=>button.textContent?.includes('tokenChannel'))!;row.click();
 assert.equal(diagram.svg!.querySelector('g.opensysml-edge.selected .edge-label')?.textContent,'tokenChannel');assert.equal(selected[0],view.edges![1]);diagram.dispose();
 }finally{Object.assign(globalThis,{document:previous});dom.window.close()}
});


test('superseding a pending focus restoration reports false and retains the newer diagram presentation',async()=>{
 const dom=new JSDOM('<!doctype html><main></main>'), previous=globalThis.document;Object.assign(globalThis,{document:dom.window.document});
 try{const host=dom.window.document.querySelector('main')!,notifications:string[][]=[],diagram=await mountDiagram(host,pipeline(),{onPresentationChange:summary=>notifications.push(summary.notices)});host.querySelector<HTMLButtonElement>('[aria-label="Select lexer"]')!.click();const state=diagram.capturePresentation();
 const old=diagram.restorePresentation({...state,mode:'focus'}),next=diagram.restorePresentation({...state,mode:'diagram'});assert.equal(await old,false);assert.equal(await next,true);assert.equal(diagram.capturePresentation().mode,'diagram');assert.ok(diagram.svg);assert.ok(notifications.at(-1)!.some(notice=>notice==='Original SDK diagram.'));diagram.dispose();
 }finally{Object.assign(globalThis,{document:previous});dom.window.close()}
});
