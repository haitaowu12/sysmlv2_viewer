"""Read-only, occurrence-aware view recipes over one validated Pilot report.

Analytical projections, not native SysML view usages or a second semantic model.
"""
import hashlib
from presentation import display_name, element_order, part_features, resolve_target
from engineering import index_report, sem, features, types, endpoint, interface_flows, LINKS
from stakeholder import human, render_svg
from check_contract import references, satisfaction_polarity

PARTS = {'PartDefinition', 'PartUsage'}
KINDS = {'connection', 'binding', 'flow'}
LIMITS = {'occurrences': 2000, 'depth': 8, 'diagramNodes': 40, 'diagramEdges': 120}


class ExplorationBudgetError(ValueError):
    """No catalogue was returned because its occurrence budget was exceeded."""


def _reference_root_type(element, index):
    """A reference context needs exactly one resolved part-definition type."""
    if element.get('metaclass') != 'ReferenceUsage':
        return None
    values = sem(element, 'type', [])
    values = values if isinstance(values, list) else [values]
    if not values or any(not isinstance(ref, dict) or not isinstance(ref.get('id'), str)
                         or ref['id'] not in index for ref in values):
        return None
    ids = {ref['id'] for ref in values}
    if len(ids) != 1:
        return None
    target = index[next(iter(ids))]
    return target if target.get('metaclass') == 'PartDefinition' else None


def _eligible_root(element, index):
    return element.get('metaclass') in PARTS or _reference_root_type(element, index) is not None


def _global_roots(index):
    return sorted((e for e in index.values() if e.get('qualifiedName') and
                   (e['metaclass'] == 'PartDefinition' or e['metaclass'] == 'PartUsage' and
                    sem(e, 'owner', {}).get('metaclass') not in PARTS or
                    _reference_root_type(e, index) is not None)), key=lambda e: e['qualifiedName'])



def satisfaction_occurrences(assertion, target, nodes, ix):
    """Resolve an explicit or native feature chain to contextual nodes.

    The normalizer may provide ``satisfyingFeatureChain`` as an exact, typed
    resolver path. Its presence is authoritative: malformed, incomplete or
    ambiguous paths remain unresolved instead of falling back to a terminal
    feature match. Older reports retain the native subject-expression path.
    """
    semantics = assertion.get('semantics', {})
    if 'satisfyingFeatureChain' in semantics:
        chain = semantics.get('satisfyingFeatureChain')
        target_id = target.get('id') if isinstance(target, dict) else None
        if (not isinstance(chain, list) or not chain or not isinstance(target_id, str)
                or any(not isinstance(ref, dict) or not isinstance(ref.get('id'), str)
                       or ref['id'] not in ix for ref in chain)
                or chain[-1]['id'] != target_id):
            return []
        candidates = [n for n in nodes if n['elementId'] == chain[0]['id']]
        for step in chain[1:]:
            parents = {n['key'] for n in candidates}
            candidates = [n for n in nodes if n['parent'] in parents and n['elementId'] == step['id']]
            if not candidates:
                return []
        return [n['key'] for n in candidates] if len(candidates) == 1 else []

    # Native Pilot reports expose the subject expression and its resolved
    # chainingFeature path. Keep this path unchanged for backward compatibility.
    subject = ix.get(sem(assertion, 'subjectParameter', {}).get('id'), {})
    expressions = [ix.get(r.get('id'), {}) for r in sem(subject, 'ownedElement', [])]
    expressions = [e for e in expressions if e.get('metaclass') == 'FeatureReferenceExpression']
    if expressions:
        if len(expressions) != 1:
            return []
        referent = ix.get(sem(expressions[0], 'referent', {}).get('id'), {})
        chain = sem(referent, 'chainingFeature', [])
        if chain:
            candidates = [n for n in nodes if n['elementId'] == chain[0].get('id')]
            for step in chain[1:]:
                parents = {n['key'] for n in candidates}
                candidates = [n for n in nodes if n['parent'] in parents and n['elementId'] == step.get('id')]
            # A rooted chain must identify one occurrence. Relative/ambiguous chains stay unresolved.
            return [n['key'] for n in candidates] if len(candidates) == 1 and candidates[0]['elementId'] == target['id'] else []
    candidates = [n['key'] for n in nodes if n['elementId'] == target['id']]
    return candidates if len(candidates) == 1 else []


