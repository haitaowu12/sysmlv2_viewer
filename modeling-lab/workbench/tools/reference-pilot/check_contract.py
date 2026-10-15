#!/usr/bin/env python3
"""Check independent expected model facts against fresh Pilot EMF evidence."""
import argparse
import hashlib
import json
from pathlib import Path
from receipts import bind_receipt
from engineering import index_report, sem


def references(value):
    return [v for v in value if isinstance(v,dict) and 'id' in v] if isinstance(value,list) else ([value] if isinstance(value,dict) and 'id' in value else [])

def reference_path(ref, index):
    if not isinstance(ref,dict) or 'id' not in ref: return None
    element = index.get(ref['id'], {})
    chain = sem(element, 'chainingFeature', [])
    if chain: return [v.get('qualifiedName', v.get('name', '?')) for v in chain]
    return [ref.get('qualifiedName', ref.get('name', '?'))]


def satisfaction_polarity(element):
    """Only a resolved engine Boolean establishes assertion polarity."""
    value = sem(element, 'isNegated')
    return 'negative' if value is True else 'positive' if value is False else 'unknown'


def constraint_membership_kind(element, index):
    """Resolve the owning language membership; absence is not 'require'."""
    membership = index.get(sem(element, 'owningMembership', {}).get('id'), {})
    if (membership.get('metaclass') != 'RequirementConstraintMembership'
            or sem(membership, 'ownedConstraint', {}).get('id') != element.get('sessionElementId')):
        return 'unknown'
    kind = sem(membership, 'kind')
    return kind if kind in {'assumption', 'requirement'} else 'unknown'


def documentation_facts(element, index):
    """Directly documented bodies, with engine ownership and source anchors."""
    identity = element.get('sessionElementId')
    docs = []
    for ref in references(sem(element, 'documentation')):
        doc = index.get(ref['id'], {})
        if (doc.get('metaclass') == 'Documentation'
                and sem(doc, 'documentedElement', {}).get('id') == identity
                and sem(doc, 'owner', {}).get('id') == identity
                and isinstance(sem(doc, 'body'), str)):
            docs.append({'elementId': doc['sessionElementId'], 'body': sem(doc, 'body'),
                         'line': doc.get('line')})
    return sorted(docs, key=lambda d: (d.get('line') or 0, d['body']))


def expression_fact(element, index, seen=None):
    """Bounded resolved expression structure; never evaluate or parse source text."""
    seen = set() if seen is None else seen
    identity = element.get('sessionElementId')
    if not identity or identity in seen:
        return {'unsupported': 'missing-or-cyclic-expression'}
    seen = seen | {identity}
    kind = element['metaclass']
    if kind.startswith('Literal'):
        return {'kind': kind, 'value': sem(element, 'value')}
    if kind == 'FeatureReferenceExpression':
        return {'kind': 'FeaturePath', 'path': reference_path(sem(element, 'referent'), index)}
    operands = [expression_fact(index.get(v['id'], {}), index, seen)
                for v in references(sem(element, 'operand'))]
    if kind == 'FeatureChainExpression' and len(operands) == 1 and operands[0].get('kind') == 'FeaturePath':
        prefix = operands[0].get('path')
        suffix = reference_path(sem(element, 'targetFeature'), index)
        if prefix and suffix:
            return {'kind': 'FeaturePath', 'path': prefix + suffix}
    if kind == 'OperatorExpression' and isinstance(sem(element, 'operator'), str) and operands:
        return {'kind': kind, 'operator': sem(element, 'operator'), 'operands': operands}
    if kind == 'ConstraintUsage':
        children = [index.get(v['id'], {}) for v in references(sem(element, 'ownedElement'))]
        expressions = [e for e in children if e.get('metaclass', '').endswith('Expression') or e.get('metaclass', '').startswith('Literal')]
        if len(expressions) == 1:
            return expression_fact(expressions[0], index, seen)
    return {'unsupported': kind}


