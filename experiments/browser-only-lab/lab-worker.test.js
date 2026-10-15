import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the shipped message router. Engine/Python are scripted boundaries;
// these tests make no claim about language evaluation or Python transaction rules.
function workerRouter(invalidSource){
 const calls=[],pending=new Map();let payload,next=0;
 let rollback=data=>({rolledBack:true,transactionId:data.transactionId});
 const python={FS:{mkdir(){},writeFile(){}},globals:{set(name,value){payload=JSON.parse(value);}},
  async runPythonAsync(){},runPython(code){
   const action=code.match(/^json\.dumps\((\w+)\(/)?.[1];
   if(!action)return;
   const data=payload;calls.push({action,data});let result;
   if(action==='render_report')result={source:data.checked.source,sourceSha256:data.checked.source,staticChecksPassed:data.checked.valid,diagnostics:data.checked.diagnostics,reportIntegrity:{reportSha256:'report:'+data.checked.source}};
   else if(action==='accept_current')result={accepted:true,transactionId:data.transactionId};
   else if(action==='rollback_current')result=rollback(data);
   else if(action==='compose_current')result={source:data.report?.source};
   else throw Error('Unexpected scripted Python call '+action);
   return JSON.stringify(result);
  }};
 const self={postMessage(message){pending.get(message.id)(message);pending.delete(message.id);}};
 const source=readFileSync(new URL('./lab-worker.js',import.meta.url),'utf8')
  .replace(/^import .*\n/gm,'').replaceAll('import.meta.url',"'https://lab.test/assets/lab-worker.js'");
 vm.runInNewContext(source,{self,URL,TextEncoder,wasmUrl:'engine.wasm',execUrl:'wasm_exec.js',
  instance:async()=>({}),loadPyodide:async()=>python,
  connectWasm:async()=>({loads:async source=>({hasErrors:source===invalidSource,diagnostics:source===invalidSource?[{severity:'error',message:'Undefined equipment type',span:{startLine:4}}]:[],toApiJson:async()=>({content:'[]'})})}),
  fetch:async()=>({text:async()=>'',json:async()=>({presets:[]})})});
 const send=(path,data={})=>new Promise(resolve=>{const id=++next;pending.set(id,resolve);self.onmessage({data:{id,path,data}});});
 return {send,calls,setRollback(fn){rollback=fn;}};
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
