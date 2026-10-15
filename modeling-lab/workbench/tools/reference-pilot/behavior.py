"""Bounded declared-behavior projections from engine facts; never simulation.

One projection serves the lab and the HTML explainer. Ownership, endpoints and
parallelism come from the engine. Source excerpts are quotations, not parsed
semantics. Inherited/redefined behavior requires a separately selected definition.
"""
from collections import defaultdict
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import textwrap

STATES = {'StateDefinition', 'StateUsage', 'ExhibitStateUsage'}
ACTIONS = {'ActionDefinition', 'ActionUsage', 'PerformActionUsage'}
FLOWS = {'FlowUsage', 'SuccessionFlowUsage', 'SuccessionAsUsage'}
CONTROL_NODES = {'ControlNode', 'ForkNode', 'JoinNode', 'DecisionNode', 'MergeNode'}
# These are the standard library action-body boundary usages returned by the
# Pilot exporter for `first start;` and `then done;`.  They are included only
# when the typed relationship points at the exact exported elements.
ACTION_BOUNDARIES = {
    'Actions::Action::start': 'start',
    'Actions::Action::done': 'done',
}
BOUNDARY = 'Declared behavior only: no execution, timing, satisfaction or acceptance result.'


def refs(value):
    if isinstance(value, dict) and isinstance(value.get('id'), str):
        return [value]
    return [r for r in value if isinstance(r, dict) and isinstance(r.get('id'), str)] if isinstance(value, list) else []


