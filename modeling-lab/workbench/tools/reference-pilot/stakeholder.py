"""Read-only audience projections from qualified engine facts, never a second model.

Labels only split identifiers; they do not infer purpose, operating readiness or safety.
Each displayed relationship retains its source element IDs and every reduction is declared.
"""
import re
import textwrap
import json
import subprocess
from engineering import index_report, sem, features, types, interconnection
from check_contract import documentation_facts, satisfaction_polarity


def human(value):
    text = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', str(value))
    text = re.sub(r'([A-Z])([A-Z][a-z])', r'\1 \2', text).replace('_', ' ')
    return text[:1].upper() + text[1:]


def project(report, target, viewpoint=None):
    if not report.get('staticChecksPassed'):
        raise ValueError('Stakeholder views require a statically valid model')
    viewpoint = viewpoint or {}
    ix = index_report(report)
    roots = [e for e in report['elements'] if e.get('qualifiedName') == target]
    if len(roots) != 1:
        raise ValueError('Choose one uniquely resolved model scope')
    root = roots[0]
    if root['metaclass'] == 'ExhibitStateUsage' or (report.get('behaviorFieldsVersion') == 1 and root['metaclass'] in {'StateDefinition', 'StateUsage', 'ActionDefinition', 'ActionUsage', 'PerformActionUsage'}):
        return behavior_story(report, target)
    rows, omitted, components = [], [], []
    nodes, edges, warnings = {}, [], []
    def node(e, role="component", referenced=False):
        label = human(e.get('name', 'Unnamed'))
        type_labels = [human(t) for t in types(e) if human(t) != label and t != 'Part'] if role == 'component' else []
        if type_labels: label += '\n' + ', '.join(type_labels)
        nodes[e["sessionElementId"]] = {"id": e["sessionElementId"], "label": label, "role": role, "referenced": referenced}
    def edge(a, b, label, e, kind, caution=False):
        edges.append({"source": a, "target": b, "label": label, "elementId": e["sessionElementId"], "kind": kind, "caution": caution})
    def row(title, body, *elements):
        rows.append({'title': title, 'body': body,
                     'elementIds': list(dict.fromkeys(e['sessionElementId'] for e in elements))})
    kind = root['metaclass']
    if kind in {'PartDefinition', 'PartUsage'}:
        title, question = 'System overview', 'What is in this part of the system, and what is connected?'
        parts = sorted((e for e in features(root, ix) if e['metaclass'] == 'PartUsage'), key=lambda e: e.get('qualifiedName', ''))
        if len(parts) > 12:
            raise ValueError('Choose a smaller scope: stakeholder overview supports 12 components')
        for part in parts:
            composite = sem(part, 'isComposite') in (True, 'true')
            node(part, referenced=not composite)
            row(human(part.get('name', 'Unnamed component')), ('Included component' if composite else 'Referenced component') +
                (' · ' + ', '.join(human(t) for t in types(part)) if types(part) else ''), part)
        components = rows[:]
        rows.clear()
        if not parts:
            row('No lower-level components shown', 'This scope has no extracted component features. This does not prove that the physical equipment has no internal parts.', root)
        # Use the same qualified connection resolution as the engineering sheet.
        if parts or any(e['metaclass'] == 'PortUsage' for e in features(root, ix)):
            detail = interconnection(report, target)
            def endpoint_node(pair):
                if pair[0]: return pair[0]
                nodes[root['sessionElementId']] = {'id': root['sessionElementId'], 'label': 'Scope boundary', 'role': 'boundary', 'referenced': False}
                return root['sessionElementId']
            def endpoint_label(pair):
                component, port = pair
                return (human(ix[component].get('name', 'Unnamed component')) if component else 'Scope boundary') + ' / ' + human(ix[port].get('name', 'Unnamed contact'))
            for c in detail['connectors']:
                a, b = c['endpoints']
                edge(endpoint_node(a), endpoint_node(b), 'Same value' if c['kind'] == 'BindingConnectorAsUsage' else 'Connection', ix[c['elementId']], 'binding' if c['kind'] == 'BindingConnectorAsUsage' else 'connection')
                label = 'Same value at two contacts' if c['kind'] == 'BindingConnectorAsUsage' else 'Connected contacts'
                row(label, endpoint_label(a) + ' — ' + endpoint_label(b), ix[c['elementId']], ix[a[1]], ix[b[1]])
            for f in detail['flows']:
                edge(endpoint_node(f['source']), endpoint_node(f['target']), human(f['item']), ix[f['elementId']], 'flow')
                row('Declared transfer: ' + human(f['item']), endpoint_label(f['source']) + ' → ' + endpoint_label(f['target']), ix[f['elementId']], ix[f['connectionId']])
            omitted.extend(e['reason'] for e in detail['excluded'])
            warnings.extend(e['reason'] for e in detail['excluded'])
        omitted.append('Internal details, engineering symbols, attribute values and operating behaviour are outside this overview. Contact lines do not imply flow direction; only declared transfers use arrows.')
    elif kind in {'StateDefinition', 'StateUsage'}:
        title, question = 'Operating story', 'Which changes of state are described in this model?'
        for state in report['elements']:
            if state['metaclass'] == 'StateUsage' and sem(state, 'owner', {}).get('id') == root['sessionElementId']: node(state, 'state')
        transitions = sorted((e for e in report['elements'] if e['metaclass'] == 'TransitionUsage' and sem(e, 'owner', {}).get('id') == root['sessionElementId']), key=lambda e: (e.get('line', 0), e.get('qualifiedName', '')))
        if len(transitions) > 24:
            raise ValueError('Choose a smaller scope: operating story supports 24 transitions')
        for e in transitions:
            a, b = ix.get(sem(e, 'source', {}).get('id')), ix.get(sem(e, 'target', {}).get('id'))
            if not a or not b:
                omitted.append('A state change has unresolved endpoints; inspect Engineering mode.'); warnings.append('Unresolved state-change endpoints'); continue
            triggers, support = [], [e, a, b]
            for ref in sem(e, 'triggerAction', []):
                action = ix.get(ref['id'], {})
                payload = ix.get(sem(action, 'payloadParameter', {}).get('id'), {})
                ts = types(payload)
                triggers.extend(human(t) for t in ts)
                if payload: support.append(payload)
            node(a, 'state'); node(b, 'state')
            caution = bool(sem(e, 'guardExpression', []) or sem(e, 'effectAction', []))
            edge(a['sessionElementId'], b['sessionElementId'], (', '.join(triggers) if triggers else 'Event not translated') + (' / conditions apply' if caution else ''), e, 'transition', caution)
            body = 'Event: ' + (', '.join(triggers) if triggers else 'not translated; inspect the source')
            if sem(e, 'guardExpression', []) or sem(e, 'effectAction', []):
                body += '. Additional conditions or effects exist; review them in Engineering mode before using this story.'
            row(human(a.get('name', 'Unnamed state')) + ' → ' + human(b.get('name', 'Unnamed state')), body, *support)
        if not transitions: row('No state changes translated', 'This scope has no directly owned transitions supported by this presentation.', root)
        omitted.append('Initial entry, nested/concurrent states, guards, effects, timing and priorities are not translated. Rows describe model declarations, not a complete operating procedure or observed behaviour.')
    elif kind.startswith('Requirement') or kind.startswith('VerificationCase'):
        verification = kind.startswith('VerificationCase')
        node(root, 'check' if verification else 'requirement')
        title = 'Planned checks' if verification else 'Requirement context'
        question = 'What is planned to be checked?' if verification else 'What obligation does this model element represent?'
        row(human(root.get('name', 'Unnamed obligation')), 'Planned model check; execution and acceptance have not been evaluated.' if verification else 'A model obligation. Open its source to read the exact acceptance condition; this view does not claim it is met.', root)
        for ref in sem(root, 'verifiedRequirement', []):
            if ref.get('id') in ix:
                e = ix[ref['id']]
                node(e, 'requirement')
                edge(root['sessionElementId'], e['sessionElementId'], 'Planned check of', root, 'trace')
                row('Intended to check: ' + human(e.get('name', 'Unnamed obligation')), 'A planned link to an obligation, not a passed test.', e, root)
        omitted.append('Constraint expressions, test setup, installed configuration, observations, deviations and sign-off are not translated or assessed. Consult Engineering mode for the exact model statements.')
    else:
        raise ValueError('No stakeholder translation is qualified for this scope. Use Engineering mode.')
    # Preserve the question asked by the selected engineering viewpoint.
    family = 'connections'
    discussion = 'Are the shown boundaries and interfaces the ones we need to review?'
    names = [c['title'] for c in components]
    takeaway = (human(root.get('name', 'System')) + ' includes ' + ', '.join(names[:4]) + (f' and {len(names)-4} other components' if len(names)>4 else '') + '.') if names else 'This scope has no extracted lower-level components.'
    statement = ''
    statement_documentation, documentation_status = [], 'not-applicable'
    if kind in {'PartDefinition', 'PartUsage'} and viewpoint.get('view') == 'TREE':
        family = 'decomposition'
        title, question = 'System breakdown', 'How is this system organised into smaller parts?'
        nodes, edges, rows = {}, [], []
        def descend(e, path, depth, ancestors):
            composite = sem(e, 'isComposite') in (True, 'true')
            nodes[path] = {'id': path, 'elementId': e['sessionElementId'], 'label': human(e.get('name', 'Unnamed')), 'role': 'component', 'referenced': depth > 0 and not composite}
            children = sorted((c for c in features(e, ix) if c['metaclass'] == 'PartUsage'), key=lambda c: c.get('qualifiedName', c['sessionElementId']))
            if depth >= 2 or e['sessionElementId'] in ancestors:
                if children: warnings.append('Further decomposition exists below ' + human(e.get('name', 'Unnamed')) + '; open a narrower scope.')
                return
            for child in children:
                child_path = path + '/' + child['sessionElementId']
                descend(child, child_path, depth + 1, ancestors | {e['sessionElementId']})
                relation = 'Contains' if sem(child, 'isComposite') in (True, 'true') else 'References'
                edge(path, child_path, relation, child, 'containment')
                row(human(e.get('name', 'Unnamed')) + ' / ' + human(child.get('name', 'Unnamed')), relation + ' this component in the model.', e, child)
        descend(root, root['sessionElementId'], 0, set())
        takeaway = f"{human(root.get('name', 'System'))} is shown with up to two levels of component breakdown."
        discussion = 'Is the responsibility of each subsystem clear at this level?'
        omitted = ['Component hierarchy only. Interfaces, behaviour and multiplicity instances are not shown. Repeated type features retain separate occurrence paths.']
    elif kind in {'PartDefinition', 'PartUsage'} and viewpoint.get('renderer') == 'summary':
        family = 'exchanges'
        title, question = 'Information exchanges', 'What is declared to pass between components?'
        edges = [e for e in edges if e['kind'] == 'flow']
        rows = [r for r in rows if r['title'].startswith('Declared transfer:')]
        used = {e[k] for e in edges for k in ('source', 'target')}
        nodes = {k: n for k, n in nodes.items() if k in used}
        takeaway = f"{len(edges)} declared transfers are shown with their direction."
        discussion = 'Are any expected exchanges missing from the model?'
        omitted = ['Only explicit transfers are shown. Contact connections and same-value bindings are omitted; an arrow does not establish delivery, timing or observed operation.'] + warnings
    elif kind in {'PartDefinition', 'PartUsage'}:
        if kind == 'PartUsage':
            family = 'context'
            title, question = 'System context', 'Who interacts with the system, and across which boundary?'
            discussion = 'Have we included the people and external systems that matter?'
            transfers = [e for e in edges if e['kind'] == 'flow']
            if transfers:
                first = transfers[0]
                takeaway = 'The model declares ' + first['label'] + ' from ' + nodes[first['source']]['label'].replace('\n', ' / ') + ' to ' + nodes[first['target']]['label'].replace('\n', ' / ') + (f'; {len(transfers)-1} other transfers are shown.' if len(transfers)>1 else '.')
        else:
            title = human(root.get('name', 'System')) + ' connections'
    elif kind in {'StateDefinition', 'StateUsage'}:
        family = 'states'
        takeaway = f"{len(edges)} declared state changes connect {len(nodes)} states."
        discussion = 'Do these events and recovery paths match the intended operating story?'
    else:
        verification = kind.startswith('VerificationCase')
        family = 'verification' if verification else 'requirement'
        title = 'Verification plan' if verification else 'Required outcome'
        question = 'How will this requirement be checked?' if verification else 'What must this part of the system achieve?'
        # Quote only directly owned engine Documentation, never a nested source excerpt.
        statement_documentation = documentation_facts(root, ix)
        docs = sem(root, 'documentation')
        documentation_status = ('resolved' if docs else 'absent') if isinstance(docs, list) and len(docs) == len(statement_documentation) else 'unknown'
        statement = '\n\n'.join(' '.join(d['body'].split()) for d in statement_documentation)
        if documentation_status == 'unknown':
            warnings.append('Direct documentation evidence unavailable or incomplete; nested source text was not used.')
        subject = ix.get(sem(root, 'subjectParameter', {}).get('id'))
        if subject:
            node(subject)
            edge(root['sessionElementId'], subject['sessionElementId'], 'Checks subject' if verification else 'Applies to', root, 'trace')
        if not verification:
            for assertion in report['elements']:
                if (assertion.get('metaclass') != 'SatisfyRequirementUsage'
                        or sem(assertion, 'satisfiedRequirement', {}).get('id') != root['sessionElementId']):
                    continue
                satisfying = ix.get(sem(assertion, 'satisfyingFeature', {}).get('id'))
                if not satisfying:
                    warnings.append('Satisfaction assertion has an unavailable subject; inspect Engineering mode.')
                    continue
                polarity = satisfaction_polarity(assertion)
                label = {'positive': 'Asserts satisfaction', 'negative': 'Asserts non-satisfaction',
                         'unknown': 'Satisfaction polarity unknown'}[polarity]
                node(satisfying)
                edge(satisfying['sessionElementId'], root['sessionElementId'], label, assertion, 'trace', polarity != 'positive')
                edges[-1].update(polarity=polarity, isNegated=sem(assertion, 'isNegated') if polarity != 'unknown' else None)
                row(label, human(satisfying.get('name', 'Unnamed subject')) + '. A model assertion; execution and acceptance are not established.', assertion, satisfying, root)
                rows[-1].update(polarity=polarity, isNegated=sem(assertion, 'isNegated') if polarity != 'unknown' else None)
                if polarity == 'unknown':
                    warnings.append('Satisfaction polarity unavailable; no positive assertion inferred.')
            for check in report['elements']:
                if check['metaclass'].startswith('VerificationCase') and any(ref.get('id') == root['sessionElementId'] for ref in sem(check, 'verifiedRequirement', [])):
                    node(check, 'check')
                    edge(check['sessionElementId'], root['sessionElementId'], 'Planned check of', check, 'trace')
                    row('Planned check', human(check.get('name', 'Unnamed check')), check)
        takeaway = 'A planned check is linked to its obligation; no execution result is supplied.' if verification else 'The obligation is shown with its subject, signed model assertions and any explicit planned checks.'
        discussion = 'What procedure, configuration and evidence will demonstrate this requirement?' if verification else 'Is the stated obligation complete and agreed by the responsible stakeholders?'
    if not nodes: node(root)
    legend = {'decomposition': ['Contains / references: model hierarchy', 'Dashed boxes: referenced components'], 'exchanges': ['Arrows: declared transfers'], 'states': ['Arrows: modeled changes of state', 'Labels: triggering events'], 'requirement': ['Dashed arrows: explicit model links', 'A requirement is not a passed check'], 'verification': ['Dashed arrows: planned verification links', 'No executed result is asserted']}.get(family, ['Lines: connections', 'Arrows: declared transfers', 'Dashed lines: same-value bindings', 'Dashed boxes: referenced components'])

    if len(nodes) > 30 or len(edges) > 60: raise ValueError('Choose a smaller scope: graphical overview supports 30 nodes and 60 relationships')
    return {'profile': 'stakeholder-graph-v3', 'viewKind': family, 'takeaway': takeaway, 'discussion': discussion, 'statement': statement,
            'statementDocumentation': statement_documentation, 'documentationStatus': documentation_status,
            'legendItems': legend, 'title': title, 'question': question, 'scope': target,
            'scopeElementId': root['sessionElementId'], 'scopeLabel': human(root.get('name', target)),
            'nodes': list(nodes.values()), 'edges': edges, 'warnings': warnings, 'rows': rows, 'components': components, 'omissions': omitted, 'labelPolicy': 'Identifier spacing only; no inferred purpose or readiness',
            'acceptance': 'Not assessed', 'sourceSha256': report.get('sourceSha256')}


