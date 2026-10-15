"""Validate the static release layout; record exact bytes for artifact promotion."""
import hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def audit(dist):
    for name in ['index.html','lab.html','probe.html','initial.json','build-info.json','engine-build.json','RUNTIME-NOTICES.txt','opensysml-browser.patch','pyodide/pyodide.asm.wasm','pyodide/python_stdlib.zip','python/normalize.py','python/browser_handler.py','licenses/catalogue.json','licenses/go/go-catalogue.json']:
        if not (dist/name).is_file(): raise ValueError('Missing release asset: '+name)
    for catalogue,prefix in [('catalogue.json',''),('go/go-catalogue.json','go/')]:
        for component in json.loads((dist/'licenses'/catalogue).read_text()):
            for name in component['files']:
                if not (dist/'licenses'/prefix/name).is_file():
                    raise ValueError('Missing runtime notice: '+prefix+name)
    index=(dist/'index.html').read_text()
    if 'id="source"' not in index or 'id="browser-build"' not in index:
        raise ValueError('Default entry must open the Lab with visible build identity.')
    if 'Run browser compatibility checks' not in (dist/'probe.html').read_text():
        raise ValueError('Diagnostic probe is not separate from the Lab.')
    if re.search(r'(?:src|href)=["\']/[^/]',index):
        raise ValueError('Root-relative asset path breaks project Pages subpaths.')
    engine=json.loads((dist/'engine-build.json').read_text())
    wasm=list((dist/'assets').glob('browser-engine-*.wasm'))
    runtime=list((dist/'assets').glob('wasm_exec-*.js'))
    for files,key in [(wasm,'wasmSha256'),(runtime,'wasmExecSha256')]:
        if len(files)!=1 or hashlib.sha256(files[0].read_bytes()).hexdigest()!=engine[key]:
            raise ValueError('Engine and Go runtime do not match their paired build record.')
    if hashlib.sha256((dist/'opensysml-browser.patch').read_bytes()).hexdigest()!=engine['patchSha256']:
        raise ValueError('Engine patch changed after the engine was built.')
    records=[]
    for path in sorted(dist.rglob('*')):
        if path.is_file() and path.name!='artifact-manifest.json':
            data=path.read_bytes();records.append({'path':path.relative_to(dist).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    identity=json.loads((dist/'build-info.json').read_text())
    return {'schema':1,'revision':identity['revision'],'contentSha256':identity['contentSha256'],'files':records}
if __name__=='__main__':
    dist=ROOT/'dist';manifest=audit(dist)
    (dist/'artifact-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f"Qualified static layout: {len(manifest['files'])} assets, content {manifest['contentSha256'][:12]}. Browser workflow qualification is separate.")
