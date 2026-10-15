#!/usr/bin/env python3
"""Reproduce community syntax counterexamples and our former uncited-addition gap."""
import argparse
import copy
import json
from pathlib import Path
import shutil
import subprocess
import sys
from check_contract import check_contract
from model_facts import signature
from acceptance_suite import check_exchanges
from check_evidence import check_evidence, digest, select

ROOT = Path(__file__).resolve().parents[2]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('jar', 'library', 'output'):
        p.add_argument('--' + name, required=True, type=Path)
    a = p.parse_args()
    a.output.mkdir(parents=True, exist_ok=False)
    def run(name, source):
        out = a.output / name
        command = [sys.executable, '-B', str(ROOT/'tools/reference-pilot/qualify.py'),
                   '--jar', str(a.jar), '--library', str(a.library), '--source', str(source), '--output', str(out)]
        with (a.output/(name+'.log')).open('w') as log:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=210)
        return result.returncode, json.loads((out/'report.json').read_text())
    code, report = run('valid-syntax', ROOT/'fixtures/language/community-review/valid.sysml')
    index = {e['sessionElementId']: e for e in report['elements']}
    expected = [('MyComponent', 'PartDefinition'), ('Region', 'AttributeDefinition'),
                ('ConditionColor', 'EnumerationDefinition'), ('ConditionColor::green', 'EnumerationUsage'),
                ('Container::name', 'AttributeUsage')]
    checks = [{'id': name, 'passed': code == 0 and report['staticChecksPassed'] and any(
        e.get('qualifiedName') == 'CommunityCounterexamples::'+name and e['metaclass'] == kind for e in report['elements'])}
        for name, kind in expected]
    ranges = [e for e in report['elements'] if e['metaclass'] == 'MultiplicityRange' and
              e.get('semantics', {}).get('owner', {}).get('qualifiedName') == 'CommunityCounterexamples::components']
    bounds = [index[v['id']] for e in ranges for v in e['semantics'].get('bound', [])]
    checks.append({'id': 'feature-reference-multiplicity', 'passed': code == 0 and len(bounds) == 1
                   and bounds[0]['metaclass'] == 'FeatureReferenceExpression'
                   and bounds[0]['semantics'].get('referent', {}).get('qualifiedName') == 'CommunityCounterexamples::count'})
    code, report = run('invalid-enum', ROOT/'fixtures/language/community-review/invalid-enum.sysml')
    checks.append({'id': 'comma-separated-enum-rejected', 'passed': code != 0 and not report['staticChecksPassed']})

    fixture = ROOT/'fixtures/authoring/cooler/architecture'
    work = a.output/'uncited-input'
    work.mkdir()
    shutil.copyfile(fixture/'input.md', work/'input.md')
    source = (fixture/'model.sysml').read_text().rstrip()
    (work/'model.sysml').write_text(source[:-1] + '    part inventedPump : Probe;\n}\n')
    code, report = run('uncited-addition', work/'model.sysml')
    contract = check_contract(report, json.loads((fixture.parent/'contract.json').read_text()))
    ledger = copy.deepcopy(json.loads((fixture/'evidence-contract.json').read_text()))
    # Rebind only source identities so the negative control isolates coverage rather
    # than the obvious stale-revision failure. No new citation or target is added.
    ledger['model']['sha256'] = digest((work/'model.sysml').read_bytes())
    for claim in ledger['claims']:
        for target in claim['targets']:
            matches = [e for e in report['elements'] if select(e, target['select'])]
            if len(matches) == 1:
                target['sourceSha256'] = digest(matches[0]['source'].strip().encode())
    result = check_evidence(report, ledger, work, json.loads((fixture/'intake.json').read_text()))
    (a.output/'uncited-evidence-result.json').write_text(json.dumps(result, indent=2)+'\n')
    missing = [e for f in result['findings'] if f['code'] == 'uncovered-declarations' for e in f['elements']]
    checks.append({'id': 'uncited-part-passes-old-facts-but-fails-evidence',
                   'passed': code == 0 and contract['passed'] and not result['passed']
                   and any(e['qualifiedName'] == 'CoolerStudy::inventedPump' for e in missing),
                   'staticChecksPassed': report['staticChecksPassed'], 'oldFactContractPassed': contract['passed'],
                   'evidencePassed': result['passed']})
    bad_binding = a.output/'self-binding.sysml'
    original = (fixture/'model.sysml').read_text()
    assert 'bind enable = controller.enable' in original
    bad_binding.write_text(original.replace('bind enable = controller.enable', 'bind enable = enable'))
    code, report = run('self-binding', bad_binding)
    current_contract = json.loads((fixture.parent/'contract.json').read_text())
    old_contract = copy.deepcopy(current_contract)
    next(c for c in old_contract['checks'] if c['id'] == 'boundary-binding')['expect'] = {}
    old_result = check_contract(report, old_contract)
    current_result = check_contract(report, current_contract)
    failed = [c['id'] for c in current_result['checks'] if not c['passed']]
    checks.append({'id': 'binding-existence-does-not-prove-endpoints',
                   'passed': code == 0 and old_result['passed'] and failed == ['boundary-binding'],
                   'staticChecksPassed': report['staticChecksPassed'],
                   'oldContractPassed': old_result['passed'], 'newContractPassed': current_result['passed']})
    mutations = [
        ('missing-performance', original.replace('        perform action regulate : Regulate;\n', ''), 'controller-performs-regulate'),
        ('documentation-only-threshold', original.replace('require constraint { cooler.controller.sampleCapacity >= 4 }',
          'doc /* cooler.controller.sampleCapacity >= 4 */'), 'requirement-constraint'),
        ('wrong-constraint-operand', original.replace('attribute sampleCapacity : Integer = 4;',
          'attribute sampleCapacity : Integer = 4; attribute otherCapacity : Integer = 4;').replace(
          'cooler.controller.sampleCapacity >= 4', 'cooler.controller.otherCapacity >= 4'), 'requirement-constraint'),
    ]
    for name, text, expected_failure in mutations:
        source = a.output/(name+'.sysml')
        assert text != original
        source.write_text(text)
        code, report = run(name, source)
        checked = check_contract(report, current_contract)
        failed = [c['id'] for c in checked['checks'] if not c['passed']]
        checks.append({'id': name, 'passed': code == 0 and expected_failure in failed,
                       'staticChecksPassed': report['staticChecksPassed'], 'failedFactChecks': failed})
    flow_line = 'flow of TemperatureReading from source.observation to target.observation;'
    duplicate = a.output/'duplicate-flow.sysml'
    duplicate.write_text(original.replace(flow_line, flow_line+' '+flow_line))
    code, report = run('duplicate-flow', duplicate)
    sig = signature(report, ['CoolerStudy::Cooler', 'CoolerStudy::context'])
    checks.append({'id': 'duplicate-directed-exchange-rejected',
                   'passed': code == 0 and not check_exchanges(sig)})
    invisible = a.output/'missing-import-visibility.sysml'
    invisible.write_text('package MissingVisibility { import ScalarValues::*; attribute x : Integer = 1; }\n')
    code, report = run('missing-import-visibility', invisible)
    checks.append({'id': 'missing-import-visibility-rejected', 'passed': code != 0 and not report['staticChecksPassed']})
    result = {'passed': all(c['passed'] for c in checks), 'checks': checks,
              'limits': 'Pinned Pilot 0.52.0 examples and one deliberately added uncited part; not full conformance, vendor compatibility or comparative generation success rates.'}
    (a.output/'regressions.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, indent=2))
    return 0 if result['passed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
