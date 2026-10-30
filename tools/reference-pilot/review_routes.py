"""Review objectives select existing model views; they never create semantic facts."""


def prepare(pack, source_sha, views):
    if not isinstance(pack, dict) or pack.get('schemaVersion') != 1:
        raise ValueError('Review routes require schemaVersion 1')
    base = pack.get('reviewedSourceSha256')
    if not isinstance(base, str) or len(base) != 64 or any(c not in '0123456789abcdef' for c in base):
        raise ValueError('Review routes require a reviewed source SHA-256')
    routes = pack.get('routes')
    if not isinstance(routes, list) or not 1 <= len(routes) <= 20:
        raise ValueError('Provide 1–20 review routes')
    by_id = {v['id']: v for v in views}
    ids = set(); result = []
    for route in routes:
        if not isinstance(route, dict): raise ValueError('Invalid review route')
        for key in ('id', 'title', 'audience', 'objective'):
            if not isinstance(route.get(key), str) or not route[key].strip() or len(route[key]) > 500:
                raise ValueError('Review route requires short ' + key)
        if route['id'] in ids: raise ValueError('Duplicate review route ID')
        ids.add(route['id']); steps = route.get('steps')
        if not isinstance(steps, list) or not 1 <= len(steps) <= 20:
            raise ValueError('Review route requires 1–20 steps')
        seen = set()
        for step in steps:
            view = by_id.get(step.get('viewId'))
            if not view or step['viewId'] in seen:
                raise ValueError('Missing or repeated view in review route')
            seen.add(step['viewId'])
            if step.get('targets') != view.get('targets', view.get('names')):
                raise ValueError('Review target changed: ' + step['viewId'])
            if not isinstance(step.get('question'), str) or not step['question'].strip() or len(step['question']) > 500:
                raise ValueError('Review step requires a short question')
        result.append({k: route[k] for k in ('id', 'title', 'audience', 'objective', 'steps')})
    return {'schemaVersion': 1, 'sourceSha256': source_sha, 'reviewedSourceSha256': base,
            'status': 'source-matches-review-basis' if source_sha == base else 'review-basis-changed',
            'routes': result, 'meaning': 'Facilitation prompts, not model facts, approvals or completed reviews.'}
