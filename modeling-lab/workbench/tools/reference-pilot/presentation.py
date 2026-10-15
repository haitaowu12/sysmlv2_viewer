"""Source-backed presentation names, unique targets and bounded collection evidence.

These helpers do not parse model source or create semantic elements. Engine IDs,
qualified names and declared relationships remain unchanged.
"""
import re


def display_name(element, fallback=None):
    for value in (element.get('name'), element.get('semantics', {}).get('effectiveName')):
        if isinstance(value, str) and value:
            return value
    return fallback or ('Unnamed ' + str(element.get('metaclass') or 'element'))


def element_order(element):
    name = display_name(element)
    qname = element.get('qualifiedName')
    line = element.get('line')
    return (name, qname if isinstance(qname, str) else '', line if isinstance(line, int) else -1,
            str(element.get('sessionElementId') or ''))


def qualified_segments(value):
    """Read only a qualified target identifier, keeping quoted delimiters atomic."""
    if not isinstance(value, str) or not value:
        return None
    if value.startswith('$::'):
        value = value[3:]
    result = []; offset = 0
    while offset < len(value):
        if value[offset] == "'":
            offset += 1; chars = []
            while offset < len(value) and value[offset] != "'":
                char = value[offset]; offset += 1
                if char == '\\':
                    if offset >= len(value) or value[offset] not in ("'", '\\'):
                        return None
                    char = value[offset]; offset += 1
                chars.append(char)
            if offset >= len(value) or not chars:
                return None
            offset += 1; result.append(''.join(chars))
        else:
            match = re.match(r'[A-Za-z_][A-Za-z0-9_]*', value[offset:])
            if not match:
                return None
            result.append(match.group()); offset += len(match.group())
        if offset == len(value):
            return tuple(result)
        if value[offset:offset+2] != '::':
            return None
        offset += 2
    return None


def resolve_target(report, target, kinds=None):
    """Return one existing element; notation aliases require its typed owner path."""
    if not isinstance(target, str) or not target:
        raise ValueError('Choose one uniquely resolved model scope')
    elements = report.get('elements', [])
    matches = [e for e in elements if e.get('qualifiedName') == target]
    if not matches:
        segments = qualified_segments(target)
        if segments is not None:
            index = {e['sessionElementId']: e for e in elements}
            def path(element):
                names = []; seen = set()
                while element:
                    eid = element['sessionElementId']
                    if eid in seen or len(seen) >= 64:
                        return None
                    seen.add(eid)
                    name = element.get('semantics', {}).get('declaredName') or element.get('name')
                    if not isinstance(name, str) or not name:
                        # The browser producer retains the anonymous document
                        # Namespace above its top-level packages. It is not a
                        # qualified-name segment. Require both typed ownership
                        # directions; never skip a missing or nested owner.
                        owner = element.get('semantics', {}).get('owner')
                        members = _refs(element.get('semantics', {}).get('ownedMember'))
                        if (element.get('metaclass') == 'Namespace' and not owner
                                and not element.get('qualifiedName') and names
                                and any(ref['id'] == child_id for ref in members)):
                            return tuple(reversed(names))
                        return None
                    names.append(name)
                    owner = element.get('semantics', {}).get('owner')
                    if not owner:
                        return tuple(reversed(names))
                    if not isinstance(owner, dict) or owner.get('id') not in index:
                        return None
                    child_id = eid
                    element = index[owner['id']]
                return None
            matches = [e for e in elements if path(e) == segments]
    if len(matches) != 1 or kinds is not None and matches[0].get('metaclass') not in kinds:
        raise ValueError('Choose one uniquely resolved model scope')
    return matches[0]


def _refs(value):
    values = value if isinstance(value, list) else [value]
    return [ref for ref in values if isinstance(ref, dict) and isinstance(ref.get('id'), str)]


def multiplicity(element, index):
    semantic = element.get('semantics', {})
    refs = _refs(semantic.get('multiplicity'))
    if len(refs) != 1 or refs[0]['id'] not in index:
        return '', False
    bounds = []
    for ref in _refs(index[refs[0]['id']].get('semantics', {}).get('bound')):
        bound = index.get(ref['id'], {})
        if bound.get('metaclass') == 'LiteralInfinity':
            bounds.append('*')
        elif bound.get('metaclass') == 'LiteralInteger':
            value = bound.get('semantics', {}).get('value')
            if isinstance(value, int) and not isinstance(value, bool) or isinstance(value, str) and value.isdigit():
                bounds.append(str(value))
            else:
                return '', False
        else:
            return '', False
    if not 1 <= len(bounds) <= 2:
        return '', False
    return '[' + '..'.join(bounds) + ']', bounds != ['1'] and bounds != ['1', '1']


