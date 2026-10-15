#!/usr/bin/env python3
"""One local external-source change: witnessed impact, planning and recorded promotion.

Digest binding and cooperative locking are local safeguards, not authenticated
human approval or protection against writers that bypass this workflow.
"""
import argparse
from collections import deque
from contextlib import contextmanager
from datetime import datetime, timezone
try:
    import fcntl
except ImportError:  # Windows can inspect impacts/plans but cannot use this lock.
    fcntl = None
import hashlib
import json
import os
from pathlib import Path
import tempfile

from check_evidence import local_file
from report_integrity import load_report

KINDS = {'source-anchor', 'model-selector', 'view', 'procedure', 'decision', 'artifact', 'observation'}
PLAN_FIELDS = ('setup', 'oracle', 'configuration', 'stimuli', 'units', 'instrumentation',
               'calibrationApplicability', 'evidenceCapture', 'stopConditions', 'authorization')
BOUNDARY = 'Local recorded disposition; not authenticated human approval or execution authorization.'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())


def text(value):
    return isinstance(value, str) and bool(value.strip())


def write_json(path, value):
    with Path(path).open('x') as handle:
        json.dump(value, handle, indent=2, ensure_ascii=False)
        handle.write('\n')


def checked_bytes(base, record):
    raw = local_file(Path(base), record.get('path')).read_bytes()
    if sha(raw) != record.get('sha256'):
        raise ValueError('Revision digest mismatch: ' + str(record.get('path')))
    return raw


def anchors(record, raw):
    if not text(record.get('revision')) or not isinstance(record.get('anchors'), list) or not record['anchors']:
        raise ValueError('Artifact revision requires a revision label and exact anchors')
    result = {}
    lines = raw.decode('utf-8').splitlines()
    for item in record['anchors']:
        aid, start, end = item.get('id'), item.get('startLine'), item.get('endLine')
        if (not text(aid) or aid in result or type(start) is not int or type(end) is not int
                or not 1 <= start <= end <= len(lines) or not text(item.get('quote'))
                or '\n'.join(lines[start-1:end]) != item['quote']):
            raise ValueError('Invalid artifact anchor or quotation: ' + str(aid))
        result[aid] = item
    return result


