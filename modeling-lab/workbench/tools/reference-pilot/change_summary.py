"""Source-backed, bounded declaration changes for stakeholder review.

This is not physical performance analysis or general change impact. Only the
capacity analyzer's supported requirement/default pair supplies numeric claims.
"""
import re
from capacity_analysis import analyze
from check_contract import facts
from engineering import index_report


def comparisons(report):
    if not report or not report.get('staticChecksPassed'):
        return {}
    ix = index_report(report)
    results = {}
    for element in report.get('elements', []):
        if element.get('metaclass') != 'ConstraintUsage':
            continue
        owner = element.get('semantics', {}).get('owner', {})
        if owner.get('metaclass') not in ('RequirementUsage', 'RequirementDefinition'):
            continue
        expression = facts(element, ix).get('expression') or {}
        operands = expression.get('operands', [])
        if len(operands) != 2 or operands[0].get('kind') != 'FeaturePath':
            continue
        path = operands[0].get('path', [])
        if path and owner.get('qualifiedName'):
            name = owner['qualifiedName']
            result = analyze(report, path[-1], name)
            # The analyzer rejects ambiguous constraints; never choose a winner.
            results[name] = result
    return results


def count_wording(report, requirement, minimum):
    """An exact, narrow documentation label, never an inferred SysML unit.

    Only one affirmative 'at least N <single count noun>' ending a clause is
    supported. Its number must agree with the resolved required predicate.
    Ambiguous, negated or changed wording is left unspecified.
    """
    elements = [e for e in report.get('elements', []) if e.get('qualifiedName') == requirement]
    if len(elements) != 1:
        return None
    docs = re.findall(r'\bdoc\s*/\*([\s\S]*?)\*/', elements[0].get('source', ''))
    if len(docs) != 1 or re.search(r'\b(?:not|never|no|unless|except)\b', docs[0], re.I):
        return None
    matches = re.findall(r'\bat least\s+(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten)\s+([a-z]+)(?=\s*(?:[.;]|$))', docs[0], re.I)
    if len(matches) != 1:
        return None
    amount, noun = matches[0]
    words = dict(zip('zero one two three four five six seven eight nine ten'.split(), range(11)))
    value = int(amount) if amount.isdigit() else words.get(amount.lower())
    return noun if value == minimum else None


def summarize(baseline, current):
    if not baseline or not current or baseline.get('sourceSha256') == current.get('sourceSha256'):
        return []
    before, after = comparisons(baseline), comparisons(current)
    result = []
    for requirement in sorted(before.keys() | after.keys()):
        old, new = before.get(requirement), after.get(requirement)
        relevant = ('status', 'declaredValue', 'requiredMinimum', 'attribute', 'constraintKind')
        if old and new and all(old.get(k) == new.get(k) for k in relevant):
            continue
        item = {'requirement': requirement, 'baselineSourceSha256': baseline['sourceSha256'],
                'sourceSha256': current['sourceSha256'], 'before': old, 'after': new,
                'physicalVerification': 'not-evaluated', 'profile': 'declared-integer-capacity-v1'}
        if old and new and old.get('attribute') == new.get('attribute') and all(x.get('status') in ('declared-comparison-passed', 'declared-design-shortfall') for x in (old, new)):
            minimum = (str(new['requiredMinimum']) + ' (unchanged)' if old['requiredMinimum'] == new['requiredMinimum']
                       else f"{old['requiredMinimum']} → {new['requiredMinimum']}")
            count = (str(new['declaredValue']) + ' (unchanged)' if old['declaredValue'] == new['declaredValue']
                     else f"{old['declaredValue']} → {new['declaredValue']}")
            old_noun = count_wording(baseline, requirement, old['requiredMinimum'])
            new_noun = count_wording(current, requirement, new['requiredMinimum'])
            # A shared noun is only quoted documentation context. Numeric facts
            # still come exclusively from the bounded native analysis above.
            noun = new_noun if old_noun and new_noun and old_noun.casefold() == new_noun.casefold() else None
            attribute = new.get('attribute', '').split('::')[-1]
            quantity = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', attribute).replace('_', ' ').capitalize() or 'Count'
            suffix = f' ({noun})' if noun else ''
            item['text'] = f"Required minimum{suffix}: {minimum}. Declared {quantity.lower()}{suffix}: {count}."
            if noun:
                item['text'] += ' Count label quoted from requirement wording.'
            item['quantityLabel'] = quantity
            item['countWording'] = noun
            item['countWordingBasis'] = 'matching requirement documentation' if noun else 'unspecified'

            item['consequence'] = ('Declared design shortfall.' if new['status'] == 'declared-design-shortfall'
                                   else 'Declared count comparison passes.') + ' Physical verification: not evaluated.'
        else:
            item['text'] = 'The basis for this declaration comparison changed.'
            item['consequence'] = 'Numeric comparison unavailable or unsupported; review the source. Physical verification: not evaluated.'
        result.append(item)
    return result
