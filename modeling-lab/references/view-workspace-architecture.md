# Source-linked view workspace

The objective is to open a user's SysML v2 model, understand its architecture,
find a subject, inspect its declarations, and retain a useful view for later work.
A diagram is a projection of accepted source. Readability, static validation,
execution and engineering acceptance are distinct claims.

## Responsibilities

| Unit | Responsibility | Boundary |
|---|---|---|
| Source intake and project workflow | Original files, assembled draft, baseline, notes, proposals, explicit save/reopen | Opening and editing use the existing staged acceptance transaction |
| Browser engine worker | Validate/query accepted source and obtain public SDK RenderView results | `/diagram` requires the exact accepted source hash; candidate inspection never becomes diagram authority |
| View workspace | One registry and selected-view state, source navigation, audience, presentation depth | Saved personal views contain qualified semantic targets, not temporary drawing IDs |
| Diagram adapter and host | Preserve SDK kinds, membership, endpoints, origins, geometry and notices; mount and dispose drawings | Reuses pinned OpenSysML canvas/layout/ELK modules, with a thin Lab adapter |
| Existing review and analytical adapters | Preserve configured reviews, registers, comparisons and analytical recipes | Analytical filters are not silently reinterpreted as SysML view membership |
| Frozen reader | Snapshot included drawings, revision, scope and saved definitions | Current SysML viewport is included; other saved SysML definitions are not claimed rendered |

The browser profile uses OpenSysML 0.10.0 at pinned commit
`08ef397841767b829e492bbecf6d723483b4421e`, plus the retained Lab patch. The native
Pilot profile retains its existing rendering pipeline. The new shared source
registry helpers also admit and preserve optional personal definitions in native
project files; the native profile does not yet render the new browser diagrams.

## View contract

The registry distinguishes configured review views, authored `ViewUsage`
declarations, personal SysML queries, and analytical views. Compatible configured
engineering/behavior views use the engine canvas in Engineering. Stakeholder
review presentations remain available within their declared layout bounds. A
legacy presentation failure does not reject otherwise validated source when the
worker has just rendered the exact configured engineering query successfully.
The worker overwrites client receipts; Python independently verifies exact source
hash, query, kind and nonempty content before staging. An unavailable stakeholder
presentation remains explicit, and a later diagram failure offers retry. Personal/authored views keep the same
semantic graph across audiences; the stakeholder transform adds word spacing,
without claiming an independent stakeholder modeling notation.

A personal definition is `{kind:'sysml', id, name, target, notation, depth}`.
`target` is the exact qualified model identity, including quoted names. `depth`
is a presentation filter from 1 to 4. Source edits can invalidate a target; a
failed render retains the last successful drawing with an explicit error. No
membership or layout is persisted using engine-local `n0` IDs. Project format
version 1 accepts optional `sysmlViews` and `selectedView`; old projects remain
admissible. Original analytical recipes are retained unchanged.

A request captures the accepted report and source hash. The worker reloads that
accepted source before rendering. The controller stages the next canvas,
checks its request ticket and accepted report, then commits drawing and selection
together. Stale results are disposed. Rendering failure keeps the committed
selection, drawing and reader metadata. Draft invalidation suppresses pending
results. Saved selection is recorded before the project save baseline is captured.

Selection uses actual engine origins. The engine's columns count UTF-8 bytes;
the controller converts them to JavaScript editor offsets. Current user origins
map to the opened assembled source; existing witnessed elements retain original
file mapping. Library origins are disclosed as external declarations and never
redirected into unrelated user source. Ports identify the owning declaration
because the SDK does not supply an independent port span.

## Declaration navigation and occurrence context

The browser Model panel now presents a lazily expanded declaration hierarchy.
Its parent relation comes only from resolved `semantics.owner` references in the
accepted source report. It does not split qualified names, attach definitions
under their usages, or treat resolved/inherited `feature` references as locally
owned children. Named packages, definitions and usages remain distinct source
declarations; hidden intermediate owners can be traversed by their explicit
owner references. Missing owners fall back to the root, and ownership cycles
cannot create a recursive UI. Sibling lists and search results are paged.

The inspector and current-view trail distinguish a declared occurrence (part,
item or occurrence usage) from its definition. Definition links resolve typed
references; the reverse Usages list finds other directly typed source usages.
These are declarations, not observed installed instances. Existing analytical
catalogues retain their separate contextual occurrence keys and projections.
The engine may resolve ports from a usage's type; navigation does not invent a
new containment tree of all inherited features beneath every usage.

Model navigation requests a temporary engine diagram of the exact semantic
subject without replacing the accepted report, configured review recipes,
authored views, personal views or analytical views. Back/Forward retains the
subject, search, expanded branches, model selection, sidebar position and engine
viewport. History holds at most thirty entries, resolves current saved recipes
and prunes deleted destinations. Source invalidation or project replacement
clears transient history. Depth changes rerender temporary exploration too.
Browsing does not become an engineering edit or dirty the saved-view baseline.

