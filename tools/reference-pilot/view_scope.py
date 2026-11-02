"""Read-only, occurrence-aware view recipes over one validated Pilot report.

Analytical projections, not native SysML view usages or a second semantic model.
"""
import hashlib
from engineering import index_report, sem, features, types, endpoint, interface_flows, LINKS
from stakeholder import human, render_svg

PARTS = {'PartDefinition', 'PartUsage'}
KINDS = {'connection', 'binding', 'flow'}
LIMITS = {'occurrences': 2000, 'depth': 8, 'diagramNodes': 40, 'diagramEdges': 120}


def catalogue(report):
    if not report.get('staticChecksPassed'):
        raise ValueError('A validated source revision is required')
    ix = index_report(report)
    roots = sorted((e for e in ix.values() if e.get('qualifiedName') and
                    (e['metaclass'] == 'PartDefinition' or e['metaclass'] == 'PartUsage' and
                     sem(e, 'owner', {}).get('metaclass') not in PARTS)), key=lambda e: e['qualifiedName'])
    nodes, relations, warnings = [], [], []
    def visit(e, path, parent, root, depth, ancestors):
        if len(nodes) >= LIMITS['occurrences']:
            raise ValueError('Model exceeds the 2000-occurrence exploration budget; split the source package. No partial catalogue returned.')
        node = {'key': path, 'parent': parent, 'root': root, 'depth': depth,
                'elementId': e['sessionElementId'], 'name': e.get('name', '(unnamed)'),
                'qualifiedName': e.get('qualifiedName', ''), 'type': ', '.join(types(e)),
                'referenced': e['metaclass'] == 'PartUsage' and not sem(e, 'isComposite', False)}
        nodes.append(node)
        fs = features(e, ix)
        children = sorted((x for x in fs if x['metaclass'] == 'PartUsage'), key=lambda x: x.get('qualifiedName', ''))
        if e['sessionElementId'] in ancestors or depth >= LIMITS['depth']:
            if children: warnings.append({'scope': path, 'reason': 'Recursive or depth-limited structure not expanded'})
            return
        childkeys = {}
        counts = {c.get('name'): sum(x.get('name') == c.get('name') for x in children) for c in children}
        for child in children:
            name = child.get('name')
            if not name or counts[name] != 1:
                warnings.append({'scope': path, 'reason': 'Unnamed or ambiguous child omitted; inspect source'})
                continue
            childkeys[name] = path + '/' + name
        by_id = {c['sessionElementId']: childkeys[c['name']] for c in children if c.get('name') in childkeys}
        ports = {x['sessionElementId'] for x in fs if x['metaclass'] == 'PortUsage'}
        child_ports = {c['sessionElementId']: {p['sessionElementId'] for p in features(c, ix) if p['metaclass'] == 'PortUsage'} for c in children}
        def contact(pair):
            component, port = pair
            if component is None:
                if port not in ports: raise ValueError('Unresolved scope port')
                key = path
            else:
                if component not in by_id or port not in child_ports[component]:
                    raise ValueError('Unresolved contextual endpoint')
                key = by_id[component]
            return {'node': key, 'portId': port, 'port': ix[port].get('name', '(unnamed)')}
        for link in fs:
            if link['metaclass'] not in LINKS: continue
            try:
                if link['metaclass'] == 'FlowUsage': raise ValueError('Direct flow syntax not translated by this profile')
                ends = sem(link, 'relatedFeature', [])
                if len(ends) != 2: raise ValueError('Only binary relationships supported')
                a, b = [contact(endpoint(ref, ix)) for ref in ends]
                key = path + '|relation|' + (link.get('qualifiedName') or str(link.get('line'))) + '|' + str(len(relations))
                kind = 'binding' if link['metaclass'] == 'BindingConnectorAsUsage' else 'connection'
                base = {'key': key, 'scope': path, 'source': a, 'target': b, 'kind': kind,
                        'elementId': link['sessionElementId'], 'name': link.get('name', '(unnamed)'), 'item': '', 'connectionId': link['sessionElementId']}
                relations.append(base)
                flows, errors = interface_flows(link, ix)
                warnings.extend({'scope': path, **error} for error in errors)
                for i, flow in enumerate(flows):
                    relations.append({**base, 'key': key + '|flow|' + str(i), 'kind': 'flow',
                                      'source': contact(flow['source']), 'target': contact(flow['target']),
                                      'elementId': flow['elementId'], 'item': flow['item']})
            except (ValueError, KeyError, TypeError) as error:
                warnings.append({'scope': path, 'elementId': link['sessionElementId'], 'reason': str(error)})
        for child in children:
            if child['sessionElementId'] in by_id:
                visit(child, by_id[child['sessionElementId']], path, root, depth + 1, ancestors | {e['sessionElementId']})
    for root in roots:
        visit(root, root['qualifiedName'], None, root['qualifiedName'], 0, set())
    # Explicit links only. Requirements with no links remain in the inventory.
    objectives = {sem(e, 'objectiveRequirement', {}).get('id') for e in ix.values()} - {None}
    frontier = set(objectives)
    while frontier:
        frontier = {e['sessionElementId'] for e in ix.values() if sem(e, 'owner', {}).get('id') in frontier} - objectives
        objectives.update(frontier)
    requirements = [e for e in ix.values() if e['metaclass'] in {'RequirementDefinition', 'RequirementUsage'} and e.get('qualifiedName') and e['sessionElementId'] not in objectives]
    traces = []
    for e in ix.values():
        if e['metaclass'] == 'SatisfyRequirementUsage':
            a, b = sem(e, 'satisfyingFeature', {}), sem(e, 'satisfiedRequirement', {})
            if a.get('id') in ix and b.get('id') in ix:
                traces.append({'kind': 'satisfy', 'sourceId': a['id'], 'targetId': b['id'], 'elementId': e['sessionElementId']})
            else: warnings.append({'scope': 'traceability', 'reason': 'Satisfaction endpoint unavailable', 'elementId': e['sessionElementId']})
        if e['metaclass'] in {'VerificationCaseDefinition', 'VerificationCaseUsage'}:
            for b in sem(e, 'verifiedRequirement', []):
                if b.get('id') in ix: traces.append({'kind': 'verify', 'sourceId': e['sessionElementId'], 'targetId': b['id'], 'elementId': e['sessionElementId']})
                else: warnings.append({'scope': 'traceability', 'reason': 'Verification target outside extracted evidence'})
    return {'roots': [e['qualifiedName'] for e in roots], 'nodes': nodes, 'relations': relations,
            'requirements': [{'elementId': e['sessionElementId'], 'name': e.get('name'), 'qualifiedName': e['qualifiedName']} for e in requirements],
            'traces': traces, 'warnings': warnings, 'limits': LIMITS, 'sourceSha256': report['sourceSha256']}