def project(report, target, limit=120):
    if report.get('staticChecksPassed') is not True:
        raise ValueError('Behavior projection requires a statically valid report')
    elements = report.get('elements', [])
    ix = {e['sessionElementId']: e for e in elements}
    if len(ix) != len(elements):
        raise ValueError('Duplicate report element IDs')
    roots = [e for e in elements if e.get('qualifiedName') == target]
    if len(roots) != 1 or roots[0]['metaclass'] not in STATES | ACTIONS:
        raise ValueError('Select one state or action definition/usage for a behavior projection')
    if type(limit) is not int or not 1 <= limit <= 300:
        raise ValueError('Behavior element limit must be 1–300')
    root = roots[0]
    semantic = lambda e, k, default=None: e.get('semantics', {}).get(k, default)
    children = defaultdict(list)
    for e in elements:
        for owner in refs(semantic(e, 'owner')):
            children[owner['id']].append(e)
    order = lambda e: (e.get('line') or 0, e.get('qualifiedName') or '', e['sessionElementId'])
    for values in children.values():
        values.sort(key=order)
    evidence, warnings = {}, []

    def witness(e):
        eid = e['sessionElementId']
        if eid not in evidence:
            if len(evidence) >= limit:
                raise ValueError('Behavior projection exceeds its element limit; select a smaller scope')
            source = e.get('source', '')
            evidence[eid] = dict(elementId=eid, qualifiedName=e.get('qualifiedName'),
                name=e.get('name'), metaclass=e['metaclass'], line=e.get('line'), endLine=e.get('endLine'),
                excerpt=source.strip()[:1200], excerptTruncated=len(source.strip()) > 1200)
        return eid

    def quoted(value, owner, field):
        result = []
        for ref in refs(value):
            e = ix.get(ref['id'])
            if not e:
                warnings.append(dict(elementId=witness(owner), reason=field + ': referenced evidence is outside the source report'))
                continue
            eid = witness(e)
            result.append(dict(elementId=eid, name=e.get('name'), text=' '.join(e.get('source', '').split())[:400],
                               textTruncated=len(' '.join(e.get('source', '').split())) > 400))
        return result

    nodes, relations = [], []
    root_id = witness(root)
    visited = set()
    state_mode = root['metaclass'] in STATES
    # Local ownership only: do not union similarly named definitions or invent occurrences.
    def visit(e, parent=None, depth=0):
        if e['sessionElementId'] in visited or depth > 8:
            raise ValueError('Cyclic or overly deep behavior ownership')
        visited.add(e['sessionElementId'])
        eid = witness(e)
        node = dict(id=eid, elementId=eid, name=e.get('name') or e['metaclass'],
                    parent=parent, kind=e['metaclass'], parallel=None, subactions={},
                    entryDeclarations=[], constraints=[])
        if e['metaclass'] in STATES:
            value = semantic(e, 'isParallel')
            node['parallel'] = value if type(value) is bool else None
            if type(value) is not bool:
                warnings.append(dict(elementId=eid, reason='Parallelism is unknown; requalify with the behavior-field exporter'))
            entry_declaration_ids = set()
            for declaration in refs(semantic(e, 'entryDeclaration')):
                membership = ix.get(declaration['id'])
                membership_owner = refs(semantic(membership, 'owner')) if membership else []
                if (membership and membership.get('metaclass') == 'StateSubactionMembership'
                        and semantic(membership, 'kind') == 'entry'
                        and any(owner.get('id') == eid for owner in membership_owner)):
                    mid = witness(membership)
                    entry_declaration_ids.add(mid)
                    node['entryDeclarations'].append(dict(elementId=mid, name='entry',
                                                           text=' '.join(membership.get('source', '').split())[:400],
                                                           textTruncated=len(' '.join(membership.get('source', '').split())) > 400))
                else:
                    warnings.append(dict(elementId=eid, reason='Entry declaration is not a resolved StateSubactionMembership owned by this state'))
            for field in ('entryAction', 'doAction', 'exitAction'):
                node['subactions'][field] = quoted(semantic(e, field), e, field)
                # Field coverage is reported per field. A missing field is not evidence
                # of absence, regardless of the producer version or its sibling fields.
                if field not in e.get('semantics', {}):
                    if field == 'entryAction' and entry_declaration_ids:
                        warnings.append(dict(elementId=eid, reason='Entry declaration is available, but no ActionUsage was exported; no action identity is inferred'))
                    else:
                        warnings.append(dict(elementId=eid, reason=field + ' evidence is unavailable in this report'))
            node['constraints'] = quoted([{'id': c['sessionElementId']} for c in children[eid]
                                          if c['metaclass'] in {'ConstraintUsage', 'AssertConstraintUsage'}], e, 'constraints')
        nodes.append(node)
        if e['metaclass'] in STATES and entry_declaration_ids and not refs(semantic(e, 'entryAction')):
            for declaration_id in entry_declaration_ids:
                nodes.append(dict(id=declaration_id, elementId=declaration_id, name='entry',
                                  parent=eid, kind='EntryDeclaration', parallel=None,
                                  subactions={}, entryDeclarations=[], constraints=[]))
        allowed = STATES if state_mode else ACTIONS
        nested = [c for c in children[eid] if c['metaclass'] in allowed]
        inherited = [v for v in refs(semantic(e, 'inheritedFeature')) if v.get('metaclass') in STATES | ACTIONS | FLOWS | CONTROL_NODES | {'TransitionUsage'}]
        if inherited:
            warnings.append(dict(elementId=eid, reason='Inherited behavior is not expanded; select its source definition'))
        for c in nested:
            visit(c, eid, depth + 1)
        # Include initial entry actions that are actual transition endpoints, not every subaction as a state.
        for rel in children[eid]:
            kind = rel['metaclass']
            entry_succession = (state_mode and kind == 'SuccessionAsUsage'
                                and any(ref.get('id') in entry_declaration_ids for ref in refs(semantic(rel, 'source'))))
            if kind not in ({'TransitionUsage'} if state_mode else FLOWS) and not entry_succession:
                if not state_mode and (kind in CONTROL_NODES or (kind.endswith('ActionUsage') and kind not in ACTIONS)):
                    warnings.append(dict(elementId=witness(rel), reason='Unsupported action control or subtype: ' + kind))
                continue
            relation = dict(elementId=witness(rel), owner=eid, kind=kind,
                            name=rel.get('name') or kind, source=None, target=None, triggers=[], guards=[], effects=[], conditionStatus={})
            a = refs(semantic(rel, 'source' if state_mode else 'sourceFeature'))
            b = refs(semantic(rel, 'target' if state_mode else 'targetFeature'))
            if len(a) != 1 or len(b) != 1:
                warnings.append(dict(elementId=relation['elementId'], reason='Only one resolved source and target are supported'))
                continue
            relation['source'], relation['target'] = a[0]['id'], b[0]['id']
            if state_mode:
                if entry_succession:
                    relation['name'] = 'entry'
                    relation['entryDeclaration'] = relation['source']
                    for field, key in [('triggerAction', 'triggers'), ('guardExpression', 'guards'), ('effectAction', 'effects')]:
                        value = semantic(rel, field)
                        references = refs(value)
                        relation[key] = quoted(value, rel, field)
                        if value is None:
                            status = 'unknown'
                        elif value == []:
                            status = 'not-declared'
                        elif references and len(relation[key]) == len(references) and all(q['text'] for q in relation[key]):
                            status = 'resolved'
                        else:
                            status = 'unavailable'
                        relation['conditionStatus'][key] = status
                        if status in {'unknown', 'unavailable'}:
                            warnings.append(dict(elementId=relation['elementId'],
                                                 reason=field + ': condition evidence unavailable; do not infer absence'))
                    relations.append(relation)
                    continue
                for field, key in [('triggerAction', 'triggers'), ('guardExpression', 'guards'), ('effectAction', 'effects')]:
                    value = semantic(rel, field)
                    references = refs(value)
                    relation[key] = quoted(value, rel, field)
                    # Coverage belongs to each returned field, not a report-wide producer version.
                    if value is None:
                        # A producer version cannot turn a missing/null field into
                        # evidence of absence.
                        status = 'unknown'
                    elif value == []:
                        # An explicit empty collection is an engine fact. Producers
                        # must omit fields they did not expose instead.
                        status = 'not-declared'
                    elif references and len(relation[key]) == len(references) and all(q['text'] for q in relation[key]):
                        status = 'resolved'
                    else:
                        status = 'unavailable'
                    relation['conditionStatus'][key] = status
                    if status in {'unknown', 'unavailable'}:
                        warnings.append(dict(elementId=relation['elementId'],
                            reason=field + ': condition evidence unavailable; do not infer absence'))
                # Mark actual entry-action endpoints without treating their name as special syntax.
                entry_ids = {v['id'] for v in refs(semantic(e, 'entryAction'))}
                for endpoint in a + b:
                    child = ix.get(endpoint['id'])
                    if child and endpoint['id'] in entry_ids and endpoint['id'] not in {n['id'] for n in nodes}:
                        nodes.append(dict(id=witness(child), elementId=child['sessionElementId'], name=child.get('name') or 'Entry action',
                                          parent=eid, kind='EntryAction', parallel=None, subactions={},
                                          entryDeclarations=[], constraints=[]))
            else:
                # The exporter represents action-body `start` and `done` as
                # typed standard-library ActionUsage endpoints. Include those
                # exact witnesses so a real start/action/done chain remains
                # visible; do not synthesize markers from names or topology.
                for endpoint in a + b:
                    child = ix.get(endpoint['id'])
                    if (child and child.get('metaclass') == 'ActionUsage'
                            and child.get('qualifiedName') in ACTION_BOUNDARIES
                            and child['sessionElementId'] not in {n['id'] for n in nodes}):
                        nodes.append(dict(id=witness(child), elementId=child['sessionElementId'],
                                          name=ACTION_BOUNDARIES[child['qualifiedName']], parent=eid,
                                          kind='ActionBoundary', parallel=None, subactions={},
                                          entryDeclarations=[], constraints=[]))
                # Preserve complete item/endpoint syntax as a quotation; no label-derived topology.
                declaration = ' '.join(rel.get('source', '').split())
                relation['declaration'] = declaration[:600]
                relation['declarationTruncated'] = len(declaration) > 600
            relations.append(relation)
    visit(root)
    node_ids = {n['id'] for n in nodes}
    supported = []
    for rel in relations:
        if rel['source'] not in node_ids or rel['target'] not in node_ids:
            warnings.append(dict(elementId=rel['elementId'], reason='Relationship endpoint is outside the selected local behavior tree'))
        else:
            supported.append(rel)
    return dict(schemaVersion=1, profile='declared-behavior-v1', kind='state' if state_mode else 'action',
                sourceSha256=report.get('sourceSha256'), reportSha256=report.get('reportIntegrity', {}).get('reportSha256'),
                target=target, rootId=root_id, nodes=nodes, relations=supported, evidence=list(evidence.values()), warnings=warnings,
                coverage='partial' if warnings else 'selected-local-behavior', boundary=BOUNDARY,
                limits=['Only explicitly owned state/action trees and resolved binary relationships are projected.',
                        'Inherited behavior and unsupported controls are not expanded; warnings are not proof of absence.',
                        'Action start/done are shown only when the exporter returns typed standard-library endpoints; absent endpoints remain unresolved.',
                        'An empty state entry declaration is shown as its StateSubactionMembership witness; no implicit ActionUsage is inferred.',
                        'Ordinary flows are transfers, not an inferred schedule; succession flows retain their separate kind.',
                        'Exact source excerpts are quotations, not evaluated expressions.'])