def facts(element, index):
    s = element.get('semantics', {})
    return {
        'qualifiedName': element.get('qualifiedName'),
        'name': element.get('name'),
        'metaclass': element['metaclass'],
        'owner': s.get('owner', {}).get('qualifiedName'),
        'types': sorted(v.get('qualifiedName', '') for v in references(s.get('type'))),
        'source': reference_path(s.get('sourceFeature'), index),
        'targets': [reference_path(v,index) for v in references(s.get('targetFeature'))],
        'endpoints': [reference_path(v,index) for v in references(s.get('relatedFeature'))],
        'expression': expression_fact(element, index) if element['metaclass'] == 'ConstraintUsage' else None,
        'transition': transition_fact(element, index) if element['metaclass'] == 'TransitionUsage' else None,
        'polarity': satisfaction_polarity(element) if element['metaclass'] == 'SatisfyRequirementUsage' else None,
        'constraintKind': constraint_membership_kind(element, index) if element['metaclass'] == 'ConstraintUsage' else None,
        'documentationBodies': [d['body'] for d in documentation_facts(element, index)],
        'literalValues': [sem(index[v['id']], 'value') for v in s.get('ownedElement', [])
                          if v['id'] in index and index[v['id']]['metaclass'].startswith('Literal')],
    }


def transition_fact(element, index):
    """Resolved transition endpoints and accepted payload types; no simulation."""
    required = {'source', 'target', 'triggerAction', 'guardExpression', 'effectAction'}
    if not required <= element.get('semantics', {}).keys():
        return {'unsupported': 'incomplete-transition-evidence'}
    triggers = []
    for ref in references(sem(element, 'triggerAction')):
        action = index.get(ref['id'], {})
        payload = sem(action, 'payloadParameter', {})
        parameter = index.get(payload.get('id'), {})
        triggers.append(sorted(v.get('qualifiedName') for v in references(sem(parameter, 'type'))))
    return {'source': sem(element, 'source', {}).get('qualifiedName'),
            'target': sem(element, 'target', {}).get('qualifiedName'),
            'triggerTypes': sorted(triggers),
            'guardCount': len(references(sem(element, 'guardExpression'))),
            'effectCount': len(references(sem(element, 'effectAction')))}


