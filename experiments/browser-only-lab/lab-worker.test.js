import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {renderAcceptedDiagram,preflightEngineViews} from './engine-view.js';

// Exercise the shipped message router. Engine/Python are scripted boundaries;
// these tests make no claim about language evaluation or Python transaction rules.
function workerRouter(invalidSource){
 const calls=[],loads=[],pending=new Map();let payload,next=0;
 let rollback=data=>({rolledBack:true,transactionId:data.transactionId});
 const python={FS:{mkdir(){},writeFile(){}},globals:{set(name,value){payload=JSON.parse(value);}},
  async runPythonAsync(){},runPython(code){
   const action=code.match(/^json\.dumps\((\w+)\(/)?.[1];
   if(!action)return;
   const data=payload;calls.push({action,data});let result;
   if(action==='engine_view_requests')result=data.target?[...(data.views||[]).filter(v=>v.id!=='focused'),{id:'focused',names:[data.target],view:data.view,renderer:data.view==='INTERCONNECTION'?'engineering':'pilot'}]:data.views||[];
   else if(action==='render_report')result={source:data.checked.source,sourceSha256:data.checked.source,staticChecksPassed:data.checked.valid,diagnostics:data.checked.diagnostics,reportIntegrity:{reportSha256:'report:'+data.checked.source}};
   else if(action==='accept_current')result={accepted:true,transactionId:data.transactionId};
   else if(action==='rollback_current')result=rollback(data);
   else if(action==='compose_current')result={source:data.report?.source};
   else throw Error('Unexpected scripted Python call '+action);
   return JSON.stringify(result);
  }};
 const self={postMessage(message){pending.get(message.id)(message);pending.delete(message.id);}};
 const source=readFileSync(new URL('./lab-worker.js',import.meta.url),'utf8')
  .replace(/^import .*\n/gm,'').replaceAll('import.meta.url',"'https://lab.test/assets/lab-worker.js'");
 vm.runInNewContext(source,{self,URL,TextEncoder,renderAcceptedDiagram,preflightEngineViews,wasmUrl:'engine.wasm',execUrl:'wasm_exec.js',
  instance:async()=>({}),loadPyodide:async()=>python,
  connectWasm:async()=>({loads:async source=>(loads.push(source),{hasErrors:source===invalidSource,diagnostics:source===invalidSource?[{severity:'error',message:'Undefined equipment type',span:{startLine:4}}]:[],toApiJson:async()=>({content:'[]'}),renderView:async(view,options)=>({view,kind:view.startsWith('#')?view.slice(1,view.indexOf(':')):'tree',nodes:[{id:source}],rows:[],edges:[],ports:options.ports})})}),
  fetch:async()=>({text:async()=>'',json:async()=>({presets:[]})})});
 const send=(path,data={})=>new Promise(resolve=>{const id=++next;pending.set(id,resolve);self.onmessage({data:{id,path,data}});});
 return {send,calls,loads,setRollback(fn){rollback=fn;}};
}
async function opened(){const worker=workerRouter();await worker.send('/initial');await worker.send('/render',{source:'old'});return worker;}
async function stage(worker,id,source='new'){return worker.send('/render',{source,stage:true,transactionId:id});}
async function accept(worker,id){return worker.send('/accept',{transactionId:id,sourceSha256:'new',reportSha256:'report:new'});}

test('rollback restores the JS report once and repeated receipts still reach Python without replacing newer context',async()=>{
 const worker=await opened();await stage(worker,'change');await accept(worker,'change');
 assert.equal((await worker.send('/compose')).result.source,'new');
 assert.equal((await worker.send('/rollback',{transactionId:'change'})).result.rolledBack,true);
 assert.equal((await worker.send('/compose')).result.source,'old');
 await worker.send('/render',{source:'later accepted model'});
 assert.equal((await worker.send('/rollback',{transactionId:'change'})).result.rolledBack,true);
 assert.equal(worker.calls.filter(call=>call.action==='rollback_current').length,2);
 assert.equal((await worker.send('/compose')).result.source,'later accepted model');
});

test('authoritative rollback of a staged-only change clears its JS acceptance candidate',async()=>{
 const worker=await opened();await stage(worker,'staged-only');
 assert.equal((await worker.send('/rollback',{transactionId:'staged-only'})).result.rolledBack,true);
 assert.equal(worker.calls.filter(call=>call.action==='rollback_current').length,1);
 assert.match((await accept(worker,'staged-only')).error,/no longer current/);
 assert.equal((await worker.send('/compose')).result.source,'old');
});

test('Python rejection of an unknown rollback preserves both accepted and staged JS context',async()=>{
 const worker=await opened();await stage(worker,'valid-stage');
 worker.setRollback(()=>{throw Error('Unknown transaction');});
 assert.match((await worker.send('/rollback',{transactionId:'unknown'})).error,/Unknown transaction/);
 assert.equal((await worker.send('/compose')).result.source,'old');
 assert.equal((await accept(worker,'valid-stage')).result.accepted,true);
 assert.equal((await worker.send('/compose')).result.source,'new');
});

test('complete 338 KiB model is admitted while UTF-8 bytes remain bounded at 512 KiB',async()=>{
 const worker=await opened();
 const complete='a'.repeat(345795);
 assert.equal((await worker.send('/inspect',{source:complete})).result.staticChecksPassed,true);
 assert.equal((await worker.send('/inspect',{source:'a'.repeat(524288)})).result.staticChecksPassed,true);
 assert.match((await worker.send('/inspect',{source:'a'.repeat(524289)})).error,/512 KiB/);
 assert.match((await worker.send('/inspect',{source:'界'.repeat(174763)})).error,/512 KiB/);
 assert.equal((await worker.send('/compose')).result.source,'old');
});


test('invalid own-source inspection returns source diagnostics without replacing the accepted model',async()=>{
 const worker=workerRouter('invalid source');await worker.send('/initial');await worker.send('/render',{source:'accepted'});
 const inspected=await worker.send('/inspect',{source:'invalid source'});
 assert.equal(inspected.error,undefined);assert.equal(inspected.result.staticChecksPassed,false);
 assert.equal(inspected.result.diagnostics[0].span.startLine,4);
 assert.deepEqual(worker.calls.findLast(call=>call.action==='render_report').data.views,[]);
 assert.equal((await worker.send('/compose')).result.source,'accepted');
});


test('diagram uses accepted revision and ignores inspected or staged candidate models',async()=>{
 const worker=await opened();
 await worker.send('/inspect',{source:'inspected'});await stage(worker,'pending','candidate');
 assert.match((await worker.send('/diagram',{sourceSha256:'candidate',view:'#tree:Demo'})).error,/older model revision/);
 const result=(await worker.send('/diagram',{sourceSha256:'old',view:'#tree:Demo',ports:'full'})).result;
 assert.equal(result.sourceSha256,'old');assert.equal(result.graph.nodes[0].id,'old');
 await worker.send('/accept',{transactionId:'pending',sourceSha256:'candidate',reportSha256:'report:candidate'});
 assert.equal((await worker.send('/diagram',{sourceSha256:'candidate',view:'#tree:Demo'})).result.graph.nodes[0].id,'candidate');
 await worker.send('/rollback',{transactionId:'pending'});
 assert.equal((await worker.send('/diagram',{sourceSha256:'old',view:'#tree:Demo'})).result.graph.nodes[0].id,'old');
});

test('worker overrides forged preflight receipts and binds focused preflight before staging',async()=>{
 const worker=await opened(),views=[{id:'large',names:['Large'],view:'INTERCONNECTION',renderer:'engineering'}];
 const staged=await worker.send('/render',{source:'fourteen part source',views,target:'Large::nested',view:'INTERCONNECTION',stage:true,transactionId:'engine-stage',enginePreflight:{large:{supported:true,sourceSha256:'forged',nodeCount:999}}});
 assert.equal(staged.error,undefined);assert.equal(worker.loads.filter(source=>source==='fourteen part source').length,1,'candidate is loaded once for API facts and all preflight views');
 const payload=worker.calls.findLast(call=>call.action==='render_report').data;
 assert.equal(payload.enginePreflight.large.supported,true);assert.notEqual(payload.enginePreflight.large.sourceSha256,'forged');assert.equal(payload.enginePreflight.large.nodeCount,1);
 assert.equal(payload.enginePreflight.focused.viewquery,'#interconnection:Large::nested');assert.equal(payload.enginePreflight.focused.sourceSha256,payload.enginePreflight.large.sourceSha256);
 assert.equal((await worker.send('/compose')).result.source,'old','preflight/staging does not accept the candidate');
 await worker.send('/accept',{transactionId:'engine-stage',sourceSha256:'fourteen part source',reportSha256:'report:fourteen part source'});
 assert.equal((await worker.send('/compose')).result.source,'fourteen part source');
 await worker.send('/rollback',{transactionId:'engine-stage'});assert.equal((await worker.send('/compose')).result.source,'old');
 const inspected=await worker.send('/inspect',{source:'inspection',views,enginePreflight:{large:{supported:true}}});assert.equal(inspected.error,undefined);
 assert.deepEqual(worker.calls.findLast(call=>call.action==='render_report').data.enginePreflight,{},'client receipts never pass through read-only inspection');
});
