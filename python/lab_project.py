"""Bounded engineering commands for the local Lab; no canonical file writes.

Selections come from a fresh engine report. Text matching below is a deliberately
small edit profile, never a substitute parser. Every candidate needs fresh engine
validation before the browser can apply it.
"""
import hashlib
import re


def digest(source):
    return hashlib.sha256(source.encode()).hexdigest()


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,63}', value):
        raise ValueError('Use a short name beginning with a letter; spaces belong in the description.')
    return value


def comment(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 4000 or '*/' in value:
        raise ValueError('Supply a description without a comment terminator (maximum 4000 characters).')
    return value.strip()


def element(report, name, kinds):
    matches = [e for e in report['elements'] if e.get('qualifiedName') == name and e['metaclass'] in kinds]
    if len(matches) != 1:
        raise ValueError('Choose one supported model element; the selection may be stale or unsupported.')
    return matches[0]


def replace_anchor(source, selected, after):
    before = selected.get('source', '')
    if not before or source.count(before) != 1:
        raise ValueError('The selected source is incomplete or ambiguous. Use the steward source editor.')
    return source.replace(before, after, 1)


def minimum_edit_profile(source):
    """Locate one simple, direct required predicate and its statement.

    This is a conservative edit profile, not a SysML parser. A fresh valid engine
    report remains mandatory. Token offsets keep comments and quoted text out of
    the predicate selection and permit changing only the selected integer span.
    """
    if not isinstance(source, str):
        return None
    token_pattern = re.compile(r'/\*[\s\S]*?\*/|//[^\r\n]*|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[A-Za-z_]\w*|\d+|>=|::|[^\s]')
    tokens, comments = [], {}
    for match in token_pattern.finditer(source):
        value = match.group()
        if value.startswith(('/*', '//')):
            comments[match.start()] = match
        else:
            tokens.append((value, match.start(), match.end()))
    if not tokens or tokens[0][0] != 'requirement':
        return None
    depth, depths = 0, []
    for value, _, _ in tokens:
        depths.append(depth)
        depth += (value == '{') - (value == '}')
        if depth < 0:
            return None
    if depth or tokens[-1][0] != '}':
        return None
    # Only the requirement's own statement and obligation are in this profile.
    # Nested constraints or several statements need deliberate source editing.
    docs = [i for i, token in enumerate(tokens) if token[0] == 'doc']
    constraints = [i for i, token in enumerate(tokens) if token[0] == 'constraint']
    requirements = [i for i, token in enumerate(tokens) if token[0] == 'require']
    if len(docs) != 1 or len(constraints) != 1 or len(requirements) != 1:
        return None
    doc, constraint, required = docs[0], constraints[0], requirements[0]
    if depths[doc] != 1 or depths[required] != 1 or constraint != required + 1:
        return None
    statement = re.match(r'\s*(/\*[\s\S]*?\*/)', source[tokens[doc][2]:])
    if not statement:
        return None
    comment_start = tokens[doc][2] + statement.start(1)
    block = comments.get(comment_start)
    if block is None:
        return None
    start = constraint + 1
    if start >= len(tokens) or tokens[start][0] != '{':
        return None
    end = start + 1
    while end < len(tokens) and depths[end] > 1:
        end += 1
    # The matching close has depth 2; the next token returns to depth 1.
    close = end - 1
    if close <= start or tokens[close][0] != '}':
        return None
    body = tokens[start + 1:close]
    if body and body[-1][0] == ';':
        body = body[:-1]
    values = [token[0] for token in body]
    try:
        operator = values.index('>=')
    except ValueError:
        return None
    path = values[:operator]
    if (not path or len(path) % 2 != 1
            or any(not re.fullmatch(r'[A-Za-z_]\w*', value) for value in path[::2])
            or any(value not in ('.', '::') for value in path[1::2])):
        return None
    literal = body[operator + 1:]
    if len(literal) == 2 and literal[0][0] == '-':
        span = (literal[0][1], literal[1][2])
        number = '-' + literal[1][0]
    elif len(literal) == 1:
        span = (literal[0][1], literal[0][2])
        number = literal[0][0]
    else:
        return None
    if not re.fullmatch(r'-?\d+', number) or len(number) > 16:
        return None
    return {'currentValue': int(number), 'statement': block.group()[2:-2].strip(),
            'integerSpan': span, 'statementSpan': (tokens[doc][1], block.end()),
            'path': path}


def minimum_edit_options(report):
    """Revision-bound eligible targets for the same profile used by candidate."""
    source = report.get('source', '') if isinstance(report, dict) else ''
    if (not isinstance(source, str) or not source or not report.get('staticChecksPassed')
            or report.get('sourceSha256') != digest(source)):
        return []
    options, counts = [], {}
    for selected in report.get('elements', []):
        target = selected.get('qualifiedName')
        counts[target] = counts.get(target, 0) + 1
    for selected in report.get('elements', []):
        target = selected.get('qualifiedName')
        if (not target or selected.get('metaclass') not in ('RequirementUsage', 'RequirementDefinition')
                or counts[target] != 1):
            continue
        before = selected.get('source', '')
        profile = minimum_edit_profile(before)
        if profile is not None and source.count(before) == 1:
            options.append({'target': target, 'currentValue': profile['currentValue'],
                            'statement': profile['statement']})
    return options


def candidate(report, source, request):
    if not report or not report.get('staticChecksPassed') or report.get('sourceSha256') != digest(source):
        raise ValueError('Validate the current model before preparing a change.')
    if request.get('baseSourceSha256') != digest(source):
        raise ValueError('The model changed. Reopen the task against the current revision.')
    reason = comment(request.get('reason'))
    operation = request.get('operation')
    target = request.get('target')
    if operation == 'minimum':
        selected = element(report, target, ('RequirementUsage', 'RequirementDefinition'))
        before = selected.get('source', '')
        profile = minimum_edit_profile(before)
        value = request.get('value')
        if type(value) is not int or not 0 <= value <= 1000000 or profile is None:
            raise ValueError('This task supports one direct required constraint with a literal integer minimum between 0 and 1000000 and one statement; use the source editor for other forms.')
        if value == profile['currentValue']:
            raise ValueError('The required minimum is unchanged. Use the source editor to revise only the statement.')
        statement = comment(request.get('statement'))
        edits = [(*profile['integerSpan'], str(value)),
                 (*profile['statementSpan'], 'doc /* '+statement+' */')]
        after = before
        for start, end, text in sorted(edits, reverse=True):
            after = after[:start] + text + after[end:]
        changed = minimum_edit_profile(after)
        if (changed is None or changed['currentValue'] != value
                or changed['path'] != profile['path'] or changed['statement'] != statement):
            raise ValueError('The required constraint could not be changed unambiguously. Use the source editor.')
        description = f'{target}: required minimum becomes {value}; the statement is updated. Design quantities stay unchanged.'
    elif operation == 'component':
        selected = element(report, target, ('PartDefinition', 'PartUsage', 'Package'))
        name = identifier(request.get('name'))
        description_text = comment(request.get('description'))
        before = selected.get('source', '')
        if not before.rstrip().endswith('}'):
            raise ValueError('Choose a component or package with an explicit body.')
        if any(e.get('qualifiedName') == target+'::'+name for e in report['elements']):
            raise ValueError('That name already exists in this scope.')
        index = before.rfind('}')
        after = before[:index] + f'    part {name} {{ doc /* {description_text} */ }}\n' + before[index:]
        description = f'Add component {name} inside {target}. No ports, safeguards or responsibility are inferred.'
    elif operation == 'scenario':
        selected = element(report, target, ('Package',))
        name = identifier(request.get('name'))
        steps = request.get('steps')
        if not isinstance(steps, list) or not 2 <= len(steps) <= 8:
            raise ValueError('Provide two to eight ordered scenario steps.')
        normalized = [(identifier(s.get('name')), comment(s.get('description'))) for s in steps]
        if len({n for n, _ in normalized}) != len(normalized):
            raise ValueError('Scenario step names must be distinct.')
        if any(e.get('qualifiedName') == target+'::'+name for e in report['elements']):
            raise ValueError('That scenario name already exists.')
        before = selected.get('source', '')
        if not before.rstrip().endswith('}'):
            raise ValueError('Choose a package with an explicit body.')
        body = '\n'.join(f'        then action {n} {{ doc /* {d} */ }}' for n, d in normalized)
        declaration = f'    action def {name} {{\n        doc /* {comment(request.get("description"))} */\n        first start;\n{body}\n        then done;\n    }}\n'
        index = before.rfind('}')
        after = before[:index] + declaration + before[index:]
        description = f'Add ordered scenario {name} with {len(steps)} declared steps. Conditions and execution remain unspecified.'
    elif operation == 'responsibility':
        selected = element(report, target, ('PartDefinition', 'PartUsage'))
        action = element(report, request.get('action'), ('ActionDefinition',))
        name = identifier(request.get('name'))
        before = selected.get('source', '')
        if not before.rstrip().endswith('}'):
            raise ValueError('Choose a component with an explicit body.')
        if any(e.get('qualifiedName') == target+'::'+name for e in report['elements']):
            raise ValueError('That responsibility name already exists.')
        index = before.rfind('}')
        after = before[:index] + f'    perform action {name} : {action["qualifiedName"]};\n' + before[index:]
        description = f'{target} performs {action["qualifiedName"]}. Shared definitions affect every use; no execution is claimed.'
    else:
        raise ValueError('Unsupported engineering task.')
    result = replace_anchor(source, selected, after)
    if result == source:
        raise ValueError('There is no model change to review.')
    return result, {'operation': operation, 'target': target, 'reason': reason,
                    'description': description, 'before': before, 'after': after,
                    'baseSourceSha256': digest(source), 'candidateSourceSha256': digest(result)}


def views_for(value):
    if not isinstance(value, list) or not 0 <= len(value) <= 32:
        raise ValueError('A project requires 0–32 view recipes.')
    ids = set()
    for view in value:
        if (not isinstance(view, dict) or not isinstance(view.get('id'), str)
                or not re.fullmatch(r'[a-z][a-z0-9-]{0,63}', view['id']) or view['id'] in ids
                or not isinstance(view.get('names'), list) or len(view['names']) != 1
                or not isinstance(view['names'][0], str) or len(view['names'][0]) > 500
                or view.get('view') not in ('DEFAULT','TREE','INTERCONNECTION','ACTION','STATE','SEQUENCE','MIXED')
                or view.get('renderer', 'pilot') not in ('pilot','engineering','summary','behavior')
                or not isinstance(view.get('styles', []), list)
                or any(s not in ('LR','TB','POLYLINE','ORTHOLINE') for s in view.get('styles', []))):
            raise ValueError('Unsupported or repeated view recipe.')
        ids.add(view['id'])
        view.setdefault('styles', [])
    return value


def scenario_view(views, target, name):
    """Allocate a presentation identifier without changing the model identifier."""
    qualified = target + '::' + name
    stem = 'scenario-' + name.lower().replace('_', '-')[:40] + '-' + digest(qualified)[:8]
    existing = {v['id'] for v in views}
    view_id, suffix = stem, 2
    while view_id in existing:
        view_id = stem + '-' + str(suffix)
        suffix += 1
    return {'id': view_id, 'names': [qualified], 'view': 'ACTION', 'styles': ['LR'], 'renderer': 'behavior'}


def exploration_views(views, target, view='DEFAULT'):
    """Render a temporary scope without mutating the project's saved recipes."""
    if not target:
        return views
    return views_for([v for v in views if v['id'] != 'focused'] + [{
        'id': 'focused', 'names': [target],
        'view': 'INTERCONNECTION' if view == 'SUMMARY' else view, 'styles': ['LR'],
        'renderer': 'summary' if view == 'SUMMARY' else ('engineering' if view == 'INTERCONNECTION' else 'pilot')}])