def check_contract(report, contract):
    if (not isinstance(contract, dict) or set(contract) - {'schemaVersion', 'checks'}
            or type(contract.get('schemaVersion')) is not int or contract['schemaVersion'] != 1
            or not isinstance(contract.get('checks'), list) or not contract['checks']):
        raise ValueError('Contract requires schemaVersion 1 and nonempty checks')
    index = index_report(report)
    results = []
    ids=set()
    for check in contract['checks']:
        if not isinstance(check, dict) or set(check) - {'id', 'select', 'expect', 'count', 'candidateCount'}:
            raise ValueError('Unsupported contract check field')
        if not isinstance(check.get('id'), str) or not check['id'].strip():
            raise ValueError('Contract check requires nonempty ID')
        expected_count = check.get('count', 1)
        if type(expected_count) is not int or expected_count < 0:
            raise ValueError('Expected count must be a nonnegative integer')
        if 'candidateCount' in check and (type(check['candidateCount']) is not int or check['candidateCount'] < 0):
            raise ValueError('candidateCount must be a nonnegative integer')
        expectations = check.get('expect', {})
        allowed = {'qualifiedName', 'name', 'metaclass', 'owner', 'types', 'source', 'targets',
                   'endpoints', 'literalValues', 'typeIncludes', 'semanticFields',
                   'referenceTargets', 'references', 'sourceIncludes', 'endpointsUnordered', 'expression', 'transition',
                   'polarity', 'constraintKind', 'documentationBodies'}
        if not isinstance(expectations, dict) or set(expectations) - allowed:
            raise ValueError('Unsupported contract expectation')
        for key in ('semanticFields', 'referenceTargets', 'references'):
            if key in expectations and (not isinstance(expectations[key], dict) or not expectations[key]):
                raise ValueError(key + ' requires a nonempty mapping')
        for key in ('referenceTargets', 'references'):
            if key in expectations and any(not isinstance(v, str) or not v.strip() for v in expectations[key].values()):
                raise ValueError(key + ' requires nonempty target names')
        if 'sourceIncludes' in expectations and (not isinstance(expectations['sourceIncludes'], list)
                or not expectations['sourceIncludes']
                or any(not isinstance(v, str) or not v for v in expectations['sourceIncludes'])):
            raise ValueError('sourceIncludes requires nonempty text clauses')
        if 'endpointsUnordered' in expectations and (not isinstance(expectations['endpointsUnordered'], list)
                or not expectations['endpointsUnordered']
                or any(not isinstance(path, list) or not path or any(not isinstance(v, str) or not v for v in path)
                       for path in expectations['endpointsUnordered'])):
            raise ValueError('endpointsUnordered requires nonempty qualified-name paths')
        if check['id'] in ids: raise ValueError('Duplicate check ID')
        ids.add(check['id'])
        selector = check['select']
        if not isinstance(selector, dict) or not selector or set(selector) - {'qualifiedName','metaclass','owner','name'}:
            raise ValueError('Unsupported or empty selector')
        candidates = [e for e in report['elements'] if all(facts(e,index).get(k)==v for k,v in selector.items())]
        matches=[]
        for e in candidates:
            f=facts(e,index); passed=True
            for key,value in check.get('expect',{}).items():
                if key in f:
                    passed &= f[key] == value
                elif key == 'endpointsUnordered':
                    # Binding orientation is immaterial; multiplicity of ends is not.
                    passed &= sorted(json.dumps(v) for v in f['endpoints']) == sorted(json.dumps(v) for v in value)
                elif key == 'typeIncludes':
                    passed &= value in f['types']
                elif key == 'semanticFields':
                    passed &= all(k in e.get('semantics', {}) and sem(e,k)==v for k,v in value.items())
                elif key == 'referenceTargets':
                    for field,target in value.items():
                        resolved=[]
                        for ref in references(sem(e,field)):
                            node=index.get(ref['id'],{})
                            terminal=sem(node,'featureTarget',ref)
                            resolved.append(terminal.get('qualifiedName') if isinstance(terminal,dict) else None)
                        passed &= target in resolved
                elif key == 'references':
                    for field,target in value.items():
                        refs=sem(e,field,[]);refs=refs if isinstance(refs,list) else [refs]
                        passed &= target in [v.get('qualifiedName') for v in refs if isinstance(v,dict)]
                elif key == 'sourceIncludes':
                    # Textual completeness only; explicitly not expression evaluation.
                    passed &= all(v in e.get('source','') for v in value)
                else: raise ValueError('Unsupported expectation '+key)
            if passed: matches.append(e)
        expected_count=check.get('count',1)
        results.append({'id':check['id'],'passed':len(matches)==expected_count and ('candidateCount' not in check or len(candidates)==check['candidateCount']),
                        'expectedCount':expected_count,'matchedCount':len(matches),'candidateCount':len(candidates),
                        'matchedFacts':[facts(e,index) for e in matches],
                        'sourceAnchors':[{'line':e.get('line'),'name':e.get('qualifiedName')} for e in candidates]})
    return {'passed': (report.get('staticChecksPassed') is True) and all(v['passed'] for v in results),
            'staticChecksPassed': (report.get('staticChecksPassed') is True),'checks':results,
            'limits':'Expected-fact checks and textual clauses; no engineering approval, expression execution or full-language conformance'}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--report',type=Path,required=True);p.add_argument('--contract',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    if a.output.exists(): raise ValueError('Do not overwrite a check receipt')
    from report_integrity import load_report, digest
    report=load_report(a.report)
    contract_raw=a.contract.read_bytes()
    r=check_contract(report,json.loads(contract_raw))
    r=bind_receipt(r,a.report,contract=a.contract,report_data=report,input_digests={'contract':digest(contract_raw)})
    a.output.write_text(json.dumps(r,indent=2)+'\n')
    print(json.dumps({'passed':r['passed'],'checks':len(r['checks']),'failed':[x['id'] for x in r['checks'] if not x['passed']]}))
    return 0 if r['passed'] else 2

if __name__=='__main__': raise SystemExit(main())