def select(catalog, recipe):
    if not isinstance(recipe, dict) or recipe.get('schemaVersion') != 1: raise ValueError('Unsupported view recipe')
    root, focus = recipe.get('root'), recipe.get('focus')
    depth, hops = recipe.get('depth', 1), recipe.get('neighbors', 0)
    if type(depth) is not int or depth not in range(5) or type(hops) is not int or hops not in range(3):
        raise ValueError('Depth must be 0–4 and interface neighbor hops 0–2')
    kinds, hidden = recipe.get('kinds', sorted(KINDS)), recipe.get('hidden', [])
    pinned = recipe.get('pinned', [])
    if not isinstance(kinds, list) or not set(kinds) <= KINDS: raise ValueError('Unknown relationship filter')
    if not isinstance(hidden, list) or not isinstance(pinned, list) or not all(isinstance(x, str) for x in hidden + pinned): raise ValueError('Invalid hidden elements')
    allnodes = {n['key']: n for n in catalog['nodes'] if n['root'] == root}
    if focus not in allnodes or any(x not in allnodes for x in hidden + pinned):
        raise ValueError('Saved scope or hidden element no longer resolves. Review the recipe; scope was not broadened.')
    chosen = {focus}
    frontier = {focus}
    for _ in range(depth):
        frontier = {n['key'] for n in allnodes.values() if n['parent'] in frontier}
        chosen.update(frontier)
    chosen.update(pinned)
    base = chosen.copy()
    eligible = [r for r in catalog['relations'] if r['source']['node'] in allnodes and r['target']['node'] in allnodes and r['kind'] in kinds]
    for _ in range(hops):
        adjacent = {r[side]['node'] for r in eligible for side in ('source', 'target') if r['source']['node'] in chosen or r['target']['node'] in chosen}
        chosen.update(adjacent)
    chosen.difference_update(hidden)
    visible = [r for r in eligible if r['source']['node'] in chosen and r['target']['node'] in chosen]
    crossing = [r for r in eligible if (r['source']['node'] in chosen) != (r['target']['node'] in chosen)]
    return {'nodes': [{**n, 'inclusion': 'focus / decomposition' if n['key'] in base else 'interface neighbor'} for n in allnodes.values() if n['key'] in chosen],
            'relations': visible, 'crossing': crossing, 'hiddenCount': len(allnodes) - len(chosen),
            'filteredRelations': sum(1 for r in catalog['relations'] if r['source']['node'] in chosen and r['target']['node'] in chosen and r['kind'] not in kinds),
            'warnings': [w for w in catalog['warnings'] if w['scope'] == 'traceability' or w['scope'] in allnodes],
            'sourceSha256': catalog['sourceSha256'], 'recipe': recipe}


