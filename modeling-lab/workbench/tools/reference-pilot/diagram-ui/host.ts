// New Lab host for the unchanged OpenSysML canvas/layout/zoom modules.
import { adaptDiagram, type SDKView, type SourceSpan, type DiagramSummary, type SDKNode } from './adapter';
import { autoLayout } from './vendor/webview/autolayout';
import { loadAvoid } from './vendor/webview/avoid';
import { drawCanvas } from './vendor/webview/canvas';
import { layoutCanvas, type Box } from './vendor/webview/layout';
import { ZOOM_STEP, type View } from './vendor/landing/zoom';

export interface SelectionContext { kind: 'node' | 'edge' | 'port' | 'note' | 'row'; id?: string; index?: number; ownerId?: string; originOf?: 'owner'; element: unknown }
export interface MountOptions {
  audience?: string; depth?: number; avoidWasmUrl?: string;
  onSelect?: (origin: SourceSpan | undefined, context: SelectionContext) => void;
  onPresentationChange?: (summary: DiagramSummary) => void;
}
export interface PresentationState { mode: 'overview' | 'focus' | 'diagram'; selectedID?: string; selectedWitness?: { origin?: SourceSpan; name?: string; kind: string }; scroll: number; page: number; allConnections?: boolean; connectionPage?: number; componentsScroll?: number; contextScroll?: number }
export interface DiagramController {
  fit(): void; zoom(factor: number): void; dispose(): void;
  captureViewport(): View | null; restoreViewport(view: View): void;
  capturePresentation(): PresentationState; restorePresentation(state: PresentationState): Promise<boolean>;
  readonly svg: SVGSVGElement | null; summary: DiagramSummary;
}
let serial = 0;

const CSS = `
.lab-donor-diagram{color:#17212c;background:white;font:14px system-ui,sans-serif;min-width:0}
.lab-donor-diagram .diagram-tools{display:flex;align-items:center;gap:6px;padding:8px;border-bottom:1px solid #d8dfe5;flex-wrap:wrap}
.lab-donor-diagram button{font:inherit;color:inherit;background:#fff;border:1px solid #bdc8d2;border-radius:4px;padding:5px 10px;cursor:pointer}
.lab-donor-diagram button:focus-visible{outline:3px solid #2671b8;outline-offset:2px}
.lab-donor-diagram .diagram-status{margin-left:auto;font-size:12px;color:#526171}
.lab-donor-diagram .diagram-stage{position:relative;width:100%;height:clamp(360px,65vh,820px);min-height:360px;overflow:hidden;touch-action:none;outline-offset:-3px;background:#fbfcfd;cursor:grab}
.lab-donor-diagram .diagram-stage:active{cursor:grabbing}
.lab-donor-diagram svg.opensysml-canvas{display:block;width:100%;height:100%;font-family:Arial,Helvetica,sans-serif;user-select:none}
.lab-donor-diagram .shape,.lab-donor-diagram .port-shape{fill:var(--node-fill,white);stroke:var(--node-border,#253648);stroke-width:1px}
.lab-donor-diagram .shape.container{fill:var(--node-fill,#f4f7fa)}
.lab-donor-diagram .shape.filled,.lab-donor-diagram .port-shape.filled{fill:#253648}
.lab-donor-diagram .shape.region{stroke-dasharray:4 4}
.lab-donor-diagram .label,.lab-donor-diagram .port-label,.lab-donor-diagram .collapsed{fill:#17212c}
.lab-donor-diagram .label .head{font-weight:600}
.lab-donor-diagram .label .keyword{font-size:.82em;font-style:italic}
.lab-donor-diagram .label .detail,.lab-donor-diagram .port-label{font-size:.9em}
.lab-donor-diagram .line{fill:none;stroke:#253648;stroke-width:1.25px}
.lab-donor-diagram .lifeline{stroke:#253648;stroke-dasharray:6 4;opacity:.6}
.lab-donor-diagram .flow .line,.lab-donor-diagram .typing .line{stroke-dasharray:5 4}
.lab-donor-diagram .arrow-fill{fill:#253648}
.lab-donor-diagram .arrow-line{fill:none;stroke:#253648;stroke-width:1.25px}
.lab-donor-diagram .arrow-hollow{fill:white;stroke:#253648;stroke-width:1px}
.lab-donor-diagram .edge-label{fill:#17212c;font-size:.85em;paint-order:stroke;stroke:white;stroke-width:3px;stroke-linejoin:round}
.lab-donor-diagram .opensysml-node,.lab-donor-diagram .opensysml-edge,.lab-donor-diagram .port{cursor:pointer}
.lab-donor-diagram .selected>.shape,.lab-donor-diagram .selected>.port-shape,.lab-donor-diagram .selected>.line,.lab-donor-diagram .selected>g.shape>circle{stroke:#176bbb;stroke-width:3px}
.lab-donor-diagram .opensysml-node:focus-visible>.shape,.lab-donor-diagram .opensysml-edge:focus-visible>.line,.lab-donor-diagram .port:focus-visible>.port-shape{stroke:#176bbb;stroke-width:3px;outline:none}
.lab-donor-diagram .diagram-notes{padding:8px 12px;border-top:1px solid #d8dfe5;max-height:180px;overflow:auto}
.lab-donor-diagram .diagram-notes p{margin:5px 0;white-space:pre-wrap}
.lab-donor-diagram .diagram-notes summary{cursor:pointer;font-weight:600}
.lab-donor-diagram .diagram-table-wrap{overflow:auto;max-height:65vh}
.lab-donor-diagram table{border-collapse:collapse;width:100%}
.lab-donor-diagram th,.lab-donor-diagram td{text-align:left;padding:8px;border-bottom:1px solid #d8dfe5}
.lab-donor-diagram tr[tabindex]{cursor:pointer}
`;

