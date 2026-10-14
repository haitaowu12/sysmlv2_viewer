#!/usr/bin/env python3
"""Hash the deliberately registered maintained source inventory; never discover exports."""
import hashlib
import json
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
# Register a reviewed maintained file here before regenerating its integrity hash.
# Exact paths are intentional: a new file beside a fixture is not an export choice.
SOURCE_PATHS = (
    'LOCAL-HANDOFF.md',
    'workbench/fixtures/authoring/alarm-review/reviewed.modeling.json',
    'workbench/fixtures/authoring/alarm-review/review.html',
    'workbench/fixtures/authoring/alarm-review/contract.json',
    'workbench/fixtures/authoring/alarm-review/README.md',
    'workbench/fixtures/authoring/alarm-review/brief.md',
    'workbench/fixtures/authoring/alarm-review/model.sysml',
    'workbench/fixtures/authoring/alarm-review/views.json',
    'workbench/fixtures/authoring/alarm-review/starter.modeling.json',
    'workbench/fixtures/authoring/alarm-review/expected-facts.json',
    'workbench/tools/reference-pilot/test_check_contributor_pilot.py',
    'workbench/tools/reference-pilot/test_contributor_export_cli.py',
    'workbench/tools/reference-pilot/test_contributor_export.py',
    'workbench/tools/reference-pilot/check_contributor_pilot.py',
    'workbench/tools/reference-pilot/contributor_export_cli.py',
    'workbench/tools/reference-pilot/contributor_export.py',
    'workbench/fixtures/contributor-pilot/model.sysml',
    'workbench/fixtures/contributor-pilot/inputs/interface-register-b.csv',
    'workbench/fixtures/contributor-pilot/inputs/interface-register-a.csv',
    'workbench/fixtures/contributor-pilot/inputs/brief.md',
    'workbench/fixtures/contributor-pilot/expected-facts.json',
    'workbench/fixtures/contributor-pilot/contributor.json',
    'workbench/fixtures/contributor-pilot/cases/undo-reopen.json',
    'workbench/fixtures/contributor-pilot/cases/stale-base.json',
    'workbench/fixtures/contributor-pilot/cases/invalid-unit.json',
    'workbench/fixtures/contributor-pilot/cases/invalid-reference.json',
    'workbench/fixtures/contributor-pilot/cases/candidate-proposal.json',
    'workbench/fixtures/contributor-pilot/candidate-model.sysml',
    'workbench/fixtures/contributor-pilot/acceptance-contract.json',
    'workbench/fixtures/contributor-pilot/README.md',
    'workbench/tools/reference-pilot/behavior.py',
    'workbench/tools/reference-pilot/test_behavior.py',
    'workbench/fixtures/language/public-projection/source-manifest.json',
    'workbench/fixtures/language/public-projection/flashlight-views.json',
    'workbench/fixtures/language/public-projection/vehicle-views.json',
    'workbench/fixtures/authoring/parcel-sorter/run_change.py',
    'workbench/fixtures/authoring/parcel-sorter/README.md',
    'workbench/fixtures/authoring/parcel-sorter/decisions.json',
    'workbench/fixtures/authoring/parcel-sorter/evidence.json',
    'workbench/fixtures/authoring/parcel-sorter/expected-facts.json',
    'workbench/fixtures/authoring/parcel-sorter/intake.json',
    'workbench/fixtures/authoring/parcel-sorter/model.sysml',
    'workbench/fixtures/authoring/parcel-sorter/sources/brief.md',
    'workbench/fixtures/authoring/parcel-sorter/sources/dialogue.md',
    'workbench/fixtures/authoring/parcel-sorter/sources/interfaces-r1.csv',
    'workbench/fixtures/authoring/parcel-sorter/views.json',
    'workbench/fixtures/authoring/parcel-sorter-inputs/README.md',
    'workbench/fixtures/authoring/parcel-sorter-inputs/brief.md',
    'workbench/fixtures/authoring/parcel-sorter-inputs/dialogue.md',
    'workbench/fixtures/authoring/parcel-sorter-inputs/evaluation.json',
    'workbench/fixtures/authoring/parcel-sorter-inputs/freeze-manifest.json',
    'workbench/fixtures/authoring/parcel-sorter-inputs/interfaces-r1.csv',
    'workbench/fixtures/authoring/parcel-sorter-inputs/interfaces-r2.csv',
    'workbench/fixtures/authoring/parcel-sorter-inputs/lifecycle.json',
    'workbench/fixtures/language/pro-review/capacity-membership.expected.json',
    'workbench/fixtures/language/pro-review/capacity-membership.sysml',
    'workbench/fixtures/language/pro-review/documentation-ownership.expected.json',
    'workbench/fixtures/language/pro-review/documentation-ownership.sysml',
    'workbench/fixtures/language/pro-review/signed-satisfaction.expected.json',
    'workbench/fixtures/language/pro-review/signed-satisfaction.sysml',
    'workbench/tools/reference-pilot/change_summary.py',
    'workbench/tools/reference-pilot/evolution.py',
    'workbench/tools/reference-pilot/report_integrity.py',
    'workbench/tools/reference-pilot/test_acceptance.py',
    'workbench/tools/reference-pilot/test_agent_context.py',
    'workbench/tools/reference-pilot/test_change_summary.py',
    'workbench/tools/reference-pilot/test_evolution.py',
    'workbench/tools/reference-pilot/test_report_integrity.py',
    'workbench/tools/reference-pilot/test_parcel_sorter.py',
    '.gitignore',
    'LICENSE',
    'NOTICE',
    'PACKAGE.md',
    'SKILL.md',
    'references/authoring.md',
    'references/collaborative-method.md',
    'references/validated-syntax.md',
    'scripts/package_manifest.py',
    'scripts/sysml.py',
    'workbench/.npmrc',
    'workbench/config/reference-pilot-lock.json',
    'workbench/fixtures/authoring/cooler/README.md',
    'workbench/fixtures/authoring/cooler/architecture/evidence-contract.json',
    'workbench/fixtures/authoring/cooler/architecture/evidence.json',
    'workbench/fixtures/authoring/cooler/architecture/expected-facts.json',
    'workbench/fixtures/authoring/cooler/architecture/input.md',
    'workbench/fixtures/authoring/cooler/architecture/intake.json',
    'workbench/fixtures/authoring/cooler/architecture/model.sysml',
    'workbench/fixtures/authoring/cooler/architecture/views.json',
    'workbench/fixtures/authoring/cooler/contract.json',
    'workbench/fixtures/authoring/cooler/conversation/evidence-contract.json',
    'workbench/fixtures/authoring/cooler/conversation/evidence.json',
    'workbench/fixtures/authoring/cooler/conversation/expected-facts.json',
    'workbench/fixtures/authoring/cooler/conversation/input.md',
    'workbench/fixtures/authoring/cooler/conversation/intake.json',
    'workbench/fixtures/authoring/cooler/conversation/model.sysml',
    'workbench/fixtures/authoring/cooler/conversation/views.json',
    'workbench/fixtures/authoring/cooler/interfaces/evidence-contract.json',
    'workbench/fixtures/authoring/cooler/interfaces/evidence.json',
    'workbench/fixtures/authoring/cooler/interfaces/expected-facts.json',
    'workbench/fixtures/authoring/cooler/interfaces/input.csv',
    'workbench/fixtures/authoring/cooler/interfaces/intake.json',
    'workbench/fixtures/authoring/cooler/interfaces/model.sysml',
    'workbench/fixtures/authoring/cooler/interfaces/request.md',
    'workbench/fixtures/authoring/cooler/interfaces/views.json',
    'workbench/fixtures/authoring/pump-station/README.md',
    'workbench/fixtures/authoring/pump-station/architecture.txt',
    'workbench/fixtures/authoring/pump-station/contract.json',
    'workbench/fixtures/authoring/pump-station/decisions-unresolved.json',
    'workbench/fixtures/authoring/pump-station/decisions.json',
    'workbench/fixtures/authoring/pump-station/evidence-contract.json',
    'workbench/fixtures/authoring/pump-station/evolution/candidate-contract.json',
    'workbench/fixtures/authoring/pump-station/evolution/proposal.json',
    'workbench/fixtures/authoring/pump-station/evolution/threshold-request.md',
    'workbench/fixtures/authoring/pump-station/fact-support.json',
    'workbench/fixtures/authoring/pump-station/intake.json',
    'workbench/fixtures/authoring/pump-station/interfaces.csv',
    'workbench/fixtures/authoring/pump-station/model.sysml',
    'workbench/fixtures/authoring/pump-station/package-unresolved.json',
    'workbench/fixtures/authoring/pump-station/package.json',
    'workbench/fixtures/authoring/pump-station/reviews.json',
    'workbench/fixtures/authoring/pump-station/views.json',
    'workbench/fixtures/authoring/pump-station/workshop.txt',
    'workbench/fixtures/language/community-review/README.md',
    'workbench/fixtures/language/community-review/invalid-enum.sysml',
    'workbench/fixtures/language/community-review/valid.sysml',
    'workbench/fixtures/workspaces/formal-monitor/README.md',
    'workbench/fixtures/workspaces/formal-monitor/model/monitor.sysml',
    'workbench/fixtures/workspaces/formal-monitor/views.json',
    'workbench/fixtures/workspaces/source-set/model.sysml',
    'workbench/fixtures/workspaces/source-set/sources.json',
    'workbench/fixtures/workspaces/source-set/types.sysml',
    'workbench/package-lock.json',
    'workbench/package.json',
    'workbench/src/test/referenceLab.test.ts',
    'workbench/tools/reference-pilot/AGENT_WORKFLOW.md',
    'workbench/tools/reference-pilot/EVIDENCE_CONTRACT.md',
    'workbench/tools/reference-pilot/LIFECYCLE.md',
    'workbench/tools/reference-pilot/MODEL_PACKAGE.md',
    'workbench/tools/reference-pilot/README.md',
    'workbench/tools/reference-pilot/ReferencePilot.java',
    'workbench/tools/reference-pilot/acceptance_suite.py',
    'workbench/tools/reference-pilot/agent_model.py',
    'workbench/tools/reference-pilot/assess_package.py',
    'workbench/tools/reference-pilot/capacity_analysis.py',
    'workbench/tools/reference-pilot/check_contract.py',
    'workbench/tools/reference-pilot/check_evidence.py',
    'workbench/tools/reference-pilot/community_regressions.py',
    'workbench/tools/reference-pilot/engineering.py',
    'workbench/tools/reference-pilot/lab.html',
    'workbench/tools/reference-pilot/lab.py',
    'workbench/tools/reference-pilot/model_facts.py',
    'workbench/tools/reference-pilot/pump_regressions.py',
    'workbench/tools/reference-pilot/qualify.py',
    'workbench/tools/reference-pilot/receipts.py',
    'workbench/tools/reference-pilot/regression_suite.py',
    'workbench/tools/reference-pilot/review_routes.py',
    'workbench/tools/reference-pilot/run_reference.py',
    'workbench/tools/reference-pilot/scope.js',
    'workbench/tools/reference-pilot/workflow.js',
    'workbench/tools/reference-pilot/lab_project.py',
    'workbench/tools/reference-pilot/lab_delivery.py',
    'workbench/tools/reference-pilot/test_lab_delivery.py',
    'workbench/tools/reference-pilot/test_lab_project.py',
    'workbench/tools/reference-pilot/source_set.py',
    'workbench/tools/reference-pilot/stakeholder.py',
    'workbench/tools/reference-pilot/test_agent_model.py',
    'workbench/tools/reference-pilot/test_capacity_analysis.py',
    'workbench/tools/reference-pilot/test_contract.py',
    'workbench/tools/reference-pilot/test_distribution.py',
    'workbench/tools/reference-pilot/test_engineering.py',
    'workbench/tools/reference-pilot/test_evidence.py',
    'workbench/tools/reference-pilot/test_package.py',
    'workbench/tools/reference-pilot/test_receipts.py',
    'workbench/tools/reference-pilot/test_source_set.py',
    'workbench/tools/reference-pilot/test_stakeholder.py',
    'workbench/tools/reference-pilot/test_view_contract.py',
    'workbench/tools/reference-pilot/test_view_scope.py',
    'workbench/tools/reference-pilot/view_scope.py',

)


