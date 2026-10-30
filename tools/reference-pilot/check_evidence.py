#!/usr/bin/env python3
"""Check revision-bound citations and explicit declaration coverage, not entailment."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
from receipts import bind_receipt

PROFILE = 'source-declarations-v1'
LIMITS = ('Checks byte identities, exact line quotations and explicit source-backed declaration '
          'coverage, not whether a quotation entails a claim. Memberships, typing edges, expressions, '
          'anonymous reference-expression fragments and implicit/library elements are outside this coverage profile. Use independent resolved '
          'semantic contracts and engineering review as separate gates. No approval or execution is inferred.')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def local_file(base, value):
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise ValueError('Evidence paths must be relative and nonempty')
    path = (base / value).resolve()
    if not path.is_relative_to(base.resolve()) or not path.is_file():
        raise ValueError('Evidence path missing or outside package: ' + value)
    return path


def covered_kind(element):
    kind = element['metaclass']
    return bool(element.get('source', '').strip()) and not (
        kind == 'ReferenceUsage' and not element.get('qualifiedName')) and (
        kind == 'Package' or kind.endswith(('Definition', 'Usage')))


def select(element, selector):
    if not isinstance(selector, dict) or not selector or set(selector) - {'qualifiedName', 'metaclass', 'line', 'owner'}:
        raise ValueError('Invalid evidence selector')
    if not isinstance(selector.get('metaclass'), str):
        raise ValueError('Evidence selector requires metaclass')
    values = {**element, 'owner': element.get('semantics', {}).get('owner', {}).get('qualifiedName')}
    return all(values.get(k) == v for k, v in selector.items())


def check_evidence(report, ledger, base, intake):
    base = Path(base)
    if (type(ledger.get('schemaVersion')) is not int or ledger['schemaVersion'] != 1
            or ledger.get('coverageProfile') != PROFILE):
        raise ValueError('Requires schemaVersion 1 and source-declarations-v1 coverageProfile')
    for key in ('sources', 'claims'):
        if not isinstance(ledger.get(key), list) or not ledger[key]:
            raise ValueError('Requires nonempty ' + key)
    if not isinstance(intake, dict) or type(intake.get('schemaVersion')) is not int or intake['schemaVersion'] != 1:
        raise ValueError('Requires independent schema-1 intake manifest')
    approved = intake.get('sources')
    if not isinstance(approved, list) or not approved or any(not isinstance(v, dict) or set(v) != {'id', 'path', 'sha256'} for v in approved):
        raise ValueError('Intake requires explicit source IDs, paths and hashes')
    if len({v['id'] for v in approved}) != len(approved):
        raise ValueError('Duplicate intake source ID')
    findings = []
    def fail(code, **details):
        findings.append({'code': code, **details})
    model = ledger['model']
    model_hash = digest(local_file(base, model['path']).read_bytes())
    if model_hash != model['sha256'] or model_hash != report.get('sourceSha256'):
        fail('model-revision-mismatch')
    if report.get('staticChecksPassed') is not True:
        fail('static-checks-failed')
    elements = report['elements']
    ids = [e['sessionElementId'] for e in elements]
    if not elements or len(ids) != len(set(ids)):
        raise ValueError('Requires nonempty report with unique element IDs')
    submitted = [{k: source.get(k) for k in ('id', 'path', 'sha256')} for source in ledger['sources']]
    if sorted(submitted, key=lambda x: str(x['id'])) != sorted(approved, key=lambda x: str(x['id'])):
        fail('intake-source-mismatch')
    sources = {}
    for source in ledger['sources']:
        sid = source['id']
        if not isinstance(sid, str) or not sid or sid in sources:
            raise ValueError('Invalid or duplicate source ID')
        raw = local_file(base, source['path']).read_bytes()
        sources[sid] = raw.decode('utf-8').splitlines()
        if digest(raw) != source['sha256']:
            fail('source-revision-mismatch', source=sid)
    covered = set()
    claim_ids = set()
    provisional = []
    for claim in ledger['claims']:
        cid = claim['id']
        if not isinstance(cid, str) or not cid or cid in claim_ids:
            raise ValueError('Invalid or duplicate claim ID')
        claim_ids.add(cid)
        status = claim['status']
        if status not in {'source-backed', 'user-confirmed', 'assumption', 'unresolved', 'conflict'}:
            raise ValueError('Unknown claim status')
        if not isinstance(claim.get('interpretation'), str) or not claim['interpretation'].strip():
            raise ValueError('Every claim requires a separate interpretation')
        citations = claim.get('citations', [])
        targets = claim.get('targets', [])
        if not isinstance(citations, list) or not isinstance(targets, list):
            raise ValueError('Citations and targets must be lists')
        before = len(findings)
        if status in {'source-backed', 'user-confirmed'} and (not citations or not targets):
            fail('accepted-claim-missing-citation-or-target', claim=cid)
        for citation in citations:
            lines = sources.get(citation['source'])
            start, end = citation['startLine'], citation['endLine']
            if (lines is None or type(start) is not int or type(end) is not int
                    or not 1 <= start <= end <= len(lines)):
                fail('invalid-citation-anchor', claim=cid)
            elif not isinstance(citation.get('quote'), str) or not citation['quote'].strip() or '\n'.join(lines[start-1:end]) != citation['quote']:
                fail('quotation-mismatch', claim=cid)
        matched = []
        for target in targets:
            matches = [e for e in elements if select(e, target['select'])]
            if len(matches) != 1:
                fail('target-not-unique', claim=cid, selector=target['select'], count=len(matches))
                continue
            element = matches[0]
            if not covered_kind(element):
                fail('target-outside-profile', claim=cid, selector=target['select'])
            elif digest(element['source'].strip().encode()) != target['sourceSha256']:
                fail('target-source-changed', claim=cid, selector=target['select'])
            else:
                matched.append(element['sessionElementId'])
        if status not in {'source-backed', 'user-confirmed'} and targets:
            provisional.append(cid)
        if len(findings) == before and status in {'source-backed', 'user-confirmed'}:
            covered.update(matched)
    required = [e for e in elements if covered_kind(e)]
    missing = [{'metaclass': e['metaclass'], 'qualifiedName': e.get('qualifiedName'), 'line': e.get('line')}
               for e in required if e['sessionElementId'] not in covered]
    if missing:
        fail('uncovered-declarations', elements=missing)
    if provisional:
        fail('provisional-modeled-claims', claims=provisional)
    excluded = Counter(e['metaclass'] for e in elements if not covered_kind(e))
    if not required:
        fail('empty-coverage')
    return {'passed': not findings, 'coverageProfile': PROFILE, 'modelSha256': model_hash,
            'claimCount': len(claim_ids), 'requiredDeclarations': len(required),
            'coveredDeclarations': len(covered), 'excludedMetaclasses': dict(sorted(excluded.items())),
            'findings': findings, 'limits': LIMITS}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('report', 'evidence', 'intake', 'output'):
        p.add_argument('--' + name, type=Path, required=True)
    a = p.parse_args()
    if a.output.exists():
        raise ValueError('Do not overwrite an evidence receipt')
    report = json.loads(a.report.read_text())
    ledger = json.loads(a.evidence.read_text())
    result = check_evidence(report, ledger, a.evidence.parent, json.loads(a.intake.read_text()))
    result = bind_receipt(result, a.report, evidence=a.evidence, intake=a.intake)
    a.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'covered': result['coveredDeclarations'],
                      'required': result['requiredDeclarations'], 'findings': result['findings']}))
    return 0 if result['passed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
