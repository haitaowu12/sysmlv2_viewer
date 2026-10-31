---
name: frontend-skill
description: Design and implement websites, apps, dashboards, prototypes, and games. Use for new frontends, substantial redesign, or repeated complaints about generic design, weak hierarchy, and polishing without improvement. Carry a coherent product direction through working states and rendered review. Keep narrow fixes narrow.
---

# Frontend design and delivery

Act as the product designer and frontend implementer for the requested surface. Own the information architecture, visual language, interaction and final rendered result together. The development-workflow capability remains the owner. The [delivery guide](references/ui-design-delivery.md) holds detailed checks; use the affected branch rather than loading every donor.

## Start with the decision the user needs to make

Read the actual project, current screen and content. Establish who uses it, their primary job, the objects they work on, the next consequential action, and the states that change that action. Retain factual qualifications, units, routes and working behavior. Use the project's design record if it exists; do not create a competing dossier.

Classify the change: local correction, new surface, flow repair or redesign. Repeated rejection of the design is evidence to reconsider its composition and visual language. Do not preserve a rejected shell merely because it is implemented, and do not interpret a small bug fix as permission to redesign.

## Resolve the design before multiplying screens

For a new or substantially redesigned surface, use [product design practice](references/product-design-practice.md). Resolve these connected decisions on one representative slice with real content:

1. **Structure:** what the user sees first, where they do the work, and where supporting detail belongs. Select navigation and layout from the task; a style-library draw cannot select product structure.
2. **Expression:** choose a coherent combination of typography, density, alignment, surface treatment, color roles, icons/imagery and state feedback. Explain its fit in one sentence. Preserve an accepted brand; when direction is open or the user supplies inspiration, use the [reference source guide](references/ui-direction-decisions.md#reference-sources-and-evidence) to select exact examples and translate their useful relationships. Distinguish style, screen structure and task flow; a gallery link or generated design document is not evidence of inspected behavior.
3. **Interaction:** show how the primary action changes the object and what happens with empty, partial, invalid or failing input. Use representative labels and data before assessing the layout.

Make alternatives only for an unresolved choice. Change their structure or emphasis while keeping task, content and constraints equal; recoloring the same shell does not answer a composition question. Inspect the actual alternatives before selecting and extending one; a later screenshot cannot support an earlier visual choice. Choose within the user's authorization and proceed. Ask only when the unresolved choice belongs to the user. Optional [direction studies](references/ui-direction-decisions.md) support this decision; there is no fixed style, candidate, image or animation quota.

## Build the chosen slice to completion, then extend

Implement the actual primary flow before repeating its shell across the product. Reuse the project's stack, accessible primitives and tokens. Give equivalent actions equivalent presentation; make status, selection, focus and disabled behavior distinguishable. Keep calculations and repeated values source-driven. An attractive empty shell or invented proof is not a usable slice.

Inspect the rendered slice at actual reading size and a narrow layout. Ask: can the intended user identify the current object/state, understand the primary action, and complete it without knowing the implementation? Read the smallest essential labels, reasons, values and qualifications independently of the display heading. Check that the action names what it does and that summaries leave the working content within useful reach. For an explanation, connect the claim or step to a concrete example. Use the [task-specific checks](references/product-design-practice.md#check-the-working-content) for the observed gap. A screenshot captured but not examined supplies no verdict.

If the structure fails that task, change it before adjusting colors, shadows or radii. If structure works but expression is generic or inconsistent, correct the specific type, alignment, rhythm, imagery or component relationships that fail the direction. Preserve justified distinctive choices through later cleanup. A donor's bans or self-score do not decide this.

## Finish and report the evidence

Exercise the primary journey, relevant failure/recovery and keyboard/narrow states after the final visual edit. Use the project's build and test requirements. Apply the [evidence contract](references/evidence-qa-contract.md); a missing browser, skipped check or unavailable backend remains unverified.

Report what changed, which task and visible design decisions improved, what was inspected/exercised, and remaining limits. Separate implementation, visual judgment, interaction verification and deployment. Owner preference remains owner judgment. Do not claim universal improvement from one fixture, a generated style sheet, skill availability or passing unit tests.

## Availability across projects

This source is not automatically installed in every host or repository. In the canonical repository, the maintained scripts/frontend_capsule.py exporter bundles this entry point and its core references into a project's .agents/skills/frontend-skill. Link it from that project's instructions. Its check establishes file/dependency availability and drift only; it does not establish model invocation or design acceptance. Optional donor/reference links in an exported capsule may require source access.

