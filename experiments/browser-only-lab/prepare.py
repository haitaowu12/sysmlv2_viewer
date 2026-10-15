"""Generate trial assets from the maintained owner instead of forking its UI."""
import hashlib,json,shutil,subprocess
from pathlib import Path
from audit_build import remove_python_caches
ROOT=Path(__file__).resolve().parent
LAB=ROOT.parents[1]/'modeling-lab/workbench'
PUBLIC=ROOT/'public'
(PUBLIC/'python').mkdir(parents=True,exist_ok=True)
remove_python_caches(PUBLIC/'python')
(PUBLIC/'pyodide').mkdir(exist_ok=True)
for name in ['engineering','stakeholder','behavior','check_contract','receipts','view_scope','capacity_analysis','change_summary','report_integrity','lab_project','lab_delivery','source_set','source_intake','presentation']:
    shutil.copy2(LAB/'tools/reference-pilot'/f'{name}.py',PUBLIC/'python'/f'{name}.py')
for name in ['pyodide.asm.js','pyodide.asm.wasm','pyodide-lock.json','python_stdlib.zip']:
    shutil.copy2(ROOT/'node_modules/pyodide'/name,PUBLIC/'pyodide'/name)
project=json.loads((LAB/'fixtures/authoring/alarm-review/reviewed.modeling.json').read_text())
(PUBLIC/'initial.json').write_text(json.dumps({'source':project['source'],'presets':project['views'],'workspaceKey':'browser-alarm-trial',
    'title':project['title'],'brief':project['brief'],'questions':project['questions']}))
cases=[{'id':'valid-baseline','expectedErrors':False,'source':(LAB/'fixtures/authoring/alarm-review/model.sysml').read_text()},{'id':'valid-reviewed','expectedErrors':False,'source':project['source']},{'id':'undefined-type','expectedErrors':True,'source':project['source'].replace('part coldRoom0 : ColdRoom;','part coldRoom0 : NoSuchRoomType;')},{'id':'undefined-endpoint','expectedErrors':True,'source':project['source'].replace('connect coldRoom0.readings','connect coldRoom0.missingReadings')},{'id':'broken-syntax','expectedErrors':True,'source':project['source']+'\npart def Broken {'},{'id':'same-name-in-two-packages','expectedErrors':False,'source':'package A { part def Unit; } package B { part def Unit; }'}]
(ROOT/'cases.json').write_text(json.dumps(cases))
page=(LAB/'tools/reference-pilot/lab.html').read_text().replace('__SCOPE_SCRIPT__',(LAB/'tools/reference-pilot/scope.js').read_text()).replace('__SOURCE_INTAKE_SCRIPT__',(LAB/'tools/reference-pilot/source_intake.js').read_text()).replace('__WORKFLOW_SCRIPT__',(LAB/'tools/reference-pilot/workflow.js').read_text()).replace('__TOKEN__','browser-local')
bootstrap='''<script>window.browserLabReady=new Promise((resolve,reject)=>{window.browserLabResolve=resolve;window.browserLabReject=reject});const originalBrowserFetch=window.fetch.bind(window);window.fetch=async (url,options)=>{if(typeof url==='string'&&['/initial','/render','/compose','/prepare','/inspect','/element','/accept','/rollback'].includes(url)){const request=await window.browserLabReady;const data=await request(url,options?.body?JSON.parse(options.body):{});return {json:async()=>data};}return originalBrowserFetch(url,options)};</script><script type="module" src="/lab-runtime.js"></script>'''
page=page.replace('<body>','<body>'+bootstrap).replace('Full qualified model retained locally. Additional source details load when selected.','Browser engine snapshot. Additional source details load when selected.').replace('Modeling lab','Modeling Lab')

# No Pilot renderer runs in this profile. Hide its inherited comparison control.
page=page.replace('</body>',"<script>document.getElementById('reference').style.display='none';</script></body>")
# Digest includes generated owner copies and runtime inputs, including uncommitted work.
paths=[p for p in (PUBLIC/'python').glob('*.py')]+[ROOT/name for name in ['lab-runtime.js','lab-worker.js','package-lock.json','opensysml-browser.patch','browser-engine.wasm','wasm_exec.js']]
paths += [ROOT/'prepare.py',ROOT/'vite.config.js',PUBLIC/'initial.json']
paths += [LAB/'tools/reference-pilot'/name for name in ['lab.html','scope.js','workflow.js','source_intake.js']]
source_digest=hashlib.sha256()
for path in sorted(paths,key=lambda p:str(p.relative_to(ROOT.parents[1]))):
    source_digest.update(str(path.relative_to(ROOT.parents[1])).encode()+b'\0'+path.read_bytes()+b'\0')
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
identity={'schema':1,'name':'Modeling Lab','revision':commit,'contentSha256':source_digest.hexdigest(),'engine':'OpenSysML 0.10.0 + typed Lab export','profile':'browser-only','sourceUrl':f'https://github.com/haitaowu12/sysmlv2_viewer/tree/{commit}/experiments/browser-only-lab'}
(PUBLIC/'build-info.json').write_text(json.dumps(identity,indent=2)+'\n')
shutil.copytree(ROOT/'licenses',PUBLIC/'licenses',dirs_exist_ok=True)
shutil.copy2(ROOT/'RUNTIME-NOTICES.md',PUBLIC/'RUNTIME-NOTICES.txt')
shutil.copy2(ROOT/'opensysml-browser.patch',PUBLIC/'opensysml-browser.patch')
shutil.copy2(ROOT/'engine-build.json',PUBLIC/'engine-build.json')
badge=f'<span id="browser-build" title="Content SHA-256: {identity["contentSha256"]}">Browser · {identity["contentSha256"][:12]} · <a href="./RUNTIME-NOTICES.txt">Runtime notices</a></span>'
page=page.replace('<footer class="status-footer">','<footer class="status-footer">'+badge)
# The root opens the Lab. Preserve the old trial URL as an equivalent entry.
(ROOT/'index.html').write_text(page)
(ROOT/'lab.html').write_text(page)
