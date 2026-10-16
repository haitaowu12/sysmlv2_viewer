// New Lab host for the unchanged OpenSysML canvas/layout/zoom modules.
import { adaptDiagram, type SDKView, type SourceSpan, type DiagramSummary } from './adapter';
import { autoLayout } from './vendor/webview/autolayout';
import { loadAvoid } from './vendor/webview/avoid';
import { drawCanvas } from './vendor/webview/canvas';
import { layoutCanvas, type Box } from './vendor/webview/layout';
import { ZOOM_STEP, type View } from './vendor/landing/zoom';

export interface SelectionContext { kind: 'node' | 'edge' | 'port' | 'note' | 'row'; id?: string; index?: number; ownerId?: string; originOf?: 'owner'; element: unknown }
export interface MountOptions {
  audience?: string; depth?: number; avoidWasmUrl?: string;
  onSelect?: (origin: SourceSpan | undefined, context: SelectionContext) => void;
}
export interface DiagramController {
  fit(): void; zoom(factor: number): void; dispose(): void;
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
  let svg: SVGSVGElement | null = null, disposed = false;
  let fit: View = { x: 0, y: 0, scale: 1 }, current: View = fit;
  let bounds: Box = { x: 0, y: 0, width: 800, height: 500 };
  let content: SVGGElement | undefined;
  const listeners: (() => void)[] = [];
  function listen(target: EventTarget, name: string, fn: EventListener, opts?: AddEventListenerOptions) {
    target.addEventListener(name, fn, opts); listeners.push(() => target.removeEventListener(name, fn, opts));
  }
  function apply() { content?.setAttribute('transform', `translate(${current.x} ${current.y}) scale(${current.scale})`); }
  let layout: ReturnType<typeof layoutCanvas> | undefined;
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
    fit: fitDiagram, zoom, summary, get svg() { return svg; },
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
  if ((view.rows?.length ?? 0) && !summary.totalNodes) {
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
  if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(fitDiagram); observer.observe(stage); }
  return controller;
}
