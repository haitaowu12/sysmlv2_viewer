# SysML Viewer (Enhanced)

A SysML v2 editor with synchronized Draw.io visualization and in-app AI-assisted model generation/editing.

## What changed

This workspace now includes:

- Bidirectional SysML v2 <-> Draw.io synchronization (structural V1 subset)
- Interactive Draw.io embed tab in the main UI
- View-scoped Draw.io generation mode (`General`, `Interconnection`, `Requirements`, `Verification`, `All`)
- Hybrid patch safety flow (`safe` auto-apply, `review_required` manual)
- Export support for `.sysml`, `.drawio`, `.svg`, `.png`
- In-app AI chat panel with BYOK provider headers and local fallback generator
- API endpoints:
  - `POST /api/ai/generate-model`
  - `POST /api/ai/edit-model`
  - `POST /api/validate/drawio`
  - `GET /api/health`

## Launch the updated app

From this folder:

```bash
npm install
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:5173/sysmlv2_viewer/`).

### Confirm you are in the enhanced build

1. Top toolbar shows a `Draw.io` button (`🧩`).
2. View tabs include `Draw.io`.
3. Right panel has `AI Chat` tab.
4. Export format selector includes `.drawio`, `.svg`, `.png`.
5. Draw.io toolbar includes a view selector so diagrams stay logically grouped by concern.

If these are missing, you are likely running a different project or an old deployed build.

## Shortcuts

- Open Draw.io bridge: `Ctrl/Cmd + Shift + D`
- Open AI chat panel: `Ctrl/Cmd + Shift + I`

## Scope status

V1 focuses on structural roundtrip for:

- `Package`, `PartDef`, `PartUsage`, `PortDef`, `PortUsage`, `ConnectionUsage`
- `RequirementDef`, `RequirementUsage`, `satisfy`
- `VerificationDef`, `VerificationUsage`, `verify`

SysML text remains canonical semantics; visual/layout edits are synchronized with patch safety classification.
