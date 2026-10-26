#!/usr/bin/env python3
"""Qualify one source file with an explicitly supplied, pinned reference runtime."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from engineering import interconnection, exchange_summary
from source_set import assemble, source_location

ROOT = Path(__file__).resolve().parents[2]

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def library_hash(root):
    records = [(path.relative_to(root).as_posix(), sha(path)) for path in root.rglob('*')
               if path.is_file() and path.suffix in ('.sysml', '.kerml')]
    if not records:
        raise ValueError('No standard library source files found')
    return hashlib.sha256(''.join(f'{name}\0{digest}\n' for name, digest in sorted(records)).encode()).hexdigest(), len(records)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('jar', 'library', 'output'):
        parser.add_argument('--' + name, required=True, type=Path)
    sources = parser.add_mutually_exclusive_group(required=True)
    sources.add_argument('--source', type=Path)
    sources.add_argument('--source-set', type=Path)
    parser.add_argument('--views', type=Path)
    args = parser.parse_args()
    lock = json.loads((ROOT / 'config/reference-pilot-lock.json').read_text())
    digest, count = library_hash(args.library.resolve())
    if sha(args.jar) != lock['jarSha256'] or digest != lock['libraryTreeSha256']:
        raise ValueError('Reference runtime or library differs from the separate candidate lock')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if (output / 'report.json').exists():
        raise ValueError('Use a new output directory; qualification evidence is not overwritten')
    source_map = assemble(args.source_set, output / 'assembled.sysml') if args.source_set else []
    source_path = output / 'assembled.sysml' if args.source_set else args.source.resolve()
    runtime = subprocess.run(['java', '-version'], capture_output=True, text=True, check=True)
    graphviz = subprocess.run(['dot', '-V'], capture_output=True, text=True, check=True)
    receipt = dict(lock, sourceSha256=sha(source_path), sourceMap=source_map, sourceSetSha256=sha(args.source_set) if args.source_set else None, libraryFileCount=count,
                   javaVersion=runtime.stderr.strip(), graphvizVersion=(graphviz.stderr + graphviz.stdout).strip(),
                   harnessSha256=sha(ROOT / 'tools/reference-pilot/ReferencePilot.java'),
                   presentationSha256=sha(ROOT / 'tools/reference-pilot/engineering.py'),
                   qualifierSha256=sha(Path(__file__)), source=str(source_path),
                   viewsSha256=sha(args.views) if args.views else None)
    (output / 'inputs.json').write_text(json.dumps(receipt, indent=2) + '\n')
    with (output / 'runtime.log').open('w') as log:
        result = subprocess.run(['java', '-Xmx2g', '-cp', str(args.jar.resolve()),
            str(ROOT / 'tools/reference-pilot/ReferencePilot.java'), str(args.library.resolve()),
            str(source_path), str(args.views.resolve()) if args.views else '-', str(output)],
            stdout=log, stderr=subprocess.STDOUT, timeout=180)
    if not (output / 'report.json').exists():
        raise RuntimeError(f'Reference process failed before reporting; see {output / "runtime.log"}')
    report = json.loads((output / 'report.json').read_text())
    report['sourceSha256'] = sha(source_path)
    report['sourceMap'] = source_map
    for item in report['elements'] + report['diagnostics']:
        location = source_location(item.get('line'), source_map)
        if location: item['originalSource'] = location
    requests = json.loads(args.views.read_text()) if args.views else []
    for request, view in zip(requests, report['views']):
        if request.get('renderer') not in ('engineering','summary') or 'file' not in view:
            continue
        try:
            if request['view'] != 'INTERCONNECTION' or len(request['names']) != 1:
                raise ValueError('Engineering profile requires a single interconnection scope')
            project = exchange_summary if request.get('renderer') == 'summary' else interconnection
            projection = project(report, request['names'][0])
            reference_file = view['id'] + '-pilot.svg'
            (output / view['file']).rename(output / reference_file)
            (output / view['file']).write_text(projection.pop('svg'))
            view.update(projection, referenceFile=reference_file)
        except ValueError as error:
            view['error'] = str(error)
    for view in report['views']:
        view['modelSha256'] = report['sourceSha256']
        if 'file' in view and (output / view['file']).is_file():
            view['artifactSha256'] = sha(output / view['file'])
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    exit_code = result.returncode or (2 if any('error' in v for v in report['views']) else 0)
    print(json.dumps({'output': str(output), 'exitCode': exit_code,
                      'staticChecksPassed': report['staticChecksPassed'], 'diagnostics': report['diagnostics'],
                      'views': report['views']}, indent=2))
    return exit_code

if __name__ == '__main__':
    sys.exit(main())
