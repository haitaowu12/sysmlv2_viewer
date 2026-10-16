// Execute the actual built WASM through the installed public SDK. This is a
// semantic/protocol test, not a browser interaction or notation conformance test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {connectWasm} from '@openmbee/opensysml';
import {renderAcceptedDiagram,preflightEngineViews} from './engine-view.js';
import {execFileSync} from 'node:child_process';
const sourceRoot=new URL('./_build/OpenSysML/',import.meta.url);
test('built WASM public SDK retains authored views, exact anonymous origins and declared layout',async()=>{
 const connection=await connectWasm({wasm:fileURLToPath(new URL('./browser-engine.wasm',import.meta.url)),wasmExec:fileURLToPath(new URL('./wasm_exec.js',import.meta.url)),timeoutMs:30000});
 try{
  const source=await readFile(new URL('examples/general-views-demo/vehicle.sysml',sourceRoot),'utf8');
  const accepted={source,sourceSha256:'vehicle-source-revision',staticChecksPassed:true};
  for(const [name,kind] of Object.entries({requirementView:'requirement',definitionView:'definition',packageView:'package',plainView:'tree'})){
   const {graph}=await renderAcceptedDiagram(connection,()=>accepted,{sourceSha256:accepted.sourceSha256,view:'GeneralViews::'+name});
   assert.equal(graph.kind,kind);assert.ok(graph.nodes.length>0);
   assert.ok(graph.nodes.every(node=>node.origin?.startLine>0&&node.origin?.startCol>0),'all authored-view nodes retain exact source spans');
  }
  const connector=`package LinkDemo {\n port def Signal;\n part def Device { port signal : Signal; }\n part system {\n  part left : Device;\n  part right : Device;\n  connect left.signal to right.signal;\n }\n}`;
  const model=await connection.loads(connector,{strictConformance:true});assert.equal(model.hasErrors,false);
  const linked=await model.renderView('#interconnection:LinkDemo::system',{ports:'full'});assert.equal(linked.edges.length,1);
  const origin=linked.edges[0].origin;assert.equal(origin.startLine,7);assert.equal(origin.startCol,3);assert.equal(origin.endLine,7);
  assert.equal(connector.split('\n')[origin.startLine-1].slice(origin.startCol-1,origin.endCol-1),'connect left.signal to right.signal;');
  const layout=await readFile(new URL('internal/ir/view/testdata/shared-notes.sysml',sourceRoot),'utf8');
  const laidOut=await connection.loads(layout,{strictConformance:true});assert.equal(laidOut.hasErrors,false);
  const drawing=await laidOut.renderView('SharedViews::rigView',{ports:'full'});
  assert.equal(drawing.canvas.hasSize,true);assert.equal(drawing.canvas.width,800);
  const left=drawing.nodes.find(node=>node.name==='left');assert.equal(left.geometry.x,20);assert.equal(left.geometry.width,100);assert.equal(left.geometry.hasSize,true);
  const note=drawing.notes.find(note=>note.text==='calibrated');assert.equal(note.width,120);assert.equal(note.hasSize,true);assert.ok(note.origin.startLine>0);
  const quoted=await connection.loads("package Quoted { part def Stage; part 'S-IC' : Stage; }",{strictConformance:true});assert.equal(quoted.hasErrors,false);
  const quotedGraph=await quoted.renderView("#interconnection:Quoted::'S-IC'",{ports:'full'});assert.equal(quotedGraph.nodes.length,1);assert.match(quotedGraph.nodes[0].name,/S-IC/);
  await assert.rejects(quoted.renderView('#tree',{ports:'full'}),/untargeted/);
 }finally{await connection.close();}
});


test('unchanged eight-file self-model pipeline gains exact-source engine admission beyond the legacy 12-part limit',async()=>{
 const names=['behavior','document','execution','identity','pipeline','quality','surfaces','views'];
 const source=(await Promise.all(names.map(name=>readFile(new URL('examples/self-model/'+name+'.sysml',sourceRoot),'utf8')))).join('\n');
 const connection=await connectWasm({wasm:fileURLToPath(new URL('./browser-engine.wasm',import.meta.url)),wasmExec:fileURLToPath(new URL('./wasm_exec.js',import.meta.url)),timeoutMs:30000});
 try{
  const model=await connection.loads(source,{strictConformance:true});assert.equal(model.hasErrors,false);
  const request={id:'pipeline',names:['OpenSysMLPipeline::AnalysisPipeline'],view:'INTERCONNECTION',renderer:'engineering'};
  const receipts=await preflightEngineViews(model,source,[request]);
  assert.equal(receipts.pipeline.supported,true);assert.equal(receipts.pipeline.nodeCount,18);assert.equal(receipts.pipeline.edgeCount,27);
  const raw=JSON.parse((await model.toApiJson()).content);
  // Run the exact Python report/staging handler against real typed API output.
  // No model source or rendering function is replaced in this cross-runtime test.
  const proof=JSON.parse(execFileSync('python3',['-c',`
import json,sys,hashlib
from pathlib import Path
root=Path.cwd()
sys.path[:0]=[str(root/'public/python'),str(root.parents[1]/'modeling-lab/workbench/tools/reference-pilot')]
from normalize import normalize
from lab_project import views_for,exploration_views
from lab_delivery import browser_report
from view_scope import catalogue_for_views
from stakeholder import project,render_svg
from engineering import interconnection,exchange_summary
from behavior import project as behavior_project,render_svg as behavior_svg
from change_summary import summarize
exec((root/'public/python/browser_handler.py').read_text())
payload=json.load(sys.stdin)
old={'source':'old','sourceSha256':'0'*64,'reportIntegrity':{'reportSha256':'1'*64}}
current_report=old
checked={'source':payload['source'],'raw':payload['raw'],'valid':True,'diagnostics':[]}
report=render_report({'checked':checked,'baseChecked':checked,'views':[payload['request']],'enginePreflight':payload['receipts'],'stage':True,'transactionId':'pipeline-test','expectedBase':'0'*64,'expectedReport':'1'*64})
assert current_report is old
view=report['views'][0]
assert view['engineView']['supported'] is True
assert 'error' in view and '12' in view['error']
assert 'svg' not in view and 'stakeholderSvg' not in view
assert 'unavailable' in view['stakeholderError']
accept_current({'transactionId':'pipeline-test','sourceSha256':report['sourceSha256'],'reportSha256':report['reportIntegrity']['reportSha256']})
assert current_report['source']==payload['source']
rollback_current({'transactionId':'pipeline-test'})
assert current_report is old
print(json.dumps({'legacyError':view['error'],'nodeCount':view['engineView']['nodeCount'],'stagedAndRolledBack':True}))
`],{cwd:fileURLToPath(new URL('./',import.meta.url)),input:JSON.stringify({source,raw,request,receipts}),encoding:'utf8',maxBuffer:20*1024*1024}));
  assert.equal(proof.nodeCount,18);assert.equal(proof.stagedAndRolledBack,true);assert.match(proof.legacyError,/12/);
 }finally{await connection.close();}
});
