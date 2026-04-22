# SysML v2 Editor — Developer Guide

## 1. Architecture Overview

The editor is a single-page application (SPA) built with modern web technologies:

| Layer | Technology | Role |
|-------|-----------|------|
| **UI Framework** | React 18 + TypeScript | Component tree, hooks, JSX views |
| **State Management** | Zustand | Lightweight global store with undo/redo |
| **Diagram Engine** | React Flow (@xyflow/react) | Canvas rendering, pan/zoom, selection |
| **Code Editor** | Monaco Editor | SysML v2 syntax highlighting, IntelliSense-ready |
| **Layout Engine** | Dagre (graphlib) | Hierarchical Sugiyama layout |
| **Edge Routing** | Custom A* on sparse grid | Orthogonal (Manhattan) obstacle avoidance |
| **Build Tool** | Vite | Fast HMR, optimized production bundles |
| **Testing** | Vitest | Unit tests for parser, bridge, and store |

### High-Level Component Diagram

```
┌─────────────────────────────────────────────┐
│                  App.tsx                      │
│  ┌─────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Code    │  │ Diagram  │  │ Draw.io     │ │
│  │ Editor  │  │ Views    │  │ Bridge View │ │
│  │(Monaco) │  │(React    │  │(iframe/     │ │
│  │         │  │ Flow)    │  │  embedded)  │ │
│  └────┬────┘  └────┬─────┘  └──────┬──────┘ │
│       │            │               │         │
│       └────────────┴───────────────┘         │
│                    │                          │
│              ┌─────┴─────┐                    │
│              │  Zustand  │                    │
│              │   Store   │                    │
│              └─────┬─────┘                    │
│                    │                          │
│       ┌────────────┼────────────┐             │
│       ▼            ▼            ▼             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
│  │ Parser  │  │ Bridge  │  │  AI     │      │
│  │ (AST)   │  │(Sync)   │  │ Service │      │
│  └─────────┘  └─────────┘  └─────────┘      │
└─────────────────────────────────────────────┘
```

---

## 2. Rendering Pipeline

The rendering pipeline transforms raw SysML v2 text into an interactive diagram in four stages:

### Stage 1: Parse — Text → AST
**File**: [`src/parser/parser.ts`](../src/parser/parser.ts)

A hand-written recursive-descent lexer/parser converts SysML v2 textual notation into a typed AST (`SysMLNode`).

```ts
const model = parseSysML(sourceCode);
// model.children: SysMLNode[]
// model.errors: ParseError[]
```

Key design decisions:
- **Recovery**: On parse error, `skipToRecovery()` advances to the next `;` or `}`, allowing partial models to render.
- **Doc heuristic**: `/* ... */` block comments are treated as `Doc` nodes only when preceded by the `doc` keyword.
- **Inline params**: `in/out/inout` parameters inside action/state bodies are parsed as `AttributeUsage` nodes with a `direction` field.

### Stage 2: Semantic Model — AST → Graph
**File**: [`src/bridge/sysml-to-semantic.ts`](../src/bridge/sysml-to-semantic.ts)

The bridge flattens the hierarchical AST into a normalized graph (`SemanticModel`) consisting of:
- `SemanticNode[]` — flat list of every model element with a stable ID.
- `SemanticEdge[]` — relationships: `contains`, `typing`, `connection`, `flow`, `binding`, `transition`, `satisfy`, `verify`, `allocation`, `dependency`.
- `LayoutMap` — computed or preserved `(x, y, width, height)` for each node.

ID stability is critical for round-trip sync. The bridge uses an **FNV-1a hash** of the SysML path:

```ts
export function sysmlPathHash(path: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i += 1) {
    hash ^= path.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const unsigned = hash >>> 0;
  return `n_${unsigned.toString(16)}`;
}
```

### Stage 3: Layout — Graph → Positions
**Files**: [`src/utils/layout.ts`](../src/utils/layout.ts), [`src/bridge/layout-map.ts`](../src/bridge/layout-map.ts)

Two layout systems coexist:

1. **React Flow auto-layout** (`layout.ts`): Uses Dagre for live diagram views.
   ```ts
   const { nodes, edges } = autoLayout(reactFlowNodes, reactFlowEdges, {
     direction: 'TB',
     nodeSpacing: 80,
     rankSpacing: 100,
     edgeRouting: true,
   });
   ```