/** Mount a read-only engineering diagram. All source callbacks use original SDK spans. */
export async function mountDiagram(container: HTMLElement, view: SDKView, options: MountOptions = {}): Promise<DiagramController> {
  if (architectureNeeded(view)) return mountArchitecture(container, view, options);
  return mountOriginalDiagram(container, view, options);
}

async function mountOriginalDiagram(container: HTMLElement, view: SDKView, options: MountOptions = {}): Promise<DiagramController> {
  const adapted = adaptDiagram(view, options.depth, options.audience);
  const shell = document.createElement('section'); shell.className = 'lab-donor-diagram';
  shell.setAttribute('aria-label', `${view.view || 'Model'} diagram`);
  const style = document.createElement('style'); style.textContent = CSS; shell.append(style);
  const tools = document.createElement('div'); tools.className = 'diagram-tools';
  const status = document.createElement('span'); status.className = 'diagram-status'; status.setAttribute('role', 'status');
  const summary = adapted.summary;
  status.textContent = `${summary.visibleNodes} of ${summary.totalNodes} elements · ${summary.visibleEdges} of ${summary.totalEdges} relationships${summary.depth === null ? '' : ` · depth ${summary.depth}`}`;
  tools.append(status); shell.append(tools);
  const stage = document.createElement('div'); stage.className = 'diagram-stage'; stage.tabIndex = 0;
  stage.setAttribute('aria-label', 'Model diagram. Drag background to pan. Use zoom buttons or control and wheel to zoom. Home fits the diagram.');
  shell.append(stage);
  let svg: SVGSVGElement | null = null, disposed = false, preserveViewportOnResize = false;
  let fit: View = { x: 0, y: 0, scale: 1 }, current: View = fit;
  let bounds: Box = { x: 0, y: 0, width: 800, height: 500 };
  let content: SVGGElement | undefined = undefined;
  const listeners: (() => void)[] = [];
  function listen(target: EventTarget, name: string, fn: EventListener, opts?: AddEventListenerOptions) {
    target.addEventListener(name, fn, opts); listeners.push(() => target.removeEventListener(name, fn, opts));
  }
  function apply() { content?.setAttribute('transform', `translate(${current.x} ${current.y}) scale(${current.scale})`); }
  let layout: ReturnType<typeof layoutCanvas> | undefined = undefined;
  // The donor hero's four-times-fit ceiling is too small for tall model views.
  // Keep its focal-point zoom math, but bound pan against the actual diagram and
  // allow actual-size labels even when the overview is very small.
  function boundedView(view: View): View {
    if (!layout) return view;
    const scale = Math.max(fit.scale, Math.min(Math.max(4, fit.scale * 16), view.scale));
    function axis(offset: number, origin: number, size: number, stageSize: number): number {
      if (size * scale <= stageSize) return (stageSize - size * scale) / 2 - origin * scale;
      return Math.min(-origin * scale, Math.max(stageSize - (origin + size) * scale, offset));
    }
    return { scale, x: axis(view.x, layout.origin.x, layout.width, bounds.width), y: axis(view.y, layout.origin.y, layout.height, bounds.height) };
  }
  function zoomTo(scale: number, focal = { x: bounds.width / 2, y: bounds.height / 2 }) {
    const boundedScale = Math.max(fit.scale, Math.min(Math.max(4, fit.scale * 16), scale));
    const factor = boundedScale / current.scale;
    current = boundedView({ scale: boundedScale, x: focal.x - (focal.x - current.x) * factor, y: focal.y - (focal.y - current.y) * factor }); apply();
  }
  function pan(dx: number, dy: number) { current = boundedView({ ...current, x: current.x + dx, y: current.y + dy }); apply(); }
  function fitDiagram() {
    preserveViewportOnResize = false;
    if (!svg || !layout || disposed) return;
    const width = stage.clientWidth || 800, height = stage.clientHeight || 500;
    bounds = { x: 0, y: 0, width, height };
    const scale = Math.min((width - 24) / Math.max(layout.width, 1), (height - 24) / Math.max(layout.height, 1));
    fit = { x: (width - layout.width * scale) / 2 - layout.origin.x * scale, y: (height - layout.height * scale) / 2 - layout.origin.y * scale, scale };
    current = { ...fit }; svg.setAttribute('viewBox', `0 0 ${width} ${height}`); apply();
  }
  function zoom(factor: number) {
    zoomTo(current.scale * factor);
  }
  const controller: DiagramController = {
    fit: fitDiagram, zoom, summary,
    capturePresentation() { return {mode:'diagram',scroll:0,page:0}; },
    async restorePresentation() { return true; },
    captureViewport() { return svg ? { ...current } : null; },
    restoreViewport(view) { if (!svg || !Number.isFinite(view.x) || !Number.isFinite(view.y) || !Number.isFinite(view.scale) || view.scale <= 0) return; current = boundedView(view); preserveViewportOnResize = true; apply(); },
    get svg() { return svg; },
    dispose() { if (disposed) return; disposed = true; listeners.forEach(remove => remove()); observer?.disconnect(); shell.remove(); },
  };
  let observer: ResizeObserver | undefined;
  function button(label: string, action: () => void) {
    const item = document.createElement('button'); item.type = 'button'; item.textContent = label; listen(item, 'click', action); tools.insertBefore(item, status);
  }
  button('Fit', fitDiagram); button('Read labels', () => zoomTo(Math.max(1, fit.scale))); button('Zoom in', () => zoom(ZOOM_STEP)); button('Zoom out', () => zoom(1 / ZOOM_STEP));
  function select(element: Element, origin: SourceSpan | undefined, context: SelectionContext) {
    shell.querySelectorAll('.selected').forEach(item => item.classList.remove('selected'));
    element.classList.add('selected'); options.onSelect?.(origin, context);
  }
  function accessible(element: Element, label: string, origin: SourceSpan | undefined, context: SelectionContext) {
    element.setAttribute('tabindex', '0'); element.setAttribute('role', 'button'); element.setAttribute('aria-label', label);
    listen(element, 'click', ((event: Event) => { event.stopPropagation(); select(element, origin, context); }) as EventListener);
    listen(element, 'keydown', ((event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select(element, origin, context); } }) as EventListener);
  }
  if (summary.omittedNodes || summary.omittedEdges || summary.missingOrigins || (view.notices?.length ?? 0) || (view.notes?.length ?? 0)) {
    const notes = document.createElement('details'); notes.className = 'diagram-notes';
    const label = document.createElement('summary'); label.textContent = `View notes and scope${summary.notes ? ` · ${summary.notes} authored notes` : ''}`; notes.append(label);
    function paragraph(text: string) { const item = document.createElement('p'); item.textContent = text; notes.append(item); return item; }
    if (summary.omittedNodes || summary.omittedEdges) { notes.open = true; paragraph(`${summary.omittedNodes} elements and ${summary.omittedEdges} relationships are omitted from this drawing because of depth, stated collapsed owners, or endpoint availability. This does not change the model or saved view membership.`); }
    if (summary.invalidEdges) paragraph(`${summary.invalidEdges} relationships have unavailable node or port endpoints and cannot be drawn.`);
    if (summary.missingOrigins) paragraph(`${summary.missingOrigins} displayed elements have no source location from the engine.`);
    for (const notice of view.notices ?? []) paragraph(notice);
    for (const [index, note] of (view.notes ?? []).entries()) {
      const item = paragraph(note.text);
      if (note.anchor) paragraph(`Note anchor: ${adapted.sourceNodes.get(note.anchor)?.name || note.anchor}${adapted.sourceNodes.has(note.anchor) ? '' : ' (outside this drawing)'}`);
      if (note.origin) { const source = document.createElement('button'); source.type = 'button'; source.textContent = 'Locate note in source'; item.append(' ', source); listen(source, 'click', () => options.onSelect?.(note.origin, { kind: 'note', index, element: note })); }
    }
    shell.append(notes);
  }
  // Replace only the host's contents. A later disposal never clears a newer mount.
  container.replaceChildren(shell);
  if (view.kind === 'table' || ((view.rows?.length ?? 0) && !summary.totalNodes)) {
    status.textContent = `${view.rows?.length ?? 0} table rows`; tools.querySelectorAll('button').forEach(button => { button.hidden = true; });
    stage.className = 'diagram-table-wrap'; stage.removeAttribute('tabindex'); stage.removeAttribute('aria-label');
    const table = document.createElement('table'), head = document.createElement('tr');
    for (const column of view.columns ?? []) { const cell = document.createElement('th'); cell.textContent = column; head.append(cell); }
    table.append(head);
    for (const [index, row] of (view.rows ?? []).entries()) {
      const tr = document.createElement('tr');
      for (const text of row.cells) { const cell = document.createElement('td'); cell.textContent = text; tr.append(cell); }
      accessible(tr, row.cells.join(', '), row.origin, { kind: 'row', index, element: row }); table.append(tr);
    }
    stage.append(table); return controller;
  }
  if (options.avoidWasmUrl) {
    try { await loadAvoid(options.avoidWasmUrl); } catch { status.textContent += ' · standard routing'; }
  }
  const layoutInput = ['requirement', 'definition', 'package'].includes(adapted.result.kind) ? {...adapted.result, kind: 'tree' as const} : adapted.result;
  if (!summary.totalNodes && !(view.rows?.length)) {
    const message=document.createElement('p');message.className='diagram-empty';message.textContent='The engine returned no drawable content for this view. Its source declaration is retained. Try a structure, interconnection or requirements view of a model subject.';stage.append(message);return controller;
  }
  const auto = await autoLayout(layoutInput);
  if (disposed || !shell.isConnected && container.firstChild !== shell) return controller;
  layout = layoutCanvas(adapted.result, {}, auto); svg = drawCanvas(layout);
  svg.querySelectorAll('.handles').forEach(item => item.remove());
  content = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  for (const item of [...svg.children]) if (item.tagName.toLowerCase() !== 'defs') content.append(item);
  svg.append(content);
  // Donor marker IDs are local to the page, not the SVG. Namespace every mount.
  const prefix = `lab-diagram-${++serial}-`;
  for (const item of svg.querySelectorAll('[id]')) { const old = item.id; item.id = prefix + old;
    for (const linked of svg.querySelectorAll('[marker-start],[marker-end]')) for (const attr of ['marker-start', 'marker-end']) if (linked.getAttribute(attr) === `url(#${old})`) linked.setAttribute(attr, `url(#${prefix}${old})`);
  }
  for (const item of svg.querySelectorAll<SVGGElement>('g.opensysml-node')) {
    const node = adapted.sourceNodes.get(item.dataset.opensysmlId!); if (!node) continue;
    item.classList.remove('movable'); accessible(item, [node.name || node.kind, node.type].filter(Boolean).join(' : '), node.origin, { kind: 'node', id: node.id, element: node });
    for (const portGroup of item.querySelectorAll<SVGGElement>('g.port')) {
      const port = node.ports?.find(value => value.id === portGroup.dataset.port); if (!port) continue;
      accessible(portGroup, `${port.name}${port.type ? ` : ${port.type}` : ''}${port.direction ? `, ${port.direction}` : ''}`, node.origin, { kind: 'port', id: port.id, ownerId: node.id, originOf: 'owner', element: port });
    }
  }
  for (const item of svg.querySelectorAll<SVGGElement>('g.opensysml-edge')) {
    const index = Number(item.dataset.edge), edge = adapted.sourceEdges[index]; if (!edge) continue;
    item.dataset.sourceEdgeIndex=String((view.edges??[]).indexOf(edge));
    const from = adapted.sourceNodes.get(edge.from), to = adapted.sourceNodes.get(edge.to);
    accessible(item, `${edge.label || edge.kind}: ${from?.name || edge.from} to ${to?.name || edge.to}`, edge.origin, { kind: 'edge', index, element: edge });
  }
  stage.append(svg); fitDiagram();
  let drag: { id: number; x: number; y: number } | undefined;
  listen(stage, 'pointerdown', ((event: PointerEvent) => {
    if (event.button !== 1 && (event.target as Element).closest('g.opensysml-node,g.opensysml-edge')) return;
    if (event.button !== 0 && event.button !== 1) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; stage.setPointerCapture?.(event.pointerId); event.preventDefault();
  }) as EventListener);
  listen(stage, 'pointermove', ((event: PointerEvent) => { if (!drag || drag.id !== event.pointerId) return;
    pan(event.clientX - drag.x, event.clientY - drag.y); drag.x = event.clientX; drag.y = event.clientY;
  }) as EventListener);
  for (const name of ['pointerup', 'pointercancel']) listen(stage, name, (() => { drag = undefined; }) as EventListener);
  listen(stage, 'wheel', ((event: WheelEvent) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) { const rect = stage.getBoundingClientRect(); zoomTo(current.scale * Math.exp(-event.deltaY * .003), { x: event.clientX - rect.left, y: event.clientY - rect.top }); }
    else pan(-event.deltaX, -event.deltaY);
  }) as EventListener, { passive: false });
  listen(stage, 'keydown', ((event: KeyboardEvent) => {
    if (event.key === 'Home') { event.preventDefault(); fitDiagram(); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(ZOOM_STEP); }
    else if (event.key === '-') { event.preventDefault(); zoom(1 / ZOOM_STEP); }
    else if (event.target === stage && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); pan(event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0, event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0);
    }
  }) as EventListener);
  if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(() => { const restored = preserveViewportOnResize ? { ...current } : null; fitDiagram(); if (restored) { current = boundedView(restored); apply(); } }); observer.observe(stage); }
  return controller;
}

