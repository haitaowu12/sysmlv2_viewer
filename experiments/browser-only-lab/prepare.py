"""Generate trial assets from the maintained owner instead of forking its UI."""
import json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parent
LAB=ROOT.parents[1]/'modeling-lab/workbench'
PUBLIC=ROOT/'public'
(PUBLIC/'python').mkdir(parents=True,exist_ok=True)
(PUBLIC/'pyodide').mkdir(exist_ok=True)
for name in ['engineering','stakeholder','behavior','check_contract','receipts','view_scope','capacity_analysis','change_summary','report_integrity','lab_project','lab_delivery']:
    shutil.copy2(LAB/'tools/reference-pilot'/f'{name}.py',PUBLIC/'python'/f'{name}.py')
for name in ['pyodide.asm.js','pyodide.asm.wasm','pyodide-lock.json','python_stdlib.zip']:
    shutil.copy2(ROOT/'node_modules/pyodide'/name,PUBLIC/'pyodide'/name)
project=json.loads((LAB/'fixtures/authoring/alarm-review/reviewed.modeling.json').read_text())
(PUBLIC/'initial.json').write_text(json.dumps({'source':project['source'],'presets':project['views'],'workspaceKey':'browser-alarm-trial'}))
cases=[{'id':'valid-baseline','expectedErrors':False,'source':(LAB/'fixtures/authoring/alarm-review/model.sysml').read_text()},{'id':'valid-reviewed','expectedErrors':False,'source':project['source']},{'id':'undefined-type','expectedErrors':True,'source':project['source'].replace('part coldRoom0 : ColdRoom;','part coldRoom0 : NoSuchRoomType;')},{'id':'undefined-endpoint','expectedErrors':True,'source':project['source'].replace('connect coldRoom0.readings','connect coldRoom0.missingReadings')},{'id':'broken-syntax','expectedErrors':True,'source':project['source']+'\npart def Broken {'},{'id':'same-name-in-two-packages','expectedErrors':False,'source':'package A { part def Unit; } package B { part def Unit; }'}]
(ROOT/'cases.json').write_text(json.dumps(cases))
page=(LAB/'tools/reference-pilot/lab.html').read_text().replace('__SCOPE_SCRIPT__',(LAB/'tools/reference-pilot/scope.js').read_text()).replace('__WORKFLOW_SCRIPT__',(LAB/'tools/reference-pilot/workflow.js').read_text()).replace('__TOKEN__','browser-local')
bootstrap='''<script>window.browserLabReady=new Promise((resolve,reject)=>{window.browserLabResolve=resolve;window.browserLabReject=reject});const originalBrowserFetch=window.fetch.bind(window);window.fetch=async (url,options)=>{if(typeof url==='string'&&['/initial','/render','/compose','/prepare','/inspect','/element'].includes(url)){const request=await window.browserLabReady;const data=await request(url,options?.body?JSON.parse(options.body):{});return {json:async()=>data};}return originalBrowserFetch(url,options)};</script><script type="module" src="/lab-runtime.js"></script>'''
page=page.replace('<body>','<body>'+bootstrap).replace('Full qualified model retained locally. Additional source details load when selected.','Browser engine snapshot. Additional source details load when selected.').replace('Modeling lab','Modeling Lab · browser trial')
page=page.replace('<header class="app-header">','<p style="margin:0;padding:8px 20px;background:#fff3cf;color:#533c14">Browser feasibility build · OpenSysML validation · full view/workflow parity still under test</p><header class="app-header">')
(ROOT/'lab.html').write_text(page)

# No Pilot renderer runs in this profile. Hide its inherited comparison control.
page=page.replace('</body>',"<script>document.getElementById('reference').style.display='none';</script></body>")
(ROOT/'lab.html').write_text(page)