2. **Semantic layout** (`layout-map.ts`): Used for Draw.io and SVG export.
   - Runs Dagre on the `SemanticModel`.
   - Applies **band offsets** (e.g., requirements pushed down by 320 px) to reduce overlap.
   - Nudges colliding nodes vertically with a 32 px step (max 32 attempts).
   - Preserves user-moved positions across re-renders.

### Stage 4: Render — Positions → React Flow / Draw.io / SVG
**Files**: [`src/views/*.tsx`](../src/views/), [`src/bridge/semantic-to-drawio.ts`](../src/bridge/semantic-to-drawio.ts), [`src/bridge/semantic-to-svg.ts`](../src/bridge/semantic-to-svg.ts)

- **React Flow views**: Each view (`GeneralView`, `InterconnectionView`, etc.) maps `SemanticNode` kinds to custom node components (`SysMLNode.tsx`) and renders edges with markers.
- **Draw.io**: `semanticModelToDrawioXml()` emits `mxCell` XML with embedded `sysmlKind` and `sysmlPath` style attributes for round-trip fidelity.
- **SVG**: A lightweight static renderer for export without dependencies.

---

## 3. Bridge Sync: SysML ↔ Draw.io Bidirectional Flow

The bridge enables **round-trip engineering** between textual SysML and visual Draw.io diagrams.

### 3.1 SysML → Draw.io
```
sourceCode
  → parseSysML()                // AST
  → buildSemanticModelFromSource() // SemanticModel
  → partitionSemanticModelForDrawio(viewMode) // Scoped model
  → semanticModelToDrawioXml()  // mxfile XML
```

View partitioning filters nodes and edges by `DrawioViewMode`:
- `general` — packages, part defs, ports, interfaces, typing edges.
- `interconnection` — part usages, connections, flows, bindings.
- `requirements` — requirements, verifications, satisfy/verify edges.
- `all` — everything.

### 3.2 Draw.io → SysML
```
raw drawio XML
  → parseDrawioToSemanticModel() // SemanticModel (layout + inferred kinds)
  → semanticModelToSysmlSource() // SysML text
```

**Kind inference** works in three layers:
1. `sysmlKind` style attribute (preserved from export).
2. Keyword prefix heuristics on the cell label (e.g., `part def`, `action`).
3. Shape fallback (ellipse → port, rhombus → connection, etc.).

### 3.3 Diff & Patch Application
**Files**: [`src/bridge/semantic-diff.ts`](../src/bridge/semantic-diff.ts), [`src/bridge/semantic-to-sysml-patch.ts`](../src/bridge/semantic-to-sysml-patch.ts)

When Draw.io XML changes, the system:

1. **Diffs** the previous and incoming semantic models:
   ```ts
   const diff = diffSemanticModels(previous, incoming);
   // diff.patches: SyncPatch[]
   ```

2. **Classifies patch safety**:
   - `safe` — layout moves, additions of known kinds, single-edge removals.
   - `review_required` — renames, re-parenting, ambiguous deletions, containment changes.

3. **Applies safe patches** immediately via text manipulation:
   - `add_node` — inserts `renderNodeStatement()` into parent or appends globally.
   - `remove_node` — deletes the AST node's source range.
   - `rename_node` — regex-based snippet replacement preserving keywords.
   - `reconnect` — removes old relation statement, adds new one.
   - `move_resize` — preserved in layout map only (no source change).

4. **Queues review patches** in the store for user approval.

Example patch application:
```ts
const result = applySyncPatches(sourceCode, patches);
// result.sourceCode   — updated text
// result.appliedPatches
// result.reviewPatches
// result.diagnostics
```

---

## 4. How to Add a New Diagram Type

Suppose you want to add a **Parametric View** for constraints and bindings.

### Step 1: Register the View Type
In [`src/store/store.ts`](../src/store/store.ts):
```ts
export type ViewType =
  | 'general'
  | 'interconnection'
  | 'actionFlow'
  | 'stateTransition'
  | 'requirements'
  | 'viewpoints'
  | 'parametric'   // <-- add
  | 'drawio'
  | 'explorer';
```