def catalogue(report, roots=None):
    if not report.get('staticChecksPassed'):
        raise ValueError('A validated source revision is required')
    ix = index_report(report)
    if roots is None:
        roots = _global_roots(ix)
    else:
        if not isinstance(roots, list) or not roots:
            raise ValueError('Explicit catalogue scopes require a nonempty target list')
        resolved = [resolve_target(report, target) for target in roots]
        if any(not _eligible_root(e, ix) for e in resolved):
            raise ValueError('Catalogue roots require a part definition, part usage or uniquely part-typed reference context')
        roots = sorted({e['sessionElementId']: e for e in resolved}.values(), key=lambda e: e['qualifiedName'])
    nodes, relations, warnings, collections = [], [], [], []
    def visit(e, path, parent, root, depth, ancestors):
        reference_root = depth == 0 and _reference_root_type(e, ix) is not None
        if len(nodes) >= LIMITS['occurrences']:
            raise ExplorationBudgetError('Model exceeds the 2000-occurrence exploration budget; split the source package. No partial catalogue returned.')
        node = {'key': path, 'parent': parent, 'root': root, 'depth': depth,
                'elementId': e['sessionElementId'], 'name': display_name(e),
                'qualifiedName': e.get('qualifiedName') or '', 'type': ', '.join(types(e)),
                'metaclass': e['metaclass'], 'referenceRoot': reference_root,
                'referenced': reference_root or e['metaclass'] == 'PartUsage' and not sem(e, 'isComposite', False)}
        nodes.append(node)
        if reference_root:
            warnings.append({'scope': path, 'elementId': e['sessionElementId'],
                             'reason': 'Referenced part context: this root is a typed reference, not an additional owned component or an observed installed instance.'})
        fs = features(e, ix)
        children, collection_features = part_features(e, ix)
        children.sort(key=lambda e: (e.get('qualifiedName') or '', element_order(e)))
        for collection in collection_features:
            collections.append(dict(collection, scope=path))
            warnings.append({'scope': path, 'elementId': collection['elementId'],
                             'reason': 'Collection feature ' + collection['name'] + ' ' + collection['multiplicity'] + ': ' + collection['reason'] + (' Members: ' + ', '.join(collection['memberNames']) if collection['memberNames'] else '')})
        if e['sessionElementId'] in ancestors or depth >= LIMITS['depth']:
            if children: warnings.append({'scope': path, 'reason': 'Recursive or depth-limited structure not expanded'})
            return
        by_id = {}
        counts = {c.get('name'): sum(x.get('name') == c.get('name') for x in children) for c in children}
        for child in children:
            name = child.get('name')
            if not isinstance(name, str) or not name or counts[name] != 1:
                warnings.append({'scope': path, 'elementId': child['sessionElementId'], 'reason': 'Unnamed or repeated-name component retained by its engine identity; inspect source for its declaration.'})
                by_id[child['sessionElementId']] = path + '/@' + child['sessionElementId']
            else:
                by_id[child['sessionElementId']] = path + '/' + name
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
            return {'node': key, 'portId': port, 'port': display_name(ix[port])}
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
                        'elementId': link['sessionElementId'], 'name': display_name(link), 'item': '', 'connectionId': link['sessionElementId']}
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
    # Verification objective scaffolding is not a second user obligation. Use
    # the typed objective references and resolved owner memberships so internal
    # requirements remain excluded even when the exporter returns a list-valued
    # reference. Do not infer exclusion from names or source text.
    objective_memberships = {'ObjectiveMembership', 'RequirementVerificationMembership'}
    objectives = {ref['id'] for e in ix.values()
                  for ref in references(sem(e, 'objectiveRequirement'))
                  if ref.get('id') in ix}
    # Current Pilot reports also expose the objective through its owning
    # membership instead of a materialized objectiveRequirement field. Treat
    # that typed membership as equivalent evidence, then follow owners below.
    objectives.update(e['sessionElementId'] for e in ix.values()
                      if any(ref.get('metaclass') in objective_memberships
                             for ref in references(sem(e, 'owningMembership'))))
    frontier = set(objectives)
    while frontier:
        owned = {e['sessionElementId'] for e in ix.values()
                 if any(ref.get('id') in frontier for ref in references(sem(e, 'owner')))}
        frontier = owned - objectives
        objectives.update(frontier)
    requirements = [e for e in ix.values() if e['metaclass'] in {'RequirementDefinition', 'RequirementUsage'} and e.get('qualifiedName') and e['sessionElementId'] not in objectives]
    traces = []
    for e in ix.values():
        if e['metaclass'] == 'SatisfyRequirementUsage':
            a, b = sem(e, 'satisfyingFeature', {}), sem(e, 'satisfiedRequirement', {})
            if a.get('id') in ix and b.get('id') in ix:
                polarity = satisfaction_polarity(e)
                occurrences = satisfaction_occurrences(e, a, nodes, ix)
                if not occurrences:
                    warnings.append({'scope': 'traceability', 'reason': 'Satisfaction occurrence unresolved; no scoped coverage inferred', 'elementId': e['sessionElementId']})
                traces.append({'kind': 'satisfy', 'sourceId': a['id'], 'targetId': b['id'], 'elementId': e['sessionElementId'],
                               'sourceOccurrences': occurrences, 'polarity': polarity, 'isNegated': sem(e, 'isNegated') if polarity != 'unknown' else None})
                if polarity == 'unknown':
                    warnings.append({'scope': 'traceability', 'reason': 'Satisfaction polarity unavailable; no positive assertion inferred', 'elementId': e['sessionElementId']})
            else: warnings.append({'scope': 'traceability', 'reason': 'Satisfaction endpoint unavailable', 'elementId': e['sessionElementId']})
        if e['metaclass'] in {'VerificationCaseDefinition', 'VerificationCaseUsage'}:
            for b in references(sem(e, 'verifiedRequirement')):
                if b.get('id') in ix: traces.append({'kind': 'verify', 'sourceId': e['sessionElementId'], 'targetId': b['id'], 'elementId': e['sessionElementId']})
                else: warnings.append({'scope': 'traceability', 'reason': 'Verification target outside extracted evidence'})
    return {'roots': [e['qualifiedName'] for e in roots], 'nodes': nodes, 'relations': relations,
            'requirements': [{'elementId': e['sessionElementId'], 'name': e.get('name'), 'qualifiedName': e['qualifiedName']} for e in requirements],
            'traces': traces, 'collections': collections, 'warnings': warnings, 'limits': LIMITS, 'sourceSha256': report['sourceSha256']}


