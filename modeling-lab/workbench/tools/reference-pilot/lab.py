#!/usr/bin/env python3
"""Loopback-only modelling Lab. Explicit project downloads persist work; model files are never overwritten."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import secrets
import subprocess
import tempfile
import hashlib
import sys
from stakeholder import project, render_svg
from view_scope import catalogue, compose
from review_routes import prepare as prepare_reviews
from report_integrity import load_report
from change_summary import summarize
from lab_project import candidate, views_for, digest, scenario_view, exploration_views
from lab_delivery import browser_report, element_detail

ROOT = Path(__file__).resolve().parents[2]


def require_complete_views(report, recipes):
    """A static source pass is insufficient when a required presentation failed."""
    views = report.get('views', [])
    for recipe in recipes:
        matches = [view for view in views if view.get('id') == recipe['id']]
        if len(matches) != 1 or matches[0].get('targets') != recipe['names']:
            raise ValueError('Required view '+recipe['id']+' is missing or has a different scope. Current project is retained.')
    for view in views:
        failure = view.get('error') or view.get('stakeholderError')
        if failure or not view.get('svg') or not view.get('stakeholderSvg'):
            raise ValueError('Required view '+str(view.get('id', '(unnamed)'))+' could not be built: '+str(failure or 'A required audience drawing is missing')+'. Current project is retained.')


class AcceptedState:
    """One staged candidate and one reversible acceptance; no model history cache."""
    def __init__(self, current):
        self.current = current
        self.staged = None
        self.previous = None
        self.last_rolled_back = None

    def identity(self):
        report = self.current.get('report') or {}
        return (report.get('sourceSha256'), report.get('reportIntegrity', {}).get('reportSha256'))

    def stage(self, token, state, expected):
        if not isinstance(token, str) or not 8 <= len(token) <= 128:
            raise ValueError('Invalid project transaction identity')
        if tuple(expected) != self.identity():
            raise ValueError('Accepted project changed while this candidate was rendering')
        self.staged = (token, state, self.identity())

    def accept(self, data):
        if not self.staged or self.staged[0] != data.get('transactionId'):
            raise ValueError('Project transaction is no longer current')
        token, state, expected = self.staged
        report = state['report']
        if self.identity() != expected or (data.get('sourceSha256'), data.get('reportSha256')) != (report['sourceSha256'], report['reportIntegrity']['reportSha256']):
            raise ValueError('Project transaction does not match the staged report')
        self.last_rolled_back = None
        self.previous = (token, self.current.copy())
        self.current.update(state)
        self.staged = None
        return {'accepted': True, 'transactionId': token, 'sourceSha256': report['sourceSha256'], 'reportSha256': report['reportIntegrity']['reportSha256']}

    def rollback(self, token):
        if not isinstance(token, str) or not 8 <= len(token) <= 128:
            raise ValueError('Invalid project transaction identity')
        if self.previous and self.previous[0] == token:
            self.current.update(self.previous[1])
            self.previous = None
        elif self.staged and self.staged[0] == token:
            # An accept request may never have arrived. Discard that candidate
            # without changing the accepted context or another transaction.
            self.staged = None
        elif self.last_rolled_back != token:
            raise ValueError('Project acceptance can no longer be rolled back')
        # Retain just the last confirmation so a lost response can be retried.
        self.last_rolled_back = token
        return {'rolledBack': True, 'transactionId': token}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('jar', 'library', 'source', 'views'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--port', type=int, default=5196)
    parser.add_argument('--reviews', type=Path, help='Optional revision-bound review routes')
    args = parser.parse_args()
    token = secrets.token_hex(24)
    source = args.source.read_text()
    presets = views_for(json.loads(args.views.read_text()))
    reviews = json.loads(args.reviews.read_text()) if args.reviews else None
    if reviews: prepare_reviews(reviews, digest(source), presets)
    origin = f'http://127.0.0.1:{args.port}'
    working = tempfile.TemporaryDirectory(prefix='sysml-reference-lab-')
    current = {'catalogue': None, 'report': None, 'views': presets, 'baseline': None}
    transactions = AcceptedState(current)
    cache = {}

    def render_model(draft, views):
        key = digest(draft + json.dumps(views, sort_keys=True))
        if key in cache:
            return json.loads(json.dumps(cache[key]))
        run = Path(working.name) / secrets.token_hex(8)
        run.mkdir()
        (run / 'draft.sysml').write_text(draft)
        (run / 'views.json').write_text(json.dumps(views))
        process = subprocess.run([sys.executable, '-B', str(ROOT / 'tools/reference-pilot/qualify.py'),
            '--jar', str(args.jar.resolve()), '--library', str(args.library.resolve()),
            '--source', str(run / 'draft.sysml'), '--views', str(run / 'views.json'), '--output', str(run / 'result')],
            capture_output=True, text=True, timeout=200)
        report_path = run / 'result/report.json'
        if not report_path.exists():
            raise RuntimeError('Reference runtime failed before reporting: ' + process.stderr[-1200:])
        report = load_report(report_path, source=draft)
        for view in report['views']:
            if 'file' in view: view['svg'] = (run / 'result' / view['file']).read_text()
            if 'rawFile' in view: view['rawSvg'] = (run / 'result' / view['rawFile']).read_text()
        report['source'] = draft
        if report.get('staticChecksPassed'):
            for view, request in zip(report['views'], views):
                try:
                    if len(view['targets']) != 1: raise ValueError('Choose one model scope for a stakeholder view')
                    view['stakeholder'] = project(report, view['targets'][0], request)
                    view['stakeholderSvg'] = render_svg(view['stakeholder'])
                    view['stakeholderPortraitSvg'] = render_svg({**view['stakeholder'], 'layoutDirection': 'TB'})
                except ValueError as error:
                    view['stakeholderError'] = str(error)
            if reviews and all(any(v['id'] == s['viewId'] for v in views) for r in reviews['routes'] for s in r['steps']):
                try: report['reviews'] = prepare_reviews(reviews, report['sourceSha256'], views)
                except ValueError as error: report['reviewError'] = str(error)
            try:
                report['catalogue'] = catalogue(report)
                report['catalogue']['reportSha256'] = report['reportIntegrity']['reportSha256']
            except ValueError as error:
                report['catalogueError'] = str(error)
        # Small source/view cache avoids revalidating a prepared proposal on apply.
        if len(cache) >= 4: cache.pop(next(iter(cache)))
        cache[key] = json.loads(json.dumps(report))
        return report

    class Handler(BaseHTTPRequestHandler):
        def reply(self, code, value, content_type='application/json'):
            data = value.encode() if isinstance(value, str) else json.dumps(value).encode()
            self.send_response(code)
            self.send_header('Content-Type', content_type + '; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', f"default-src 'self'; script-src 'nonce-{token}'; style-src 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def allowed(self):
            return self.headers.get('Host') == origin.removeprefix('http://')

        def do_GET(self):
            if not self.allowed(): return self.reply(403, {'error': 'Host rejected'})
            if self.path == '/':
                page = (ROOT / 'tools/reference-pilot/lab.html').read_text()
                for key, filename in [('__SCOPE_SCRIPT__', 'scope.js'), ('__WORKFLOW_SCRIPT__', 'workflow.js')]:
                    page = page.replace(key, (ROOT / 'tools/reference-pilot' / filename).read_text())
                return self.reply(200, page.replace('__TOKEN__', token), 'text/html')
            if self.path == '/initial':
                return self.reply(200, {'source': source, 'presets': presets, 'workspaceKey': digest(str(args.source.resolve()))[:20]})
            self.reply(404, {'error': 'Not found'})

        def do_POST(self):
            if not self.allowed() or self.headers.get('Origin') != origin or self.headers.get('X-Session') != token:
                return self.reply(403, {'error': 'Session or origin rejected'})
            if self.path not in ('/render', '/compose', '/prepare', '/inspect', '/element', '/accept', '/rollback') or self.headers.get('Content-Type') != 'application/json':
                return self.reply(400, {'error': 'Expected JSON modelling request'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 1_048_576: raise ValueError('Request exceeds 1 MiB')
                data = json.loads(self.rfile.read(size))
                if self.path == '/accept':
                    return self.reply(200, transactions.accept(data))
                if self.path == '/rollback':
                    return self.reply(200, transactions.rollback(data.get('transactionId')))
                if self.path == '/element':
                    return self.reply(200, element_detail(current['report'], data))
                if self.path == '/inspect':
                    draft = data.get('source')
                    if not isinstance(draft, str) or len(draft.encode()) > 262144:
                        raise ValueError('Model source must be text, up to 256 KiB')
                    views = views_for(data['views']) if data.get('views') else []
                    report = render_model(draft, views)
                    if data.get('baselineSource') is not None:
                        baseline = data['baselineSource']
                        if not isinstance(baseline, str) or len(baseline.encode()) > 262144:
                            raise ValueError('Invalid baseline source')
                        # Source validation is independent of presentation recipes.
                        # Reuse an exact-text qualification, including a known failure.
                        base_report = report if baseline == draft else next(
                            (cached for cached in cache.values() if cached.get('source') == baseline), None)
                        if base_report is None:
                            base_report = render_model(baseline, [])
                        if not base_report.get('staticChecksPassed'):
                            raise ValueError('The imported baseline does not pass language validation. Current project is unchanged.')
                    return self.reply(200, browser_report(report))
                if self.path == '/compose':
                    catalog = current['catalogue']
                    if (not catalog or data.get('sourceSha256') != catalog['sourceSha256']
                            or data.get('reportSha256') != catalog['reportSha256']):
                        raise ValueError('Source revision is no longer current; validate the draft first')
                    return self.reply(200, {**compose(catalog, data.get('recipe')), 'reportSha256': catalog['reportSha256']})
                if self.path == '/prepare':
                    old = current['report']
                    draft, proposal = candidate(old, old['source'] if old else '', data)
                    views = json.loads(json.dumps(current['views']))
                    if data['operation'] == 'scenario':
                        views.append(scenario_view(views, data['target'], data['name']))
                    report = render_model(draft, views_for(views))
                    if not report.get('staticChecksPassed'):
                        return self.reply(400, {'error': 'The proposed edit failed language validation. Current model is unchanged.', 'diagnostics': report['diagnostics']})
                    return self.reply(200, {'source': draft, 'views': views, 'proposal': proposal,
                        'changeSummary': summarize(old, report), 'validated': True})
                draft = data['source']
                if not isinstance(draft, str) or len(draft.encode()) > 262144:
                    raise ValueError('Model source must be text, up to 256 KiB')
                if data.get('expectedBase') and data['expectedBase'] != (current['report'] or {}).get('sourceSha256'):
                    raise ValueError('The model changed while this proposal was open. Reopen the task.')
                project_views = views_for(data.get('views', presets))
                views = exploration_views(project_views, data.get('target'), data.get('view', 'DEFAULT'))
                baseline = data.get('baselineSource', source)
                if not isinstance(baseline, str) or len(baseline.encode()) > 262144:
                    raise ValueError('Invalid baseline source')
                baseline_report = current['baseline']
                if not baseline_report or baseline_report['sourceSha256'] != digest(baseline):
                    # Initial baseline uses the same recipes except newly added scenarios.
                    baseline_views = [v for v in views if not v['id'].startswith('scenario-')] or presets
                    baseline_report = render_model(baseline, baseline_views)
                    if not baseline_report.get('staticChecksPassed'):
                        raise ValueError('The project baseline does not pass language validation.')
                report = render_model(draft, views)
                report['viewRecipes'] = project_views
                report['changeSummary'] = summarize(baseline_report, report)
                for view in report['views']:
                    if view.get('stakeholder'):
                        target = next((e for e in report['elements'] if e.get('qualifiedName') == view['targets'][0]), {})
                        concerns = {view['targets'][0]} | {r.get('qualifiedName') for r in target.get('semantics', {}).get('verifiedRequirement', [])}
                        view['stakeholder']['changeSummary'] = [change for change in report['changeSummary'] if change['requirement'] in concerns]
                if report.get('staticChecksPassed'):
                    require_complete_views(report, views)
                state = {'catalogue': report.get('catalogue'), 'report': report, 'views': project_views, 'baseline': baseline_report}
                if data.get('stage'):
                    if report.get('staticChecksPassed'):
                        transactions.stage(data.get('transactionId'), state, (data.get('expectedBase'), data.get('expectedReport')))
                    report['transactionId'] = data.get('transactionId')
                else:
                    # Existing native callers retain the immediate-render protocol.
                    current.update(state if report.get('staticChecksPassed') else {'catalogue': None, 'report': None, 'views': project_views, 'baseline': baseline_report})
                    transactions.staged = transactions.previous = transactions.last_rolled_back = None
                return self.reply(200, browser_report(report))
            except Exception as error:
                return self.reply(400, {'error': str(error)})

    print(f'Modeling lab: {origin} (project-file save; input source unchanged)', flush=True)
    try:
        HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
    finally:
        working.cleanup()

if __name__ == '__main__': main()
