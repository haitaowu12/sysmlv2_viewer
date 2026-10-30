# UI design and delivery

Use the relevant parts for frontend implementation or refinement. Backend-only tasks skip this reference; audit-only tasks stay read-only under quality-verification. The [frontend entry point](../SKILL.md) and its [product design practice](product-design-practice.md) carry the working sequence; deeper donor links below are optional references for an unresolved gap. This is an outcome contract, not a mandatory sequence of agents or tools.

## Intent and boundaries

Read the target surface, related components, tokens, assets, installed dependencies, and task-relevant project instructions. Establish the primary user task, visual priority, relevant states, and what must remain unchanged. Resolve routine design choices from that evidence and continue; ask only about a material choice that cannot be resolved from the authorized brief.

Refinement preserves existing identity, factual copy, routes, and behavior outside scope. Redesign replaces the visual direction only when requested. A missing DESIGN.md does not make an existing product greenfield. Use existing project records rather than creating competing context files or requesting a new brief for every edit.

Repeated rejection of the design or churn through cosmetic revisions is evidence to revisit composition and expression within the requested scope. Do not classify that request as a narrow polish pass merely to preserve an implemented shell. Resolve task, visual language and interaction on a representative slice before extending it.

Choose composition for purpose: marketing may need one defining section; an operational tool needs readable controls, state, and results; reading needs structure and navigation. A learning game's artwork and feedback must match its progression and learning task. Honor a specified aesthetic; do not impose novelty, huge headlines, arbitrary whitespace percentages, or a universal component ban.

For a substantial surface, retain audience, primary task, actual content, useful density, hierarchy, preserved identity, reusable components, imagery provenance, meaningful states, motion policy and output/editability in the existing project contract. For a small refinement, reuse established decisions; no fresh dossier or approval cycle is required.

For a new or substantially redesigned app, resolve the working composition with a representative domain task and its actual content before extending a generic shell across the product. A practitioner-facing editor must expose the fields and relationships needed for that task; a generic record form or raw JSON is insufficient when ordinary work requires understanding the storage schema. Raw structures may remain appropriate for developer tools or an explicit advanced workflow. Likewise, an uncomputed or stale state should give priority to the required setup or recovery action; keep essential result status visible without letting empty metrics and chart scaffolding displace the work. Preserve quantity definitions, qualifications and accessible labels when simplifying.

## Reuse and references

