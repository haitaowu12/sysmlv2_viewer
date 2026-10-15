import {connectWasm} from '@openmbee/opensysml/browser';
import wasmUrl from './browser-engine.wasm?url';
import execUrl from './wasm_exec.js?url';
import {loadPyodide} from 'pyodide';
import {instance} from '@viz-js/viz';
const base=new URL('../',import.meta.url);
let python,connection;let current=null,initialData=null;
const ready=(async()=>{
 const assetRoot=base;
 globalThis.labViz=await instance();
 python=await loadPyodide({indexURL:new URL('pyodide/',assetRoot).href});
 python.FS.mkdir('/lab');
 for(const name of ['engineering','stakeholder','behavior','check_contract','receipts','view_scope','capacity_analysis','change_summary','report_integrity','lab_project','lab_delivery','normalize']){
  const text=await (await fetch(new URL('python/'+name+'.py',assetRoot))).text();python.FS.writeFile('/lab/'+name+'.py',text);
 }
 await python.runPythonAsync(`import sys, json, hashlib, subprocess, types\nsys.path.insert(0,'/lab')\nimport js\ndef browser_dot(args, input='', **kwargs):\n    fmt=next((a[2:] for a in args if a.startswith('-T')), 'svg')\n    output=str(js.labViz.renderString(input, js.JSON.parse(json.dumps({'format':fmt}))))\n    return types.SimpleNamespace(stdout=output, stderr='', returncode=0)\nsubprocess.run=browser_dot\nfrom normalize import normalize\nfrom lab_project import candidate, views_for, scenario_view, exploration_views\nfrom lab_delivery import browser_report, element_detail\nfrom view_scope import catalogue, compose\nfrom stakeholder import project, render_svg\nfrom engineering import interconnection, exchange_summary\nfrom behavior import project as behavior_project, render_svg as behavior_svg\nfrom change_summary import summarize\n`);
 const code=await(await fetch(new URL('python/browser_handler.py',assetRoot))).text();python.runPython(code);
 connection=await connectWasm({wasm:new URL(wasmUrl,import.meta.url),wasmExec:new URL(execUrl,import.meta.url),timeoutMs:20000});
})();
async function inspect(source){
 if(typeof source!=='string'||new TextEncoder().encode(source).length>262144)throw Error('Source must be text, up to 256 KiB.');
 const model=await connection.loads(source,{strictConformance:true});
 return {source,valid:!model.hasErrors,diagnostics:model.diagnostics,raw:model.hasErrors?[]:JSON.parse((await model.toApiJson()).content)};
}
function py(action,data){python.globals.set('browser_payload',JSON.stringify(data));return JSON.parse(python.runPython(`json.dumps(${action}(json.loads(browser_payload)))`));}
let queue=Promise.resolve();
self.onmessage=({data:message})=>{queue=queue.then(async()=>{try{
 await ready;const {path,data}=message;let result;
 if(path==='/initial'){result=await(await fetch(new URL('initial.json',base))).json();initialData=result;}
 else if(path==='/render'||path==='/inspect'){
  const checked=await inspect(data.source);const baseChecked=data.baselineSource&&data.baselineSource!==data.source?await inspect(data.baselineSource):checked;
  if(!baseChecked.valid)throw Error('The project baseline does not pass browser validation.');
  result=py('render_report',{views:initialData.presets,...data,checked,baseChecked,accept:path==='/render'});if(path==='/render')current=result;
 }else if(path==='/prepare'){
  if(!current)throw Error('Validate this model before preparing a change.');
  const proposed=py('prepare_candidate',{report:current,request:data});const checked=await inspect(proposed.source);
  if(!checked.valid)throw Error('The proposed edit failed browser validation: '+checked.diagnostics.map(d=>d.message).join(' '));
  result={...proposed,validated:true,changeSummary:py('proposal_summary',{checked})};
 }else if(path==='/compose')result=py('compose_current',{report:current,request:data});
 else if(path==='/element')result=py('detail_current',{report:current,request:data});
 else throw Error('Unsupported browser operation.');
 self.postMessage({id:message.id,result});
 }catch(error){self.postMessage({id:message.id,error:error.message||String(error)});}});};