def graph_dot(projection):
    """Topology comes exclusively from resolved facts, not prose labels or row order."""
    q = lambda value: json.dumps(str(value), ensure_ascii=False)
    wrap = lambda value: "\n".join(part for line in value.splitlines() for part in (textwrap.wrap(line, 24) or [""]))
    node_ids = {n['id']: f'n{i}' for i, n in enumerate(projection['nodes'])}
    vertical = projection.get('viewKind') == 'decomposition' or (projection.get('viewKind') == 'states' and len(projection.get('nodes', [])) >= 4)
    direction = projection.get('layoutDirection') or ('TB' if vertical else 'LR')
    lines = ['digraph G {',
        'graph [rankdir='+direction+', bgcolor="transparent", pad="0.35", nodesep="0.65", ranksep="0.9", splines=polyline, outputorder=edgesfirst];',
        'node [shape=box, style="rounded,filled", fillcolor="#f0f6f4", color="#47796e", penwidth=1.4, margin="0.3,0.23", fontname="Arial", fontsize=17, fontcolor="#243b36"];',
        'edge [fontname="Arial", fontsize=12, fontcolor="#52645f", color="#99a8a2", penwidth=1.3, arrowsize=0.75];']
    if projection.get('viewKind') == 'states' and direction == 'TB':
        lines += ['graph [pad="0.12", ranksep="0.3"];', 'node [margin="0.2,0.1"];', 'edge [fontsize=14];']
    for n in projection['nodes']:
        attrs = {'label': wrap(n['label']), 'URL': 'psysml:'+n.get('elementId', n['id']), 'tooltip': n['label']+' · inspect source'}
        if n['referenced']: attrs['style'] = 'rounded,filled,dashed'
        if n['role'] == 'state': attrs['shape'] = 'ellipse'
        elif n['role'] == 'requirement': attrs.update(fillcolor='#fbf4e6', color='#ac8b4c')
        elif n['role'] == 'check': attrs.update(fillcolor='#edf1f7', color='#7485a0')
        elif n['role'] == 'boundary': attrs.update(style='rounded,filled,dashed', fillcolor='#f4f4f0', color='#93a5a0')
        lines.append(node_ids[n['id']]+' ['+', '.join(k+'='+q(v) for k,v in attrs.items())+'];')
    for i, e in enumerate(projection['edges']):
        if e['source'] not in node_ids or e['target'] not in node_ids: raise ValueError('Graphical relationship has an unresolved visible endpoint')
        directed = e['kind'] in {'flow', 'transition', 'trace'}
        attrs = {'id': f'relation-{i}', 'label': wrap(e['label']), 'URL': 'psysml:'+e['elementId'], 'tooltip': e['label']+' · inspect source', 'dir': 'forward' if directed else 'none'}
        if e['kind'] in {'flow', 'transition'}: attrs.update(color='#147d91', fontcolor='#176274', penwidth='2.5')
        if e['kind'] in {'binding', 'trace'}: attrs['style'] = 'dashed'
        if e['kind'] == 'containment': attrs.update(style='dotted', color='#8d9da8', penwidth='1.3')
        if e['caution']: attrs.update(color='#a96b16', fontcolor='#915a0f')
        lines.append(node_ids[e['source']]+' -> '+node_ids[e['target']]+' ['+', '.join(k+'='+q(v) for k,v in attrs.items())+'];')
    lines.append('}')
    return '\n'.join(lines)


