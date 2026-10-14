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
        # Only a single literal integer lower-bound obligation is in this edit profile.
        hits = list(re.finditer(r'(?<![><=])>=\s*(-?\d+)(?![\w.])', before))
        value = request.get('value')
        if type(value) is not int or not 0 <= value <= 1000000 or len(hits) != 1:
            raise ValueError('This task supports one literal integer minimum, between 0 and 1000000.')
        statement = comment(request.get('statement'))
        docs = list(re.finditer(r'\bdoc\s*/\*[\s\S]*?\*/', before))
        if len(docs) != 1:
            raise ValueError('This requirement needs one explicit statement; use the source editor for other forms.')
        edits = [(hits[0].start(1), hits[0].end(1), str(value)),
                 (docs[0].start(), docs[0].end(), 'doc /* '+statement+' */')]
        after = before
        for start, end, text in sorted(edits, reverse=True):
            after = after[:start] + text + after[end:]
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
    if not isinstance(value, list) or not 1 <= len(value) <= 32:
        raise ValueError('A project requires 1–32 view recipes.')
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