### Step 2: Add View Partitioning
In [`src/bridge/view-partition.ts`](../src/bridge/view-partition.ts):
```ts
if (view === 'parametric') {
  return (
    node.kind === 'ConstraintDef' ||
    node.kind === 'ConstraintUsage' ||
    node.kind === 'BindingUsage' ||
    node.kind === 'AttributeUsage' ||
    node.kind === 'PartUsage'
  );
}
```

And for edges:
```ts
if (view === 'parametric') {
  return edge.kind === 'binding' || edge.kind === 'typing' || edge.kind === 'contains';
}
```

### Step 3: Create the View Component
Create [`src/views/ParametricView.tsx`](../src/views/):

```tsx
import { useMemo } from 'react';
import { type Node, type Edge } from '@xyflow/react';
import { useAppStore, getNodeId } from '../store/store';
import { SysMLDiagramNode } from '../components/SysMLNode';
import { autoLayout } from '../utils/layout';
import DiagramView from '../components/DiagramView';

const nodeTypes = { sysmlNode: SysMLDiagramNode };

export default function ParametricView() {
  const model = useAppStore((s) => s.model);

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!model) return { initialNodes: [], initialEdges: [] };
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Walk AST and emit constraint/binding nodes + edges
    // ... (similar pattern to GeneralView)

    const layouted = autoLayout(nodes, edges, { direction: 'TB', edgeRouting: true });
    return { initialNodes: layouted.nodes, initialEdges: layouted.edges };
  }, [model]);

  return (
    <DiagramView
      nodes={initialNodes}
      edges={initialEdges}
      nodeTypes={nodeTypes}
      emptyTitle="No parametric elements"
      emptyDescription="The Parametric view shows constraints, bindings, and value properties."
    />
  );
}
```

### Step 4: Wire into App.tsx
In [`src/App.tsx`](../src/App.tsx), add a route/tab for `parametric` rendering `<ParametricView />`.

### Step 5: Add Layout Preset (Optional)
In [`src/utils/layout.ts`](../src/utils/layout.ts):
```ts
const LAYOUT_PRESETS: Record<string, LayoutPreset> = {
  // ... existing presets
  parametric: { direction: 'TB', nodesep: 100, ranksep: 120 },
};
```

---

## 5. Edge Routing and Layout Engine Internals

### 5.1 Orthogonal A* Routing
**File**: [`src/utils/edgeRouting.ts`](../src/utils/edgeRouting.ts)

The router finds Manhattan-style paths that avoid node obstacles.

```ts
const waypoints = computeOrthogonalRoute({
  source: { x: 100, y: 200 },
  target: { x: 400, y: 200 },
  obstacles: [{ x: 200, y: 150, width: 100, height: 100 }],
  preferredDirection: 'H',
});
// waypoints: [{x:100,y:200}, {x:400,y:200}]  (direct, no obstacles)
```

Algorithm details:
- **Grid**: Implicit sparse grid at 10 px steps.
- **Portals**: Obstacle boundary coordinates are added to the search space for cleaner routes.
- **Bounding box**: Padded by 4 grid steps so routes can go around the outside.
- **Fallback**: If A* exceeds 5000 iterations, returns the direct orthogonal path.

### 5.2 Edge Bundling
Parallel edges between the same source/target are offset perpendicular to the dominant direction:

```ts
const bundled = bundleEdges({
  edges: [e1, e2, e3],
  sourcePos: { x: 0, y: 0 },
  targetPos: { x: 100, y: 0 },
  spacing: 14,
});
// e1: y=-14, e2: y=0, e3: y=+14
```

### 5.3 Zoom-Adaptive Labels
Labels fade and truncate based on zoom level:

```ts
const label = computeAdaptiveLabel(0.4, 'satisfy');
// { opacity: 0.7, text: '', visible: false }
```

### 5.4 Layout Presets
Each view declares its preferred Dagre configuration:

| View | Direction | nodesep | ranksep |
|------|-----------|---------|---------|
| general | TB | 80 | 100 |
| interconnection | LR | 80 | 120 |
| actionFlow | LR | 60 | 120 |
| stateTransition | TB | 80 | 100 |
| requirements | TB | 100 | 150 |
| viewpoints | TB | 100 | 150 |

---

## 6. Testing Strategy

