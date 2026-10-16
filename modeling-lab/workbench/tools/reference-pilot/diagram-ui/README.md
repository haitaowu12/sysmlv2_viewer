# OpenSysML diagram UI seam

The `vendor/` files are unchanged copies of Open-MBEE/OpenSysML commit
`08ef397841767b829e492bbecf6d723483b4421e`, from `editors/vscode/src/`:
`webview/{canvas,layout,geometry,autolayout,avoid}.ts`, `landing/zoom.ts`,
`protocol.ts` and `style.ts`. Source: https://github.com/Open-MBEE/OpenSysML
See `LICENSE.OpenSysML` and `THIRD_PARTY_NOTICES.OpenSysML.md`.

`adapter.ts` and `host.ts` are new Lab code. They adapt the SDK `RenderedView`
shape to the editor canvas, preserving IDs, labels, kinds, port endpoints,
stated geometry and source spans. Empty protobuf optional strings become absent
editor fields. Stated sizes apply only when `hasSize` is true. Nothing constructs
FQNs, model edits or SysML semantics from labels.

Stakeholder audience adds spaces at camel-case and underscore boundaries in node
names only. It retains the same semantic membership, original labels in selection
callbacks, types, kinds and graph notation. This is a readability transform, not
an independent stakeholder notation or a generated explanation.

The host provides fit, pan, zoom, keyboard activation, exact original source-span
callbacks, table rows and a notes panel. SDK ports have no independent source
span; their selection explicitly returns the owner's span (`originOf: 'owner'`).
Notes appear in the notes panel, with source buttons when supplied; note geometry
is not drawn on the canvas. View notices and missing-source counts remain visible.

`Fit` and Home show the overview; `Read labels` reaches at least actual size.
The Lab host adapts the donor's focal zoom math to allow up to four times actual
size or sixteen times fit, whichever is larger. Pan uses actual diagram bounds,
centering an axis when its content is smaller than the viewport. The unchanged
donor hero module's four-times-fit cap is not used for model reading.

`depth` is an optional presentation limit (root = 0). Ancestors remain in the
drawing and edges require both visible node and port endpoints. Omitted counts
are disclosed. This filter does not implement analytical-scope hidden/pinned rules
and does not alter saved membership. Cyclic ownership and repeated IDs reject
before mounting. No dragging gesture mutates source or saved layout.

The browser adapter builds this source through Vite from
`experiments/browser-only-lab`, with exact `elkjs@0.12.0` and `libavoid-js@0.4.5`
dependencies. Its aliases resolve the one installed browser dependency tree.
The optional `avoidWasmUrl` enables libavoid obstacle routing; the current host
uses donor ELK and standard routes. The distributed replaceable WASM and licenses
remain available under `licenses/`.

The exported global is `window.labDiagramRenderer`. `await mountDiagram(host,
renderedView, options)` returns `{ fit, zoom, dispose, svg, summary }`. The caller
stages a new mount, checks the accepted revision/request ticket, and then swaps it
into the workspace. A failed or stale mount cannot clear a newer drawing.

Run focused checks with `npm run test:diagram-ui` from
`experiments/browser-only-lab`. This bundles the tests from maintained source
into ignored build output and exercises adapter, layout, source callbacks,
interaction and disposal in a DOM. Real browser qualification remains separate.
