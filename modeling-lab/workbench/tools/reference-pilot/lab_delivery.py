"""Browser working inventory over the unchanged, qualified server report."""


def browser_report(report):
    """Keep named editing targets and every register witness; defer anonymous internals.

    The integrity reference identifies the full qualified report held by the server,
    not a hash of this enriched/filtered browser response.
    """
    witness_ids = {r['elementId'] for r in (report.get('catalogue') or {}).get('relations', [])}
    elements = []
    for element in report.get('elements', []):
        if element.get('qualifiedName') or element.get('metaclass') == 'PerformActionUsage':
            elements.append(element)
        elif element['sessionElementId'] in witness_ids:
            elements.append({k: v for k, v in element.items() if k != 'semantics'})
    return {**report, 'elements': elements, 'delivery': {
        'kind': 'browser-working-inventory', 'fullElementCount': len(report.get('elements', [])),
        'loadedElementCount': len(elements), 'additionalEvidence': 'revision-bound /element',
        'integrityReference': 'full qualified server report'}}


def element_detail(report, request):
    if (not report or not report.get('staticChecksPassed')
            or request.get('sourceSha256') != report.get('sourceSha256')
            or request.get('reportSha256') != report.get('reportIntegrity', {}).get('reportSha256')):
        raise ValueError('Source or report revision is no longer current; validate the model first')
    element = next((e for e in report['elements'] if e['sessionElementId'] == request.get('elementId')), None)
    if element is None:
        raise ValueError('Element is not present in this qualified report')
    return {'element': element, 'sourceSha256': report['sourceSha256'],
            'reportSha256': report['reportIntegrity']['reportSha256']}
