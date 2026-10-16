Modeling Lab browser runtime notices
===================================

This distribution contains the maintained Modeling Lab, a typed-export modification
of OpenSysML 0.10.0, its JavaScript client, and embedded language libraries. The
browser stores no project in a remote modeling service. This statement describes
the runtime architecture; it does not establish language conformance or acceptance.

Modeling Lab source: https://github.com/haitaowu12/sysmlv2_viewer/tree/main/modeling-lab
Browser adapter and modifications: https://github.com/haitaowu12/sysmlv2_viewer/tree/main/experiments/browser-only-lab
The exact deployed source revision and content identity are in build-info.json.
The distributed OpenSysML modification is opensysml-browser.patch; it adds typed
Lab export/render operations. It is not an upstream OpenSysML release.

Runtime components
------------------
OpenSysML 0.10.0, JavaScript SDK and modified Go WASM engine: Apache-2.0.
The embedded official SysML/KerML language libraries: EPL-2.0; the embedded
OpenSysML extension libraries: Apache-2.0. Their upstream NOTICE and license texts
are retained under licenses/OpenSysML. Exact upstream source (including library
files): https://github.com/Open-MBEE/OpenSysML/tree/08ef397841767b829e492bbecf6d723483b4421e

The diagram host also reuses that pinned OpenSysML release's canvas, layout,
geometry, ELK adapter, optional obstacle router and pure zoom modules. These
modules are unchanged; the Lab's SDK adapter and workspace host are new code.
Source and notices: modeling-lab/workbench/tools/reference-pilot/diagram-ui.

elkjs 0.12.0: EPL-2.0 OR GPL-3.0-or-later; this distribution retains the EPL-2.0
license under licenses/elkjs. Source: https://github.com/kieler/elkjs/tree/v0.12.0

libavoid-js 0.4.5 bindings and the supplied libavoid.wasm: LGPL-2.1-or-later.
The complete license is under licenses/libavoid-js. Upstream copyright and exact
libavoid source/build provenance are retained in
licenses/OpenSysML/DIAGRAM-THIRD-PARTY-NOTICES.md. Source for the bindings:
https://github.com/Aksem/libavoid-js/tree/28a6fe20c2f1f809afdbeca8d789e65357614c4f
Source for the libavoid fork compiled by that release:
https://github.com/Aksem/adaptagrams/tree/dd3236536399e5297b353d02c0b751eeaaf63aee
The bindings are bundled into the browser's Lab JavaScript. The WASM object is a
separate replaceable file, libavoid.wasm. To use a modified build, replace
experiments/browser-only-lab/public/libavoid.wasm after preparation, or replace
the installed package's dist/libavoid.wasm before preparation, then rebuild the
site. To change the bindings, rebuild against a modified libavoid-js package.

Pyodide 0.29.3: MPL-2.0. The shipped loader, runtime and Python standard library
are unmodified upstream assets. Source corresponding to the release:
https://github.com/pyodide/pyodide/tree/72e3c78d53a32a76e0aca7443ad24e5cae1042d3
Its CPython 3.13.2 runtime and bundled portions retain the Python license history
and third-party acknowledgements under licenses/CPython. The Pyodide runtime links
libffi, hiwire, zlib 1.3.1 and bzip2 1.0.6 and Emscripten runtime/library portions;
their notices are retained too. No optional Pyodide packages are installed by this
application. pyodide-lock.json describes optional upstream packages; shipping that
catalogue does not mean those package binaries are included.

Viz.js 3.31.0: MIT; its WASM object code includes Graphviz 16.1.0 (EPL-2.0) and
Expat 2.8.5 (MIT). Viz's release provenance identifies those exact source versions:
https://github.com/mdaines/viz-js/tree/c8ce050d28eb0dc1ed1629ea32ab7f3dc117db0f
Relevant notices are under licenses/Viz-js, licenses/Graphviz and licenses/Expat.

Go 1.27.1 standard library and wasm_exec.js: BSD-3-Clause. Licenses for modules
actually linked into the browser engine are collected from the pinned module
cache under licenses/go, with their exact versions in go-catalogue.json. The
engine-build.json records the matching engine/Go loader pair and patch identity.

licenses/catalogue.json lists the retained source commits and notice files.
Build-only Vite/esbuild/npm tooling is not shipped as an end-user runtime.