const structuralKinds = new Set(['tree', 'interconnection', 'definition', 'package']);
function architectureParts(view: SDKView) {
  const nodes = view.nodes ?? [], ids = new Set(nodes.map(node => node.id));
  const roots = nodes.filter(node => !node.parent || !ids.has(node.parent));
  const direct = roots.length === 1 ? nodes.filter(node => node.parent === roots[0].id) : roots;
  return { root: roots.length === 1 ? roots[0] : undefined, components: direct.filter(node => !/^port(?:\s|$)/i.test(node.kind)), ports: direct.filter(node => /^port(?:\s|$)/i.test(node.kind)) };
}
function architectureNeeded(view: SDKView) { return structuralKinds.has(view.kind) && (architectureParts(view).components.length > 8 || (view.nodes?.length ?? 0) > 30); }
function descendants(view: SDKView, selectedID: string) {
  const result = new Set([selectedID]);
  for (let changed = true; changed;) { changed = false; for (const node of view.nodes ?? []) if (node.parent && result.has(node.parent) && !result.has(node.id)) { result.add(node.id); changed = true; } }
  return result;
}

/** Presentation subset only. Original objects, endpoint IDs and ownership remain authoritative. */
export function focusArchitecture(view: SDKView, selectedID: string, nodeBudget = 12, edgeBudget = 24) {
  adaptDiagram(view);
  const nodes = view.nodes ?? [], edges = view.edges ?? [], byID = new Map(nodes.map(node => [node.id, node]));
  const subtree = descendants(view, selectedID), retained = new Set<string>(), contextIDs = new Set<string>();
  function chain(id: string) { const result: string[] = []; let node = byID.get(id); while (node) { result.unshift(node.id); node = node.parent ? byID.get(node.parent) : undefined; } return result; }
  function include(id: string, context: boolean) { const required = chain(id).filter(value => !retained.has(value)); if (!required.length) return true; if (retained.size + required.length > nodeBudget) return false; for (const value of required) { retained.add(value); if (context && !subtree.has(value)) contextIDs.add(value); } return true; }
  const available = !!byID.has(selectedID) && include(selectedID, false);
  if (available) {
    for (const node of nodes) if (subtree.has(node.id)) include(node.id, false);
    for (const edge of edges) if (subtree.has(edge.from) || subtree.has(edge.to)) { include(edge.from, !subtree.has(edge.from)); include(edge.to, !subtree.has(edge.to)); }
  }
  const keptNodes = nodes.filter(node => retained.has(node.id));
  const keptEdges = edges.filter(edge => (subtree.has(edge.from) || subtree.has(edge.to)) && retained.has(edge.from) && retained.has(edge.to)).slice(0, edgeBudget);
  const omittedNodes = nodes.length - keptNodes.length, omittedEdges = edges.length - keptEdges.length;
  const notice = available ? `${view.kind==='interconnection'?'Focused connections':'Focused relationships'}: ${keptNodes.length} of ${nodes.length} elements and ${keptEdges.length} of ${edges.length} relationships. ${omittedNodes} elements and ${omittedEdges} relationships outside this focus or its ${nodeBudget}-element / ${edgeBudget}-relationship budget are omitted. Neighbor endpoints are context, not owned children. Open Diagram for the complete SDK graph.` : 'This ownership path exceeds the focus budget. Open Diagram to inspect the original graph.';
  return { available, contextIDs, omittedNodes, omittedEdges, view: { ...view, nodes: keptNodes, edges: keptEdges, notices: [...view.notices ?? [], notice] }, notice };
}

