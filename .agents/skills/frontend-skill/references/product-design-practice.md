# Product design practice

Use for a new frontend, substantial redesign, or design stalled in repeated cosmetic revisions. This is the working method under the existing frontend entry point. Load deeper donor material only to answer an unresolved question. A narrow correction reuses the accepted direction.

## Make the product legible before decorating it

Write the primary job as an action with an outcome: “compare two allocations and find the limiting section”, not “view a dashboard”. Identify the objects, decisions, evidence and consequences involved. Use their names in navigation and controls. Name consequential actions with a verb and object or explicit destination; a status or priority label alone does not explain what a clickable control will do. Where a flow has distinct levels, name the return destination and preserve the invoking context. Put the object of work in the dominant region; support it with controls and context in the order needed.

For an operational application, decide whether the task needs a queue/detail view, document/editor, comparison, spatial canvas or sequential form. These are possibilities, not templates. Keep navigation about destinations, controls about actions, and status about the current object. Persistent inspectors earn their space when they help the current action; secondary detail may belong in disclosure or a dedicated view. Marketing instead needs an honest proposition, subject-specific proof and an action; reading needs a reading sequence and navigation.

Build with plausible full content, not just short labels and ideal totals. Include a long title, missing value, zero where meaningful and the state that changes the next action. Preserve essential uncertainty and provenance. Removing a warning to make a candidate cleaner changes the problem rather than solving the design.

## Establish a coherent visual language

Choose relationships that can recur across the product. Define tokens and components in the existing system, and show them in the representative slice:

| Design decision | What to establish in the rendered result |
|---|---|
| Typography | Distinct heading, reading, label and numeric roles; intentional line breaks; suitable measure and line height; tabular numbers for comparisons. Confirm the intended font loads. |
| Layout and rhythm | Shared alignment; proximity that communicates grouping; spacing that distinguishes sections from related items. A box is useful when its boundary carries meaning. |
| Density | Information needed for the task, comfortable controls and readable labels. Do not replace a comparison table with large cards merely to add whitespace. |
| Color and surfaces | Content layers, interaction emphasis and semantic states with separate roles. Use contrast and text/icon cues for meaning. Avoid making every number, badge and button compete. |
| Identity and assets | One recognizable approach fitting the subject: editorial type, measured technical precision, tactile materials, expressive illustration, or another justified choice. Imagery contributes subject or information; retain source notices. |
| Interaction grammar | Consistent controls, selected/current state, focus, feedback, error and recovery. Motion explains a change or supports the requested experience; it is optional. |

Professional appearance is a judgment about these relationships in context. It is not synonymous with minimalism, dark mode, a particular font, fewer colors or banning familiar components. A branded page may be expressive; an engineering tool may be quiet and dense. The product should look authored for its content rather than interchangeable with an unrelated brief.

## Check the working content

Apply the relevant check to the representative slice, using the existing components and design record. These checks do not require a separate specimen page or a new design dossier.

- **Reading size:** inspect an actual action, reason, qualification, identifier and compared value at their rendered sizes, including the tightest supported layout. If type choice is unresolved, compare that same content in a small rendered specimen before changing the type system. Check weight, line breaks, required glyphs, ambiguous identifiers such as I/l/1 and O/0, and numeric alignment where relevant. A large headline does not compensate for unreadable working text. Adjust the failing size, contrast or relationship; retain the accepted typeface when it works.
- **Useful density:** on a narrow working view, inspect the route from the heading and controls to the first useful object and its action. Compress repeated summaries, ornamental framing or unnecessary vertical gaps before shrinking essential text. Keep the fields needed for the current comparison together. Preserve context and touch/keyboard access; there is no universal row count or above-the-fold quota.
- **Evidence beside explanation:** when explaining a workflow or capability, pair the claim or step with the specific record, source fragment or implemented UI state that demonstrates it. Label synthetic examples. Keep the proposition and primary action easy to find; a large preview should earn its space through what it explains. Do not invent proof to fill a visual.
- **State-specific copy:** distinguish no data, no matches, completed work, loading failure and missing access. Name what is unavailable and an implemented next action. On failure, state what failed, a cause only when known, and what happened to entered work. Never infer successful completion or normal operation from an empty list, or promise recovery or persistence the product does not implement.