def safe_file(root, relative):
    """Resolve a canonical relative regular file without following any symlink."""
    if not isinstance(relative, str) or not relative or "\\" in relative or ":" in relative or "\0" in relative:
        raise ValueError('Unsafe package path: '+repr(relative))
    rel = PurePosixPath(relative)
    if rel.is_absolute() or rel.as_posix() != relative or any(part in ('.', '..') for part in rel.parts):
        raise ValueError('Unsafe package path: '+repr(relative))
    root = Path(root).absolute()
    path = root
    for part in (None, *rel.parts):
        if part is not None: path = path/part
        if path.is_symlink(): raise ValueError('Symlink is not a package file: '+relative)
    if not path.is_file(): raise ValueError('Package file missing or not regular: '+relative)
    return path


def source_files(root):
    if len(SOURCE_PATHS) != len(set(SOURCE_PATHS)):
        raise ValueError('Duplicate maintained source registration')
    return {name: hashlib.sha256(safe_file(root, name).read_bytes()).hexdigest()
            for name in SOURCE_PATHS}


def maintained_files(root):
    manifest = json.loads(safe_file(root, 'package-manifest.json').read_text())
    if manifest.get('schemaVersion') != 1 or not isinstance(manifest.get('files'), dict):
        raise ValueError('Invalid package integrity manifest')
    files = manifest['files']
    for name, digest in files.items():
        safe_file(root, name)
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
            raise ValueError('Invalid package digest: '+name)
    if set(files) != set(SOURCE_PATHS):
        raise ValueError('Manifest inventory differs from registered maintained source paths')
    for name, expected in files.items():
        if hashlib.sha256(safe_file(root, name).read_bytes()).hexdigest() != expected:
            raise ValueError('Package file changed or missing: '+name)
    return files


if __name__ == '__main__':
    value = {'schemaVersion': 1, 'purpose': 'Source integrity, not engineering approval', 'files': source_files(ROOT)}
    (ROOT/'package-manifest.json').write_text(json.dumps(value, indent=2)+'\n')
    print(f"Recorded {len(value['files'])} registered source files")