const ARCHITECTURE_CSS = `
.lab-donor-diagram .architecture-overview.has-selection{display:flex;flex-direction:column;overflow:hidden;container-type:inline-size}
.lab-donor-diagram .architecture-selection{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(230px,.9fr);gap:16px;flex:1;min-height:0;margin-top:12px}
.lab-donor-diagram .architecture-components{min-height:0;overflow:auto}
.lab-donor-diagram .architecture-selection>.architecture-context{min-height:0;overflow:auto;border-top:0;border-left:1px solid #d8dfe5;margin:0;padding:0 0 0 14px}
.lab-donor-diagram .architecture-card.is-neighbor{border-left:3px solid #54829f;background:#f3f7fa}
.lab-donor-diagram .architecture-card .architecture-direction{color:#315c75}
svg.focus-connections g.opensysml-edge:not(.selected) .edge-label{display:none}
.lab-donor-diagram .focused-connections{max-height:150px;overflow:auto;margin-top:6px}
@container(max-width:650px){.lab-donor-diagram .architecture-selection{display:flex;flex-direction:column}.lab-donor-diagram .architecture-selection>.architecture-context{order:-1;max-height:55%;border-left:0;border-bottom:1px solid #d8dfe5;padding:0 0 10px}.lab-donor-diagram .architecture-components{flex:1}}
@media(max-width:650px){.lab-donor-diagram .architecture-selection{display:flex;flex-direction:column}.lab-donor-diagram .architecture-selection>.architecture-context{order:-1;max-height:55%;border-left:0;border-bottom:1px solid #d8dfe5;padding:0 0 10px}.lab-donor-diagram .architecture-components{flex:1}}

.lab-donor-diagram.architecture-shell{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}
.lab-donor-diagram .architecture-body,.lab-donor-diagram .architecture-drawing{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
.lab-donor-diagram .architecture-drawing>.lab-donor-diagram{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
.lab-donor-diagram .architecture-focus-context{flex-shrink:0}
.lab-donor-diagram .architecture-focus-context summary{cursor:pointer;color:#526171;font-size:12px}

.lab-donor-diagram .architecture-overview{overflow:auto;touch-action:auto;cursor:auto;padding:16px;box-sizing:border-box;background:#fff}
.lab-donor-diagram .architecture-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:12px 0;align-content:start}
.lab-donor-diagram .architecture-card{text-align:left;min-width:0;overflow-wrap:anywhere;padding:12px;line-height:1.4}
.lab-donor-diagram .architecture-card strong,.lab-donor-diagram .architecture-card small{display:block}
.lab-donor-diagram .architecture-card small{font-size:12px;color:#526171;margin-top:4px}
.lab-donor-diagram .architecture-card[aria-pressed=true]{border:2px solid #176bbb;background:#eef5fc;padding:11px}
.lab-donor-diagram .architecture-context{border-top:1px solid #d8dfe5;margin-top:16px;padding-top:12px;overflow-wrap:anywhere}
.lab-donor-diagram .architecture-context h3{font-size:16px;margin:0 0 5px}
.lab-donor-diagram .architecture-context p{margin:6px 0;font-size:13px;color:#526171}
.lab-donor-diagram .architecture-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.lab-donor-diagram .architecture-connection{display:block;width:100%;text-align:left;margin:5px 0;white-space:normal;overflow-wrap:anywhere;line-height:1.45}
.lab-donor-diagram .architecture-connection small{display:block;color:#526171;font-size:12px}
.lab-donor-diagram .architecture-pages{display:flex;align-items:center;gap:8px;margin:10px 0}
.lab-donor-diagram .architecture-focus-context{padding:10px 14px;border-bottom:1px solid #d8dfe5;font-size:13px;overflow-wrap:anywhere}
.lab-donor-diagram .architecture-focus-context p{margin:4px 0}
`;

