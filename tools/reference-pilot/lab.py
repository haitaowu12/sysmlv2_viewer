#!/usr/bin/env python3
"""Loopback-only reference lab. Draft validation/rendering never edits source files."""
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

ROOT = Path(__file__).resolve().parents[2]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('jar', 'library', 'source', 'views'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--port', type=int, default=5196)
    parser.add_argument('--reviews', type=Path, help='Optional revision-bound review routes')
    args = parser.parse_args()
    token = secrets.token_hex(24)
    source = args.source.read_text()
    presets = json.loads(args.views.read_text())
    reviews = json.loads(args.reviews.read_text()) if args.reviews else None
    if reviews: prepare_reviews(reviews, hashlib.sha256(source.encode()).hexdigest(), presets)
    origin = f'http://127.0.0.1:{args.port}'
    working = tempfile.TemporaryDirectory(prefix='sysml-reference-lab-')

    current = {"catalogue": None}

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
                page = (ROOT / 'tools/reference-pilot/lab.html').read_text().replace('__SCOPE_SCRIPT__', (ROOT / 'tools/reference-pilot/scope.js').read_text()).replace('__TOKEN__', token)
                return self.reply(200, page, 'text/html')
            if self.path == '/initial': return self.reply(200, {'source': source, 'presets': presets, 'workspaceKey': hashlib.sha256(str(args.source.resolve()).encode()).hexdigest()[:20]})
            self.reply(404, {'error': 'Not found'})

        def do_POST(self):
            if not self.allowed() or self.headers.get('Origin') != origin or self.headers.get('X-Session') != token:
                return self.reply(403, {'error': 'Session or origin rejected'})
            if self.path not in ('/render', '/compose') or self.headers.get('Content-Type') != 'application/json':
                return self.reply(400, {'error': 'Expected JSON render request'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 262144: raise ValueError('Draft exceeds 256 KiB')
                data = json.loads(self.rfile.read(size))
                if self.path == '/compose':
                    catalog = current['catalogue']
                    if not catalog or data.get('sourceSha256') != catalog['sourceSha256']:
                        raise ValueError('Source revision is no longer current; validate the draft first')
                    return self.reply(200, compose(catalog, data.get('recipe')))
                current['catalogue'] = None
                draft = data['source']
                if not isinstance(draft, str): raise ValueError('Source must be text')
                views = presets
                if data.get('target'):
                    view = data.get('view', 'DEFAULT')
                    if view not in ('DEFAULT', 'TREE', 'INTERCONNECTION', 'ACTION', 'STATE', 'SEQUENCE', 'MIXED', 'SUMMARY'):
                        raise ValueError('Unsupported reference view')
                    views = [{'id': 'focused', 'names': [data['target']], 'view': 'INTERCONNECTION' if view == 'SUMMARY' else view, 'styles': ['LR'], 'renderer': 'summary' if view == 'SUMMARY' else ('engineering' if view == 'INTERCONNECTION' else 'pilot')}]
                run = Path(working.name) / secrets.token_hex(8)
                run.mkdir()
                (run / 'draft.sysml').write_text(draft)
                (run / 'views.json').write_text(json.dumps(views))
                process = subprocess.run([sys.executable, str(ROOT / 'tools/reference-pilot/qualify.py'),
                    '--jar', str(args.jar.resolve()), '--library', str(args.library.resolve()),
                    '--source', str(run / 'draft.sysml'), '--views', str(run / 'views.json'), '--output', str(run / 'result')],
                    capture_output=True, text=True, timeout=200)
                report_path = run / 'result/report.json'
                if not report_path.exists(): raise RuntimeError('Reference runtime failed before reporting: ' + process.stderr[-1200:])
                report = json.loads(report_path.read_text())
                for view in report['views']:
                    if 'file' in view: view['svg'] = (run / 'result' / view['file']).read_text()
                    if 'rawFile' in view: view['rawSvg'] = (run / 'result' / view['rawFile']).read_text()
                report['sourceSha256'] = hashlib.sha256(draft.encode()).hexdigest()
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
                if report.get('staticChecksPassed'):
                    if reviews:
                        try: report['reviews'] = prepare_reviews(reviews, report['sourceSha256'], report['views'])
                        except ValueError as error: report['reviewError'] = str(error)
                    try:
                        report['catalogue'] = catalogue(report)
                        current['catalogue'] = report['catalogue']
                    except ValueError as error:
                        report['catalogueError'] = str(error)
                return self.reply(200, report)
            except Exception as error:
                return self.reply(400, {'error': str(error)})

    print(f'Reference lab: {origin} (draft-only; canonical source unchanged)', flush=True)
    try:
        HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
    finally:
        working.cleanup()

if __name__ == '__main__': main()