## Use references to resolve a choice

Inspect current pixels from an accepted project reference or relevant source. Note which relationship helps the task, what the image shows, and what remains inferred. Translate it into current content and constraints. A link, style name or remembered appearance is not an inspected reference. If source access is unavailable, state it and use accepted local design; do not invent a benchmark inspection.

When the first approach is unresolved, make small alternatives of the difficult slice. Vary workspace organization, hierarchy, reading rhythm or imagery strategy. Keep required information and state equal. Inspect their rendered differences before selecting by task clarity, content fit and coherence, then carry that decision through. A direction name or an unexplored sketch does not establish a visual comparison. Avoid building several finished products or asking the user to approve routine typography choices.

## Distinguish a product problem from a cosmetic problem

Review the first complete slice before scaling it. A developer should not need to explain where the work happens. Read the screen as a new user, attempt its primary action, and inspect the resulting state. Check populated and relevant non-ideal states. For example:

- A blank result area explains what is missing and offers the next implemented action; empty metrics do not dominate the work.
- A review queue connects a decision to supporting evidence and consequence; badge counts alone do not do that job.
- A form exposes the fields a practitioner uses; JSON is an advanced format, not a substitute for domain authoring unless that is the brief.
- A comparison aligns equivalent quantities, distinguishes missing from zero, and retains units and qualifications where used.

If this pass exposes a task failure, repair composition or interaction before decorative polish. If expression is weak, name the visible relationship to change. “Make it premium” is not a correction. If a reference's hero dominates an operational task, reject that transfer even if the reference is attractive.

## Accept the result on available evidence

Inspect final pixels at reading size and the intended narrow layout; exercise the affected flow after the final change. Evaluate task clarity, hierarchy, typography, coherence and state coverage separately from functional assertions. State preferences as judgments supported by locations and observed relationships, not numerical beauty scores.

For a requested audit or recurring disputed design outcome, give an isolated image-capable reviewer the original brief, constraints and current screenshots. Withhold the author's defense until initial observations are recorded. Verify corrections and preserve choices that serve the product. If the reviewer or browser is unavailable, report the limit; do not award an independent pass.

Do not stop at “the style sheet exists” or “UI tests pass”. Stop when the requested slice meets its task and design criteria, or state the unresolved criterion and why it could not be completed. A bounded optional styling pass limits preference churn; it does not make a visibly unmet brief accepted work.

## Source basis

This synthesis retains adopted mechanisms and applies the 29 October 2026 source review: [Taste](https://github.com/Leonxlnx/taste-skill/tree/12af471f627f866411b4bd785b19646d3672784c), [Anthropic frontend-design](https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/frontend-design), [Huashu](https://github.com/alchaincyf/huashu-design/tree/4fc7bfdbd5ec3fa2d43ce7a6433de60976a5e4b1), and [Oil UI](https://github.com/oil-oil/oil-ui/tree/e3334bd5f6e700d21ac275b169ceee6495db9391). It does not import runtimes, mandatory aesthetic bans, image/motion quotas, approval rituals or test-skipping advice. Popularity and donor self-tests do not establish improved results here.

The 30 October targeted extension uses donor strengths observed in the [matched comparison](https://github.com/haitaowu12/tonys-second-brain/blob/0595f46dfbe0a47a2d89b1f302176dde2adb08fb/docs/frontend-delivery/comparisons/2026-10-30/README.md) and selected source mechanisms from [Web Typography](https://github.com/wondelai/skills/blob/c172996495bed0fcd26896a9416b2093fd7073f0/web-typography/references/evaluating-typefaces.md), [UX Writing](https://github.com/content-designer/ux-writing-skill/tree/98cacde4ba2dd10ed28df43a8d53eef1e321c539/templates), and [Interface Design](https://github.com/Dammyjay93/interface-design/blob/2f9be3206855bcb2d1d0af262c8bae25cba6658d/.claude/skills/interface-design/SKILL.md). It adopts actual-content type inspection, explicit actions/state copy and rendered component decisions. Donor scores, fixed numerical style recipes, universal novelty requirements and extra approval/persistence workflows are excluded. Source adoption is not evidence of general improvement.
