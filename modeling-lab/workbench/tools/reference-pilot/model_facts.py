"""Portable, named semantic facts for cross-input and fresh-load comparisons.

This is a bounded comparison signature, not whole-language model equivalence.
"""
import hashlib
import json
from engineering import interconnection, index_report, sem
from check_contract import references, satisfaction_polarity, constraint_membership_kind, documentation_facts


def signature(report, scopes):
    if not report.get('staticChecksPassed'):raise ValueError('Cannot compare invalid models')
    index=index_report(report)
    parts=[]; ports=[]; literals=[]; successions=[]; satisfaction=[]; structures=[]; constraint_kinds=[]; documentation=[]
    for e in report['elements']:
        q=e.get('qualifiedName');s=e.get('semantics',{})
        owner=s.get('owner',{}).get('qualifiedName')
        if q and e['metaclass']=='PartUsage' and owner:
            parts.append((q,owner,s.get('isComposite'),tuple(sorted(r.get('qualifiedName','') for r in references(s.get('type'))))))
        if q and e['metaclass']=='PortUsage' and owner and owner in [x.get('qualifiedName') for x in report['elements'] if x['metaclass']=='PartDefinition']:
            ports.append((q,tuple(sorted(r.get('qualifiedName','') for r in references(s.get('type'))))))
        if e['metaclass'].startswith('Literal') and owner:
            parent=index.get(s.get('owner',{}).get('id'),{})
            if parent.get('metaclass')=='AttributeUsage':literals.append((owner,e['metaclass'],s.get('value')))
        if e['metaclass']=='SuccessionAsUsage':
            source=s.get('sourceFeature',{});targets=references(s.get('targetFeature'))
            if isinstance(source,dict):successions.append((owner,source.get('name'),tuple(t.get('name') for t in targets)))
        if e['metaclass']=='SatisfyRequirementUsage':
            target=s.get('satisfyingFeature',{});target=index.get(target.get('id'),target)
            terminal=sem(target,'featureTarget',target)
            satisfaction.append((s.get('satisfiedRequirement',{}).get('qualifiedName'),terminal.get('qualifiedName'),satisfaction_polarity(e)))
        if e['metaclass']=='ConstraintUsage':
            constraint_kinds.append((owner,q,constraint_membership_kind(e,index)))
        if q:
            documentation.extend((q,d['body']) for d in documentation_facts(e,index))
    for scope in scopes:
        view=interconnection(report,scope)
        if view['excluded']:raise ValueError('Cannot compare a scope with excluded relationships')
        def end(pair):
            owner,port=pair
            return (index[owner].get('qualifiedName') if owner else scope,index[port].get('name'))
        flows=sorted((end(f['source']),end(f['target']),f['item']) for f in view['flows'])
        connectors=sorted((c['kind'],tuple(sorted((end(c['endpoints'][0]),end(c['endpoints'][1]))))) for c in view['connectors'])
        structures.append((scope,connectors,flows))
    result={k:sorted(v,key=lambda x:json.dumps(x,sort_keys=True)) for k,v in dict(parts=parts,ports=ports,literals=literals,successions=successions,satisfaction=satisfaction,structures=structures,constraintKinds=constraint_kinds,documentation=documentation).items()}
    encoded=json.dumps(result,sort_keys=True,separators=(',',':'))
    return {'sha256':hashlib.sha256(encoded.encode()).hexdigest(),'facts':result,
            'limits':'Named structure/ports/literals/successions/satisfaction and selected binary interface scopes; not full semantic equivalence'}