def render_svg(projection):
    if 'behavior' in projection:
        from behavior import render_svg as render_behavior
        return render_behavior(projection['behavior'])
    result = subprocess.run(['dot', '-Tsvg'], input=graph_dot(projection), text=True, capture_output=True, timeout=15)
    if result.returncode: raise ValueError('Graphical stakeholder layout failed: '+result.stderr[:300])
    return result.stdout


def behavior_story(report, target):
    """State/action subtype handling shares the source-bound behavior projection."""
    from behavior import project as behavior_project
    b = behavior_project(report, target)
    nodes = {n['id']: n for n in b['nodes']}
    rows = []
    def quotation(item, flag='textTruncated', field='text'):
        return item[field] + (' [excerpt truncated; inspect source]' if item.get(flag) else '')
    for n in b['nodes']:
        if n['parallel'] is True:
            rows.append({'title': human(n['name']) + ' — parallel regions',
                         'body': 'Child regions are concurrent, not sequential steps.', 'elementIds': [n['id']]})
        for field, label in [('entryAction', 'Entry'), ('doAction', 'During'), ('exitAction', 'Exit')]:
            for a in n['subactions'].get(field, []):
                rows.append({'title': human(n['name']) + ' / ' + label, 'body': quotation(a), 'textTruncated': bool(a.get('textTruncated')), 'elementIds': [n['id'], a['elementId']]})
        for c in n['constraints']:
            rows.append({'title': human(n['name']) + ' / Constraint', 'body': quotation(c), 'textTruncated': bool(c.get('textTruncated')), 'elementIds': [n['id'], c['elementId']]})
    for i, rel in enumerate(b['relations'], 1):
        clauses=[]; support=[rel['elementId'],rel['source'],rel['target']]
        for key, title in [('triggers','Trigger'),('guards','Guard'),('effects','Effect')]:
            for item in rel[key]:
                clauses.append(title+': '+quotation(item));support.append(item['elementId'])
            if rel['kind'] == 'TransitionUsage' and rel.get('conditionStatus', {}).get(key) in {'unknown', 'unavailable'}:
                clauses.append(title + ': evidence unavailable; do not infer absence.')
        if rel.get('declaration'): clauses.append(quotation(rel, 'declarationTruncated', 'declaration'))
        rows.append({'title': f'R{i}: '+human(nodes[rel['source']]['name'])+' → '+human(nodes[rel['target']]['name']),
                     'body': ' | '.join(clauses) or 'No explicit trigger, guard or effect in this transition.',
                     'textTruncated': bool(rel.get('declarationTruncated') or any(item.get('textTruncated') for key in ('triggers','guards','effects') for item in rel[key])),
                     'elementIds': list(dict.fromkeys(support))})
    return {'profile':'stakeholder-behavior-v1','viewKind': 'states' if b['kind']=='state' else 'actions',
            'title':human(nodes[b['rootId']]['name']), 'question':'What behavior is declared, and under which conditions?',
            'takeaway':str(len(b['relations']))+' declared relationships; source conditions and effects are listed below the diagram.',
            'discussion':'Do these declared transitions, guards and recovery paths match the intended behavior?',
            'statement':'', 'statementDocumentation':[], 'documentationStatus':'not-requested',
            'legendItems':['R numbers identify the matching source-backed relationship rows.',
                           'Parallel regions are concurrent; ordinary flows are not an execution schedule.', b['boundary']],
            'scope':target, 'scopeElementId':b['rootId'], 'scopeLabel':human(nodes[b['rootId']]['name']),
            'nodes':[], 'edges':[], 'rows':rows, 'components':[], 'behavior':b,
            'warnings':[w['reason'] for w in b['warnings']], 'omissions':b['limits'],
            'labelPolicy':'Model identifiers and exact source quotations; not inferred operating results.',
            'acceptance':'Not assessed', 'sourceSha256':b['sourceSha256']}
