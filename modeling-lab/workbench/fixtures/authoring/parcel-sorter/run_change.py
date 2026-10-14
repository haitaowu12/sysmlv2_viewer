#!/usr/bin/env python3
"""Fictional frozen ICD R1→R2 transaction; never changes this fixture's model.

The recorded fixture disposition demonstrates a local transition, not a human
engineering decision. ACK-MEANING-01 remains open and timing is not evaluated.
"""
import argparse
import copy
import csv
import io
import json
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
PACKAGE = HERE.parents[3]
sys.path.insert(0, str(PACKAGE / 'workbench/tools/reference-pilot'))
from agent_model import candidate
from check_contract import check_contract
from check_evidence import local_file
from evolution import create_transaction, planning, promote, sha, write_json
from report_integrity import load_report

FREEZE_SHA256 = 'eccbc7e0ac2f44aa42a74f85afac22ed0ade1eed978653666b12b5062b8b6240'


def qualify(source, output):
    with output.with_suffix('.cli.txt').open('x') as log:
        subprocess.run([sys.executable, '-B', str(PACKAGE / 'scripts/sysml.py'), 'qualify',
                        '--source', str(source), '--views', str(HERE / 'views.json'),
                        '--output', str(output)], stdout=log, stderr=subprocess.STDOUT, check=True)
    return output / 'report.json'


def ack_revision(path, anchor, revision):
    raw = path.read_bytes()
    rows = list(csv.DictReader(io.StringIO(raw.decode())))
    selected = [row for row in rows if row['source_anchor'] == anchor and row['message'] == 'RouteAcknowledgement']
    if len(selected) != 1:
        raise ValueError('Frozen ICD requires exactly one acknowledgement anchor')
    line_matches = [(number, line) for number, line in enumerate(raw.decode().splitlines(), 1)
                    if line.startswith(anchor + ',')]
    if len(line_matches) != 1:
        raise ValueError('ICD source line is missing or ambiguous')
    line, quote = line_matches[0]
    bound = re.fullmatch(r'Acknowledgement shall be returned within (\d+) ms of RouteDispatch receipt',
                         selected[0]['timing_provision'])
    if not bound:
        raise ValueError('This demonstration supports the frozen explicit millisecond bound only')
    return {'path': path.name, 'sha256': sha(raw), 'revision': revision,
            'anchors': [{'id': anchor, 'startLine': line, 'endLine': line, 'quote': quote}]}, int(bound[1])


