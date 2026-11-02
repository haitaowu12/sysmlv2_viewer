#!/usr/bin/env python3
"""Fresh-engine regressions for semantic false positives and source-set mapping."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
from check_contract import check_contract
from engineering import interconnection

ROOT = Path(__file__).resolve().parents[2]

def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ['jar', 'library', 'output']:
        p.add_argument('--' + name, type=Path, required=True)
    a = p.parse_args()
    a.output.mkdir(parents=True, exist_ok=False)
    def run(name, source, source_set=False):
        out = a.output / name
        cmd = [sys.executable, '-B', str(ROOT / 'tools/reference-pilot/qualify.py'),
               '--jar', str(a.jar), '--library', str(a.library), '--output', str(out),
               '--source-set' if source_set else '--source', str(source)]
        with (a.output / (name + '.log')).open('w') as log:
            result = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, timeout=210)
        return result.returncode, json.loads((out / 'report.json').read_text())
    fixture = ROOT / 'fixtures/authoring/cooler/interfaces/model.sysml'
    bad = a.output / 'ambiguous-satisfaction.sysml'
    text = fixture.read_text()
    assert 'by CoolerStudy::context::cooler' in text
    bad.write_text(text.replace('by CoolerStudy::context::cooler', 'by cooler'))
    code, report = run('ambiguous', bad)
    contract = json.loads((ROOT / 'fixtures/authoring/cooler/contract.json').read_text())
    checked = check_contract(report, contract)
    failed = [c['id'] for c in checked['checks'] if not c['passed']]
    checks = [{'id': 'static-pass-does-not-prove-intended-satisfaction',
               'passed': code == 0 and report['staticChecksPassed'] and 'satisfaction-target' in failed,
               'failedExpectedFacts': failed}]
    code, report = run('source-set', ROOT / 'fixtures/workspaces/source-set/sources.json', True)
    left = next(e for e in report['elements'] if e.get('qualifiedName') == 'SourceSetStudy::Pair::left')
    sheet = interconnection(report, 'SourceSetStudy::Pair')
    marks = [m for m in sheet['marks'] if m['semanticLocator'] == 'SensorLibrary::Sensor::readings']
    checks.append({'id': 'source-set-mapping-and-repeated-port-context',
                   'passed': code == 0 and left['originalSource']['path'] == 'model.sysml'
                   and left['originalSource']['line'] == 4 and len(marks) == 2
                   and len({m['presentationId'] for m in marks}) == 2})
    broken = a.output / 'broken-source-set'
    shutil.copytree(ROOT / 'fixtures/workspaces/source-set', broken)
    model = broken / 'model.sysml'
    model.write_text(model.read_text().replace('left : Sensor', 'left : MissingType'))
    code, report = run('source-set-invalid', broken / 'sources.json', True)
    checks.append({'id': 'invalid-source-set-diagnostic-original-file-line',
                   'passed': code != 0 and not report['staticChecksPassed'] and any(
                       d.get('originalSource', {}).get('path') == 'model.sysml'
                       and d['originalSource']['line'] == 4 for d in report['diagnostics'])})
    code, report = run('monitor', ROOT / 'fixtures/workspaces/formal-monitor/model/monitor.sysml')
    expected = {'schemaVersion': 1, 'checks': [{'id': 'monitor-satisfaction',
        'select': {'metaclass': 'SatisfyRequirementUsage'},
        'expect': {'references': {'satisfyingFeature': 'MonitorExample::context::monitor'}}}]}
    monitor = check_contract(report, expected)
    checks.append({'id': 'monitor-qualified-satisfaction', 'passed': code == 0 and monitor['passed']})
    result = {'passed': all(c['passed'] for c in checks), 'checks': checks}
    (a.output / 'regressions.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
    return 0 if result['passed'] else 2

if __name__ == '__main__':
    raise SystemExit(main())
