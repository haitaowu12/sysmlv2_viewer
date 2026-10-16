// Shared Lab diagram host. Bundle as IIFE, no VS Code runtime dependency.
import { mountDiagram } from '../../modeling-lab/workbench/tools/reference-pilot/diagram-ui/host';
import { adaptDiagram } from '../../modeling-lab/workbench/tools/reference-pilot/diagram-ui/adapter';
const renderer = { mountDiagram, mount: mountDiagram, adaptDiagram };
(globalThis as typeof globalThis & { labDiagramRenderer?: typeof renderer }).labDiagramRenderer = renderer;
export { mountDiagram, adaptDiagram };
