"""Developer build only. The resulting browser app starts no native process."""
import os, shutil, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'_build/OpenSysML'
PIN='08ef397841767b829e492bbecf6d723483b4421e'
def run(*args, **kwargs):return subprocess.run(args,check=True,**kwargs)
if not SOURCE.exists():
    SOURCE.parent.mkdir(exist_ok=True)
    run('git','clone','--depth','1','--branch','v0.10.0','https://github.com/Open-MBEE/OpenSysML.git',str(SOURCE))
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=SOURCE,text=True).strip()
if head!=PIN:raise SystemExit('The engine source does not match the reviewed pin.')
patch=ROOT/'opensysml-browser.patch'
if subprocess.run(['git','apply','--unidiff-zero','--reverse','--check',str(patch)],cwd=SOURCE,capture_output=True).returncode:
    run('git','apply','--unidiff-zero','--check',str(patch),cwd=SOURCE)
    run('git','apply','--unidiff-zero',str(patch),cwd=SOURCE)
go=os.environ.get('LAB_GO','go')
version=subprocess.check_output([go,'version'],text=True)
if 'go1.27.1 ' not in version:raise SystemExit('Reproduce this trial with Go 1.27.1 (LAB_GO can name an isolated SDK).')
run(go,'build','-trimpath','-ldflags=-s -w -X main.Version=0.10.0-lab-spike','-o',str(ROOT/'browser-engine.wasm'),'./cmd/sysml-wasm',cwd=SOURCE,env={**os.environ,'GOOS':'js','GOARCH':'wasm'})
goroot=Path(subprocess.check_output([go,'env','GOROOT'],text=True).strip())
shutil.copy2(goroot/'lib/wasm/wasm_exec.js',ROOT/'wasm_exec.js')
print('Built the pinned experimental browser engine; this is not a release qualification.')
