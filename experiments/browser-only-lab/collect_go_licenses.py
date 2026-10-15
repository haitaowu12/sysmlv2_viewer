"""Copy license texts for modules actually linked into the browser engine."""
import json,shutil,sys
from pathlib import Path

def go_license(goroot):
    goroot=goroot.resolve()
    candidates=[goroot/'LICENSE']
    # Homebrew relocates the upstream license one level above GOROOT/libexec.
    if goroot.name=='libexec':candidates.append(goroot.parent/'LICENSE')
    for path in candidates:
        if path.is_file():
            text=path.read_text()
            if 'The Go Authors' in text and 'Redistribution and use in source and binary forms' in text:
                return path
    raise ValueError('Go runtime license is missing from the SDK root or its Homebrew prefix.')

def collect(dependencies,goroot,target):
    text=dependencies.read_text();decoder=json.JSONDecoder();modules={}
    while text.strip():
        row,end=decoder.raw_decode(text.lstrip());text=text.lstrip()[end:]
        module=row.get('Module',{})
        if module.get('Dir') and not module.get('Main'):
            modules[module['Path']]=(module.get('Version'),Path(module['Dir']))
    if target.exists():shutil.rmtree(target)
    target.mkdir(parents=True,exist_ok=True)
    records=[]
    for name,(version,directory) in sorted(modules.items()):
        files=[p for p in directory.iterdir() if p.is_file() and p.name.upper().split('.')[0] in ['LICENSE','LICENCE','COPYING','NOTICE','PATENTS']]
        if not any(p.name.upper().startswith(('LICENSE','LICENCE','COPYING')) for p in files):
            raise ValueError('No license found for linked module '+name)
        sub=target/name.replace('/','_');sub.mkdir(exist_ok=True)
        for p in files:shutil.copy2(p,sub/p.name)
        records.append({'module':name,'version':version,'files':[str((sub/p.name).relative_to(target)) for p in files]})
    shutil.copy2(go_license(goroot),target/'Go-LICENSE')
    records.append({'module':'Go standard library and wasm_exec.js','version':'go1.27.1','files':['Go-LICENSE']})
    (target/'go-catalogue.json').write_text(json.dumps(records,indent=2)+'\n')
if __name__=='__main__': collect(Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3]))