async function mountArchitecture(container: HTMLElement, view: SDKView, options: MountOptions): Promise<DiagramController> {
  const originalSummary = adaptDiagram(view, options.depth, options.audience).summary;
  const relationshipCaption = view.kind==='interconnection'?'Connections and flows':'Relationships', allCaption=view.kind==='interconnection'?'All connections':'All relationships', exploreCaption=view.kind==='interconnection'?'Explore connections':'Explore relationships', focusCaption=view.kind==='interconnection'?'Focused connections':'Focused relationships';
  const parts = architectureParts(view), nodes = view.nodes ?? [], edges = view.edges ?? [], byID = new Map(nodes.map(node => [node.id, node]));
  const shell = document.createElement('section'); shell.className = 'lab-donor-diagram architecture-shell'; shell.setAttribute('aria-label', `${view.view || 'Model'} architecture`);
  const style = document.createElement('style'); style.textContent = CSS + ARCHITECTURE_CSS; shell.append(style);
  const tools = document.createElement('div'); tools.className = 'diagram-tools'; shell.append(tools);
  const body = document.createElement('div'); body.className = 'architecture-body'; shell.append(body); container.replaceChildren(shell);
  let mode: PresentationState['mode'] = 'overview', selectedID: string | undefined, overviewScroll = 0, page = 0, connectionPage = 0, allConnections = false, componentsScroll = 0, contextScroll = 0;
  let child: DiagramController | null = null, disposed = false, generation = 0;
  let summary: DiagramSummary = { ...originalSummary, notices: [...originalSummary.notices] };
  const nodeName = (node: SDKNode | undefined, fallback = '') => node?.name || fallback || node?.kind || 'Element';
  function make<T extends keyof HTMLElementTagNameMap>(tag: T, text?: string) { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; return item; }
  function button(text: string, action: () => void | Promise<void>) { const item = make('button', text); item.type = 'button'; item.addEventListener('click', () => { if (!disposed) void action(); }); return item; }
  function endpoint(id: string, portID?: string) { const node = byID.get(id), port = node?.ports?.find(value => value.id === portID); return nodeName(node, id) + (portID ? ' · ' + (port?.name || portID) : ''); }
  function sourceNode(node: SDKNode) { options.onSelect?.(node.origin, { kind: 'node', id: node.id, element: node }); }
  function connectionRows(host: HTMLElement, matching: readonly typeof edges[number][]) {
    connectionPage = Math.max(0, Math.min(connectionPage, Math.max(0, Math.ceil(matching.length / 50) - 1)));
    const start = connectionPage * 50, end = Math.min(start + 50, matching.length);
    host.append(make('p', `${relationshipCaption} ${matching.length ? start + 1 + '–' + end : '0'} of ${matching.length}${allConnections ? ' in this graph' : ' adjacent to this selection'}${matching.length > end - start ? ' · ' + (matching.length - (end - start)) + ' outside this page' : ''}.`));
    for (const edge of matching.slice(start, start + 50)) {
      const item = button(`${endpoint(edge.from, edge.fromPort)}${edge.kind==='flow'?' → ':' — '}${endpoint(edge.to, edge.toPort)}`, () => options.onSelect?.(edge.origin, { kind: 'edge', index: edges.indexOf(edge), element: edge }));
      item.className = 'architecture-connection'; item.append(make('small', [edge.label, edge.kind].filter(Boolean).join(' · '))); host.append(item);
    }
    if (matching.length > 50) { const pages = make('div'); pages.className = 'architecture-pages'; const previous = button(view.kind==='interconnection'?'Previous connections':'Previous relationships', () => { connectionPage--; renderOverview(); }), next = button(view.kind==='interconnection'?'Next connections':'Next relationships', () => { connectionPage++; renderOverview(); }); previous.disabled = !connectionPage; next.disabled = start + 50 >= matching.length; pages.append(previous, make('span', `${connectionPage + 1} / ${Math.ceil(matching.length / 50)}`), next); host.append(pages); }
  }
  function toolbar() {
    tools.replaceChildren();
    if (mode !== 'overview') tools.append(button('Back to overview', async () => { await show('overview'); }));
    if (mode !== 'diagram') tools.append(button('Diagram', async () => { await show('diagram'); }));
    const status = make('span', mode === 'overview' ? `Architecture overview · ${parts.components.length} components` : mode === 'focus' ? focusCaption+' · SDK graph' : 'Original SDK diagram'); status.className = 'diagram-status'; status.setAttribute('role', 'status'); tools.append(status);
  }
  function renderOverview() {
    if (disposed) return;
    const previousStage = body.querySelector<HTMLElement>('.architecture-overview'); if (previousStage) {overviewScroll = previousStage.scrollTop; componentsScroll = body.querySelector<HTMLElement>('.architecture-components')?.scrollTop ?? componentsScroll; contextScroll = body.querySelector<HTMLElement>('.architecture-context')?.scrollTop ?? contextScroll;}
    body.replaceChildren(); const stage = make('div'); stage.className = 'diagram-stage architecture-overview'; Object.assign(stage.style,{flex:'1 1 0',minHeight:'0',height:'auto'}); stage.setAttribute('aria-label', 'Architecture overview');
    stage.append(make('strong', nodeName(parts.root, view.view || 'System architecture')));
    const selectedNodes = selectedID ? descendants(view, selectedID) : new Set<string>();
    const grid = make('div'); grid.className = 'architecture-grid'; grid.setAttribute('aria-label', 'Direct components');
    page = Math.max(0, Math.min(page, Math.max(0, Math.ceil(parts.components.length / 50) - 1)));
    for (const node of parts.components.slice(page * 50, page * 50 + 50)) {
      const card = button('', () => { selectedID = node.id; allConnections = false; connectionPage = 0; renderOverview(); contextScroll=0; const context=body.querySelector<HTMLElement>('.architecture-context'); if(context)context.scrollTop=0; body.querySelector<HTMLButtonElement>('.architecture-card[aria-pressed=true]')?.focus({preventScroll:true}); }); card.className = 'architecture-card'; card.dataset.nodeId = node.id; card.setAttribute('aria-pressed', String(selectedID === node.id)); card.setAttribute('aria-label', `Select ${nodeName(node)}`);
      card.append(make('strong', nodeName(node)), make('small', [node.kind, node.type].filter(Boolean).join(' · ')));
      if(selectedID && selectedID!==node.id){
        const members=descendants(view,node.id),toSelection=(edge:typeof edges[number])=>members.has(edge.from)&&selectedNodes.has(edge.to),fromSelection=(edge:typeof edges[number])=>selectedNodes.has(edge.from)&&members.has(edge.to);
        const connected=edges.some(edge=>edge.kind!=='flow'&&(toSelection(edge)||fromSelection(edge))),flowTo=edges.some(edge=>edge.kind==='flow'&&toSelection(edge)),flowFrom=edges.some(edge=>edge.kind==='flow'&&fromSelection(edge));
        if(connected||flowTo||flowFrom){const name=nodeName(byID.get(selectedID)),direction=[connected?'Connected to '+name:null,flowTo&&flowFrom?'Flow to and from '+name:flowTo?'Flow to '+name:flowFrom?'Flow from '+name:null].filter(Boolean).join(' · ');card.classList.add('is-neighbor');card.setAttribute('aria-label',`Select ${nodeName(node)}; ${direction}`);const annotation=make('small',direction);annotation.className='architecture-direction';card.append(annotation)}
      }grid.append(card);
    }
    stage.append(grid);
    if (parts.components.length > 50) { const pages = make('div'); pages.className = 'architecture-pages'; const previous = button('Previous components', () => { page--; renderOverview(); }), next = button('Next components', () => { page++; renderOverview(); }); previous.disabled = !page; next.disabled = (page + 1) * 50 >= parts.components.length; pages.append(previous, make('span', `${page + 1} / ${Math.ceil(parts.components.length / 50)}`), next); stage.append(pages); }
    const context = make('section'); context.className = 'architecture-context'; context.setAttribute('aria-label', view.kind==='interconnection'?'Connections context':'Relationships context');
    const selected = selectedID ? byID.get(selectedID) : undefined;
    context.append(make('h3', allConnections ? 'All '+relationshipCaption.toLowerCase() : selected ? nodeName(selected) : view.kind==='interconnection'?'Connections context':'Relationships context'));
    if (selected && !allConnections) { context.append(make('p', [selected.kind, selected.type].filter(Boolean).join(' · '))); const actions = make('div'); actions.className = 'architecture-actions'; actions.append(button(exploreCaption, async () => { overviewScroll = stage.scrollTop; await show('focus'); }), button('Inspect source', () => sourceNode(selected))); context.append(actions); }
    if (parts.ports.length || parts.root?.ports?.length) { const ports = [...parts.ports.map(node => `${nodeName(node)}${node.type ? ' : ' + node.type : ''}`), ...(parts.root?.ports ?? []).map(port => `${port.name}${port.type ? ' : ' + port.type : ''}`)]; context.append(make('p', 'Boundary ports: ' + ports.join(', '))); }
    if (selected || allConnections) { const selectedNodes = selected ? descendants(view, selected.id) : new Set<string>(); connectionRows(context, allConnections ? edges : edges.filter(edge => selectedNodes.has(edge.from) || selectedNodes.has(edge.to))); }
    else context.append(make('p', 'Choose a component to inspect its relationships.'));
    if (!allConnections) context.append(button(allCaption, () => { allConnections = true; connectionPage = 0; renderOverview(); }));
    if(selected && !allConnections){stage.classList.add('has-selection');const layout=make('div');layout.className='architecture-selection';const components=make('div');components.className='architecture-components';components.append(grid);for(const child of [...stage.children])if(child.classList.contains('architecture-pages'))components.append(child);layout.append(components,context);stage.append(layout)}else stage.append(context);body.append(stage); stage.scrollTop = overviewScroll; const componentPane=stage.querySelector<HTMLElement>('.architecture-components'); if(componentPane)componentPane.scrollTop=componentsScroll; context.scrollTop=contextScroll;
    const displayed = Math.min(50, parts.components.length - page * 50) + parts.ports.length + (parts.root ? 1 : 0);
    const pageNodes=parts.components.slice(page*50,page*50+50),missingOrigins=[...pageNodes,...parts.ports,...(parts.root?[parts.root]:[])].filter(node=>!node.origin).length;
    summary = { ...originalSummary, depth:null,missingOrigins,visibleNodes: displayed, visibleEdges: 0, omittedNodes: Math.max(0, nodes.length - displayed), omittedEdges: edges.length, notices: [...view.notices ?? [], ...(missingOrigins?[`${missingOrigins} overview elements have no source location from the engine.`]:[]),...(originalSummary.invalidEdges?[`${originalSummary.invalidEdges} relationships have unavailable node or port endpoints.`]:[]), `Architecture overview is a navigation aid: page ${page + 1} of ${Math.max(1, Math.ceil(parts.components.length / 50))}, showing ${Math.min(50, parts.components.length - page * 50)} of ${parts.components.length} direct components. ${Math.max(0, nodes.length - displayed)} elements are outside this overview page. No diagram edges are drawn here. Diagram opens the original SDK graph.`] };
    toolbar();options.onPresentationChange?.(summary);
  }
  async function show(next: PresentationState['mode'], restoring = false) {
    if (disposed) return;
    const overview = body.querySelector<HTMLElement>('.architecture-overview'); if (overview && !restoring) {overviewScroll = overview.scrollTop; componentsScroll = body.querySelector<HTMLElement>('.architecture-components')?.scrollTop ?? componentsScroll; contextScroll = body.querySelector<HTMLElement>('.architecture-context')?.scrollTop ?? contextScroll;}
    const token = ++generation; child?.dispose(); child = null; mode = next; body.replaceChildren(); toolbar();
    if (mode === 'overview') { renderOverview(); return; }
    let drawing = view, focus: ReturnType<typeof focusArchitecture> | undefined;
    if (mode === 'focus') {
      if (!selectedID || !byID.has(selectedID)) { mode = 'overview'; renderOverview(); return; }
      focus = focusArchitecture(view, selectedID); const context = make('div'); context.className = 'architecture-focus-context'; context.append(make('strong', nodeName(byID.get(selectedID))+(view.kind==='interconnection'?' connections':' relationships'))); const scope = make('details'); scope.append(make('summary', 'Focus scope and limits'), make('p', focus.notice)); context.append(scope);
      const neighbors = nodes.filter(node => focus!.contextIDs.has(node.id)); if (neighbors.length) context.append(make('p', 'Context: ' + neighbors.map(node => nodeName(node)).join(', ')));
      context.append(make('p','Select a line to show its name.'));
      const connections=make('details');connections.className='focused-connections architecture-focus-connections';connections.append(make('summary',`${relationshipCaption} (${focus.view.edges.length})`));for(const edge of focus.view.edges){const row=button(`${endpoint(edge.from,edge.fromPort)}${edge.kind==='flow'?' → ':' — '}${endpoint(edge.to,edge.toPort)}`,()=>{const originalIndex=focus!.view.edges.indexOf(edge),svgEdge=body.querySelector(`g.opensysml-edge[data-source-edge-index="${originalIndex}"]`);body.querySelectorAll('g.opensysml-edge.selected').forEach(item=>item.classList.remove('selected'));svgEdge?.classList.add('selected');options.onSelect?.(edge.origin,{kind:'edge',index:edges.indexOf(edge),element:edge})});row.className='architecture-connection';row.append(make('small',[edge.label,edge.kind].filter(Boolean).join(' · ')));connections.append(row)}context.append(connections);
      body.append(context); if (!focus.available) { summary = { ...originalSummary, visibleNodes: 0, visibleEdges: 0, omittedNodes: nodes.length, omittedEdges: edges.length, notices: [...view.notices ?? [], focus.notice] }; options.onPresentationChange?.(summary);return; } drawing = focus.view;
    }
    const target = make('div'); target.className = 'architecture-drawing'+(mode==='focus'?' connections-focus':''); body.append(target);
    let nextChild: DiagramController;
    try { nextChild = await mountOriginalDiagram(target, drawing, { ...options, ...(mode === 'focus' ? { depth: undefined } : {}), onSelect: (origin, context) => options.onSelect?.(origin, context.kind === 'edge' ? { ...context, index: edges.indexOf(context.element as typeof edges[number]) } : context) }); }
    catch (error) { if (disposed || token !== generation) return; mode = 'overview'; renderOverview(); const message = make('p', 'Diagram could not be opened: ' + (error instanceof Error ? error.message : String(error))); message.setAttribute('role', 'alert'); body.prepend(message); return; }
    if (disposed || token !== generation) { nextChild.dispose(); return; }
    if(mode==='focus')nextChild.svg?.classList.add('focus-connections');
    for(const stage of target.querySelectorAll<HTMLElement>('.diagram-stage'))Object.assign(stage.style,{flex:'1 1 0',minHeight:'0',height:'auto'});
    child = nextChild; summary = { ...child.summary, totalNodes: nodes.length, totalEdges: edges.length, omittedNodes: nodes.length - child.summary.visibleNodes, omittedEdges: edges.length - child.summary.visibleEdges, notices: [...child.summary.notices, ...(focus ? [] : ['Original SDK diagram.']), ...(focus ? [focus.notice] : [])] };options.onPresentationChange?.(summary);
  }
  function capturePresentation(): PresentationState {
    const selected = selectedID ? byID.get(selectedID) : undefined;
    const stage = body.querySelector<HTMLElement>('.architecture-overview'); if (stage) {overviewScroll = stage.scrollTop; componentsScroll = body.querySelector<HTMLElement>('.architecture-components')?.scrollTop ?? componentsScroll; contextScroll = body.querySelector<HTMLElement>('.architecture-context')?.scrollTop ?? contextScroll;}
    return { mode, ...(selected ? { selectedID: selected.id, selectedWitness: { origin: selected.origin, name: selected.name, kind: selected.kind } } : {}), scroll: overviewScroll, page, allConnections, connectionPage, componentsScroll, contextScroll };
  }
  async function restorePresentation(state: PresentationState) {
    if (disposed || !state || !['overview', 'focus', 'diagram'].includes(state.mode)) return false;
    selectedID = undefined;
    if (state.selectedWitness?.origin) { const witness = state.selectedWitness, matches = nodes.filter(node => node.name === witness.name && node.kind === witness.kind && !!node.origin && (['file','startLine','startCol','endLine','endCol'] as const).every(key => node.origin![key] === witness.origin![key])); if (matches.length === 1) selectedID = matches[0].id; }
    overviewScroll = Number.isFinite(state.scroll) ? Math.max(0, state.scroll) : 0; page = Number.isInteger(state.page) ? Math.max(0, state.page) : 0;
    componentsScroll = Number.isFinite(state.componentsScroll) ? Math.max(0, state.componentsScroll!) : 0; contextScroll = Number.isFinite(state.contextScroll) ? Math.max(0, state.contextScroll!) : 0;
    allConnections = state.allConnections === true; const selection = selectedID ? descendants(view, selectedID) : new Set<string>(), count = allConnections ? edges.length : edges.filter(edge => selection.has(edge.from) || selection.has(edge.to)).length; connectionPage = Math.min(Number.isInteger(state.connectionPage) ? Math.max(0, state.connectionPage!) : 0, Math.max(0, Math.ceil(count / 50) - 1));
    const desired=state.mode === 'focus' && !selectedID ? 'overview' : state.mode, expected=generation+1;await show(desired, true);return !disposed && generation===expected && mode===desired;
  }
  renderOverview();
  return {
    fit() { child?.fit(); }, zoom(factor) { child?.zoom(factor); }, captureViewport() { return child?.captureViewport() ?? null; }, restoreViewport(camera) { child?.restoreViewport(camera); }, capturePresentation, restorePresentation,
    get svg() { return child?.svg ?? null; }, get summary() { return summary; },
    dispose() { if (disposed) return; disposed = true; generation++; child?.dispose(); child = null; shell.remove(); },
  };
}