def impact(manifest, base):
    """Return transaction and immutable snapshot bytes; no model/observation writes."""
    if manifest.get('schemaVersion') != 1 or not text(manifest.get('id')) or not text(manifest.get('artifactId')):
        raise ValueError('Requires schema-1 source-change ID and artifact ID')
    raw = {side: checked_bytes(base, manifest.get(side, {})) for side in ('old', 'new')}
    if raw['old'] == raw['new']:
        raise ValueError('External artifact bytes must change')
    cited = {side: anchors(manifest[side], raw[side]) for side in ('old', 'new')}
    changed = manifest.get('changedAnchorIds')
    if not isinstance(changed, list) or not changed or len(set(changed)) != len(changed):
        raise ValueError('Requires unique changed anchor IDs')
    for aid in changed:
        old, new = cited['old'].get(aid), cited['new'].get(aid)
        if (old is None and new is None) or (old and new and old['quote'] == new['quote']):
            raise ValueError('Changed anchor must witness changed/removed/added content: ' + str(aid))
    nodes = manifest.get('nodes', [])
    if not isinstance(nodes, list) or not nodes:
        raise ValueError('Requires explicit dependency nodes')
    by_id = {}
    for node in nodes:
        nid = node.get('id')
        if not text(nid) or nid in by_id or node.get('kind') not in KINDS:
            raise ValueError('Invalid/duplicate dependency node')
        if node['kind'] == 'model-selector' and not node.get('selector'):
            raise ValueError('Model dependency requires explicit selector')
        by_id[nid] = node
    if any(aid not in by_id or by_id[aid]['kind'] != 'source-anchor' for aid in changed):
        raise ValueError('Changed anchors require source-anchor nodes')
    links = {}
    paths = {}
    for side in ('old', 'new'):
        links[side] = manifest.get(side + 'Links', [])
        if not isinstance(links[side], list):
            raise ValueError('Requires explicit old/new link lists')
        ids = set()
        adjacency = {}
        for link in links[side]:
            if (not text(link.get('id')) or link['id'] in ids or link.get('from') not in by_id
                    or link.get('to') not in by_id or not text(link.get('reason'))):
                raise ValueError('Invalid dependency witness')
            ids.add(link['id']); adjacency.setdefault(link['from'], []).append(link)
        # Each reachable node has a shortest explicit path for each changed anchor/revision.
        for aid in changed:
            queue = deque([(aid, [])]); seen = {aid}
            while queue:
                current, path = queue.popleft()
                for link in adjacency.get(current, []):
                    target = link['to']
                    if target in seen:
                        continue
                    seen.add(target); witness = path + [link]
                    paths.setdefault(target, []).append({'revision': side, 'anchorId': aid, 'links': witness})
                    queue.append((target, witness))
    affected = [{'node': by_id[nid], 'classification': 'direct' if any(len(p['links']) == 1 for p in ps) else 'possible',
                 'witnessPaths': ps} for nid, ps in sorted(paths.items()) if nid not in changed]
    new_links = {identity(link) for link in links['new']}
    removed = [link for link in links['old'] if identity(link) not in new_links]
    inventory = manifest.get('inventory', [])
    if not isinstance(inventory, list) or any(not text(v.get('id')) or v.get('kind') not in KINDS for v in inventory):
        raise ValueError('Invalid uncovered-artifact inventory')
    all_nodes = {**by_id, **{v['id']: v for v in inventory}}
    unknown = [{'node': node, 'reason': 'No witnessed path from changed anchors; impact is unknown.'}
               for nid, node in sorted(all_nodes.items()) if nid not in paths and nid not in changed]
    snapshots = {'old-artifact': raw['old'], 'new-artifact': raw['new'],
                 'model-baseline': checked_bytes(base, manifest.get('modelBaseline', {}))}
    observations = manifest.get('observations', [])
    if not isinstance(observations, list):
        raise ValueError('Observations require a list')
    observation_ids = set()
    annotations = []
    for number, observation in enumerate(observations):
        oid = observation.get('id')
        if not text(oid) or oid in observation_ids:
            raise ValueError('Observation IDs must be unique')
        observation_ids.add(oid)
        snapshots['observation-' + str(number)] = checked_bytes(base, observation)
        annotations.append({'observationId': oid, 'originalSha256': observation['sha256'],
                            'status': 'applicability-review-required' if oid in paths else 'applicability-unknown',
                            'reason': 'Historical configuration, values and outcome remain unchanged.'})
    transaction = {'schemaVersion': 1, 'role': 'local-source-change-transaction', 'sourceChangeId': manifest['id'],
                   'manifest': manifest, 'baseSourceSha256': sha(snapshots['model-baseline']),
                   'snapshots': {name: {'file': name + '.snapshot', 'sha256': sha(data)} for name, data in snapshots.items()},
                   'impact': affected, 'removedLinks': removed, 'unknownImpact': unknown,
                   'applicabilityAnnotations': annotations,
                   'limits': ['Dependency witnesses express recorded links, not causal proof or engineering entailment.',
                              'Unlisted artifacts and undeclared dependencies remain unknown; this is not complete impact coverage.',
                              'No timing or physical-behavior calculation is performed.', BOUNDARY]}
    transaction['transactionSha256'] = identity(transaction)
    return transaction, snapshots


def create_transaction(manifest_path, output):
    manifest_path, output = Path(manifest_path), Path(output)
    transaction, snapshots = impact(json.loads(manifest_path.read_text()), manifest_path.parent)
    output.mkdir(parents=True, exist_ok=False)
    for name, raw in snapshots.items():
        (output / transaction['snapshots'][name]['file']).write_bytes(raw)
    write_json(output / 'transaction.json', transaction)
    return transaction


