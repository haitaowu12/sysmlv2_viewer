import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAcceptedDiagram} from './engine-view.js';
test('stale requests and invalid model handles are refused before a drawing is returned',async()=>{
 const report={staticChecksPassed:true,source:'package Demo {}',sourceSha256:'accepted'};
 let calls=0;
 const connection={loads:async()=>{calls++;return {hasErrors:true}}};
 await assert.rejects(renderAcceptedDiagram(connection,()=>report,{sourceSha256:'stale',view:'#tree:Demo'}),/older model revision/);
 assert.equal(calls,0);
 await assert.rejects(renderAcceptedDiagram(connection,()=>report,{sourceSha256:'accepted',view:'#tree:Demo'}),/no longer passes/);
});
test('revision change during public SDK rendering discards a stale result',async()=>{
 let current={staticChecksPassed:true,source:'package Demo {}',sourceSha256:'accepted'};
 const connection={loads:async source=>({hasErrors:false,renderView:async(view,options)=>{assert.equal(source,'package Demo {}');assert.equal(view,'#tree:Demo');assert.deepEqual(options,{ports:'full'});current={...current,sourceSha256:'new'};return {nodes:[]};}})};
 await assert.rejects(renderAcceptedDiagram(connection,()=>current,{sourceSha256:'accepted',view:'#tree:Demo'}),/changed while/);
});

test('candidate preflight is exact-source, exact-query and supported-content bound',async()=>{
 const {preflightEngineViews}=await import('./engine-view.js');
 const source='part def Large { '+Array.from({length:14},(_,i)=>'part p'+i+';').join(' ')+' }';
 const requests=[{id:'architecture',names:['Large'],view:'INTERCONNECTION',renderer:'engineering'},
  {id:'behavior',names:['Large::run'],view:'ACTION',renderer:'behavior'},
  {id:'legacy',names:['Large'],view:'TREE'}];
 const seen=[];const model={hasErrors:false,renderView:async(query,options)=>{seen.push([query,options]);if(query.includes('run'))throw Error('No action named run');return {kind:'interconnection',nodes:Array.from({length:15},(_,id)=>({id})),edges:[],rows:[]}}};
 const receipts=await preflightEngineViews(model,source,requests);
 const {createHash}=await import('node:crypto');assert.equal(receipts.architecture.sourceSha256,createHash('sha256').update(source).digest('hex'));
 assert.deepEqual(receipts.architecture,{supported:true,sourceSha256:receipts.architecture.sourceSha256,viewquery:'#interconnection:Large',kind:'interconnection',nodeCount:15,rowCount:0,edgeCount:0});
 assert.equal(receipts.behavior.supported,false);assert.match(receipts.behavior.error,/No action/);assert.equal(receipts.legacy,undefined);
 assert.deepEqual(seen.map(([query])=>query),['#interconnection:Large','#action:Large::run']);
 assert.ok(seen.every(([,options])=>options.ports==='full'));
 for(const graph of [{kind:'interconnection',nodes:[],rows:[]},{kind:'tree',nodes:[{}],rows:[]}]){
  const failed=await preflightEngineViews({hasErrors:false,renderView:async()=>graph},source,[requests[0]]);assert.equal(failed.architecture.supported,false);
 }
});
