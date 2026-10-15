import hashlib,json,tempfile,unittest
from pathlib import Path
from audit_build import audit,remove_python_caches

class ReleaseLayoutTests(unittest.TestCase):
    def fixture(self, root):
        names=['examples/apollo-11.modeling.json','examples/APOLLO-LICENSE.md','index.html','lab.html','probe.html','initial.json','build-info.json','engine-build.json','RUNTIME-NOTICES.txt','opensysml-browser.patch','pyodide/pyodide.asm.wasm','pyodide/python_stdlib.zip','python/normalize.py','python/browser_handler.py','licenses/catalogue.json','licenses/go/go-catalogue.json','assets/browser-engine-a.wasm','assets/wasm_exec-b.js']
        for name in names:
            p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('fixture')
        (root/'index.html').write_text('<textarea id="source"></textarea><span id="browser-build"></span><script src="./assets/app.js"></script>')
        (root/'licenses/catalogue.json').write_text('[]')
        (root/'licenses/go/go-catalogue.json').write_text('[]')
        (root/'probe.html').write_text('Run browser compatibility checks')
        (root/'build-info.json').write_text(json.dumps({'revision':'abc','contentSha256':'def'}))
        sha=lambda n:hashlib.sha256((root/n).read_bytes()).hexdigest()
        (root/'engine-build.json').write_text(json.dumps({'wasmSha256':sha('assets/browser-engine-a.wasm'),'wasmExecSha256':sha('assets/wasm_exec-b.js'),'patchSha256':sha('opensysml-browser.patch')}))
    def test_valid_static_subpath_layout(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);self.fixture(root);self.assertEqual(audit(root)['revision'],'abc')
    def test_missing_assets_and_wrong_engine_pair_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);self.fixture(root);(root/'assets/wasm_exec-b.js').write_text('other SDK')
            with self.assertRaisesRegex(ValueError,'paired'):audit(root)
            (root/'initial.json').unlink()
            with self.assertRaisesRegex(ValueError,'Missing'):audit(root)
    def test_missing_openable_example_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);self.fixture(root);(root/'examples/apollo-11.modeling.json').unlink()
            with self.assertRaisesRegex(ValueError,'Missing release asset: examples/apollo'):
                audit(root)

    def test_bytecode_caches_are_removed_without_touching_python_sources(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);self.fixture(root)
            source_before={name:(root/'python'/name).read_bytes() for name in ['normalize.py','browser_handler.py']}
            cache=root/'python/__pycache__';cache.mkdir()
            (cache/'normalize.cpython-313.pyc').write_bytes(b'host-specific cache')
            with self.assertRaisesRegex(ValueError,'bytecode cache'):audit(root)
            remove_python_caches(root/'python')
            self.assertFalse(cache.exists())
            for name,data in source_before.items():self.assertEqual((root/'python'/name).read_bytes(),data)
            self.assertEqual(audit(root)['revision'],'abc')
            (root/'python/legacy.pyc').write_bytes(b'old standalone cache')
            with self.assertRaisesRegex(ValueError,'bytecode cache'):audit(root)

    def test_root_relative_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);self.fixture(root)
            p=root/'index.html';p.write_text(p.read_text().replace('./assets','/assets'))
            with self.assertRaisesRegex(ValueError,'Root-relative'):audit(root)

class EngineSourceTests(unittest.TestCase):
    def test_only_the_retained_patch_including_new_files_is_accepted(self):
        import subprocess
        import build_engine
        def git(*args,cwd):return subprocess.check_output(['git',*args],cwd=cwd,text=True).strip()
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);repo=root/'engine';repo.mkdir()
            git('init','-q',cwd=repo);git('config','user.email','build@example.invalid',cwd=repo);git('config','user.name','Build test',cwd=repo)
            (repo/'engine.go').write_text('original\n');(repo/'other.go').write_text('pinned input\n');git('add','engine.go','other.go',cwd=repo);git('commit','-qm','pin',cwd=repo)
            pin=git('rev-parse','HEAD',cwd=repo);original=build_engine.PIN;build_engine.PIN=pin
            (repo/'engine.go').write_text('typed export\n');(repo/'capture_test.go').write_text('retained test\n');git('add','capture_test.go',cwd=repo)
            patch=root/'patch';patch.write_text(git('diff','HEAD',cwd=repo)+'\n')
            git('reset','--quiet','HEAD','capture_test.go',cwd=repo)
            try:
                build_engine.verify_source(repo,patch)
                (repo/'capture_test.go').write_text('unexpected edit\n')
                with self.assertRaisesRegex(ValueError,'Unexpected'):build_engine.verify_source(repo,patch)
                (repo/'capture_test.go').write_text('retained test\n');(repo/'extra.go').write_text('unexpected file\n')
                with self.assertRaisesRegex(ValueError,'Unexpected'):build_engine.verify_source(repo,patch)
                (repo/'extra.go').unlink()
                (repo/'.git/info/exclude').write_text('injected.go\n')
                (repo/'injected.go').write_text('ignored compiler input\n')
                with self.assertRaisesRegex(ValueError,'Unexpected'):build_engine.verify_source(repo,patch)
                (repo/'injected.go').unlink()
                excludes=root/'global-excludes';excludes.write_text('global.go\n')
                git('config','core.excludesFile',str(excludes),cwd=repo)
                (repo/'global.go').write_text('globally ignored compiler input\n')
                with self.assertRaisesRegex(ValueError,'Unexpected'):build_engine.verify_source(repo,patch)
                (repo/'global.go').unlink()
                for flag in ['--assume-unchanged','--skip-worktree']:
                    git('update-index',flag,'other.go',cwd=repo)
                    (repo/'other.go').write_text('hidden tracked edit\n')
                    with self.assertRaisesRegex(ValueError,'Unexpected'):build_engine.verify_source(repo,patch)
                    (repo/'other.go').write_text('pinned input\n')
                    git('update-index',flag.replace('--','--no-',1),'other.go',cwd=repo)
                build_engine.verify_source(repo,patch)
            finally:build_engine.PIN=original

class GoNoticeTests(unittest.TestCase):
    def test_upstream_and_homebrew_sdk_layouts_and_missing_license(self):
        from collect_go_licenses import go_license
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);sdk=root/'go';sdk.mkdir()
            license=sdk/'LICENSE';license.write_text('Copyright The Go Authors. Redistribution and use in source and binary forms')
            self.assertEqual(go_license(sdk),license.resolve())
            libexec=sdk/'libexec';libexec.mkdir()
            self.assertEqual(go_license(libexec),license.resolve())
            license.unlink()
            with self.assertRaisesRegex(ValueError,'missing'):go_license(libexec)

if __name__=='__main__':unittest.main()
