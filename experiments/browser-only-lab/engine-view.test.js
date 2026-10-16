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