### 6.1 Test Stack
- **Runner**: Vitest (Vite-native, fast HMR-aware testing).
- **Assertions**: `vitest` built-in `expect`.
- **Coverage**: Run `vitest --coverage` (optional via `@vitest/coverage-v8`).

### 6.2 Test Categories

#### Parser Tests
**File**: [`src/test/parser.test.ts`](../src/test/parser.test.ts)

Covers:
- Empty input, single elements, nesting.
- All supported node kinds (package, part def, action, state, requirement, etc.).
- Comments (line, block, nested block).
- Error recovery (`partdef` typo, invalid input).

```ts
it('parses a part def', () => {
  const result = parseSysML('part def Vehicle {\n}');
  expect(result.errors).toHaveLength(0);
  expect(result.children[0].kind).toBe('PartDef');
});
```

#### Bridge Tests
**File**: [`src/test/bridge.test.ts`](../src/test/bridge.test.ts)

Covers:
- `sysml-to-semantic`: AST → graph conversion, ID stability.
- `semantic-to-drawio`: XML serialization, style correctness.
- `drawio-to-semantic`: Round-trip kind inference, layout preservation.
- `semantic-diff`: Patch generation for add/remove/rename/reconnect.
- `semantic-to-sysml-patch`: Text-level patch application accuracy.

#### Store Tests
**File**: [`src/test/store.test.ts`](../src/test/store.test.ts)

Covers:
- State transitions (load, parse, select, undo/redo).
- History stack boundaries (max 50 entries).
- Sync state updates (hash consistency, conflict detection).

### 6.3 Running Tests
```bash
npm test              # Run once
npm run test:watch    # Watch mode
npm run test:ui       # Vitest UI (if configured)
```

### 6.4 Adding a New Test
```ts
import { describe, it, expect } from 'vitest';
import { myNewUtility } from '../utils/myNewUtility';

describe('myNewUtility', () => {
  it('handles the happy path', () => {
    expect(myNewUtility('input')).toBe('output');
  });
});
```

---

## 7. Key Files Reference

| Concern | File |
|---------|------|
| Entry point | [`src/main.tsx`](../src/main.tsx) |
| Root component | [`src/App.tsx`](../src/App.tsx) |
| Global store | [`src/store/store.ts`](../src/store/store.ts) |
| Parser | [`src/parser/parser.ts`](../src/parser/parser.ts) |
| AST types | [`src/parser/types.ts`](../src/parser/types.ts) |
| Semantic types | [`src/bridge/semantic-types.ts`](../src/bridge/semantic-types.ts) |
| AST → Semantic | [`src/bridge/sysml-to-semantic.ts`](../src/bridge/sysml-to-semantic.ts) |
| Semantic → Draw.io | [`src/bridge/semantic-to-drawio.ts`](../src/bridge/semantic-to-drawio.ts) |
| Draw.io → Semantic | [`src/bridge/drawio-to-semantic.ts`](../src/bridge/drawio-to-semantic.ts) |
| Diff engine | [`src/bridge/semantic-diff.ts`](../src/bridge/semantic-diff.ts) |
| Patch applicator | [`src/bridge/semantic-to-sysml-patch.ts`](../src/bridge/semantic-to-sysml-patch.ts) |
| Layout presets | [`src/utils/layout.ts`](../src/utils/layout.ts) |
| Edge routing | [`src/utils/edgeRouting.ts`](../src/utils/edgeRouting.ts) |
| View partition | [`src/bridge/view-partition.ts`](../src/bridge/view-partition.ts) |
| Diagram views | [`src/views/`](../src/views/) |
| Node components | [`src/components/SysMLNode.tsx`](../src/components/SysMLNode.tsx) |
| Library panel | [`src/components/LibraryPanel.tsx`](../src/components/LibraryPanel.tsx) |

---

## 8. Contributing Guidelines

- **Follow existing conventions**: Use the same file structure and naming patterns.
- **Type safety**: Prefer strict TypeScript; avoid `any`.
- **Parser changes**: Always add a corresponding test in `parser.test.ts`.
- **Bridge changes**: Verify round-trip fidelity (SysML → semantic → Draw.io → semantic → SysML).
- **Performance**: Keep layout calculations under 100 ms for models with < 500 nodes.
