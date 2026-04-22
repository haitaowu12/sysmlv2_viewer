# SysML v2 Editor — User Guide

## 1. Overview

The **SysML v2 Editor** is a browser-based modeling environment for Systems Modeling Language (SysML) v2. It combines a textual code editor with live diagram views, a component library, and bidirectional sync with Draw.io. You can write SysML v2 source code directly, import existing models, or generate diagrams from scratch using the AI assistant.

### Key Features
- **Live parsing**: Real-time AST validation as you type.
- **Multiple diagram views**: General, Interconnection, Action Flow, State Transition, Requirements, and Viewpoints.
- **Drag-and-drop library**: Pre-built SysML v2 templates with search and recent-items tracking.
- **Draw.io bridge**: Round-trip sync between SysML source and Draw.io XML.
- **AI chat panel**: Generate or refactor models using natural language.
- **Keyboard-driven workflow**: Extensive shortcuts for navigation and editing.

---

## 2. Diagram Views Explained

### 2.1 General View
Equivalent to a **Block Definition Diagram (BDD)**.

- **Shows**: `package`, `part def`, `part usage`, `port def`, `port usage`, `interface def`, `item def`, and their relationships.
- **Edges**: Composition (nesting), specialization (`«specializes»`), and typing links.
- **Layout**: Top-to-bottom hierarchical (Sugiyama).
- **Interaction**: Click a node to select it; right-click to **Focus** or toggle attribute visibility.

```sysml
package 'Vehicle System' {
  part def Vehicle {
    part eng : Engine;
    port p1 : PowerPort;
  }
  part def Engine;
  port def PowerPort;
}
```

### 2.2 Interconnection View
Equivalent to an **Internal Block Diagram (IBD)**.

- **Shows**: Internal structure of a selected part, including nested `part usages`, `port usages`, `connection usages`, `flow usages`, and `binding usages`.
- **Edges**: Containment (dashed), connections (green arrow), flows (animated purple arrow).
- **Layout**: Left-to-right for readability.
- **Interaction**: Focus on a part to see only its internal graph.

### 2.3 Action Flow View
Equivalent to an **Activity Diagram**.

- **Shows**: `action def`, `action usage`, `flow usage`, and `binding usage`.
- **Compartments**: Input and output parameters are listed in labeled compartments.
- **Edges**: Sub-action decomposition (gray dashed), flows (purple animated), bindings (green dashed).
- **Layout**: Left-to-right.

```sysml
action def StartEngine {
  in ignitionSignal : Boolean;
  out engineRunning : Boolean;
}
```

### 2.4 State Transition View
Equivalent to a **State Machine Diagram**.

- **Shows**: `state def`, `state usage`, and `transition usage`.
- **Pseudo-state**: An initial pseudo-state is rendered automatically if an `entry` transition exists.
- **Edge labels**: Trigger `[guard] / effect` syntax is concatenated into the transition label.
- **Layout**: Top-to-bottom.

```sysml
state def VehicleStates {
  entry; then parked;
  state parked;
  transition park_to_idle first parked accept StartSignal then idle;
  state idle;
}
```

### 2.5 Requirements View
Equivalent to a **Requirements Diagram**.

- **Shows**: `requirement def`, `requirement usage`, `verification def`, and `constraint def`.
- **Edges**: `«satisfy»` (green), `«verify»` (red), `«deriveReqt»` (red dashed).
- **Doc rendering**: Requirement `doc /* ... */` text is shown inside the node when available.
- **Layout**: Top-to-bottom.

```sysml
requirement def VehicleMassRequirement {
  doc /* The total vehicle mass shall not exceed 2000 kg. */
  attribute massLimit : Real;
}
```

### 2.6 Viewpoints View
Architecture framework alignment.

- **Shows**: `viewpoint def`, `viewpoint usage`, `view def`, and `view usage`.
- **Edges**: `«conforms»` links from a view to its viewpoint.
- **Compartments**: Concerns list for viewpoints; viewpoint reference for views.
- **Layout**: Top-to-bottom.

---

## 3. Library Usage

The **Library Panel** (left sidebar) provides searchable, categorized SysML v2 templates.

### 3.1 Categories
| Category | Examples |
|----------|----------|
| **Structure** | Package, Part Def, Part, Port Def, Port, Item, Enum |
| **Connections** | Interface, Connection, Flow, Binding |
| **Behavior** | Action, State, Transition |
| **Requirements** | Requirement, Constraint, Verification, Analysis |

### 3.2 Searching
Type in the search box to filter by label or kind keyword (e.g., `port`, `action`). Matching categories auto-expand.

### 3.3 Drag-and-Drop
1. **Drag** a library item onto the code editor or diagram canvas.
2. The editor inserts the template at the cursor or into the selected package.
3. **Double-click** an item to open the **Creation Modal** for naming and scoping.

### 3.4 Recently Used
The top category tracks your last 5 used items via `localStorage`. It updates automatically as you drag or double-click templates.

---

## 4. Keyboard Shortcuts Reference

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + B` | Toggle Explorer Panel |
| `Cmd/Ctrl + J` | Toggle Properties Panel |
| `Cmd/Ctrl + Shift + D` | Open Draw.io Bridge |
| `Cmd/Ctrl + Shift + I` | Open AI Chat Panel |
| `Cmd/Ctrl + /` | Show Keyboard Shortcuts Help |
| `Delete` / `Backspace` | Delete Selected Node |
| `Escape` | Clear Focus / Close Modal |

> **Tip**: In the code editor, standard Monaco shortcuts (multi-cursor, find/replace, command palette) are also available.

---

## 5. Import / Export Workflows

### 5.1 Import
1. Click **File → Open** or drag a file onto the editor.
2. Supported formats:
   - **`.sysml`** — Plain-text SysML v2 source.
   - **`.drawio`** — Draw.io XML (automatically converted to SysML via the bridge).
3. On Draw.io import, the parser translates shapes back to semantic nodes, then serializes to SysML source.

### 5.2 Export
| Format | How | Use Case |
|--------|-----|----------|
| **SysML** | `File → Export → SysML` | Share source, version control |
| **Draw.io** | `File → Export → Draw.io` | Edit in diagrams.net, share diagrams |
| **SVG** | `File → Export → SVG` | Embed in documents, presentations |

### 5.3 Draw.io Bridge Workflow
1. **SysML → Draw.io**: Switch to the **Draw.io** view. The current semantic model is partitioned by view mode and rendered as Draw.io XML.
2. **Edit in Draw.io**: Open the exported `.drawio` file in diagrams.net, make layout or styling changes.
3. **Draw.io → SysML**: Re-import the file. The bridge computes a semantic diff and produces **sync patches**.
4. **Review Patches**: Safe patches apply automatically; review-required patches appear in the **Patch Review Panel** for explicit approval or rejection.

---

## 6. Quick Tips

- **Focus mode**: Right-click any node and choose **Focus This Item** to isolate its subgraph. Press `Escape` to clear.
- **Attribute visibility**: Right-click a node to show/hide its property compartments.
- **AI generation**: Describe a system in the AI chat (e.g., *"Model a drone with battery, motors, and flight controller"*) and apply the generated SysML.
- **Dark mode**: Toggle via the theme button in the toolbar.
