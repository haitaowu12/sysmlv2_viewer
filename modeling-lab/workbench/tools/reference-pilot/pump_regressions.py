#!/usr/bin/env python3
"""Fresh-engine negative controls for the pumping-station qualification fixture."""
import argparse
import json
from pathlib import Path
import sys

from assess_package import assess, check_exchanges
from check_contract import check_contract
from run_reference import run_reference

HERE = Path(__file__).resolve().parent
FIXTURE = HERE.parents[1]/'fixtures/authoring/pump-station'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for k in ('jar', 'library', 'output'):
        p.add_argument('--'+k, type=Path, required=True)
    a = p.parse_args(); a.output.mkdir(parents=True, exist_ok=False)
    original = (FIXTURE/'model.sysml').read_text()
    contract = json.loads((FIXTURE/'contract.json').read_text())
    manifest = json.loads((FIXTURE/'package.json').read_text())
    checks = []
    mutations = [
        ('wrong-state-target', 'first stopped accept StartRequest then running', 'first stopped accept StartRequest then tripped', 'startMotor'),
        ('wrong-trigger', 'first stopped accept StartRequest then running', 'first stopped accept StopRequest then running', 'startMotor'),
        ('missing-exhibition', '        exhibit state operating : MotorStates;\n', '', 'motor-state-performance'),
        ('cross-wired-pumps', 'controller.dutyCommand to duty.command', 'controller.dutyCommand to standby.command', 'IF-02'),
        ('unsupported-design-edit', 'installedPumpCount : Integer = 2', 'installedPumpCount : Integer = 3', 'Station::installedPumpCount'),
    ]
    for name, before, after, expected_failure in mutations:
        if original.count(before) != 1:
            raise ValueError('Mutation must target exactly one clause')
        source = a.output/(name+'.sysml'); source.write_text(original.replace(before, after))
        result = a.output/name
        code, report = run_reference([sys.executable, str(HERE/'qualify.py'), '--jar', str(a.jar), '--library', str(a.library),
                                      '--source', str(source), '--output', str(result)], a.output/(name+'.log'), result/'report.json')
        if code:
            checks.append({'id': name, 'passed': False, 'failure': report.get('failure', report.get('diagnostics'))})
            continue
        facts = check_contract(report, contract)
        failed = [c['id'] for c in facts['checks'] if not c['passed']]
        record = {'id': name, 'passed': report['staticChecksPassed'] and failed == [expected_failure], 'failedFacts': failed}
        if name == 'cross-wired-pumps':
            record['exchangeGateRejected'] = not check_exchanges(report, manifest['exchangeScopes'], manifest['expectedExchanges'])['passed']
            record['passed'] &= record['exchangeGateRejected']
        checks.append(record)
    # Fresh restoration also regenerates every requested concern and reruns all package gates.
    restored = a.output/'restored'
    code, report = run_reference([sys.executable, str(HERE/'qualify.py'), '--jar', str(a.jar), '--library', str(a.library),
                                  '--source', str(FIXTURE/'model.sysml'), '--views', str(FIXTURE/'views.json'), '--output', str(restored)],
                                 a.output/'restored.log', restored/'report.json')
    if code == 0:
        accepted = assess(restored/'report.json', FIXTURE/'package.json')
        blocked = assess(restored/'report.json', FIXTURE/'package-unresolved.json')
        (a.output/'restored-assessment.json').write_text(json.dumps(accepted, indent=2)+'\n')
        (a.output/'unresolved-assessment.json').write_text(json.dumps(blocked, indent=2)+'\n')
        checks.append({'id': 'restored-all-gates', 'passed': accepted['passed']})
        failed_gates = [k for k, v in blocked['gates'].items() if not v['passed']]
        checks.append({'id': 'unresolved-policy-blocked', 'passed': failed_gates == ['decisions'], 'failedGates': failed_gates})
    else:
        checks.append({'id': 'restored-all-gates', 'passed': False, 'failure': report.get('failure', report.get('diagnostics'))})
    result = {'passed': all(c['passed'] for c in checks), 'checks': checks,
              'limits': 'Second authored fictional system, not a blind benchmark or execution test. Unchanged intended facts checked after bounded edits.'}
    (a.output/'regressions.json').write_text(json.dumps(result, indent=2)+'\n'); print(json.dumps(result, indent=2))
    return 0 if result['passed'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
