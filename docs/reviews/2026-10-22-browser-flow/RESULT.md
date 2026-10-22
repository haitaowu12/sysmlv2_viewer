# SysML v2 Viewer / Modeling Lab practitioner-flow verification

Observed 2026-10-22 using the Codex in-app browser (`iab`) on the existing Mac. This is an agent-operated, single-session workflow check. It is not a real practitioner's acceptance, a cold-device test, a multi-browser qualification, or a full SysML conformance claim.

## Source and deployment

Fresh `git fetch` and the advertised remote head confirmed main `9e0723777a7064080896ae8cb005487aeae90409`. The primary and browser source checkouts were clean at this revision. A new browser production build passed its 75-asset audit with content `ac6487bddb209541d7b92ee57638365064c27bf0dc2a04d5be2e99497f5014d0`; build-info identifies current main. The browser test used that built distribution at `http://127.0.0.1:5272/`.

The actual public page and its build-info were inspected through iab. They still identify source `bda0e575e9f80d2dc41139315d33b2687d2da75f` and content `7c525f90d4710f04276f0d6355115ad9ce4a741e6547bf004a3967ecf6199dcd` (October 16). Public Apollo startup rendered. The public artifact does not include the subsequent #25 Lab state/identity repairs on current main; #23/#24 also preserve older service code. Squash history means raw commit counts do not describe the product delta accurately. No deployment or promotion occurred.

## Observed workflow and evidence

| Check | Observed result | Evidence |
|---|---|---|
| Open raw non-TREP source | Unchanged fictional alarm `model.sysml` imported. Its source text and the original file in sourceSet survived the actual project download exactly. | raw-import.modeling.json; main-raw-import.png |
| Navigate and inspect source | The initial occurrence showed one element; Definition opened the four direct components and three exact relationships. Both room occurrences remained separate. Port inspection identified the port and disclosed its owner source span without offering the owner as an authoritative edit target. | main-port-inspection.png |
| Review engineering edit | Guided minimum change showed required 2 to 3, capacity 2 unchanged, explicit CR-1 basis, declared design shortfall, and physical verification not evaluated. Apply produced revision 284640d10406. | main-change-review.png; changed-saved.modeling.json |
| Keep a named view | Created Cold-room capacity review on AlarmReview::MonitoringSystem, interconnection depth 3; Read labels camera and Controller search were retained. | main-edited-saved.png; download-verification.json |
| Save and reopen | Reopened the actual downloaded JSON. Named view, depth 3, six matching model-search results, source/change history and saved indicator returned. Actual SVG transform was translate(-17 64.5) scale(1), matching the downloaded camera. No false unsaved state appeared after asynchronous mounting. | main-reopened.png; changed-saved.modeling.json |
| Export standalone reader | Downloaded HTML opened via a static local server. It rendered three configured reviews and the current personal SysML view. Minimum 3 versus capacity 2, declared shortfall, exact revision, basis, planned/unexecuted verification, unresolved notes and coverage limits remained available. | changed-reader.html; reader.png |
| Undo | Undo last engineering change restored the starter's source byte-for-byte and emptied change history. The personal view remained usable. | undone-saved.modeling.json; main-undo.png |
| Reject invalid import and recover | Broken source (`package Broken {`) was rejected with expected closing-brace feedback and enabled retry controls. A new actual project download after rejection equaled the pre-import accepted JSON object in every field. | invalid.modeling.json; main-rejected-import.png; retained-after-invalid-import.modeling.json |

The downloaded edited source retained sampleCapacity = 2, the minimum-three statement and exactly one change record. Its computed source SHA-256 matches viewReading and exported artifact metadata. The raw supplied source files were never overwritten.

## Findings and limits

No blocking defect was reproduced in the bounded workflow above, so no candidate branch or code repair was created. The raw-source starting occurrence initially requires its explicit Definition link to see internal structure; this is a navigation friction observation, not proof of lost source or a failed semantic contract. The definition and occurrence remain visibly distinct.

One file-chooser tool call took about 672 seconds before returning. The operation combined browser automation and application activity, so this is not attributed to product validation time. No startup/latency/performance acceptance claim is made. Later chooser and save operations returned promptly. Browser locator mismatches were resolved from fresh UI state; they were not product failures.

The reader was inspected at the actual exported file, served by a static server with no modeling service. Current-main UI evidence was captured at the normal 1280 by 720 desktop viewport. Narrow layouts, screen readers, clean devices, other browsers, large external models and real practitioners were not exercised. The public deployed version received startup/version inspection, not this entire edited workflow. The older deployed artifact remains unchanged.

## Human trial still to observe

1. On an agreed qualified artifact, let an engineer unfamiliar with this exercise open their own non-TREP source/project without coaching. Record whether they understand occurrence versus definition and can locate both room/probe occurrences.
2. Have them identify the changed minimum of three and retained capacity of two, inspect a source witness, and explain the declared shortfall without interpreting planned verification as a passed test.
3. Ask them to create or rename a useful view, save the editable project to a known location, close it, and reopen that actual file. Observe whether view/depth/search/reading context is useful and understandable.
4. Have them export and explain the frozen reader, including scope limits, unresolved acknowledgement/restoration decisions, and lack of execution/acceptance evidence.
5. Separately record a cold-browser/device trial and any intended narrow-screen/accessibility needs. If public trial is desired, decide and qualify a current-main artifact for promotion in a separately authorized release slice; this check did not deploy one.

## Preservation and cleanup

The verification slice wrote only generated/ignored build outputs and its local evidence folder. This closeout now retains the selected evidence in the product repository. Shared Second Brain, Systems Visuals, Archify and unified-visuals were left unchanged. Archived tags, recovery bundles and re-audit WIP were not modified. No code repair was needed. The subsequent documentation closeout is reviewed and merged separately with GitHub Actions disabled during publication. Temporary preview/static servers are stopped after evidence capture. Original downloads remain in Downloads alongside the copied evidence.

## Frozen candidate and publication

The [retained workflow candidate](https://github.com/haitaowu12/sysmlv2_viewer/releases/tag/modeling-lab-workflow-2026-10-22-r1) freezes source 9e07237 and content ac6487bddb20. It is a prerelease artifact, not a public Pages promotion. The downloaded successful main candidate from run [39695429537](https://github.com/haitaowu12/sysmlv2_viewer/actions/runs/39695429537) and the locally browser-tested distribution match byte-for-byte across all 75 manifest entries. Both complete inventories and every listed length/SHA-256 passed verification. The archive is packaged from the downloaded artifact without rebuilding. The immediately preceding live overview archive is retained alongside it.

The user's October 22 instruction requires publication without GitHub Actions. The repository Pages profile is `workflow`; its deployment workflow requires an Actions-issued OIDC token. The [GitHub Pages deployment API](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-deployment) likewise requires that token. No token was fabricated, deployment policy changed, or workflow dispatched. The live URL remains on its previously observed October 16 version. A future explicitly authorized promotion can use the retained source revision and run ID without rebuilding; it must retain the missing human/device/resource acceptance boundaries above.
