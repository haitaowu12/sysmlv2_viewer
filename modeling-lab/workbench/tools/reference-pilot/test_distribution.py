"""Standalone transfer boundary tests. Doctor is exercised, never bypassed."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

PACKAGE = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PACKAGE/'scripts'))
import package_manifest
import sysml
ORIGINAL_LICENSES = dict(sysml.RUNTIME_LICENSES)
FIXTURE_LICENSE_BYTES = {'LICENSE': b'DISTRIBUTION TEST ONLY - license fixture\n',
                         'LICENSE-GPL': b'DISTRIBUTION TEST ONLY - copyleft license fixture\n'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.package = self.base/'relocated-package'
        for name in package_manifest.SOURCE_PATHS:
            target = self.package/name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(PACKAGE/name, target)
        self.runtime = self.package/'.runtime'
        library = self.runtime/'sysml/sysml.library'
        library.mkdir(parents=True)
        jar = b'fixture-engine-with-independently-locked-bytes'
        (self.runtime/sysml.ENGINE_PATH).write_bytes(jar)
        source = b'package Fixture {}\n'
        (library/'fixture.sysml').write_bytes(source)
        # A tiny explicitly locked runtime fixture makes these tests available before setup.
        # Only this temporary source copy uses fixture license hashes; shipped pins stay intact.
        licenses = {name: sha(data) for name, data in FIXTURE_LICENSE_BYTES.items()}
        script = self.package/'scripts/sysml.py'
        text = script.read_text()
        for name, data in FIXTURE_LICENSE_BYTES.items():
            (self.runtime/name).write_bytes(data)
            text = text.replace(ORIGINAL_LICENSES[name], licenses[name])
        script.write_text(text)
        lock = {'release': 'distribution-fixture', 'jarSha256': sha(jar),
                'libraryTreeSha256': sha(('fixture.sysml\0'+sha(source)+'\n').encode())}
        (self.package/'workbench/config/reference-pilot-lock.json').write_text(json.dumps(lock))
        self.regenerate()
        self.addCleanup(patch.stopall)
        patch.object(sysml, 'PACKAGE', self.package).start()
        patch.object(sysml, 'WORKBENCH', self.package/'workbench').start()
        patch.object(sysml, 'RUNTIME', self.runtime).start()
        patch.object(sysml, 'RUNTIME_LICENSES', licenses).start()

    def regenerate(self):
        value = {'schemaVersion': 1, 'files': package_manifest.source_files(self.package)}
        (self.package/'package-manifest.json').write_text(json.dumps(value))
        return value['files']

    def run_doctor(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            status = sysml.doctor()
        return status, json.loads(output.getvalue())

    def test_real_doctor_and_bundle_exclude_unlisted_data_at_every_depth(self):
        if not shutil.which('java') or not shutil.which('dot'):
            self.skipTest('Java and Graphviz required for actual doctor')
        expected = self.regenerate()
        extras = ['.env', '.git/config', 'evidence/client-source.txt',
                  'references/client-input.md', 'workbench/tools/reference-pilot/client.py',
                  '.runtime/.env', '.runtime/sysml/kernel.js',
                  '.runtime/sysml/sysml.library/client-input.txt']
        for name in extras:
            target = self.package/name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('EXCLUSION-SENTINEL')
        self.assertEqual(expected, self.regenerate())
        self.assertEqual(self.run_doctor()[0], 0)
        output = self.base/'transfer.zip'
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(sysml.bundle(output), 0)
        with zipfile.ZipFile(output) as zipped:
            names = {name.removeprefix('sysml-v2-modeling/') for name in zipped.namelist()}
            runtime, _ = sysml.runtime_inventory(self.runtime)
            self.assertEqual(names, set(expected)|{'package-manifest.json'}|{'.runtime/'+name for name in runtime})
            self.assertFalse(set(extras)&names)
            for name, digest in runtime.items():
                self.assertEqual(sha(zipped.read('sysml-v2-modeling/.runtime/'+name)), digest)
            zipped.extractall(self.base/'unpacked')
        # The same single entry point works from an unrelated current directory.
        result = subprocess.run([sys.executable, '-B', str(self.base/'unpacked/sysml-v2-modeling/scripts/sysml.py'),
                                 'doctor'], cwd=self.base, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)

    def test_regeneration_cli_does_not_register_adjacent_files(self):
        extra = self.package/'references/new-private-note.md'
        extra.write_text('EXCLUSION-SENTINEL')
        result = subprocess.run([sys.executable, '-B', str(self.package/'scripts/package_manifest.py')],
                                cwd=self.base, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        files = json.loads((self.package/'package-manifest.json').read_text())['files']
        self.assertEqual(set(files), set(package_manifest.SOURCE_PATHS))
        self.assertNotIn('references/new-private-note.md', files)

    def test_manifest_cannot_silently_register_new_file(self):
        (self.package/'.env').write_text('EXCLUSION-SENTINEL')
        manifest = json.loads((self.package/'package-manifest.json').read_text())
        manifest['files']['.env'] = sha(b'EXCLUSION-SENTINEL')
        (self.package/'package-manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'inventory differs'):
            package_manifest.maintained_files(self.package)
        self.assertEqual(self.run_doctor()[0], 2)

    def test_manifest_and_registration_reject_unsafe_paths(self):
        for name in ('../outside', '/outside', 'references/../LICENSE', 'references//authoring.md',
                     'references\\authoring.md', 'C:/outside'):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Unsafe package path'):
                package_manifest.safe_file(self.package, name)
        with patch.object(package_manifest, 'SOURCE_PATHS', ('../outside',)):
            with self.assertRaises(ValueError):
                package_manifest.source_files(self.package)

    def test_registered_symlink_or_symlink_parent_is_rejected(self):
        target = self.package/'references/authoring.md'
        content = self.base/'outside.md'
        content.write_bytes(target.read_bytes())
        target.unlink(); target.symlink_to(content)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            package_manifest.source_files(self.package)
        target.unlink(); target.write_bytes(content.read_bytes())
        references = self.package/'references'
        references.rename(self.package/'original-references')
        references.symlink_to(self.package/'original-references', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            package_manifest.maintained_files(self.package)

    def test_runtime_inventory_requires_original_license_bytes(self):
        for name in sysml.RUNTIME_LICENSES:
            path = self.runtime/name
            original = path.read_bytes()
            path.unlink()
            with self.assertRaises(ValueError): sysml.runtime_inventory(self.runtime)
            path.write_bytes(b'changed license')
            with self.assertRaisesRegex(ValueError, 'license differs'):
                sysml.runtime_inventory(self.runtime)
            path.write_bytes(original)
        self.assertEqual(len(sysml.runtime_inventory(self.runtime)[0]), 4)

    def test_runtime_library_change_or_symlink_is_rejected(self):
        library = self.runtime/'sysml/sysml.library'
        (library/'unexpected.sysml').write_text('package Unlocked {}')
        with self.assertRaisesRegex(ValueError, 'runtime lock'):
            sysml.runtime_inventory(self.runtime)
        (library/'unexpected.sysml').unlink()
        target = library/'fixture.sysml'
        content = self.base/'outside.sysml'
        content.write_bytes(target.read_bytes())
        target.unlink(); target.symlink_to(content)
        with self.assertRaisesRegex(ValueError, 'symlinks'):
            sysml.runtime_inventory(self.runtime)

    def test_changed_source_blocks_bundle_and_no_output_is_created(self):
        (self.package/'NOTICE').write_text('changed notice')
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(ValueError, 'Fix package checks'):
            sysml.bundle(self.base/'rejected.zip')
        self.assertFalse((self.base/'rejected.zip').exists())


class InstalledRuntimeTests(unittest.TestCase):
    def test_installed_official_runtime_matches_actual_pins_when_available(self):
        runtime = PACKAGE/'.runtime'
        if not runtime.exists(): self.skipTest('Official runtime not installed; fixture boundary tests still run')
        files, status = sysml.runtime_inventory(runtime)
        self.assertEqual(status['licenseSha256'], ORIGINAL_LICENSES)
        for name, digest in ORIGINAL_LICENSES.items():
            self.assertEqual(files[name], digest)


if __name__ == '__main__':
    unittest.main()
