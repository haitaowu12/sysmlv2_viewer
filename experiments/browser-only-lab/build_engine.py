"""Build a pinned browser engine and its matching Go JavaScript runtime."""
import hashlib,json,os,shutil,stat,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'_build/OpenSysML'
PIN='08ef397841767b829e492bbecf6d723483b4421e'
GO_VERSION='go1.27.1'
def run(*args, **kwargs): return subprocess.run(args,check=True,**kwargs)
def output(*args, **kwargs): return subprocess.check_output(args,text=True,**kwargs).strip()
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def verify_source(source,patch):
    if output('git','rev-parse','HEAD',cwd=source)!=PIN:
        raise ValueError('The engine source does not match the reviewed pin.')
    if output('git','diff','--cached','--name-only',cwd=source):
        raise ValueError('Staged engine changes are not supported; use a fresh build checkout.')
    import tempfile
    def files(directory):
        # Compare disk bytes, not Git's change cache or ignore rules. Go can read
        # ignored files and tracked files marked assume-unchanged/skip-worktree.
        inventory={}
        for parent,dirs,names in os.walk(directory,followlinks=False):
            parent=Path(parent)
            if parent==directory:dirs[:]=[name for name in dirs if name!='.git']
            for name in list(dirs):
                path=parent/name
                if path.is_symlink():
                    inventory[path.relative_to(directory).as_posix()]=('symlink',os.readlink(path))
                    dirs.remove(name)
            for name in names:
                path=parent/name
                if path==directory/'.git':continue
                mode=path.lstat().st_mode
                if stat.S_ISLNK(mode):value=('symlink',os.readlink(path))
                elif stat.S_ISREG(mode):value=('file',bool(mode & 0o111),path.read_bytes())
                else:raise ValueError('Unexpected special file in engine source: '+str(path))
                inventory[path.relative_to(directory).as_posix()]=value
        return inventory
    with tempfile.TemporaryDirectory() as temp:
        expected=Path(temp)/'source'
        run('git','clone','--quiet','--shared','--no-hardlinks',str(source),str(expected))
        run('git','checkout','--quiet',PIN,cwd=expected)
        clean=files(expected)
        run('git','apply','--unidiff-zero',str(patch),cwd=expected)
        if files(source)==clean:
            run('git','apply','--unidiff-zero',str(patch),cwd=source)
        if files(source)!=files(expected):
            raise ValueError('Unexpected engine modifications beyond opensysml-browser.patch.')

def main():
    if not SOURCE.exists():
        SOURCE.parent.mkdir(exist_ok=True)
        run('git','clone','--depth','1','--branch','v0.10.0','https://github.com/Open-MBEE/OpenSysML.git',str(SOURCE))
    patch=ROOT/'opensysml-browser.patch'
    verify_source(SOURCE,patch)
    go=os.environ.get('LAB_GO','go')
    if output(go,'env','GOVERSION')!=GO_VERSION:
        raise SystemExit('Use Go 1.27.1 (LAB_GO can name an isolated SDK).')
    native_env={**os.environ,'GOOS':output(go,'env','GOHOSTOS'),'GOARCH':output(go,'env','GOHOSTARCH'),'GOTOOLCHAIN':'local'}
    run(go,'test','./internal/frontend/core','./internal/frontend/combined','-run','TestLab','-count=1',cwd=SOURCE,env=native_env)
    env={**os.environ,'GOOS':'js','GOARCH':'wasm','GOTOOLCHAIN':'local'}
    run(go,'build','-trimpath','-ldflags=-s -w -X main.Version=0.10.0-lab','-o',str(ROOT/'browser-engine.wasm'),'./cmd/sysml-wasm',cwd=SOURCE,env=env)
    goroot=Path(output(go,'env','GOROOT'))
    shutil.copy2(goroot/'lib/wasm/wasm_exec.js',ROOT/'wasm_exec.js')
    metadata={'schema':1,'engineCommit':PIN,'patchSha256':sha(patch),'goVersion':GO_VERSION,'wasmSha256':sha(ROOT/'browser-engine.wasm'),'wasmExecSha256':sha(ROOT/'wasm_exec.js')}
    (ROOT/'engine-build.json').write_text(json.dumps(metadata,indent=2)+'\n')
    with (ROOT/'_build/go-dependencies.json').open('w') as dependencies:
        run(go,'list','-deps','-json','./cmd/sysml-wasm',cwd=SOURCE,env=env,stdout=dependencies)
    from collect_go_licenses import collect
    collect(ROOT/'_build/go-dependencies.json',goroot,ROOT/'public/licenses/go')
    print('Built the pinned engine and matching Go runtime. Qualification is separate.')
if __name__=='__main__': main()