def load_transaction(path):
    path = Path(path)
    transaction = json.loads((path / 'transaction.json').read_text())
    claimed = transaction.get('transactionSha256')
    core = {k: v for k, v in transaction.items() if k != 'transactionSha256'}
    if transaction.get('role') != 'local-source-change-transaction' or identity(core) != claimed:
        raise ValueError('Source-change transaction content mismatch')
    for snapshot in transaction.get('snapshots', {}).values():
        if sha(local_file(path, snapshot.get('file')).read_bytes()) != snapshot.get('sha256'):
            raise ValueError('Source-change snapshot mismatch')
    if transaction.get('baseSourceSha256') != transaction['snapshots']['model-baseline']['sha256']:
        raise ValueError('Transaction baseline mismatch')
    return transaction


def planning(plan, base=None):
    if plan.get('schemaVersion') != 1 or not text(plan.get('id')):
        raise ValueError('Planning draft requires schema-1 ID')
    placeholders = {'unknown', 'tbd', 'missing', 'not provided', 'pending'}
    missing = [field for field in PLAN_FIELDS if not plan.get(field) or
               (isinstance(plan.get(field), str) and (not plan[field].strip() or plan[field].strip().lower() in placeholders)) or
               (isinstance(plan.get(field), dict) and plan[field].get('status') in placeholders)]
    oracle_verified = False
    oracle = plan.get('oracle')
    if 'oracle' not in missing:
        try:
            if not isinstance(oracle, dict) or not text(oracle.get('independenceRationale')) or base is None:
                raise ValueError('An independently sourced exact oracle citation must be checked')
            citation = oracle['source']
            raw = checked_bytes(base, citation)
            anchors({'revision': 'oracle', 'anchors': [{'id': 'oracle', **citation}]}, raw)
            oracle_verified = True
        except (KeyError, TypeError, ValueError, OSError):
            missing.append('oracle')
    auth = plan.get('authorization')
    if 'authorization' not in missing and (not isinstance(auth, dict) or auth.get('status') != 'recorded-local'
            or any(not text(auth.get(key)) for key in ('recordedBy', 'recordedAt', 'scope'))):
        missing.append('authorization')
    return {'schemaVersion': 1, 'role': 'verification-planning-draft', 'plan': plan,
            'status': 'blocked-nonexecutable-draft' if missing else 'planning-inputs-complete-draft',
            'executable': False, 'missingInputs': missing, 'oracleEvidenceVerified': oracle_verified,
            'limits': [BOUNDARY, 'Input presence does not establish adequate setup, independent oracle or commissioning readiness.',
                       'Execution release and acceptance remain with the responsible authority.']}


