// Execute the actual built WASM through the installed public SDK. This is a
// semantic/protocol test, not a browser interaction or notation conformance test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {connectWasm} from '@openmbee/opensysml';
import {renderAcceptedDiagram} from './engine-view.js';
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
