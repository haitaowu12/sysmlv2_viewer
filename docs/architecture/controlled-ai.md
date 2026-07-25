# Controlled AI Safety Contract

Version: `1.0.0`

## Authority

SysML/KerML source and deterministic language-service results remain
authoritative. The AI orchestrator is a proposal and explanation boundary. It
is not a parser, semantic authority, diagnostic authority, or source writer.

An AI operation has four distinct actors:

1. the user issues a bounded request;
2. a registered provider can call narrow semantic tools;
3. the command engine produces and validates a source patch;
4. a user separately approves that exact validated proposal.

The provider cannot perform step 4.

## Provider-visible tools

The complete provider-visible registry is:

| Tool | Scope | Mutating |
|---|---|---:|
| `search_elements` | bounded name/kind search over semantic metadata | no |
| `get_element` | one stable identity | no |
| `get_relationships` | bounded normalized neighbourhood | no |
| `get_requirements` | requirements projection | no |
| `get_verification` | verification projection | no |
| `get_interfaces` | interface projection | no |
| `get_diagnostics` | deterministic language diagnostics | no |
| `run_model_query` | validated bounded query | no |
| `compare_baselines` | one named semantic baseline comparison | no |
| `propose_commands` | typed-command policy check | no |
| `validate_commands` | authoritative patch/diff validation | no |
| `apply_approved_commands` | apply prior proposal with user approval | yes |

The provider proxy always rejects `apply_approved_commands`. The orchestrator
invokes that tool only during a separate `ai/apply` request containing a
user-kind approval and matching operation, workspace, and proposal identities.

There is no raw file-read, file-write, shell, Git mutation, network, arbitrary
query, or repository traversal tool. Semantic elements expose identity, kind,
qualified name, source range, and fingerprints; they do not expose full source
documents.

## Grounding and validation

- Every provider citation must resolve in the request snapshot.
- Unknown citations reject the operation and are included in the audit.
- The current profile accepts one typed command per approval.
- The command engine validates base snapshot and document hashes, source-edit
  bounds, diagnostics, semantic diff, conflicts, and undo.
- Provider execution and command validation leave canonical files byte-exact.
- An approval after restart revalidates the stored envelope. Exact source edits,
  affected identities, diagnostics, and semantic change identities must match
  the audited proposal.
- If the workspace changed, validation changed, or an identity is ambiguous,
  apply fails and a new proposal is required.

## Network and credentials

The installed default provider is `local-deterministic`. It is offline and
uses a small explicit request grammar for grounded search and rename
proposals. It does not claim generative reasoning.

External providers:

- are not registered in the production service by default;
- are disabled by policy even if a provider object or credential exists;
- require a server-side adapter plus `allowNetworkAi: true`;
- require explicit provider selection in the user request;
- never receive browser-held credentials;
- must declare `networkAccess: true`, which drives the visible network state;
- remain subject to identical citation, command, approval, and audit rules.

No external provider adapter ships in the Gate P6 profile. Adding one requires
provider-specific privacy, retention, redaction, timeout, rate-limit, and
contract tests.

## Audit

Each attempted operation is stored under:

```text
.sysml-workbench/audit/ai/<operationId>.json
```

The canonical JSON record contains:

- user request, actor, and timestamp;
- workspace and snapshot hash;
- optional baseline;
- provider id, model, and network posture;
- tool names plus hashes of tool inputs/results;
- stable citations and assumptions;
- typed command and source-edit proposal;
- affected identities;
- deterministic diagnostics and semantic diff;
- rejection reasons or approval;
- transaction receipt;
- record SHA-256.

Full source documents, provider credentials, hidden prompts, and chain-of-
thought are not recorded. Audit paths reject traversal and directories that
resolve outside the workspace.

## Retired behavior

The legacy `/api/ai/generate-model` and `/api/ai/edit-model` whole-document
mutation paths are removed. Requests receive `410 Gone` and direct clients to
the paired Workbench Service `ai/request` then `ai/apply` flow.

## Current limitations

- One typed command is allowed per operation. Multi-command atomic proposals
  wait for a composite command transaction.
- Only the offline deterministic provider ships.
- Answers are grounded in normalized semantics and diagnostics; unsupported
  language semantics remain unavailable.
- Audit records are local project artifacts. Retention policy UI and OS-keystore
  provider credentials are Gate P7 work.