@contextmanager
def baseline_lock(baseline):
    """Stable adjacent flock; every cooperating candidate uses the same lock."""
    if fcntl is None:
        raise ValueError('Local promotion requires POSIX fcntl locking (macOS/Linux); this platform is unsupported')
    lock = baseline.with_name('.' + baseline.name + '.evolution.lock')
    with lock.open('a+b') as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def promote(transaction_path, candidate, report_path, baseline, disposition_path, output):
    transaction = load_transaction(transaction_path)
    candidate, baseline, output = Path(candidate), Path(baseline), Path(output)
    if baseline.is_symlink() or not baseline.is_file():
        raise ValueError('Baseline must be an existing regular file, not a symlink')
    baseline = baseline.resolve()
    candidate_raw = candidate.read_bytes()
    report = load_report(Path(report_path), source=candidate_raw, require_managed=True)
    if report.get('staticChecksPassed') is not True or not report.get('elements'):
        raise ValueError('Promotion requires fresh managed static qualification with elements')
    if sha(candidate_raw) == transaction['baseSourceSha256']:
        raise ValueError('Candidate must differ from baseline')
    disposition_raw = Path(disposition_path).read_bytes()
    disposition = json.loads(disposition_raw)
    expected = {'schemaVersion': 1, 'action': 'promote', 'sourceChangeId': transaction['sourceChangeId'],
                'transactionSha256': transaction['transactionSha256'], 'baseSourceSha256': transaction['baseSourceSha256'],
                'candidateSourceSha256': sha(candidate_raw)}
    if any(disposition.get(key) != value for key, value in expected.items()):
        raise ValueError('Disposition must bind exact change, transaction, base and candidate')
    if any(not text(disposition.get(key)) for key in ('recordedBy', 'recordedAt', 'rationale')):
        raise ValueError('Requires explicit local recorder, date and rationale')
    if not isinstance(disposition.get('retainedShortfalls'), list) or any(not text(v) for v in disposition['retainedShortfalls']):
        raise ValueError('Requires explicit retainedShortfalls list')
    dispositions = disposition.get('impacts', [])
    covered = set()
    for item in dispositions:
        if (item.get('nodeId') in covered or not text(item.get('nodeId'))
                or item.get('action') not in ('retain', 'revise', 'review', 'out-of-scope') or not text(item.get('reason'))):
            raise ValueError('Invalid impact disposition')
        covered.add(item['nodeId'])
    required = {item['node']['id'] for item in transaction['impact']}
    if not required.issubset(covered):
        raise ValueError('Missing disposition of witnessed impacts')
    with baseline_lock(baseline):
        original = baseline.read_bytes()
        if sha(original) != transaction['baseSourceSha256']:
            raise ValueError('Expected baseline changed; candidate cannot overwrite it')
        output.mkdir(parents=True, exist_ok=False)
        (output / 'baseline-before.sysml').write_bytes(original)
        (output / 'candidate-promoted.sysml').write_bytes(candidate_raw)
        (output / 'recorded-disposition.json').write_bytes(disposition_raw)
        receipt = {'schemaVersion': 1, 'role': 'local-baseline-promotion', **expected,
                   'baselinePath': str(baseline), 'dispositionSha256': sha(disposition_raw),
                   'reportIntegrity': report['reportIntegrity'], 'retainedShortfalls': disposition['retainedShortfalls'],
                   'promotedAt': datetime.now(timezone.utc).isoformat(), 'boundary': BOUNDARY,
                   'status': 'prepared-not-promoted'}
        write_json(output / 'prepared-receipt.json', receipt)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=baseline.parent, prefix='.' + baseline.name + '.', delete=False) as handle:
                temporary = Path(handle.name); handle.write(candidate_raw); handle.flush(); os.fsync(handle.fileno())
            os.chmod(temporary, baseline.stat().st_mode & 0o777)
            os.replace(temporary, baseline)
            receipt['status'] = 'promoted-local-baseline'
            write_json(output / 'promotion-receipt.json', receipt)
        finally:
            if temporary is not None and temporary.exists():
                temporary.unlink()
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    operations = parser.add_subparsers(dest='operation', required=True)
    change = operations.add_parser('impact'); change.add_argument('--manifest', type=Path, required=True)
    change.add_argument('--output', type=Path, required=True)
    plan = operations.add_parser('plan'); plan.add_argument('--plan', type=Path, required=True)
    plan.add_argument('--output', type=Path, required=True)
    promote_parser = operations.add_parser('promote')
    for field in ('transaction', 'candidate', 'report', 'baseline', 'disposition', 'output'):
        promote_parser.add_argument('--' + field, type=Path, required=True)
    args = parser.parse_args()
    if args.operation == 'impact':
        create_transaction(args.manifest, args.output)
    elif args.operation == 'plan':
        write_json(args.output, planning(json.loads(args.plan.read_text()), args.plan.parent))
    else:
        promote(args.transaction, args.candidate, args.report, args.baseline, args.disposition, args.output)
    print(args.output)


if __name__ == '__main__':
    main()