For a substantial explanatory interaction or sequence, use [Plan an explanation](https://github.com/haitaowu12/tonys-second-brain/blob/3edda779472d71d8d002d72e873031eb2969249e/resources/tools/art-motion/explainer-planning.md) to connect the audience outcome, stable visual objects, source evidence and comprehension checks. Apply it when the surface teaches a mechanism or decision; ordinary operational controls do not need a story arc.

Prefer the project's tokens and components, then approved primitives. Consult the optional [UI toolkit](https://github.com/haitaowu12/tonys-second-brain/blob/3edda779472d71d8d002d72e873031eb2969249e/.agent/skills/development-workflow/references/ui-toolkit.md) only when choosing an external pattern, component, or design method. Browse a small number of references when there is an unresolved gap, not for every button. Adapt the useful pattern rather than importing a whole demonstration page. Preserve real copy and content; do not invent testimonials, product claims, or unavailable assets.

For a specific typography/layout, resilience/localization, task-review or selected-reference fidelity gap, use the [Impeccable adaptation](https://github.com/haitaowu12/tonys-second-brain/blob/3edda779472d71d8d002d72e873031eb2969249e/resources/methods/skill-mechanisms/impeccable/METHOD.md) and load only its relevant branch. It adds concrete diagnosis and checks within this delivery flow; substantial open direction continues through the existing methods below.

Inspect reuse permission, framework/base-library compatibility, dependencies, keyboard/focus behavior, responsive states, and maintenance cost before adopting external code. Unknown permission is not permission to copy. An unavailable provider is not a blocker when the local stack can satisfy the task. Do not install provider runtimes, change accounts, or upload private context as a side effect of gathering inspiration.

When studying a supplied reference, separate observed layout, type roles, spacing relationships and palette from estimated dimensions or unverified fonts. A declared font is not proof it loaded; a screenshot is not evidence that an interaction or animation works. Generated concept images cannot establish factual copy, exact geometry, accessibility or tested components.

For a substantial unresolved visual direction or a requested comparison, use [Evidence-led UI direction decisions](ui-direction-decisions.md) for category-based benchmark decomposition and reviewable selection evidence. Existing identity and the authorized brief constrain this branch; narrow corrections skip it. Reuse the current prototype mechanism instead of creating a parallel exploration workflow.

For substantial open UI direction, optionally consult [Taste page/app design](https://github.com/haitaowu12/tonys-second-brain/blob/3edda779472d71d8d002d72e873031eb2969249e/resources/methods/skill-mechanisms/taste-design/METHOD.md). Public pages inventory distinctive subject material and order claims with proof. App screens use the separate data/job inventory, primary question/finding, app style/shell/screen library, product identity, density and state method. The offline adapter executes both complete libraries; the method reaches their detailed references and working starters. Existing task, brand, content, components and accessibility govern the result; narrow corrections and locked refinements skip the draw.

For visual references or converging first ideas in that branch, optionally consult [Huashu specimens and exploration](https://github.com/haitaowu12/tonys-second-brain/blob/3edda779472d71d8d002d72e873031eb2969249e/resources/methods/skill-mechanisms/huashu-design/METHOD.md): actual image/HTML studies across five media groups, broader small studies before refinement, same-medium reference inspection and app presentation composition. Reuse the existing brief, Taste candidates and decision record; no second direction lottery or fixed candidate quota is required.

## Finish the requested surface

Build the requested behavior and inspect the rendered result without waiting for another polish request. Diagnose the observed issue before correcting it:

| Observation | Correction | Preserve/check |
|---|---|---|
| Labels or feedback conceal the next step | Clarify | Purpose, outcome, and recovery |
| A title, badge, description or helper text repeats the same information | Remove the redundant instance | Accessible names, units, scope and material qualifications |
| Competing regions obscure the task | Distill | Required information and actions |
| Cards within cards add boundaries without a distinct task or scope | Flatten the grouping; try spacing, alignment or a divider | Meaningful relationships, interaction boundaries and reading order |
| Secondary explanation crowds the working view | Move detail to discoverable disclosure | Essential state and decision information remain visible; details work by keyboard and touch |
| Intended focal point is weak | Increase emphasis | Legibility and the requested identity |
| Decoration dominates | Reduce emphasis | Meaning and the primary task |
| Alignment, spacing, typography, or states drift | Polish | Existing tokens and component patterns |
| Empty, slow, failing, or retry states break | Harden | Relevant input and recovery behavior |

These are alternatives, not a sequence of required passes or installed commands. Confirm basic behavior before decorative work. Inspect relevant device classes together, batch justified visual corrections, then confirm. Stop optional styling iteration when the brief is met or that bounded pass is spent; unresolved functional or accessibility blockers remain blockers. Extend testing only for changed inputs, a new failure, or a concrete risk.

Use the [UI evidence contract](evidence-qa-contract.md). Verify affected interactions after visual changes, not just the screenshot. Missing runtime access is an explicit evidence gap, not permission to fabricate a pass or abandon independent implementation.

Meaningful content must remain reachable with motion disabled, at narrow widths and with longer or Chinese labels. Skipping an animation while leaving panels off-screen is a failure; overflow clipping is not a repair. Use static flow or a tested accessible alternative. Preserve entered values and valid partial results on failure, and offer only recovery actions implemented by the product. Add offline/conflict handling only where its actual task requires it.

For changed custom Enter shortcuts, responsive relocation of stateful DOM, or a demonstrated slow interaction, use [Browser interaction details](https://github.com/haitaowu12/tonys-second-brain/blob/3edda779472d71d8d002d72e873031eb2969249e/resources/methods/skill-mechanisms/modern-web-interactions/METHOD.md). It adds IME composition checks, explicit state-preserving relocation outcomes and trace-phase diagnosis. Load only the affected branch; it does not establish model/date correctness, persistence or support in an untested browser.

For a data-loading waterfall, repeated server work, redundant render state or bundle/startup issue, use [Async work and render state](https://github.com/haitaowu12/tonys-second-brain/blob/3edda779472d71d8d002d72e873031eb2969249e/.agent/skills/development-workflow/references/async-work-and-render-state.md): dependency-aware scheduling, failure/authorization edges, request/cache lifetime and production-build inspection. Load for the demonstrated issue rather than applying a blanket optimization pass.

## Completion and handoff

Done means the authorized change is implemented, its rendered result inspected where possible, affected behavior checked, and unresolved limits disclosed. For a substantial UI delivery, assess the visible hierarchy, useful density, type roles and primary affordance against the selected task and direction at actual reading size. A generated style sheet, screenshot capture, lack of overflow or passing functional tests does not by itself establish design acceptance. If a generic shell still conceals the domain task, correct that composition within scope before describing the design as complete; disclose any remaining gap. Use the existing completion note: changed files, design decision, preserved constraints, references actually used, evidence, and remaining defects. Keep implemented, visually inspected, interaction-verified, and released states separate. Add independent review only for a requested audit, material risk, or disputed evidence.

When independent visual review is already justified, use the [current-pixels critique handoff](ui-direction-decisions.md#3-independent-critique-starts-from-current-pixels): current screenshots and constraints first, impact-ranked observable findings, and one or two choices to preserve. This does not add a reviewer to routine edits.

UX concerns task understanding and completion; DX concerns maintaining and testing the implementation; AX here concerns the next agent finding the owning code, decisions, and evidence. Accessibility is a separate requirement. Never trade required behavior, security, factual content, or accessibility for a subjective visual score.

For task-prompt calibration and source provenance, consult the optional [UI toolkit](https://github.com/haitaowu12/tonys-second-brain/blob/3edda779472d71d8d002d72e873031eb2969249e/.agent/skills/development-workflow/references/ui-toolkit.md). For evaluating this method, use [UI design evaluation](https://github.com/haitaowu12/tonys-second-brain/blob/3edda779472d71d8d002d72e873031eb2969249e/.agent/skills/development-workflow/references/ui-design-evaluation.md); it is not a prerequisite for ordinary UI tasks.

