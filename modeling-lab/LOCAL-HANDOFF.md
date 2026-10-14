# Open, work and recover a local study

This package is the maintained Modeling Lab. It supports bounded declared-model work, source inspection, explicit editable-project downloads and a frozen reader. Native validation does not establish equipment performance, executed verification or acceptance.

## Open the supplied study

Extract the supplied package into a new directory. In its `sysml-v2-modeling` folder, run:

```sh
python3 scripts/sysml.py doctor
python3 scripts/sysml.py serve --source workbench/fixtures/authoring/alarm-review/model.sysml --views workbench/fixtures/authoring/alarm-review/views.json --port 5260
```

Open `http://127.0.0.1:5260/` in the in-app browser. Use Project → Open project file to open `workbench/fixtures/authoring/alarm-review/starter.modeling.json` for the initial brief or `reviewed.modeling.json` for the completed exercise. The starter source and brief remain separate from the reviewed project. The existing pump example is also available through `python3 scripts/sysml.py demo --port 5260`; stop the first server before reusing that port.

The package includes the pinned Pilot runtime and library when transferred with `sysml.py bundle`. Python 3.10+, Java21+ and Graphviz must already be available; doctor checks these and the package's registered source integrity. Fresh-directory verification on the existing Mac does not establish a clean-machine installation or Windows support.

## Work and keep changes

Use one active study per local server. Opening a different study in another tab can invalidate the first tab's source inspection, proposal or custom-view requests; return to that study and validate again to restore it. Separate local server instances are required for simultaneous studies. This is a single-user local handoff, with no shared-review concurrency claim.

The project name and file state appear above the model. Develop model provides bounded guided tasks. Edit SysML source opens the advanced language editor. Each proposal needs an explicit source quotation or decision basis, validation and review before Apply to project. Review changes preserves the change basis and offers undo when its revision still matches.

Use Model to find a component, then choose a presentation and Scope. Registers distinguish component name, occurrence context and port; expand Model path for the exact identifier. Connections do not acquire direction from their labels; arrows represent declared transfers. Scope and crossing/filtered omissions remain visible.

Open Save view or View options to rename the current view and save it. Save as new view creates a distinct copy. A name used by another view is rejected. A view kept in this browser is included in an editable project file only when you use Save project file. That action requests a download: retain the file in a known location. Reloading a tab is not a project-file save. Export reader review creates a frozen HTML record; it does not replace the editable JSON.

## Read without the model runtime

The completed exercise's `review.html` is a standalone frozen reader. Open it in a browser that supports local HTML files. The Codex in-app browser accepts HTTP/HTTPS and can reject `file://`; that refusal is not evidence that the HTML is invalid. The delivery record identifies the HTTP reader instance actually inspected. Keep any denied destination unaccessed; do not switch tools to bypass a saved restriction.

The reader records the source revision, brief/open questions, declared change history, selected presentation, interface-source register and requirements. Planned verification and satisfaction assertions do not establish a test pass. Dense diagrams still have readability limits; narrow the view or use a register. Named custom recipes are analytical projections, not native modeled SysML views. Responsibility tables distinguish whole-scenario performance from individual-step assignment. Quantity labels can quote matching, unambiguous requirement count wording; this does not infer a physical unit or execute a constraint.

## Recover

Keep both the editable project JSON and the frozen reader. If an import fails validation, the current project remains; fix a separate copy and retry. Reopen a known saved project file to recover its source, baseline, notes, view recipes and history. Restoring the baseline draft changes only the browser draft; the supplied source file is not overwritten. Review and save any recovery deliberately.

The local Git checkpoint and complete package archive preserve the product source. Notebook note/source backups exclude the product package, so their partial receipt is not complete remote code protection. A package manifest proves file identity, not usability or engineering approval. Do not edit generated readers to repair source facts: fix the source/projection and regenerate.

Stop the local server with Ctrl+C when finished. Keep the package, project files and reader; temporary validation directories and browser tabs are disposable only after needed outputs are retained.

## Human acceptance still to observe

When available, ask Tony to identify the changed minimum and declared capacity, distinguish the two room/probe occurrences, inspect a source witness, rename a view, save and reopen the project, and explain what remains unresolved or unexecuted. These local and agent checks do not replace that observation.