def compose(catalog, recipe):
    result = select(catalog, recipe)
    nodes, relations = result['nodes'], result['relations']
    visible_keys = {n['key'] for n in nodes}
    containment = [n for n in nodes if n['parent'] in visible_keys]
    if len(nodes) > LIMITS['diagramNodes'] or len(relations) + len(containment) > LIMITS['diagramEdges']:
        result['diagramError'] = 'Diagram exceeds 40 elements or 120 relationships. Reduce depth, hide elements, or use the register; no diagram was truncated.'
    elif not nodes:
        result['diagramError'] = 'All selected elements are hidden. Restore an element in Customize.'
    else:
        # Hashes are local graphical IDs only; map back to source and occurrence explicitly.
        mapping = {n['key']: hashlib.sha256(n['key'].encode()).hexdigest()[:24] for n in nodes}
        graphnodes = [{'id': mapping[n['key']], 'label': human(n['name']) + ('\n'+human(n['type']) if n['type'] and human(n['type']) != human(n['name']) else ''), 'role': 'component', 'referenced': n['referenced']} for n in nodes]
        edges = [{'source': mapping[r['source']['node']], 'target': mapping[r['target']['node']], 'elementId': r['elementId'],
                  'kind': r['kind'], 'label': human(r['item']) if r['kind'] == 'flow' else 'Same value' if r['kind'] == 'binding' else 'Connection', 'caution': False} for r in relations]
        edges.extend({'source': mapping[n['parent']], 'target': mapping[n['key']], 'elementId': n['elementId'], 'kind': 'containment', 'label': 'References' if n['referenced'] else 'Contains', 'caution': False} for n in containment)
        result['svg'] = render_svg({'title': 'System overview', 'nodes': graphnodes, 'edges': edges, 'legend': 'Lines: connections   •   Arrows: transfers   •   Dotted: decomposition'})
        result['portraitSvg'] = render_svg({'title': 'System overview', 'nodes': graphnodes, 'edges': edges, 'layoutDirection': 'TB'})
        result['graphSources'] = {mapping[n['key']]: {'elementId': n['elementId'], 'occurrence': n['key']} for n in nodes}
    return result
