#!/usr/bin/env python3
"""Bounded analysis of an explicit Integer default against one >= literal predicate.

Does not evaluate arbitrary SysML, count installed equipment, or execute behavior.
"""
import argparse
import json
from pathlib import Path
from check_contract import facts
from engineering import index_report
from report_integrity import load_report


def analyze(report, attribute, requirement):
    result = {'schemaVersion': 1, 'policy': 'declared-integer-capacity-v1',
              'modelSha256': report.get('sourceSha256'), 'attribute': attribute, 'requirement': requirement,
              'status': 'unsupported', 'limits': 'Declared integer default only; not instance overrides, computed part cardinality, installed inventory, physical performance or requirement satisfaction evidence.'}
    if not report.get('staticChecksPassed') or not report.get('sourceSha256'):
        return dict(result, reason='Requires a statically valid revision-bound report')
    index = index_report(report)
    values = [facts(e, index) for e in report['elements'] if e.get('qualifiedName') == attribute]
    predicates = [facts(e, index) for e in report['elements'] if e.get('metaclass') == 'ConstraintUsage'
                  and e.get('semantics', {}).get('owner', {}).get('qualifiedName') == requirement]
    if len(values) != 1 or len(predicates) != 1:
        return dict(result, reason='Requires exactly one selected default and one owned constraint')
    value = values[0]; expression = predicates[0]['expression'] or {}
    if predicates[0].get('constraintKind') != 'requirement':
        return dict(result, reason='Requires an engine-resolved required constraint membership; assumed or unknown conditions are unsupported',
                    constraintKind=predicates[0].get('constraintKind', 'unknown'))
    operands = expression.get('operands', [])
    if (value['metaclass'] != 'AttributeUsage' or value['types'] != ['ScalarValues::Integer']
            or len(value['literalValues']) != 1 or type(value['literalValues'][0]) is not int
            or expression.get('operator') != '>=' or len(operands) != 2
            or operands[0].get('kind') != 'FeaturePath' or not operands[0].get('path')
            or operands[0]['path'][-1] != attribute
            or operands[1].get('kind') != 'LiteralInteger' or type(operands[1].get('value')) is not int):
        return dict(result, reason='Expression/default outside declared-integer-capacity-v1')
    declared = value['literalValues'][0]; threshold = operands[1]['value']
    if not (0 <= declared <= 9007199254740991 and 0 <= threshold <= 9007199254740991):
        return dict(result, reason='Counts outside supported exact nonnegative integer range')
    return dict(result, status='declared-comparison-passed' if declared >= threshold else 'declared-design-shortfall',
                declaredValue=declared, requiredMinimum=threshold, comparison=f'{declared} >= {threshold}',
                comparisonResult=declared >= threshold, units='count', physicalVerification='not-evaluated')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--report', type=Path, required=True)
    p.add_argument('--attribute', required=True); p.add_argument('--requirement', required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args(); report = load_report(a.report)
    result = analyze(report, a.attribute, a.requirement)
    result['reportIntegrity'] = report['reportIntegrity']
    with a.output.open('x') as f: json.dump(result, f, indent=2); f.write('\n')
    print(json.dumps(result, indent=2))
    return 0 if result['status'] == 'declared-comparison-passed' else 2

if __name__ == '__main__': raise SystemExit(main())
