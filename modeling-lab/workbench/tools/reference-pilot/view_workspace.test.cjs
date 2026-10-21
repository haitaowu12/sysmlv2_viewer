const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');const context={structuredClone};vm.runInNewContext(fs.readFileSync(__dirname+'/view_workspace.js','utf8'),context);const {admitViews,viewRegistry,sourceSlice,acceptsEngineView}=context.labViewDefinitions;const plain=x=>JSON.parse(JSON.stringify(x));
const recipe={kind:'sysml',id:'my-view',name:'Pump',target:"Plant::'Pump A'",notation:'interconnection',depth:2};
test('personal view round trips semantic target without drawing IDs',()=>{assert.deepEqual(plain(admitViews(JSON.parse(JSON.stringify([recipe])))),[recipe]);assert.deepEqual(plain(admitViews(undefined)),[]);assert.throws(()=>admitViews([recipe,recipe]));assert.throws(()=>admitViews([{...recipe,target:''}]));assert.throws(()=>admitViews([{...recipe,depth:5}]));});
test('authored, engineering and analytical views coexist with distinct keys',()=>{const list=viewRegistry([{id:'overview'}],[{name:'Pump'}],[{name:'Pump',qualifiedName:'Plant::PumpView'}],[recipe]);assert.deepEqual(plain(list.map(v=>v.kind)),['review','authored','sysml','analytical']);assert.equal(new Set(list.map(v=>v.key)).size,4);assert.equal(list[1].target,'Plant::PumpView');});
test('anonymous relationship source span selects exact columns on shared line',()=>{const source='package P { part a; connect a.p to b.p; }';const start=source.indexOf('connect');const end=source.indexOf(';',start)+1;assert.deepEqual(plain(sourceSlice(source,{startLine:1,startCol:start+1,endLine:1,endCol:end+1})),{start,end,text:'connect a.p to b.p;'});assert.equal(sourceSlice(source,{startLine:0,endLine:1}),null);});

test('engine UTF-8 byte columns map to exact JavaScript editor offsets after non-ASCII text',()=>{for(const name of ['Étage','系统','🚀']){const source="package P { part '"+name+"'; part other; }",start=source.indexOf('part other'),end=start+'part other;'.length;const origin={startLine:1,startCol:Buffer.byteLength(source.slice(0,start))+1,endLine:1,endCol:Buffer.byteLength(source.slice(0,end))+1};assert.deepEqual(plain(sourceSlice(source,origin)),{start,end,text:'part other;'});}assert.equal(sourceSlice('Étage',{startLine:1,startCol:2,endLine:1,endCol:4}),null,'a column inside a UTF-8 code point is invalid');});

test('only an exact source/query and nonempty engine view receipt admits the engineering fallback',()=>{const report={sourceSha256:'a'.repeat(64)},view={view:'INTERCONNECTION',targets:['P::System'],engineView:{supported:true,sourceSha256:report.sourceSha256,viewquery:'#interconnection:P::System',kind:'interconnection',nodeCount:15,rowCount:0}};assert.equal(acceptsEngineView(report,view),true);for(const change of [{sourceSha256:'b'.repeat(64)},{viewquery:'#interconnection:P::Other'},{nodeCount:0},{kind:'tree'},{supported:false}])assert.equal(acceptsEngineView(report,{...view,engineView:{...view.engineView,...change}}),false);});

test('focused state and action fallback dispatches a real engine recipe only for verified source evidence',()=>{for(const kind of ['STATE','ACTION','INTERCONNECTION']){const report={sourceSha256:'c'.repeat(64)},view={id:'focused',view:kind,targets:['P::Subject'],engineView:{supported:true,sourceSha256:report.sourceSha256,viewquery:'#'+kind.toLowerCase()+':P::Subject',kind:kind.toLowerCase(),nodeCount:3,rowCount:0}};assert.equal(context.labViewDefinitions.engineRecipeFor(report,view).view,kind);if(kind!=='INTERCONNECTION')assert.equal(context.labViewDefinitions.engineRecipeFor({...report,sourceSha256:'d'.repeat(64)},view),null);}});