def part_features(root, index):
    """Separate typed multi-valued features; retain unresolved bindings explicitly.

    A typed value expression supplies the evidence. Multiplicity or a name alone
    never identifies an alias collection, and unsupported bindings stay explicit.
    """
    semantic = lambda e: e.get('semantics', {})
    parts = [index[r['id']] for r in _refs(semantic(root).get('feature'))
             if r['id'] in index and index[r['id']].get('metaclass') == 'PartUsage']
    sibling_ids = {p['sessionElementId'] for p in parts}
    subset_members = {}
    for member in parts:
        for ref in _refs(semantic(member).get('ownedSubsetting')):
            relation = index.get(ref['id'], {})
            if relation.get('metaclass') != 'Subsetting':
                continue
            rs = semantic(relation)
            sources = _refs(rs.get('subsettingFeature')) + _refs(rs.get('specific')) + _refs(rs.get('source'))
            targets = _refs(rs.get('subsettedFeature'))
            if any(r['id'] == member['sessionElementId'] for r in sources) and len(targets) == 1 and targets[0]['id'] in sibling_ids:
                subset_members.setdefault(targets[0]['id'], []).append(member['sessionElementId'])
    ordinary = []; collections = []
    for part in parts:
        ps = semantic(part); values = _refs(ps.get('value')) + _refs(ps.get('valueExpression'))
        for ref in _refs(ps.get('ownedElement')):
            child = index.get(ref['id'], {})
            if child.get('metaclass') == 'FeatureValue':
                sources = _refs(semantic(child).get('source'))
                owner = semantic(child).get('owner', {})
                if any(s['id'] == part['sessionElementId'] for s in sources) or isinstance(owner, dict) and owner.get('id') == part['sessionElementId']:
                    values += _refs(semantic(child).get('value'))
            else:
                membership = index.get(semantic(child).get('owningMembership', {}).get('id'), {})
                if membership.get('metaclass') == 'FeatureValue' and any(s['id'] == part['sessionElementId'] for s in _refs(semantic(membership).get('source'))):
                    values += _refs(semantic(membership).get('value'))
        value_ids = list(dict.fromkeys(ref['id'] for ref in values))
        mult, is_collection = multiplicity(part, index)
        subset = list(dict.fromkeys(subset_members.get(part['sessionElementId'], [])))
        if len(value_ids) != 1 or value_ids[0] not in index:
            if is_collection and subset and not value_ids:
                collections.append({'elementId': part['sessionElementId'], 'name': display_name(part), 'qualifiedName': part.get('qualifiedName'),
                    'multiplicity': mult, 'kind': 'subset-collection', 'memberIds': subset,
                    'memberNames': [display_name(index[eid]) for eid in subset], 'evidenceIds': subset,
                    'reason': 'Collection with explicitly subsetted occurrences; listed members do not establish its complete population.'})
            else:
                ordinary.append(part)
            continue
        value = index[value_ids[0]]; evidence = []; budget = [0]
        def members(expression, seen):
            eid = expression.get('sessionElementId')
            budget[0] += 1
            if eid in seen or budget[0] > 128:
                return None
            seen = seen | {eid}; evidence.append(eid)
            if expression.get('metaclass') == 'FeatureReferenceExpression':
                referents = _refs(semantic(expression).get('referent'))
                if len(referents) == 1 and referents[0]['id'] in sibling_ids and referents[0]['id'] != part['sessionElementId']:
                    return [referents[0]['id']]
                return None
            if expression.get('metaclass') != 'OperatorExpression' or semantic(expression).get('operator') != ',':
                return None
            operands = _refs(semantic(expression).get('operand'))
            if len(operands) < 2:
                return None
            result = []
            for ref in operands:
                if ref['id'] not in index:
                    return None
                items = members(index[ref['id']], seen)
                if items is None:
                    return None
                result += items
            return result
        bound_members = members(value, set()) if value.get('metaclass') == 'OperatorExpression' else None
        null_collection = is_collection and value.get('metaclass') == 'NullExpression'
        if not is_collection:
            ordinary.append(part); continue
        label = display_name(part)
        unresolved = not null_collection and bound_members is None
        reason = ('Null-valued collection feature; no additional concrete component is asserted.' if null_collection else
                  'Collection value binding is unresolved or unsupported; component membership and count are not inferred.' if unresolved else
                  'Collection bound to existing component occurrences; not additional components.')
        collections.append({'elementId': part['sessionElementId'], 'name': label, 'qualifiedName': part.get('qualifiedName'),
                            'multiplicity': mult, 'kind': 'null-collection' if null_collection else 'unresolved-collection' if unresolved else 'bound-collection',
                            'memberIds': bound_members or [], 'memberNames': [display_name(index[eid]) for eid in bound_members or []],
                            'evidenceIds': list(dict.fromkeys([value_ids[0]] + evidence)), 'reason': reason})
    return ordinary, collections