Temporary navigation is not a new saved view. Project save retains the last
registered selected view; Save as view explicitly retains a newly explored
subject as a personal semantic recipe. Original authored and analytical views
remain available in the Views panel. Table presentations report actual row
counts and omit graph zoom controls.

The interface borrows the established explorer/type distinction rather than
introducing diagram membership editing. The inspected SysON 2026.9 General View
documentation distinguishes usage/definition representations and an explorer
from exposed diagram membership; its General View is marked experimental:
https://doc.mbse-syson.org/syson/v2026.9.0/user-manual/features/general-view.html
No SysON framework code or service was introduced.

## Readable overview and focused neighborhoods

Large structural results (tree, interconnection, definition or package) open an
Architecture overview when they contain more than eight direct components or
thirty total nodes. It is explicitly a navigation aid, not an alternative SysML
notation. A bounded grid shows direct engine-owned components with original
kind/type. Boundary ports remain visible as context. Selecting a component lists
its exact adjacent connection and flow assertions, with readable endpoints and
original edge-source callbacks. Separate parallel assertions are preserved.
Component and connection lists page at fifty, with explicit current ranges.
The original SysML Diagram remains available through one direct action.

Explore connections focuses the existing SDK graph rather than synthesizing a new
instance structure. It includes the selected subtree, actual adjacent endpoints
and necessary ancestor chains within twelve nodes and twenty-four edges.
Endpoints retain original parents and port identities; external neighbors are
identified as context. No edge is retargeted to a visible owner. Generic connections remain undirected
in overview annotations; only actual flows receive flow-direction labels. Omitted counts
and budget limits remain explicit, and the complete original graph remains
available. Open definition continues to follow declared typing to user-source
structure; a focused neighborhood does not invent subsystem internals.

Back to overview retains the selected component and list position. Model-view
history also captures the overview/focus/diagram presentation and camera. A
unique original source/name/kind witness resolves selections after rerendering;
render-local IDs are not persisted. Asynchronous presentation restoration is
bound to its drawing, accepted report and request ticket, so an obsolete restore
cannot move a newer drawing's camera. Source changes clear transient history.
Selected component actions and exact relationships share the overview pane.
Focused drawings suppress unselected edge-label clutter, retain selectable line
names and an exact source-linked relationship list. The original drawing is
unchanged. Secondary depth/save/full-canvas settings live in View options.
Discovery controls remain outside scrolling result lists, and short desktop
windows use a bounded flex/scroll chain rather than clipping diagram controls.

Reader export retains the displayed overview or focused drawing, its revision,
current page/range and explicit projection limits. Overview navigation buttons
become static content or are removed; an exported overview does not claim to
include all edges or every page. Useful configured, authored, personal and
analytical recipes remain unchanged in editable projects.

## Bounded capability

The browser producer stops tree/interconnection containment after four levels
from each exposed root, before descendant expansion, and reports that bound.
Presentation depth can narrow that result. A wide level can still be large.
ELK has its donor 600-node guard; this slice is not industrial scale qualification.
The current renderer shows source declarations. It does not materialize every
inherited type feature as a new usage occurrence. Selecting a typed component
can lead to its definition when that definition is available in user source.

The adapter supports engine diagrams and table rows. Notes remain in an explicit
notes panel; note geometry is not drawn. Empty engine results say that no content
was returned. The host does not infer table semantics from a view's name. The
Apollo RequirementsTableView therefore does not become a requirements table by
naming convention. Engine support and model definitions determine that result.

Source import remains bounded to 64 files and 512 KiB of assembled UTF-8 source,
with an 8 MiB project file. Full parser, notation, behavior execution, package
resolution and multi-user editing are not claimed by this slice.

## Follow-through

First prove open → find → authored/personal SysML diagram → inspect source →
edit and validate → save/reopen → reader export, using unmodified reference
models and the retained full Apollo project. Preserve older useful analytical
views. Test rapid selection, rejected rendering, stale source, non-ASCII spans
and subjects beyond the first results page. Qualify the exact frozen build in
the in-app browser before Pages promotion.

Subsequent slices should address, in this order:

1. Published interoperability coverage: import a declared corpus of ordinary
   multi-file SysML models, report unsupported constructs before drawing, and
   qualify source-owned identity and view coverage for each.
2. Scalable view queries: producer-side node/edge budgets and server/profile
   capability discovery, then progressive expansion and benchmarked wide/deep
   models. Host presentation budgets do not reduce producer work. A readable
   overview or smaller screenshot is not proof of scale.
3. Editing interaction: reversible, source-witnessed changes and clear diagnostics
   around one complete engineering task before adding diagram editing gestures.

Each slice must demonstrate its user task before breadth expands. A new parser,
full inherited-occurrence instantiator or service deployment requires a separate
bounded decision; it is not a detour inside this first canvas slice.