// Source contract from pinned OpenSysML examples/self-model: surfaces.sysml
// 623–624 declares Toolchain::pipeline : AnalysisPipeline; pipeline.sysml
// 728–742 declares AnalysisPipeline's 14 children under the definition. A second
// occurrence below is a deliberate counterexample, not a donor model claim.
const declaration=(id,name,qualifiedName,metaclass,owner=null,type=[])=>({sessionElementId:id,name,qualifiedName,metaclass,semantics:{owner:owner?{id:owner}:null,type}});
const modelFacts=()=>[
 declaration('surface','OpenSysMLSurfaces','OpenSysMLSurfaces','Package'),
 declaration('toolchain','Toolchain','OpenSysMLSurfaces::Toolchain','PartDefinition','surface'),
 declaration('pipeline','pipeline','OpenSysMLSurfaces::Toolchain::pipeline','PartUsage','toolchain',[{id:'analysis'}]),
 declaration('pipeline2','backupPipeline','OpenSysMLSurfaces::Toolchain::backupPipeline','PartUsage','toolchain',[{qualifiedName:'OpenSysMLPipeline::AnalysisPipeline'}]),
 declaration('pipeline-package','OpenSysMLPipeline','OpenSysMLPipeline','Package'),
 declaration('analysis','AnalysisPipeline','OpenSysMLPipeline::AnalysisPipeline','PartDefinition','pipeline-package'),
 declaration('sources','sources','OpenSysMLPipeline::AnalysisPipeline::sources','PartUsage','analysis'),
 declaration('lexer','lexer','OpenSysMLPipeline::AnalysisPipeline::lexer','PartUsage','analysis')
];
test('source owners define the hierarchy while type and resolved-feature links stay separate',()=>{
 const facts=modelFacts();facts[2].semantics.resolvedFeatures=[{id:'sources'},{id:'lexer'}];facts[2].semantics.children=[{id:'sources'}];
 const index=context.labViewDefinitions.modelIndex(facts);
 assert.equal(index.parents.get('pipeline'),'toolchain');
 assert.deepEqual(plain(index.path(index.byId.get('pipeline')).map(e=>e.name)),['OpenSysMLSurfaces','Toolchain','pipeline']);
 assert.deepEqual(plain(index.children.get('toolchain').map(e=>e.sessionElementId)),['pipeline2','pipeline']);
 assert.equal(index.children.has('pipeline'),false,'definition members must not become children of a typed occurrence');
 assert.deepEqual(plain(index.children.get('analysis').map(e=>e.name)),['lexer','sources']);
 assert.deepEqual(plain(index.types(index.byId.get('pipeline')).map(e=>e.sessionElementId)),['analysis']);
 assert.deepEqual(plain(index.usages.get('analysis').map(e=>e.sessionElementId)),['pipeline','pipeline2']);
 assert.notEqual(index.byId.get('pipeline'),index.byId.get('pipeline2'),'two explicit occurrences preserve their own identity');
 assert.equal(context.labViewDefinitions.modelRole(index.byId.get('pipeline')),'Occurrence');
 assert.equal(context.labViewDefinitions.modelRole(index.byId.get('analysis')),'Definition');
 assert.equal(context.labViewDefinitions.modelNotation(index.byId.get('pipeline')),'interconnection');
});

test('quoted names, hidden owners and malformed ownership cycles remain bounded and unambiguous',()=>{
 const facts=[
  declaration('root',"'Plant::One'","'Plant::One'",'Package'),
  declaration('hidden','@membership',"'Plant::One'::@membership",'Membership','root'),
  declaration('quoted',"'Pump::A'","'Plant::One'::'Pump::A'",'PartUsage','hidden'),
  declaration('cycle-a','A','Cycle::A','PartDefinition','cycle-b'),
  declaration('cycle-b','B','Cycle::B','PartDefinition','cycle-a'),
  declaration('self','Self','Self','PartDefinition','self'),
  declaration('orphan','Orphan','Unrelated::Orphan','PartUsage','missing')
 ];
 const index=context.labViewDefinitions.modelIndex(facts);
 assert.equal(index.parents.get('quoted'),'root');
 assert.deepEqual(plain(index.path(index.byId.get('quoted')).map(e=>e.qualifiedName)),["'Plant::One'","'Plant::One'::'Pump::A'"]);
 assert.equal(index.resolve("'Plant::One'::'Pump::A'").sessionElementId,'quoted');
 assert.equal(index.byId.has('hidden'),false);
 assert.equal(index.parents.has('self'),false);assert.equal(index.parents.has('orphan'),false,'qualified name punctuation never invents an owner');
 const reached=new Set();function walk(id){for(const e of index.children.get(id)||[]){assert.equal(reached.has(e.sessionElementId),false,'UI hierarchy contains no ownership cycle');reached.add(e.sessionElementId);walk(e.sessionElementId)}}walk(null);
 assert.equal(reached.size,index.entries.length);for(const e of index.entries)assert.ok(index.path(e).length<=index.entries.length);
});

test('type navigation requires a unique source definition and does not resolve usages as definitions',()=>{
 const facts=modelFacts();facts.push(declaration('ambiguous-a','Shared','P::Shared','PartDefinition'),declaration('ambiguous-b','Shared','P::Shared','PartDefinition'));
 facts[2].semantics.type=[{qualifiedName:'P::Shared'},{id:'pipeline2'},{id:'absent'},{id:'analysis'}];
 const index=context.labViewDefinitions.modelIndex(facts);
 assert.equal(index.resolve('P::Shared'),null,'ambiguous qualified names must not choose an arbitrary definition');
 assert.deepEqual(plain(index.types(index.byId.get('pipeline')).map(e=>e.sessionElementId)),['analysis']);
 assert.deepEqual(plain(index.usages.get('analysis').map(e=>e.sessionElementId)),['pipeline','pipeline2']);
 assert.equal(index.usages.has('pipeline2'),false);
});


test('saved reading admission refuses a mismatched shape and non-finite camera',()=>{
 const {admitReading}=context.labViewDefinitions;
 const valid={sourceSha256:'a'.repeat(64),item:{kind:'sysml',key:'sysml:one'},query:'',filter:'',expanded:[],page:0,scroll:0,presentation:{mode:'focus'},viewport:{x:1,y:2,scale:1}};
 assert.deepEqual(plain(admitReading(valid)),valid);assert.throws(()=>admitReading({...valid,item:null}));assert.throws(()=>admitReading({...valid,usageFilter:{unexpected:true}}));assert.throws(()=>admitReading({...valid,selection:[]}));assert.throws(()=>admitReading({...valid,viewport:{x:0,y:0,scale:Infinity}}));
});