def catalogue_for_views(report, views):
    """Use configured part scopes only when complete global exploration exceeds its budget.

    A configured catalogue is complete within the existing expansion limits for
    precisely those roots. All extracted requirements and trace declarations
    remain in its evidence inventory; occurrence coverage is explicitly limited.
    """
    try:
        return catalogue(report)
    except ExplorationBudgetError as error:
        global_reason = str(error)
    if not isinstance(views, list):
        raise ValueError('Configured catalogue requires a view recipe list')
    selected = {}
    index = index_report(report)
    for view in views:
        names = view.get('names') if isinstance(view, dict) else None
        if not isinstance(names, list) or len(names) != 1:
            raise ValueError('Configured catalogue requires uniquely resolved single-target views')
        target = resolve_target(report, names[0])
        if _eligible_root(target, index):
            selected[target['sessionElementId']] = target
    if not selected:
        raise ValueError('Global exploration exceeds its budget and no configured view selects a supported part scope')
    # An oversized configured root fails again; no prefix or arbitrary root is returned.
    result = catalogue(report, roots=[e['qualifiedName'] for e in selected.values()])
    global_ids = {e['sessionElementId'] for e in _global_roots(index_report(report))}
    limitation = ('Only configured part scopes have occurrence coverage. Other roots, cross-root relationships and '
                  'unresolved trace occurrences are not represented; their absence here is not evidence that they do not exist.')
    result['coverage'] = {'mode': 'configured-part-scopes', 'globalAvailable': False,
        'globalUnavailableReason': global_reason, 'excludedRootCount': len(global_ids - selected.keys()),
        'configuredRoots': result['roots'], 'traceabilityLimit': limitation}
    result['warnings'].append({'scope': 'traceability', 'reason': limitation})
    return result


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
            'collections': [c for c in catalog.get('collections', []) if c['scope'] in chosen],
            **({'coverage': catalog['coverage']} if 'coverage' in catalog else {}),
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
        graphnodes = [{'id': mapping[n['key']], 'label': ('Referenced context · ' if n.get('referenceRoot') else '') + human(n['name']) + ('\n'+human(n['type']) if n['type'] and human(n['type']) != human(n['name']) else ''), 'role': 'component', 'referenced': n['referenced']} for n in nodes]
        edges = [{'source': mapping[r['source']['node']], 'target': mapping[r['target']['node']], 'elementId': r['elementId'],
                  'kind': r['kind'], 'label': human(r['item']) if r['kind'] == 'flow' else 'Same value' if r['kind'] == 'binding' else 'Connection', 'caution': False} for r in relations]
        edges.extend({'source': mapping[n['parent']], 'target': mapping[n['key']], 'elementId': n['elementId'], 'kind': 'containment', 'label': 'References' if n['referenced'] else 'Contains', 'caution': False} for n in containment)
        result['svg'] = render_svg({'title': 'System overview', 'nodes': graphnodes, 'edges': edges, 'legend': 'Lines: connections   •   Arrows: transfers   •   Dotted: decomposition'})
        result['portraitSvg'] = render_svg({'title': 'System overview', 'nodes': graphnodes, 'edges': edges, 'layoutDirection': 'TB'})
        result['graphSources'] = {mapping[n['key']]: {'elementId': n['elementId'], 'occurrence': n['key']} for n in nodes}
    return result
