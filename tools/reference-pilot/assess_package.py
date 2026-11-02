#!/usr/bin/env python3
"""Assess a system-specific package against independently reviewed acceptance inputs.

This is a bounded model review gate, never a general engineering approval.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys

from check_contract import check_contract
from check_evidence import check_evidence, covered_kind, local_file
from engineering import index_report, interconnection
from receipts import bind_receipt, sha
from run_reference import run_reference

HERE = Path(__file__).resolve().parent


def schema(value, keys, label):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError(label + ' requires exactly: ' + ', '.join(keys))


def ids(values, label):
    if (not isinstance(values, list) or any(not isinstance(v, str) or not v.strip() for v in values)
            or len(values) != len(set(values))):
        raise ValueError(label + ' requires unique nonempty strings')
    return set(values)


def check_decisions(register, ledger, support):
    schema(register, ['schemaVersion', 'decisions'], 'Decision register')
    if type(register['schemaVersion']) is not int or register['schemaVersion'] != 2 or not isinstance(register['decisions'], list):
        raise ValueError('Requires schema-2 decision list with resolution check bindings')
    claims = {c['id']: c for c in ledger['claims']}
    linked = {link['claim'] for link in support['links']}
    seen = set(); findings = []; residuals = []; triaged = set()
    for d in register['decisions']:
        schema(d, ['id', 'question', 'impact', 'status', 'sourceClaims', 'resolutionClaim', 'scopeReason', 'resolutionChecks'], 'Decision')
        if not isinstance(d['id'], str) or not d['id'].strip() or d['id'] in seen:
            raise ValueError('Invalid or duplicate decision ID')
        seen.add(d['id'])
        if not isinstance(d['question'], str) or not d['question'].strip():
            raise ValueError('Decision requires question')
        if d['impact'] not in ('blocking', 'outside-claims') or d['status'] not in ('open', 'resolved'):
            raise ValueError('Invalid decision impact/status')
        source_ids = ids(d['sourceClaims'], 'Decision sources')
        triaged.update(source_ids)
        if not source_ids or not source_ids <= claims.keys() or any(not claims[c].get('citations') for c in source_ids):
            findings.append({'code': 'decision-source-missing', 'decision': d['id']})
        resolution = d['resolutionClaim']
        resolution_checks = ids(d['resolutionChecks'], 'Resolution checks')
        if d['status'] == 'open':
            if resolution is not None or resolution_checks:
                raise ValueError('Open decision cannot have a resolution claim')
            if d['impact'] == 'blocking':
                findings.append({'code': 'unresolved-blocking-decision', 'decision': d['id']})
            elif not isinstance(d['scopeReason'], str) or not d['scopeReason'].strip():
                raise ValueError('Outside-claims decision requires explicit scope reason')
            else:
                residuals.append({'id': d['id'], 'question': d['question'], 'scopeReason': d['scopeReason']})
        elif (resolution not in claims or claims[resolution]['status'] not in ('source-backed', 'user-confirmed')
              or not claims[resolution].get('citations') or not claims[resolution].get('targets') or resolution not in linked
              or not resolution_checks or not resolution_checks <= {v['check'] for v in support['links'] if v['claim'] == resolution}):
            findings.append({'code': 'unsupported-decision-resolution', 'decision': d['id']})
    pending = {c['id'] for c in ledger['claims'] if c['status'] in ('conflict', 'unresolved', 'assumption')}
    if pending - triaged:
        findings.append({'code': 'untriaged-provisional-claims', 'claims': sorted(pending - triaged)})
    return {'passed': not findings, 'findings': findings, 'openOutsideClaims': residuals}


def selector_supports(check, target):
    """Require the claimed target to match the checked subject; not prose entailment."""
    values = dict(target)
    name = target.get('qualifiedName')
    if name:
        values.setdefault('owner', name.rsplit('::', 1)[0] if '::' in name else '')
        values.setdefault('name', name.rsplit('::', 1)[-1])
    return all(values.get(key) == value for key, value in check.items())


def check_support(support, contract, ledger):
    schema(support, ['schemaVersion', 'links'], 'Fact support')
    if type(support['schemaVersion']) is not int or support['schemaVersion'] != 1 or not isinstance(support['links'], list):
        raise ValueError('Requires schema-1 fact support links')
    checks = {c['id']: c for c in contract['checks']}; claims = {c['id']: c for c in ledger['claims']}
    seen = set(); findings = []
    for link in support['links']:
        schema(link, ['check', 'claim'], 'Fact support link')
        if not isinstance(link['check'], str) or not isinstance(link['claim'], str):
            raise ValueError('Fact support identifiers must be strings')
        pair = (link['check'], link['claim'])
        if pair in seen:
            raise ValueError('Duplicate fact support link')
        seen.add(pair)
        claim = claims.get(link['claim'], {})
        if link['check'] not in checks or claim.get('status') not in ('source-backed', 'user-confirmed') or not claim.get('citations') or not claim.get('targets'):
            findings.append({'code': 'unsupported-fact-link', **link})
        elif not any(selector_supports(checks[link['check']]['select'], t['select'])
                     or t['select'].get('qualifiedName', object()) in checks[link['check']].get('expect', {}).get('references', {}).values()
                     for t in claim['targets']):
            findings.append({'code': 'support-target-mismatch', **link})
    missing = sorted(checks.keys() - {p[0] for p in seen})
    if missing:
        findings.append({'code': 'facts-without-source-review', 'checks': missing})
    return {'passed': not findings, 'findings': findings,
            'limits': 'Links are analyst-reviewed source support, not automated natural-language entailment.'}


def check_package_views(report, expected, base):
    if not isinstance(expected, list) or not expected:
        raise ValueError('Expected views cannot be empty')
    index = index_report(report)
    def key(v):
        return (v['id'], tuple(v['targets']), v['view'], v['profile'],
                tuple(sorted((x['name'], x['reason']) for x in v['excluded'])))
    wanted = []
    for v in expected:
        schema(v, ['id', 'targets', 'view', 'profile', 'excluded'], 'Expected view')
        if not isinstance(v['id'], str) or not v['id'] or not isinstance(v['view'], str) or not isinstance(v['profile'], str):
            raise ValueError('Invalid view ID/mode/profile')
        if not ids(v['targets'], 'View targets') or not isinstance(v['excluded'], list):
            raise ValueError('View targets/exclusions malformed')
        for omitted in v['excluded']:
            schema(omitted, ['name', 'reason'], 'Reviewed exclusion')
            if any(not isinstance(s, str) or not s for s in omitted.values()):
                raise ValueError('Exclusion requires stable name and reason')
        wanted.append(key(v))
    if len({k[0] for k in wanted}) != len(wanted):
        raise ValueError('Expected view IDs must be unique')
    actual = []; findings = []
    for v in report.get('views', []):
        omitted = [{'name': index.get(x.get('id'), {}).get('qualifiedName', '<unresolved>'), 'reason': x.get('reason', '')}
                   for x in v.get('excluded', [])]
        actual.append(key({'id': v.get('id'), 'targets': v.get('targets', []), 'view': v.get('view'),
                           'profile': v.get('notationProfile', 'pilot'), 'excluded': omitted}))
        if v.get('error') or not report.get('sourceSha256') or v.get('modelSha256') != report['sourceSha256']:
            findings.append({'code': 'view-error-or-stale-model', 'view': v.get('id')})
        try:
            if sha(local_file(base, v.get('file'))) != v.get('artifactSha256'):
                findings.append({'code': 'view-artifact-mismatch', 'view': v.get('id')})
        except (ValueError, OSError):
            findings.append({'code': 'view-artifact-missing', 'view': v.get('id')})
    if Counter(wanted) != Counter(actual):
        findings.append({'code': 'view-concern-scope-profile-or-exclusions-mismatch'})
    return {'passed': not findings, 'findings': findings, 'count': len(actual), 'visualAcceptance': 'requires-inspection'}


def check_exchanges(report, scopes, expected):
    if not ids(scopes, 'Exchange scopes') or not isinstance(expected, list):
        raise ValueError('Exchange contract requires scopes and a list')
    fields = ['scope', 'source', 'sourcePort', 'target', 'targetPort', 'item']
    for row in expected:
        schema(row, fields, 'Expected exchange')
        if any(not isinstance(v, str) or not v for v in row.values()) or row['scope'] not in scopes:
            raise ValueError('Invalid exchange name/scope')
    index = index_report(report); actual = []; exclusions = []
    for scope in scopes:
        projection = interconnection(report, scope)
        exclusions.extend(projection['excluded'])
        for flow in projection['flows']:
            source, sp = flow['source']; target, tp = flow['target']
            actual.append({'scope': scope, 'source': index[source]['qualifiedName'] if source else scope,
                           'sourcePort': index[sp]['name'], 'target': index[target]['qualifiedName'] if target else scope,
                           'targetPort': index[tp]['name'], 'item': flow['item']})
    def counted(rows):
        return Counter(tuple(r[k] for k in fields) for r in rows)
    return {'passed': not exclusions and counted(actual) == counted(expected), 'actual': actual, 'excluded': exclusions}


def assess(report_path, package_path):
    base = package_path.parent
    manifest = json.loads(package_path.read_text())
    schema(manifest, ['schemaVersion', 'model', 'views', 'contract', 'evidence', 'intake', 'factSupport',
                      'decisions', 'supportedDeclarationKinds', 'expectedViews', 'exchangeScopes', 'expectedExchanges'], 'Model package')
    if type(manifest['schemaVersion']) is not int or manifest['schemaVersion'] != 1:
        raise ValueError('Requires schema-1 model package')
    paths = {key: local_file(base, manifest[key]) for key in ('model', 'views', 'contract', 'evidence', 'intake', 'factSupport', 'decisions')}
    loaded = {key: json.loads(path.read_text()) for key, path in paths.items() if key != 'model'}
    report = json.loads(report_path.read_text())
    allowed = ids(manifest['supportedDeclarationKinds'], 'Supported declaration kinds')
    if not allowed:
        raise ValueError('Supported declaration kinds cannot be empty')
    observed = {e['metaclass'] for e in report['elements'] if covered_kind(e)}
    gates = {
        'canonicalSource': {'passed': sha(paths['model']) == report.get('sourceSha256')
                            and local_file(base, loaded['evidence']['model']['path']) == paths['model']},
        'facts': check_contract(report, loaded['contract']),
        'evidence': check_evidence(report, loaded['evidence'], base, loaded['intake']),
        'support': check_support(loaded['factSupport'], loaded['contract'], loaded['evidence']),
        'decisions': check_decisions(loaded['decisions'], loaded['evidence'], loaded['factSupport']),
        'views': check_package_views(report, manifest['expectedViews'], report_path.parent),
        'exchanges': check_exchanges(report, manifest['exchangeScopes'], manifest['expectedExchanges']),
        'constructScope': {'passed': not observed - allowed, 'unsupportedDeclarationKinds': sorted(observed - allowed)},
    }
    result = bind_receipt({'passed': all(g['passed'] for g in gates.values()), 'gates': gates,
                           'limits': 'Bounded static model package assessment; visual inspection, source entailment, physical adequacy and execution remain separate.'},
                          report_path, contract=paths['contract'], evidence=paths['evidence'], intake=paths['intake'])
    result['packageSha256'] = sha(package_path)
    result['packageFileSha256'] = {k: sha(v) for k, v in paths.items()}
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--package', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--report', type=Path)
    p.add_argument('--jar', type=Path)
    p.add_argument('--library', type=Path)
    a = p.parse_args()
    if not a.report and (not a.jar or not a.library):
        p.error('Supply an existing --report or both --jar and --library for fresh qualification')
    a.output.mkdir(parents=True, exist_ok=False)
    execution_mode = 'existing-report-assessment' if a.report else 'fresh-engine-run-and-assessment'
    try:
        if not a.report:
            manifest = json.loads(a.package.read_text())
            model = local_file(a.package.parent, manifest['model'])
            views = local_file(a.package.parent, manifest['views'])
            a.report = a.output/'qualification/report.json'
            code, report = run_reference([sys.executable, str(HERE/'qualify.py'), '--jar', str(a.jar), '--library', str(a.library),
                                          '--source', str(model), '--views', str(views), '--output', str(a.report.parent)],
                                         a.output/'qualification.log', a.report)
            if code != 0:
                raise RuntimeError(json.dumps(report.get('failure', {'diagnostics': report.get('diagnostics'), 'views': report.get('views')})))
        result = assess(a.report, a.package)
        result['executionMode'] = execution_mode
    except (ValueError, KeyError, TypeError, OSError, RuntimeError) as error:
        result = {'passed': False, 'failure': {'kind': type(error).__name__, 'message': str(error)}}
    (a.output/'assessment.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'passed': result['passed'], 'gates': {k: v['passed'] for k, v in result.get('gates', {}).items()}, 'failure': result.get('failure')}))
    return 0 if result['passed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
