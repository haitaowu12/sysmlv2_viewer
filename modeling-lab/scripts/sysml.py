#!/usr/bin/env python3
"""One portable entry point for the SysML v2 skill. Paths resolve from this package."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile
from package_manifest import maintained_files, safe_file

PACKAGE = Path(__file__).resolve().parents[1]
WORKBENCH = PACKAGE / 'workbench'
TOOLS = WORKBENCH / 'tools/reference-pilot'
RUNTIME = PACKAGE / '.runtime'
JAR = RUNTIME / 'sysml/jupyter-sysml-kernel-0.52.0-all.jar'
LIBRARY = RUNTIME / 'sysml/sysml.library'
RUNTIME_LICENSES = {
    'LICENSE': 'e3a994d82e644b03a792a930f574002658412f62407f5fee083f2555c5f23118',
    'LICENSE-GPL': '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986',
}
ENGINE_PATH = 'sysml/jupyter-sysml-kernel-0.52.0-all.jar'


def hash_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def runtime_inventory(root):
    """Only locked engine/library bytes and pinned original licenses are transferable."""
    lock = json.loads((WORKBENCH/'config/reference-pilot-lock.json').read_text())
    jar = safe_file(root, ENGINE_PATH)
    library = root/'sysml/sysml.library'
    if hash_file(jar) != lock['jarSha256']:
        raise ValueError('Missing or mismatched engine; run setup with the pinned official archive')
    files = {ENGINE_PATH: lock['jarSha256']}
    for name, expected in RUNTIME_LICENSES.items():
        if hash_file(safe_file(root, name)) != expected:
            raise ValueError('Official runtime license differs from pinned archive: '+name)
        files[name] = expected
    if library.is_symlink(): raise ValueError('Standard library must not be a symlink')
    records = []
    for path in sorted(library.rglob('*')):
        if path.is_symlink(): raise ValueError('Standard library must not contain symlinks')
        if path.is_file() and path.suffix in ('.sysml', '.kerml'):
            relative = path.relative_to(root).as_posix()
            digest = hash_file(safe_file(root, relative))
            files[relative] = digest
            records.append((path.relative_to(library).as_posix(), digest))
    if not records: raise ValueError('No standard library source files found')
    digest = hashlib.sha256(''.join(f'{name}\0{value}\n' for name, value in sorted(records)).encode()).hexdigest()
    if digest != lock['libraryTreeSha256']:
        raise ValueError('Standard library does not match the runtime lock')
    return files, {'release': lock['release'], 'jarSha256': lock['jarSha256'], 'libraryFiles': len(records),
                   'libraryTreeSha256': digest, 'licenseSha256': dict(RUNTIME_LICENSES)}


def runtime_check(root=None):
    return runtime_inventory(RUNTIME if root is None else root)[1]


def doctor():
    checks = {'python': sys.version.split()[0], 'package': str(PACKAGE)}
    errors = []
    if sys.version_info < (3, 10): errors.append('Python 3.10+ required')
    for executable, option in [('java', '-version'), ('dot', '-V')]:
        found = shutil.which(executable)
        if not found: errors.append(executable+' is not on PATH'); continue
        result = subprocess.run([found, option], capture_output=True, text=True)
        checks[executable] = (result.stderr+result.stdout).strip()
        if result.returncode: errors.append(executable+' version check failed')
        if executable == 'java':
            import re
            version = re.search(r'version "(\d+)', checks[executable])
            if not version or int(version[1]) < 21: errors.append('Java 21+ required')
    try: checks['runtime'] = runtime_check()
    except (ValueError, OSError, KeyError, TypeError) as error: errors.append(str(error))
    try: checks['maintainedSourceFiles'] = len(maintained_files(PACKAGE))
    except (ValueError, OSError, KeyError, TypeError) as error: errors.append(str(error))
    checks.update(ok=not errors, errors=errors)
    print(json.dumps(checks, indent=2)); return 0 if not errors else 2


def setup(archive):
    if RUNTIME.exists():
        runtime_check(); print('Pinned runtime already installed'); return 0
    with tempfile.TemporaryDirectory(prefix='.runtime-install-', dir=PACKAGE) as temporary:
        target = Path(temporary)
        with zipfile.ZipFile(archive) as zipped:
            if sum(x.file_size for x in zipped.infolist()) > 300_000_000:
                raise ValueError('Runtime archive exceeds expected size')
            names = set()
            for info in zipped.infolist():
                path = (target/info.filename).resolve()
                parts = Path(info.filename).parts
                if (not path.is_relative_to(target.resolve()) or '\\' in info.filename or ':' in info.filename
                        or '..' in parts or info.filename in names
                        or (info.external_attr >> 16) & 0o170000 == 0o120000):
                    raise ValueError('Unsafe runtime archive member')
                names.add(info.filename)
            zipped.extractall(target)
        runtime_check(target)
        target.rename(RUNTIME)
    print('Installed and verified the package-local runtime'); return 0


def bundle(output):
    if doctor(): raise ValueError('Fix package checks before bundling')
    if output.resolve().is_relative_to(PACKAGE): raise ValueError('Bundle output must be outside the package')
    files = maintained_files(PACKAGE)
    files['package-manifest.json'] = hash_file(safe_file(PACKAGE, 'package-manifest.json'))
    runtime_files, _ = runtime_inventory(RUNTIME)
    files.update({'.runtime/'+name: digest for name, digest in runtime_files.items()})
    created = False
    try:
        with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as zipped:
            created = True
            for name, expected in sorted(files.items()):
                data = safe_file(PACKAGE, name).read_bytes()
                if hashlib.sha256(data).hexdigest() != expected:
                    raise ValueError('Package file changed during bundling: '+name)
                zipped.writestr('sysml-v2-modeling/'+name, data)
    except Exception:
        if created: output.unlink()
        raise
    print(output); return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, add_help=len(sys.argv) < 2 or sys.argv[1].startswith("-"))
    parser.add_argument('command', choices=['doctor','setup','bundle','test','qualify','serve','demo','context','propose','explain','check','evidence','assess','capacity','regressions','community','acceptance','evolution','contributor-review','contributor-check'])
    args, extra = parser.parse_known_args()
    if args.command == 'doctor': return doctor()
    if args.command in ('setup','bundle'):
        p = argparse.ArgumentParser(); p.add_argument('--archive' if args.command=='setup' else '--output', type=Path, required=True)
        parsed = p.parse_args(extra)
        return setup(parsed.archive) if args.command=='setup' else bundle(parsed.output)
    if args.command == 'test':
        return subprocess.call([sys.executable,'-B','-m','unittest','discover','-s',str(TOOLS),'-p','test_*.py'],cwd=WORKBENCH)
    mapping={'qualify':'qualify.py','serve':'lab.py','demo':'lab.py','context':'agent_model.py','propose':'agent_model.py',
             'explain':'behavior.py','check':'check_contract.py','evidence':'check_evidence.py','assess':'assess_package.py','capacity':'capacity_analysis.py',
             'regressions':'pump_regressions.py','community':'community_regressions.py','acceptance':'acceptance_suite.py','evolution':'evolution.py','contributor-review':'contributor_export_cli.py','contributor-check':'check_contributor_pilot.py'}
    command=[sys.executable,'-B',str(TOOLS/mapping[args.command])]
    if args.command in ('context','propose'): command.append(args.command)
    if args.command in ('qualify','serve','demo','regressions','community','acceptance','assess'):
        runtime_check(); command += ['--jar',str(JAR),'--library',str(LIBRARY)]
    if args.command == 'demo':
        fixture=WORKBENCH/'fixtures/authoring/pump-station'
        command += ['--source',str(fixture/'model.sysml'),'--views',str(fixture/'views.json'),'--reviews',str(fixture/'reviews.json')]
    return subprocess.call(command+extra)


if __name__ == '__main__':
    try: raise SystemExit(main())
    except (ValueError, OSError) as error: print(str(error),file=sys.stderr); raise SystemExit(2)
