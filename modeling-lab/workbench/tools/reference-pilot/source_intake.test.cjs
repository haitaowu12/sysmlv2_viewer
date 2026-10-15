const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {webcrypto,createHash}=require('node:crypto');
const vm=require('node:vm');
const test=require('node:test');
const env={TextEncoder,TextDecoder,crypto:webcrypto};
vm.runInNewContext(readFileSync(__dirname+'/source_intake.js','utf8'),env);
const intake=env.sourceSetIntake,plain=value=>JSON.parse(JSON.stringify(value));
const digest=text=>createHash('sha256').update(text).digest('hex');

test('assembly preserves original UTF-8/CRLF/BOM and maps deterministic original file lines',async()=>{
 const files=[{path:'b.sysml',source:'part b;'},{path:'a.sysml',source:'\uFEFFpackage A;\r\n'}];
 const result=await intake.assemble(files);
 assert.equal(result.source,'\uFEFFpackage A;\r\npart b;\n');
 assert.deepEqual(plain(result.sourceMap),[
  {path:'a.sysml',sha256:digest(files[1].source),startLine:1,endLine:1},
  {path:'b.sysml',sha256:digest(files[0].source),startLine:2,endLine:2}]);
 assert.equal(result.sourceSet.assembledSourceSha256,digest(result.source));
 assert.deepEqual(plain(intake.sourceLocation(2,result.sourceMap)),{path:'b.sysml',line:1,sha256:digest('part b;')});
 assert.equal(intake.sourceLocation(3,result.sourceMap),null);
});

test('path ordering matches Python Unicode code points rather than UTF-16 or locale order',async()=>{
 const result=await intake.assemble([{path:'\u{10000}.sysml',source:'second'},{path:'\uE000.sysml',source:'first'}]);
 assert.equal(result.source,'first\nsecond\n');
});

test('admission recomputes originals and mapping and rejects tampered or unrelated baseline data',async()=>{
 const result=await intake.assemble([{path:'a.sysml',source:'package A;'}]);
 const admitted=await intake.admit({...result.sourceSet,sourceMap:[{path:'forged.sysml'}]},result.source);
 assert.equal(admitted.sourceMap[0].path,'a.sysml');
 await assert.rejects(intake.admit({...result.sourceSet,assembledSourceSha256:'0'.repeat(64)}),/revision/);
 await assert.rejects(intake.admit(result.sourceSet,'different baseline'),/baseline/);
 const original=await intake.mappingFor(result.sourceSet,result.source);
 assert.equal(original.status,'original');assert.equal(original.sourceMap.length,1);
 const edited=await intake.mappingFor(result.sourceSet,result.source+'\npart added;');
 assert.equal(edited.status,'edited');assert.equal(edited.sourceMap.length,0);
 assert.equal((await intake.mappingFor(result.sourceSet,result.source)).status,'original');
});

test('path, duplicate, file-count, UTF-8 and assembled-byte limits reject before intake',async()=>{
 for(const path of ['../a.sysml','/a.sysml','C:/a.sysml','a\\b.sysml','a/./b.sysml','a//b.sysml','a.txt','a\0.sysml'])await assert.rejects(intake.assemble([{path,source:''}]),/relative/);
 await assert.rejects(intake.assemble([{path:'a.sysml',source:''},{path:'a.sysml',source:''}]),/Duplicate/);
 await assert.rejects(intake.assemble(Array.from({length:65},(_,i)=>({path:i+'.sysml',source:''}))),/1–64/);
 await assert.rejects(intake.assemble([{path:'a.sysml',source:'\ud800'}]),/UTF-8/);
 const exact='x'.repeat(intake.SOURCE_LIMIT-1)+'\n';assert.equal((await intake.assemble([{path:'a.sysml',source:exact}])).source.length,intake.SOURCE_LIMIT);
 await assert.rejects(intake.assemble([{path:'a.sysml',source:'x'.repeat(intake.SOURCE_LIMIT)}]),/Assembled/);
 await assert.rejects(intake.assemble([{path:'a.sysml',source:'雪'.repeat(174763)}]),/Combined/);
});

test('File intake preserves folder-relative identities and rejects malformed bytes',async()=>{
 const file=(path,raw)=>({name:path.split('/').at(-1),webkitRelativePath:path,size:raw.length,arrayBuffer:async()=>Uint8Array.from(raw).buffer});
 const result=await intake.fromFiles([file('project/types/a.sysml',new TextEncoder().encode('\uFEFFpart a;\r\n')),file('project/b.sysml',new TextEncoder().encode('part b;'))]);
 assert.deepEqual(plain(result.sourceSet.files.map(item=>item.path)),['b.sysml','types/a.sysml']);
 assert.equal(result.sourceSet.files[1].source,'\uFEFFpart a;\r\n');
 await assert.rejects(intake.fromFiles([file('bad.sysml',[0xc3,0x28])]),/not valid UTF-8/);
});