def run(inputs, output, baseline_report=None):
    inputs, output = Path(inputs).resolve(), Path(output).resolve()
    frozen_raw = (inputs / 'freeze-manifest.json').read_bytes()
    if sha(frozen_raw) != FREEZE_SHA256:
        raise ValueError('Input freeze identity changed; this demonstration requires the original independent fixture')
    freeze = json.loads(frozen_raw)
    frozen_files = {}
    for entry in freeze['files']:
        raw = local_file(inputs, entry['path']).read_bytes()
        if sha(raw) != entry['sha256'] or len(raw) != entry['bytes']:
            raise ValueError('Frozen source bytes changed: ' + entry['path'])
        frozen_files[entry['path']] = raw
    lifecycle = json.loads(frozen_files['lifecycle.json'])
    if lifecycle.get('fictional') is not True:
        raise ValueError('This demonstrator accepts only its fictional lifecycle fixture')
    change = lifecycle['change']
    original_model = (HERE / 'model.sysml').read_bytes()
    output.mkdir(parents=True, exist_ok=False)
    evidence = output / 'inputs'; evidence.mkdir()
    # Maintained frozen allowlist only; no surrounding project export.
    for name, raw in frozen_files.items():
        (evidence / name).write_bytes(raw)
    (evidence / 'freeze-manifest.json').write_bytes(frozen_raw)
    baseline = evidence / 'controlled.sysml'; baseline.write_bytes(original_model)
    old, old_bound = ack_revision(evidence / change['old_file'], change['old_anchor'], change['old_revision'])
    new, new_bound = ack_revision(evidence / change['new_file'], change['new_anchor'], change['new_revision'])
    baseline_report = Path(baseline_report) if baseline_report else qualify(baseline, output / 'baseline-qualification')
    report = load_report(baseline_report, source=original_model)
    if report.get('staticChecksPassed') is not True:
        raise ValueError('Baseline static qualification failed')
    citation = new['anchors'][0]
    proposal = {'schemaVersion': 1, 'baseSourceSha256': sha(original_model),
                'evidence': [{'id': 'ICD-R2-ACK', 'path': new['path'], 'sha256': new['sha256'],
                              **{k: citation[k] for k in ('startLine', 'endLine', 'quote')}}],
                'changes': [
                    {'target': 'ParcelSortingStudy::sorter::acknowledgementBoundMilliseconds',
                     'before': f'attribute acknowledgementBoundMilliseconds : Integer = {old_bound};',
                     'after': f'attribute acknowledgementBoundMilliseconds : Integer = {new_bound};',
                     'reason': 'Record the revised ICD declared bound; do not infer achieved timing.', 'evidenceIds': ['ICD-R2-ACK']},
                    {'target': 'ParcelSortingStudy::acknowledgementTiming',
                     'before': f'PS-ICD {change["old_revision"]} acknowledgement within {old_bound} milliseconds',
                     'after': f'PS-ICD {change["new_revision"]} acknowledgement within {new_bound} milliseconds',
                     'reason': 'Revise the source-backed obligation while preserving the open milestone.', 'evidenceIds': ['ICD-R2-ACK']},
                    {'target': 'ParcelSortingStudy', 'before': 'Fictional B1 / PS-ICD R1 / D1 study.',
                     'after': 'Fictional B1 / PS-ICD R2 / D1 study.',
                     'reason': 'Identify the candidate ICD basis; architecture and decisions are retained.', 'evidenceIds': ['ICD-R2-ACK']}]}
    result, proposal_receipt = candidate(report, original_model.decode(), proposal, evidence)
    candidate_path = evidence / 'candidate.sysml'; candidate_path.write_bytes(result.encode())
    write_json(output / 'proposal.json', proposal_receipt)
    selectors = {'ACK-BOUND': 'ParcelSortingStudy::acknowledgementTiming',
                 'ACK-DEFAULT': 'ParcelSortingStudy::sorter::acknowledgementBoundMilliseconds'}
    kinds = {'TP-ACK-R1': 'procedure', 'VIEW-INTERFACE-R1': 'view', 'DEC-RECOVERY': 'decision',
             'ACTUATOR-SUPPLIER': 'artifact', 'VIEW-INTERFACE-R2': 'view', 'OBS-MOCK-01': 'observation'}
    nodes = [{'id': value['anchors'][0]['id'], 'kind': 'source-anchor'} for value in (old, new)]
    nodes += [{'id': key, 'kind': 'model-selector', 'selector': value} for key, value in selectors.items()]
    nodes += [{'id': key, 'kind': value} for key, value in kinds.items()]
    links, unlinked = [], []
    for entry in lifecycle['dependencies']:
        if entry['classification'] == 'unlinked_unknown':
            unlinked.append(entry); continue
        links.append({'id': entry['id'], 'from': change['old_anchor'] if entry['from'].startswith('PS-ICD@') else entry['from'],
                      'to': entry['to'], 'reason': entry['witness'] + ': ' + entry['meaning'],
                      'recordedClassification': entry['classification']})
    links += [{'id': 'MODEL-BOUND-DECLARATION', 'from': 'ACK-BOUND', 'to': 'ACK-DEFAULT',
               'reason': 'Current model source explicitly declares the R1 bound; this does not compute timing performance.'},
              {'id': 'HISTORICAL-R1-BASIS', 'from': change['old_anchor'], 'to': 'OBS-MOCK-01',
               'reason': 'LC1:observation explicitly cites PS-ICD R1 and ICD-R1:ack; mock result remains historical.'}]
    retired = {entry['id'] for entry in lifecycle['link_history']['proposed_retirements']}
    new_links = [{**entry, 'from': change['new_anchor'] if entry['from'] == change['old_anchor'] and
                  entry['id'] != 'HISTORICAL-R1-BASIS' else entry['from']} for entry in links if entry['id'] not in retired]
    for entry in lifecycle['link_history']['proposed_additions']:
        new_links.append({'id': entry['id'], 'from': change['new_anchor'], 'to': entry['to'],
                          'reason': 'LC1:link-history candidate review refresh; no participant acceptance asserted.'})
    manifest = {'schemaVersion': 1, 'id': change['id'], 'artifactId': change['artifact_id'], 'old': old, 'new': new,
                'modelBaseline': {'path': baseline.name, 'sha256': sha(original_model)},
                'changedAnchorIds': [change['old_anchor'], change['new_anchor']], 'nodes': nodes,
                'oldLinks': links, 'newLinks': new_links, 'unlinkedEvidence': unlinked,
                'observations': [{'id': 'OBS-MOCK-01', 'path': 'lifecycle.json', 'sha256': sha(frozen_files['lifecycle.json'])}],
                'frozenManifestSha256': FREEZE_SHA256,
                'limits': ['The historical observation is embedded in the preserved original lifecycle bytes.',
                           'Link changes are recorded fixture dispositions, not authenticated engineering-owner decisions.']}
    write_json(evidence / 'source-change.json', manifest)
    transaction = create_transaction(evidence / 'source-change.json', output / 'transaction')
    plan = planning({'schemaVersion': 1, 'id': 'PS-ACK-R2-planning', 'units': 'ms',
                     'sourcePrerequisiteGaps': lifecycle['commissioning_planning']['missing']}, evidence)
    write_json(output / 'blocked-planning.json', plan)
    candidate_report_path = qualify(candidate_path, output / 'candidate-qualification')
    candidate_report = load_report(candidate_report_path, source=candidate_path)
    contract = json.loads((HERE / 'expected-facts.json').read_text())
    candidate_contract = copy.deepcopy(contract)
    matches = [check for check in candidate_contract['checks'] if check['id'] == 'ack-r1-bound']
    if len(matches) != 1 or matches[0]['expect']['literalValues'] != [old_bound]:
        raise ValueError('Existing bound expectation does not match frozen R1 provision')
    matches[0]['id'] = 'ack-r2-bound'; matches[0]['expect']['literalValues'] = [new_bound]
    checks = check_contract(candidate_report, candidate_contract)
    write_json(output / 'candidate-contract.json', candidate_contract)
    write_json(output / 'candidate-checks.json', checks)
    if checks.get('passed') is not True:
        raise ValueError('Candidate expected-fact checks failed')
    shortfalls = ['ACK-MEANING-01 remains open: accepted message versus completed physical diversion is unresolved.',
                  'No tested timing or physical-behavior analysis profile applies; 95 ms historical mock result is not R2 compliance.',
                  'Integrated setup, oracle, instrumentation/calibration applicability, stop conditions and execution authorization remain missing.']
    disposition = {'schemaVersion': 1, 'action': 'promote', 'sourceChangeId': change['id'],
                   'transactionSha256': transaction['transactionSha256'], 'baseSourceSha256': sha(original_model),
                   'candidateSourceSha256': sha(candidate_path.read_bytes()), 'recordedBy': 'Automated fictional local fixture recorder',
                   'recordedAt': '2026-10-04', 'rationale': 'Record R2 obligation in a disposable local fixture baseline; no engineering-owner approval or physical design change.',
                   'impacts': [{'nodeId': entry['node']['id'], 'action': 'review', 'reason': 'Recorded fixture applicability review; acceptance remains unestablished.'}
                               for entry in transaction['impact'] + transaction['unknownImpact']],
                   'retainedShortfalls': shortfalls}
    disposition_path = output / 'recorded-disposition.json'; write_json(disposition_path, disposition)
    receipt = promote(output / 'transaction', candidate_path, candidate_report_path, baseline, disposition_path, output / 'promotion')
    original_observation = lifecycle['historical_observation']
    preserved = json.loads((output / 'transaction/observation-0.snapshot').read_text())['historical_observation']
    if preserved != original_observation or (HERE / 'model.sysml').read_bytes() != original_model:
        raise ValueError('Original model or historical observation changed')
    summary = {'schemaVersion': 1, 'role': 'fictional-parcel-source-change-demonstration', 'sourceChangeId': change['id'],
               'frozenManifestSha256': FREEZE_SHA256, 'oldBoundMilliseconds': old_bound, 'newBoundMilliseconds': new_bound,
               'unchanged': change['unchanged'], 'unresolvedConsequence': shortfalls,
               'timingCompliance': 'not-evaluated', 'physicalVerification': 'not-evaluated',
               'historicalObservationPreserved': True, 'historicalObservation': original_observation,
               'planningStatus': plan['status'], 'promotionStatus': receipt['status'], 'boundary': receipt['boundary']}
    write_json(output / 'change-summary.json', summary)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, default=HERE.parent / 'parcel-sorter-inputs')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--baseline-report', type=Path)
    args = parser.parse_args()
    print(json.dumps(run(args.inputs, args.output, args.baseline_report), indent=2))


if __name__ == '__main__':
    main()
