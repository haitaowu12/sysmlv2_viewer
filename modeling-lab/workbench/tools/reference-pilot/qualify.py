#!/usr/bin/env python3
"""Qualify immutable source/view snapshots with a pinned reference runtime."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from engineering import interconnection, exchange_summary
from behavior import project as behavior_project, render_svg as behavior_svg
from source_set import assemble, source_location
from report_integrity import digest, seal_report, view_recipe_sha256

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return digest(Path(path).read_bytes())


def library_hash(root):
    records = [(path.relative_to(root).as_posix(), sha(path)) for path in root.rglob('*')
               if path.is_file() and path.suffix in ('.sysml', '.kerml')]
    if not records:
        raise ValueError('No standard library source files found')
    return digest(''.join(f'{name}\0{value}\n' for name, value in sorted(records)).encode()), len(records)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('jar', 'library', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    sources = parser.add_mutually_exclusive_group(required=True)
    sources.add_argument('--source', type=Path)
    sources.add_argument('--source-set', type=Path)
    parser.add_argument('--views', type=Path)
    args = parser.parse_args()
    lock_raw = (ROOT / 'config/reference-pilot-lock.json').read_bytes()
    lock = json.loads(lock_raw)
    runtime_digest, count = library_hash(args.library.resolve())
    if sha(args.jar) != lock['jarSha256'] or runtime_digest != lock['libraryTreeSha256']:
        raise ValueError('Reference runtime or library differs from the separate candidate lock')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if any((output/name).exists() for name in ('report.json', 'inputs.json', 'source.snapshot.sysml', 'producer')):
        raise ValueError('Use a new output directory; qualification evidence is not overwritten')
    snapshots = {}
    if args.source_set:
        manifest_raw = args.source_set.read_bytes()
        (output/'source-set.snapshot.json').write_bytes(manifest_raw)
        source_map = assemble(args.source_set, output/'source.snapshot.sysml', manifest_raw=manifest_raw)
        snapshots['sourceSet'] = {'file': 'source-set.snapshot.json', 'sha256': digest(manifest_raw)}
    else:
        source_map = []
        (output/'source.snapshot.sysml').write_bytes(args.source.read_bytes())
    source_path = output/'source.snapshot.sysml'
    snapshots['source'] = {'file': source_path.name, 'sha256': sha(source_path)}
    views_path = None
    requests = []
    if args.views:
        views_raw = args.views.read_bytes()
        requests = json.loads(views_raw)
        if not isinstance(requests, list):
            raise ValueError('View requests must be a list')
        for request in requests: view_recipe_sha256(request)
        if len({v['id'] for v in requests}) != len(requests):
            raise ValueError('View IDs must be unique')
        views_path = output/'views.snapshot.json'
        views_path.write_bytes(views_raw)
        snapshots['views'] = {'file': views_path.name, 'sha256': digest(views_raw)}
    (output/'runtime-lock.snapshot.json').write_bytes(lock_raw)
    snapshots['runtimeLock'] = {'file': 'runtime-lock.snapshot.json', 'sha256': digest(lock_raw)}
    implementation = {}
    producer_dir = output/'producer'
    producer_dir.mkdir()
    producer_root = ROOT/'tools/reference-pilot'
    producer_names = ('qualify.py', 'source_set.py', 'report_integrity.py', 'engineering.py', 'behavior.py', 'ReferencePilot.java')
    producer_paths = [producer_root/name for name in producer_names if (producer_root/name).is_file()]
    for path in producer_paths:
        raw = path.read_bytes()
        dest = producer_dir/path.name
        dest.write_bytes(raw)
        implementation[path.name] = {'file': dest.relative_to(output).as_posix(), 'sha256': digest(raw)}
    producer_digests = {name: entry['sha256'] for name, entry in implementation.items()}
    harness_path = producer_dir/'ReferencePilot.java'
    runtime = subprocess.run(['java', '-version'], capture_output=True, text=True, check=True)
    graphviz = subprocess.run(['dot', '-V'], capture_output=True, text=True, check=True)
    receipt = dict(lock, sourceSha256=snapshots['source']['sha256'], sourceMap=source_map,
                   sourceSetSha256=digest(manifest_raw) if args.source_set else None, libraryFileCount=count,
                   javaVersion=runtime.stderr.strip(), graphvizVersion=(graphviz.stderr + graphviz.stdout).strip(),
                   harnessSha256=sha(harness_path),
                   presentationSha256=producer_digests['engineering.py'],
                   qualifierSha256=producer_digests.get('qualify.py', sha(Path(__file__))), source=str(source_path),
                   viewsSha256=snapshots.get('views', {}).get('sha256'), producerImplementationSha256=producer_digests,
                   originalSource=str(args.source_set.resolve() if args.source_set else args.source.resolve()),
                   originalViews=str(args.views.resolve()) if args.views else None, snapshots=snapshots)
    (output/'inputs.json').write_text(json.dumps(receipt, indent=2) + '\n')
    with (output/'runtime.log').open('w') as log:
        result = subprocess.run(['java', '-Xmx2g', '-cp', str(args.jar.resolve()),
            str(harness_path), str(args.library.resolve()), str(source_path),
            str(views_path) if views_path else '-', str(output)],
            stdout=log, stderr=subprocess.STDOUT, timeout=180)
    if not (output/'report.json').exists():
        raise RuntimeError(f'Reference process failed before reporting; see {output / "runtime.log"}')
    # Rechecking parsed snapshots fails closed if a process edits their bytes.
    for label, entry in snapshots.items():
        if sha(output/entry['file']) != entry['sha256']:
            raise ValueError('Qualification input snapshot changed during execution: ' + label)
    if sha(args.jar) != lock['jarSha256'] or library_hash(args.library.resolve())[0] != runtime_digest:
        raise ValueError('Reference runtime changed during qualification')
    for path in producer_paths:
        if sha(path) != producer_digests[path.name] or sha(producer_dir/path.name) != producer_digests[path.name]:
            raise ValueError('Producer implementation changed during qualification: ' + path.name)
    report = json.loads((output/'report.json').read_text())
    report.update(sourceSha256=snapshots['source']['sha256'], sourceMap=source_map,
                  viewsSha256=snapshots.get('views', {}).get('sha256'), producerImplementationSha256=producer_digests,
                  producerIntegrity={'schemaVersion': 1, 'receiptFile': 'report-integrity.json',
                                     'boundary': 'Local integrity receipt; not an authenticated producer signature.'})
    for item in report['elements'] + report['diagnostics']:
        location = source_location(item.get('line'), source_map)
        if location: item['originalSource'] = location
    if report.get('staticChecksPassed') is False:
        if report.get('views'):
            raise ValueError('Statically invalid engine report must not contain rendered views')
        # The Pilot deliberately skips rendering invalid source. Seal the actual
        # diagnostics and mark requested recipes blocked, not realized graphics.
        report['views'] = [dict(id=r['id'], view=r['view'], targets=r['names'], styles=r['styles'],
            status='blocked-invalid-source', error='Static validation failed; no view produced') for r in requests]
    if len(report['views']) != len(requests):
        raise ValueError('Engine report does not realize every view request')
    by_id = {r['id']: r for r in requests}
    seen_views = set()
    for view in report['views']:
        request = by_id.get(view.get('id'))
        if request is None or view['id'] in seen_views:
            raise ValueError('Engine report view IDs differ from the requested recipe')
        seen_views.add(view['id'])
        if view.get('view') != request['view'] or view.get('targets') != request['names']:
            raise ValueError('Engine report view concern/targets differ from the request')
        view['viewRecipeSha256'] = view_recipe_sha256(request)
        if request.get('renderer') not in ('engineering', 'summary', 'behavior') or 'file' not in view:
            continue
        try:
            if len(request['names']) != 1:
                raise ValueError('Custom profiles require a single scope')
            if request.get('renderer') == 'behavior':
                if request['view'] not in ('STATE', 'ACTION'):
                    raise ValueError('Behavior profile requires a state or action view')
                behavior = behavior_project(report, request['names'][0])
                if behavior['kind'] != ('state' if request['view'] == 'STATE' else 'action'):
                    raise ValueError('Behavior concern does not match the selected element')
                projection = {'svg': behavior_svg(behavior), 'behavior': behavior,
                              'notationProfile': 'declared-behavior-v1', 'authority': 'Pilot EMF facts; bounded custom presentation',
                              'excluded': behavior['warnings'], 'limits': behavior['limits']}
            else:
                if request['view'] != 'INTERCONNECTION':
                    raise ValueError('Engineering profile requires a single interconnection scope')
                project = exchange_summary if request.get('renderer') == 'summary' else interconnection
                projection = project(report, request['names'][0])
            reference_file = view['id'] + '-pilot.svg'
            (output/view['file']).rename(output/reference_file)
            (output/view['file']).write_text(projection.pop('svg'))
            view.update(projection, referenceFile=reference_file)
        except ValueError as error:
            view['error'] = str(error)
    for view in report['views']:
        view['modelSha256'] = report['sourceSha256']
        for field, digest_field in (('file', 'artifactSha256'), ('referenceFile', 'referenceArtifactSha256'), ('rawFile', 'rawArtifactSha256')):
            if field in view and (output/view[field]).is_file():
                view[digest_field] = sha(output/view[field])
    (output/'report.json').write_text(json.dumps(report, indent=2) + '\n')
    seal_report(output/'report.json', output/'inputs.json', snapshots, implementation)
    exit_code = result.returncode or (2 if any('error' in v for v in report['views']) else 0)
    print(json.dumps({'output': str(output), 'exitCode': exit_code,
                      'staticChecksPassed': report['staticChecksPassed'], 'diagnostics': report['diagnostics'],
                      'views': report['views']}, indent=2))
    return exit_code

if __name__ == '__main__':
    sys.exit(main())
