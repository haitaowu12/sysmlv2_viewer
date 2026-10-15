# Own-model opening and bounded workflow repair — 2026-10-15

The acceptance task is opening and working with a person's own SysML v2 model. Apollo is a multi-file regression input, not a special rendering path or a general compatibility certificate.

## Resulting workflow

Open model accepts SysML v2 text files, a folder, or a saved Modeling Lab project. A unique source-owned top-level part usage opens directly; otherwise a unique source-owned part definition can open directly. Ambiguous sources offer a searchable starting point. Original files and their locations are retained. Imported study notes start blank.

Source validation is independent of diagram support. Invalid source cannot replace the current project. Valid source whose requested diagram is unsupported can explicitly open without a diagram, retaining the source, baseline and available component browsing. This state saves and reopens normally. Nonempty saved projects still require all their configured views; a failed view is not silently discarded.

Selecting a component inspects it without replacing the current drawing. Open component view starts a neutral analytical scope. Open SysML part/port sheet uses the selected element's direct features, explicitly enters Engineering, and can return to the earlier view and audience. Inspection occupies space beside or below the model. Packages distinguish otherwise identical component and subject names.

Analytical diagrams/tables, bounded SysML part/port sheets and declared-behavior projections are labeled separately. Authored SysML view declarations remain in source; they are not automatically translated into Lab selector entries. Guided minimum edits use one producer capability profile and check the exact formal change. Linked-element detail in proposals starts closed.

## Evidence and limits

- The untouched OpenSysML [spacecraft communications source](https://github.com/Open-MBEE/OpenSysML/blob/08ef397841767b829e492bbecf6d723483b4421e/examples/runtime-showcase/spacecraft-comms.sysml) opened from a file chooser directly into its mission scope. Two components and their port connection were shown. Two declared interface flows were reported unsupported. A disposable component edit was prepared, reviewed, applied, saved and undone; the restored source and baseline matched the original exactly.
- A separate browser agent opened the untouched [General Views vehicle source](https://github.com/Open-MBEE/OpenSysML/blob/08ef397841767b829e492bbecf6d723483b4421e/examples/general-views-demo/vehicle.sysml), compared both audiences, reviewed satisfaction/planned verification, then saved and reopened a custom requirements view. The trial exposed duplicate-name, authored-view and requirement-discovery gaps. Naming/disclosure and unsupported boundary framing were repaired; first-class requirement discovery remains open.
- Ordinary folder import retained all 28 Airbus Apollo source files and their 345,795-byte assembled source, then opened the selected Saturn V scope. This route did not use the bundled example project.
- Invalid source retained the preceding project. A valid thirteen-component model exceeded the declared twelve-component overview profile and could explicitly open without a diagram. A package/attribute-only model also opened, saved and reopened in that state.
- Inspector layout was checked at desktop and narrow widths. Fresh native qualifications of the two untouched OpenSysML sources passed with no diagnostics. These are bounded checks, not browser/device, performance or human acceptance qualification.

Occurrence-path collisions now fail explicitly before dictionary selection can discard a component. This is containment, not collision-free identity migration. Unknown multiplicity bound evidence is kept distinct from a known collection or an additional component. State entry successions no longer overwrite the requested scope or inflate state/transition counts.

## Next bounded work

1. Complete collision-free contextual identity and safe legacy recipe migration.
2. Organize model navigation around source-backed components, requirements, behavior and verification, with selection and current view kept distinct.
3. Extend scoped engineering notation and producer contracts from witnessed model gaps: inherited/interface flows, nonliteral cardinality and authored SysML view declarations. Retain explicit unsupported outcomes until each capability is verified.
4. Qualify repeated editing, cancellation, resource use, cold delivery and the supported browser/device matrix on the exact delivered artifact.

Preserve useful existing views, the browser-only Pages workflow and the current input/resource limits. Each next slice needs an observable user task and its own bounded effort; these priorities do not authorize extending the existing cap. Publication follows the exact-artifact process in `experiments/browser-only-lab/RELEASE.md`.
