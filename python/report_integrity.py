"""Verify locally managed qualification evidence before consuming semantic facts.

This digest chain detects alteration and accidental mixing of managed artifacts.
It is not an authenticated signature: a party able to replace the entire evidence
set can replace its receipt too. Imported reports require an explicit opt-in and
never acquire managed producer provenance merely by being read.
"""
import hashlib
import json
from pathlib import Path

BOUNDARY = 'Local integrity receipt; not an authenticated producer signature.'
RECEIPT = 'report-integrity.json'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def view_recipe(request):
    """Canonical semantic/render recipe; bind all material request options."""
    if not isinstance(request, dict):
        raise ValueError('View recipe must be an object')
    result = dict(request)
    result['targets'] = result.pop('names', result.get('targets', None))
    result.setdefault('styles', [])
    result.setdefault('renderer', 'pilot')
    if not isinstance(result.get('id'), str) or not isinstance(result.get('view'), str):
        raise ValueError('View recipe requires ID and concern')
    if not isinstance(result['targets'], list) or not result['targets'] or any(not isinstance(t, str) for t in result['targets']):
        raise ValueError('View recipe requires targets')
    return result


def view_recipe_sha256(request):
    return digest(json.dumps(view_recipe(request), sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())


def _local(base, name):
    if not isinstance(name, str):
        raise ValueError('Integrity record requires a local file name')
    path = (base / name).resolve()
    if not path.is_relative_to(base.resolve()) or not path.is_file():
        raise ValueError('Integrity evidence file missing or outside report directory: ' + name)
    return path


def seal_report(report_path, inputs_path, snapshots, implementation):
    """Called only by the qualifier after it has produced the bound report."""
    base = Path(report_path).parent
    receipt = {'schemaVersion': 1, 'role': 'managed-qualification-integrity', 'boundary': BOUNDARY,
               'reportSha256': digest(Path(report_path).read_bytes()),
               'inputsFile': Path(inputs_path).relative_to(base).as_posix(),
               'inputsSha256': digest(Path(inputs_path).read_bytes()),
               'snapshots': snapshots, 'producerImplementation': implementation}
    (base / RECEIPT).write_text(json.dumps(receipt, indent=2) + '\n')
    return receipt


def load_report(path, *, source=None, require_managed=True):
    path = Path(path)
    raw = path.read_bytes()
    report = json.loads(raw)
    if not isinstance(report, dict):
        raise ValueError('Report must be an object')
    report_digest = digest(raw)
    receipt_path = path.parent / RECEIPT
    if not receipt_path.is_file():
        if require_managed or report.get('producerIntegrity'):
            raise ValueError('Managed report integrity receipt is missing; imported reports require explicit opt-in')
        integrity = {'status': 'imported-unverified', 'reportSha256': report_digest, 'boundary': BOUNDARY}
    else:
        receipt_raw = receipt_path.read_bytes()
        receipt = json.loads(receipt_raw)
        if receipt.get('schemaVersion') != 1 or receipt.get('role') != 'managed-qualification-integrity':
            raise ValueError('Unsupported report integrity receipt')
        if receipt.get('reportSha256') != report_digest:
            raise ValueError('Managed report content digest mismatch')
        inputs_raw = _local(path.parent, receipt.get('inputsFile')).read_bytes()
        if digest(inputs_raw) != receipt.get('inputsSha256'):
            raise ValueError('Managed qualification input record digest mismatch')
        inputs = json.loads(inputs_raw)
        producer = report.get('producerIntegrity', {})
        if producer.get('schemaVersion') != 1 or producer.get('receiptFile') != RECEIPT:
            raise ValueError('Managed report producer receipt binding is missing')
        snapshots = receipt.get('snapshots', {})
        if not isinstance(snapshots, dict) or 'source' not in snapshots:
            raise ValueError('Managed report source snapshot is missing')
        if inputs.get('snapshots') != snapshots:
            raise ValueError('Managed snapshot inventory differs from producer inputs')
        for label, entry in snapshots.items():
            actual = digest(_local(path.parent, entry.get('file')).read_bytes())
            if actual != entry.get('sha256'):
                raise ValueError('Managed input snapshot digest mismatch: ' + label)
            if label in ('source', 'views') and actual != inputs.get(label + 'Sha256'):
                raise ValueError('Managed input snapshot does not match producer inputs: ' + label)
        if report.get('sourceSha256') != snapshots['source']['sha256']:
            raise ValueError('Managed report source binding mismatch')
        if report.get('viewsSha256') != (snapshots.get('views') or {}).get('sha256'):
            raise ValueError('Managed report view input binding mismatch')
        implementation = receipt.get('producerImplementation')
        if not isinstance(implementation, dict) or not implementation:
            raise ValueError('Managed producer implementation record is missing')
        for name, entry in implementation.items():
            if digest(_local(path.parent, entry.get('file')).read_bytes()) != entry.get('sha256'):
                raise ValueError('Managed producer implementation snapshot mismatch: ' + name)
        producer_digests = {name: item['sha256'] for name, item in implementation.items()}
        if producer_digests != inputs.get('producerImplementationSha256') or producer_digests != report.get('producerImplementationSha256'):
            raise ValueError('Managed producer implementation binding mismatch')
        requests = json.loads(_local(path.parent, snapshots['views']['file']).read_bytes()) if 'views' in snapshots else []
        by_id = {v['id']: v for v in requests}
        if len(by_id) != len(requests) or len(report.get('views', [])) != len(requests):
            raise ValueError('Managed realized view set mismatch')
        for view in report.get('views', []):
            request = by_id.get(view.get('id'))
            if request is None or view.get('viewRecipeSha256') != view_recipe_sha256(request):
                raise ValueError('Managed realized view recipe mismatch')
            if 'file' in view and digest(_local(path.parent, view['file']).read_bytes()) != view.get('artifactSha256'):
                raise ValueError('Managed view artifact digest mismatch: ' + view['id'])
            for artifact, sha_field in (('referenceFile', 'referenceArtifactSha256'), ('rawFile', 'rawArtifactSha256')):
                if artifact in view and digest(_local(path.parent, view[artifact]).read_bytes()) != view.get(sha_field):
                    raise ValueError('Managed ' + artifact + ' view artifact digest mismatch: ' + view['id'])
        integrity = {'status': 'verified-managed', 'receiptSha256': digest(receipt_raw),
                     'reportSha256': report_digest, 'boundary': BOUNDARY}
    if source is not None:
        source_raw = source.read_bytes() if isinstance(source, Path) else source if isinstance(source, bytes) else source.encode('utf-8')
        if digest(source_raw) != report.get('sourceSha256'):
            raise ValueError('Source differs from qualified report snapshot')
    report['reportIntegrity'] = integrity
    return report