def graph_dot(projection):
    """Separate edge identities from long declarations; evidence rows carry full labels."""
    q = lambda s: json.dumps(str(s), ensure_ascii=False)
    wrap = lambda s: '\n'.join(textwrap.wrap(str(s), 30) or [''])
    nodes = projection['nodes']; root = projection['rootId']
    names = {n['id']: 'n' + str(i) for i, n in enumerate(nodes)}
    by_parent = defaultdict(list)
    for n in nodes:
        by_parent[n['parent']].append(n)
    lines = ['digraph G {', 'graph [rankdir=TB, compound=true, nodesep=0.5, ranksep=0.7, pad=0.3, bgcolor="white"];',
             'node [shape=box, style=rounded, fontname="Arial", fontsize=16, margin="0.22,0.15"];',
             'edge [fontname="Arial", fontsize=14, arrowsize=0.8];']

    def emit(n):
        nid=names[n['id']]; kids=by_parent[n['id']]
        parts=[wrap(n['name'])]
        if n['parallel'] is True: parts.append('PARALLEL REGIONS')
        elif n['kind'] in STATES and n['parallel'] is None: parts.append('Parallelism unknown')
        for field, label in [('entryAction', 'entry'), ('doAction', 'do'), ('exitAction', 'exit')]:
            parts.extend(wrap(label + ': ' + (a['text'] or a['name'] or 'Source unavailable') + (' [excerpt truncated]' if a.get('textTruncated') else '')) for a in n['subactions'].get(field, []))
        parts.extend(wrap('constraint: ' + c['text'] + (' [excerpt truncated]' if c.get('textTruncated') else '')) for c in n['constraints'])
        if kids:
            lines.append('subgraph cluster_' + nid + ' { label=' + q('\n'.join(parts)) + '; fontname="Arial"; fontsize=16; color="#607687";')
            # Anchor is an inspected source node, not an invented transition.
            lines.append(nid+' [shape=plaintext,label='+q(n['name'])+',URL='+q('psysml:'+n['id'])+'];')
            for child in kids: emit(child)
            lines.append('}')
        else:
            lines.append(nid+' [label='+q('\n'.join(parts))+',URL='+q('psysml:'+n['id'])+'];')
    emit(next(n for n in nodes if n['id']==root))
    for i, rel in enumerate(projection['relations'],1):
        kind = {'TransitionUsage':'transition','FlowUsage':'flow','SuccessionFlowUsage':'succession flow', 'SuccessionAsUsage':'succession'}[rel['kind']]
        label = f'R{i}: {kind}'
        if rel.get('entryDeclaration'):
            label += '\nentry declaration'
        if rel['kind']=='TransitionUsage':
            # Trigger/guard/effect are legible in a separate traceable table; never silently drop them.
            label += ('\ntrigger' if rel['triggers'] else '') + (' / guard' if rel['guards'] else '') + (' / effect' if rel['effects'] else '')
        if any(v in {'unknown', 'unavailable'} for v in rel.get('conditionStatus', {}).values()):
            label += '\ncondition evidence incomplete'
        lines.append(names[rel['source']]+' -> '+names[rel['target']]+' [label='+q(label)+',URL='+q('psysml:'+rel['elementId'])+'];')
    lines.append('}')
    return '\n'.join(lines)


def render_svg(projection):
    run = subprocess.run(['dot', '-Tsvg'], input=graph_dot(projection), text=True, capture_output=True, timeout=20, check=True)
    return run.stdout


def main():
    from report_integrity import load_report
    p=argparse.ArgumentParser(description=__doc__)
    for key in ('source','report','output'): p.add_argument('--'+key, type=Path, required=True)
    p.add_argument('--target', required=True)
    a=p.parse_args()
    report=load_report(a.report, source=a.source)
    result=project(report,a.target)
    result['projectionImplementationSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    raw=(json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode()
    with a.output.open('xb') as f: f.write(raw)
    print(json.dumps({'output':str(a.output),'coverage':result['coverage']}))


if __name__=='__main__':
    main()
