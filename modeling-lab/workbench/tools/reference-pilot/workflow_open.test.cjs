/* Workflow boundary tests. DOM and validation transport are doubles; real browser
   layout and model rendering are verified separately in the integrated journey. */
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {webcrypto}=require('node:crypto');
const vm=require('node:vm');
const test=require('node:test');

class Element{
  constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.attributes={};this.handlers={};this.style={};this.dataset={};this.disabled=false;this.value='';this.classList={toggle(){}}}
  append(...children){for(const child of children){child.remove();child.parentElement=this;this.children.push(child);if(this.tagName==='select'&&this.children.length===1)this.value=child.value}}
  after(child){this.parentElement?.append(child)}
  insertBefore(child){this.append(child)}
  replaceChildren(...children){for(const child of this.children)child.parentElement=null;this.children=[];this.append(...children)}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null}
  setAttribute(key,value){this.attributes[key]=String(value)}
  getAttribute(key){return this.attributes[key]??null}
  removeAttribute(key){delete this.attributes[key]}
  addEventListener(name,callback){(this.handlers[name]??=[]).push(callback)}
  async emit(name){for(const callback of this.handlers[name]||[])await callback({preventDefault(){}})}
  click(){if(!this.disabled)return this.emit('click')}
  showModal(){this.open=true}
  close(){this.open=false;return this.emit('close')}
  focus(){}
  get options(){return this.children}
  matches(selector){return selector.startsWith('[role=')?this.attributes.role===selector.slice(6,-1):selector.startsWith('.')?this.className===selector.slice(1):this.tagName===selector}
  querySelectorAll(selector){const selectors=selector.split(','),found=[];for(const child of this.children){if(selectors.some(s=>child.matches(s)))found.push(child);found.push(...child.querySelectorAll(selector))}return found}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
}
function setup(fetcher){
  const body=new Element('body'),header=new Element('header');header.className='app-header';const audience=new Element('select');audience.className='audience';header.append(audience);body.append(header);
  const ids={source:new Element('textarea'),audience,'view-title':new Element('h2','Overview'),editor:new Element('details'),diagnostics:new Element('div'),'view-search':new Element('input'),'model-search':new Element('input'),'source-view-note':new Element('p')};
  ids.source.value='package Existing;';audience.value='engineering';let custom=[];
  const context={console,TextEncoder,crypto:webcrypto,structuredClone,URL,Blob,document:{body,title:'',createElement:tag=>new Element(tag),getElementById:id=>ids[id]||body.querySelectorAll('dialog,div').find(e=>e.id===id),querySelector:selector=>selector==='.app-header'?header:selector==='.audience'?audience:null,addEventListener(){}},window:{scopeWorkbench:{export:()=>custom,import:views=>{custom=views},leave(){},active:()=>false}},report:{source:'package Existing;',sourceSha256:'old',elements:[]},acceptedReport:{old:true},busy:false,selected:null,editRevision:0,initial:{source:'package Existing;',presets:[{id:'overview',names:['Existing'],view:'TREE',styles:[]}],workspaceKey:'existing'},human:value=>value,stakeholderMode:()=>audience.value==='stakeholder',status(){},syncEditor(){},fetch:fetcher};
  context.render=async(_force,options)=>{options.commit();context.report={source:options.source,sourceSha256:'new',elements:[],viewRecipes:options.payload.views};context.acceptedReport=context.report;context.window.labWorkflow.onReport(context.report);return true};
  vm.runInNewContext(readFileSync(__dirname+'/workflow.js','utf8'),context);
  const workflow=context.window.labWorkflow;workflow.onReport(context.report);
  const findButton=label=>body.querySelectorAll('button').find(e=>e.textContent===label);
  return {context,workflow,body,ids,findButton,dialog:()=>body.querySelector('dialog'),field:label=>body.querySelectorAll('input,textarea,select').find(e=>e.attributes['aria-label']===label)};
}
const project=()=>({schemaVersion:1,id:'apollo-example',title:'Apollo example',brief:'Research scaffold',questions:'Unapproved example',source:'package Apollo;',baselineSource:'package Apollo;',views:[{id:'overview',names:['Apollo'],view:'TREE',styles:[]}],customViews:[],history:[]});
const goodInspect=()=>({ok:true,json:async()=>({staticChecksPassed:true,diagnostics:[]})});

test('Open model is direct; project notes do not contain import choices',async()=>{
 const ui=setup(async()=>goodInspect());
 assert.equal(ui.body.querySelectorAll('button')[0].textContent,'Open model');
 await ui.findButton('Project').click();assert.equal(ui.field('Project name').value,'System study');assert.equal(ui.field('Open project file'),undefined);
 await ui.dialog().close();await ui.findButton('Open model').click();
 assert.equal(ui.dialog().querySelectorAll('section')[0].querySelector('h3').textContent,'Open your SysML v2 model');assert.equal(ui.findButton('Open Apollo 11').parentElement.tagName,'details');assert.ok(ui.field('Open project file'));assert.ok(ui.field('Choose SysML files'));assert.ok(ui.field('Choose SysML folder'));assert.equal(ui.field('Project name'),undefined);
});

test('Apollo action uses atomic project validation, reports loading, and preserves supplied views',async()=>{
 let finish;const delayed=new Promise(resolve=>finish=resolve),calls=[];
 const ui=setup(async(url,options)=>{calls.push([url,options]);if(url==='./examples/apollo-11.modeling.json'){await delayed;return{ok:true,json:async()=>project()}}return goodInspect()});
 await ui.findButton('Open model').click();const action=ui.findButton('Open Apollo 11').click();
 assert.equal(ui.dialog().getAttribute('aria-busy'),'true');assert.equal(ui.findButton('Open Apollo 11').disabled,true);assert.match(ui.body.querySelector('[role=status]').textContent,/Opening Apollo/);
 finish();await action;assert.equal(ui.workflow.snapshot().title,'Apollo example');assert.equal(ui.workflow.snapshot().id,'apollo-example');assert.deepEqual(JSON.parse(JSON.stringify(ui.workflow.snapshot().views)),project().views);assert.equal(ui.dialog().open,false);
 const inspect=JSON.parse(calls.find(([url])=>url==='/inspect')[1].body);assert.equal(inspect.source,project().source);assert.equal(inspect.baselineSource,project().baselineSource);
});

test('Unavailable example and rejected validation retain entered project and offer retry',async()=>{
 for(const failure of ['missing','invalid']){
  const ui=setup(async url=>url==='./examples/apollo-11.modeling.json'?failure==='missing'?{ok:false,status:404}:{ok:true,json:async()=>project()}:{ok:true,json:async()=>({staticChecksPassed:false,diagnostics:[{message:'Unsupported model'}]})});
  const before=JSON.stringify(ui.workflow.capture());await ui.findButton('Open model').click();await ui.findButton('Open Apollo 11').click();
  assert.equal(JSON.stringify(ui.workflow.capture()),before);assert.equal(ui.dialog().open,true);assert.equal(ui.dialog().getAttribute('aria-busy'),null);assert.equal(ui.findButton('Open Apollo 11').disabled,false);assert.ok(ui.dialog().querySelector('[role=alert]'));
 }
});

test('Minimum task uses producer capability and values, never documentation comparison text',async()=>{
 let request;const ui=setup(async(_url,options)=>{request=JSON.parse(options.body);return{ok:true,json:async()=>({sourceSha256:'old',options:[{target:'Existing::R',currentValue:4,statement:'Actual requirement'}]})}});
 ui.context.report.elements=[{qualifiedName:'Existing::R',name:'R',metaclass:'RequirementUsage',source:'requirement R { doc /* misleading >= 99 */ count > 1; }'}];
 await ui.findButton('Develop model').click();assert.equal(request.operation,'minimum-options');assert.equal(request.baseSourceSha256,'old');assert.equal(ui.field('Required minimum').value,4);assert.equal(ui.field('Complete requirement statement').value,'Actual requirement');
});

test('Unsupported or unavailable minimum capability leaves other tasks and source editor reachable',async()=>{
 for(const response of [{sourceSha256:'old',options:[]},{sourceSha256:'stale',options:[]}]){
  const ui=setup(async()=>({ok:true,json:async()=>response}));await ui.findButton('Develop model').click();
  assert.equal(ui.field('Required minimum'),undefined);assert.ok(ui.findButton('Edit SysML source'));assert.ok(ui.field('Engineering task'));assert.equal(ui.field('Engineering task').options.some(option=>option.value==='minimum'),false);
 }
});

test('Malformed project file leaves the open choices and current model available',async()=>{
 const ui=setup(async()=>goodInspect()),before=JSON.stringify(ui.workflow.capture());await ui.findButton('Open model').click();
 const upload=ui.field('Open project file');upload.files=[{size:8,text:async()=>'{broken'}];await upload.emit('change');
 assert.equal(JSON.stringify(ui.workflow.capture()),before);assert.equal(ui.dialog().open,true);assert.equal(upload.disabled,false);assert.equal(upload.value,'');assert.ok(ui.dialog().querySelector('[role=alert]'));
});

test('One source-owned component definition opens directly without a scope choice',async()=>{
 const source='part def Vehicle { part wheel; }',element={qualifiedName:'Vehicle',name:'Vehicle',metaclass:'PartDefinition',line:1,source};
 const sourceSet={schemaVersion:1,files:[{path:'Vehicle.sysml',source}],assembledSourceSha256:'a'.repeat(64)};
 const ui=setup(async()=>({ok:true,json:async()=>({staticChecksPassed:true,diagnostics:[],elements:[element]})}));
 ui.context.window.sourceSetIntake={fromFiles:async()=>({source,sourceSet}),admit:async value=>({sourceSet:value})};
 await ui.findButton('Open model').click();const input=ui.field('Choose SysML files');input.files=[{name:'Vehicle.sysml'}];await input.emit('change');
 assert.equal(ui.field('Starting point'),undefined);
 assert.equal(ui.workflow.snapshot().source,source);assert.equal(ui.workflow.snapshot().title,'Vehicle');assert.equal(ui.workflow.snapshot().views[0].renderer,'engineering');assert.equal(ui.dialog().open,false);
});

test('Late minimum capability response cannot replace a different panel',async()=>{
 let finish;const response=new Promise(resolve=>finish=resolve),ui=setup(async()=>{await response;return{ok:true,json:async()=>({sourceSha256:'old',options:[]})}});
 const action=ui.findButton('Develop model').click();await ui.dialog().close();await ui.findButton('Project').click();finish();await action;
 assert.ok(ui.field('Project name'));assert.equal(ui.field('Engineering task'),undefined);assert.equal(ui.dialog().querySelector('[role=alert]'),null);
});

test('Bundled Apollo project passes real project and original-file admission without losing views',async()=>{
 const example=JSON.parse(readFileSync(__dirname+'/examples/apollo-11.modeling.json','utf8'));
 const intakeEnv={TextEncoder,TextDecoder,crypto:webcrypto};vm.runInNewContext(readFileSync(__dirname+'/source_intake.js','utf8'),intakeEnv);
 const ui=setup(async url=>url==='./examples/apollo-11.modeling.json'?{ok:true,json:async()=>example}:goodInspect());ui.context.window.sourceSetIntake=intakeEnv.sourceSetIntake;
 await ui.findButton('Open model').click();await ui.findButton('Open Apollo 11').click();
 assert.equal(ui.dialog().open,false);const opened=ui.workflow.snapshot();assert.equal(opened.source,example.source);assert.equal(opened.baselineSource,example.baselineSource);assert.equal(opened.sourceSet.files.length,28);assert.equal(opened.views.length,5);assert.equal(opened.customViews.length,2);
});

function ownModelUI(source,elements,inspectOverride){
 const sourceSet={schemaVersion:1,files:[{path:'my-design.sysml',source}],assembledSourceSha256:'a'.repeat(64)};
 const ui=setup(async(url,options)=>{const request=JSON.parse(options.body);return{ok:true,json:async()=>inspectOverride?.(request)||({staticChecksPassed:true,diagnostics:[],elements})}});
 ui.context.window.sourceSetIntake={fromFiles:async files=>{sourceSet.files=files.map(file=>({path:file.name,source}));return{source,sourceSet}},admit:async value=>({sourceSet:value})};
 return ui;
}
async function chooseSources(ui,names=['my-design.sysml']){await ui.findButton('Open model').click();const input=ui.field('Choose SysML files');input.files=names.map(name=>({name}));await input.emit('change')}

test('A unique source top-level usage wins over several definitions and nested usages across files',async()=>{
 const source='part def Pump {}\npart def Frame {}\npart installation : Frame {}\npart component : Pump;';
 const elements=[{qualifiedName:'Pump',name:'Pump',metaclass:'PartDefinition',line:1,source:'part def Pump {}'},{qualifiedName:'Frame',name:'Frame',metaclass:'PartDefinition',line:2,source:'part def Frame {}'},{qualifiedName:'installation',name:'installation',metaclass:'PartUsage',line:3,source:'part installation : Frame {}',semantics:{owner:{metaclass:'Namespace'}}},{qualifiedName:'installation::component',name:'component',metaclass:'PartUsage',line:4,source:'part component : Pump;',semantics:{owner:{metaclass:'PartUsage'}}},{qualifiedName:'Library::Thing',name:'Thing',metaclass:'PartDefinition',line:99,source:'part def Thing {}'}];
 const ui=ownModelUI(source,elements);await chooseSources(ui,['types.sysml','system.sysml']);
 assert.equal(ui.workflow.snapshot().views[0].names[0],'installation');assert.equal(ui.workflow.snapshot().sourceSet.files.length,2);assert.equal(ui.field('Starting point'),undefined);
});

test('Several source roots require an explicit starting point; library and nested elements are not defaults',async()=>{
 const source='part first;\npart second;\npart inner;';
 const elements=[{qualifiedName:'first',name:'first',metaclass:'PartUsage',line:1,source:'part first;',semantics:{owner:{metaclass:'Namespace'}}},{qualifiedName:'second',name:'second',metaclass:'PartUsage',line:2,source:'part second;',semantics:{owner:{metaclass:'Package'}}},{qualifiedName:'first::inner',name:'inner',metaclass:'PartUsage',line:3,source:'part inner;',semantics:{owner:{metaclass:'PartUsage'}}},{qualifiedName:'Library::OnlyDefinition',name:'OnlyDefinition',metaclass:'PartDefinition',line:10,source:'part def OnlyDefinition {}'}];
 const ui=ownModelUI(source,elements);await chooseSources(ui);
 assert.equal(ui.workflow.snapshot().source,'package Existing;');const target=ui.field('Starting point');assert.deepEqual(target.options.map(option=>option.value),['','first','second']);assert.equal(ui.findButton('Open selected model').disabled,true);
 target.value='second';await target.emit('change');await ui.findButton('Open selected model').click();assert.equal(ui.workflow.snapshot().views[0].names[0],'second');
});

test('A failed diagram keeps the old project until explicit opening without a diagram',async()=>{
 const source='part def Satellite {}',elements=[{qualifiedName:'Satellite',name:'Satellite',metaclass:'PartDefinition',line:1,source}];
 const ui=ownModelUI(source,elements,request=>request.views?.length?{error:'Required view overview exceeds this diagram profile.'}:null);await chooseSources(ui);
 assert.equal(ui.workflow.snapshot().source,'package Existing;');assert.ok(ui.dialog().querySelector('[role=alert]'));assert.ok(ui.findButton('Open model without diagram'));
 await ui.findButton('Open model without diagram').click();assert.equal(ui.workflow.snapshot().source,source);assert.equal(ui.workflow.snapshot().views.length,0);assert.equal(ui.dialog().open,false);
 const opened=ui.workflow.snapshot();await ui.workflow.openProject(opened);assert.equal(ui.workflow.snapshot().views.length,0);
});

test('Valid source without a drawing target offers model browsing; invalid source cannot use that route',async()=>{
 for(const valid of [true,false]){
  const source='package MyModel {}',ui=ownModelUI(source,[],()=>({staticChecksPassed:valid,diagnostics:valid?[]:[{message:'Invalid source'}],elements:[]}));await chooseSources(ui);
  assert.equal(ui.workflow.snapshot().source,'package Existing;');const fallback=ui.findButton('Open model without diagram');
  if(valid){assert.ok(fallback);await fallback.click();assert.equal(ui.workflow.snapshot().source,source);assert.equal(ui.workflow.snapshot().views.length,0)}else{assert.equal(fallback,undefined);assert.ok(ui.dialog().querySelector('[role=alert]'))}
 }
});

// Exercise the shipped admission function, rather than setup()'s render double.
// Transport and report display remain doubles: this checks transactional opening,
// not canvas layout. The engine-proof predicate is the real workspace helper.
function renderAdmissionUI(changeProof=()=>{}){
 const ui=setup(async()=>goodInspect()),ctx=ui.context,calls=[];
 const page=readFileSync(__dirname+'/lab.html','utf8');
 const start=page.indexOf('async function render(focused=false,transition=null){');
 const end=page.indexOf('\nfunction syncEditor()',start);
 assert.ok(start>=0&&end>start,'the actual inline render admission must be available');
 vm.runInNewContext(readFileSync(__dirname+'/view_workspace.js','utf8'),ctx);
 ctx.window.labViews={snapshot:()=>({views:[]}),restore(){},importProject(){},onReport(){}};
 ctx.acceptedReport=ctx.report;
 Object.assign(ctx,{updateTimer:null,queued:false,pendingCompensation:null,clearTimeout(){},controls(){},empty(){},scheduleUpdate(){},sysmlReturn:null,
  $:id=>ui.ids[id]??(ui.ids[id]=new Element('div')),
  setRuntimeDiagnostic:error=>{ui.ids.diagnostics.textContent=String(error);ui.ids.diagnostics.dataset.runtimeError=String(error)},
  displayReport:data=>{ctx.report=data;ui.workflow.onReport(data)},
  invalidateDraft:()=>{throw Error('A rejected opening must retain the prior accepted source')},
  modelRequest:async(path,payload)=>{
   calls.push({path,payload});
   if(path==='/render'){
    const data={source:payload.source,sourceSha256:'b'.repeat(64),transactionId:payload.transactionId,staticChecksPassed:true,
     diagnostics:[],elements:[],viewRecipes:payload.views,reportIntegrity:{reportSha256:'c'.repeat(64)},
     views:payload.views.map(recipe=>({id:recipe.id,targets:recipe.names,view:recipe.view,svg:'',stakeholderSvg:'',error:'Legacy SVG limit reached',stakeholderError:'Legacy SVG limit reached',
      engineView:{supported:true,sourceSha256:'b'.repeat(64),viewquery:'#'+recipe.view.toLowerCase()+':'+recipe.names[0],kind:recipe.view.toLowerCase(),nodeCount:1,rowCount:0}}))};
    changeProof(data.views[0].engineView,data);return data;
   }
   if(path==='/accept')return{accepted:true,...payload};
   if(path==='/rollback')return{rolledBack:true,transactionId:payload.transactionId};
   throw Error('Unexpected admission request '+path);
  },
 });
 vm.runInNewContext(page.slice(start,end),ctx);
 return{...ui,calls};
}

test('Actual render admission accepts a revision-bound engine drawing despite both legacy SVG failures',async()=>{
 const ui=renderAdmissionUI();await ui.workflow.openProject(project());
 assert.equal(ui.workflow.snapshot().id,'apollo-example');assert.equal(ui.workflow.snapshot().source,project().source);
 assert.deepEqual(ui.calls.map(call=>call.path),['/render','/accept']);
 assert.equal(ui.calls[0].payload.stage,true);assert.equal(ui.calls[1].payload.transactionId,ui.calls[0].payload.transactionId);
 assert.equal(ui.context.acceptedReport.sourceSha256,'b'.repeat(64));assert.equal(ui.context.acceptedReport.views[0].error,'Legacy SVG limit reached');
});

test('Actual render admission refuses stale or mismatched engine proof and preserves the prior project',async()=>{
 for(const [label,change] of [
  ['stale source',proof=>{proof.sourceSha256='a'.repeat(64)}],
  ['different target',proof=>{proof.viewquery='#tree:DifferentSystem'}],
  ['different notation',proof=>{proof.kind='interconnection'}],
  ['unsupported',proof=>{proof.supported=false}],
  ['no drawable content',proof=>{proof.nodeCount=0;proof.rowCount=0}],
 ]){
  const ui=renderAdmissionUI(change),before=JSON.stringify(ui.workflow.capture()),prior=ui.context.acceptedReport;
  await assert.rejects(ui.workflow.openProject(project()),/Required view overview could not be built/,label);
  assert.deepEqual(ui.calls.map(call=>call.path),['/render'],label+' must not accept the candidate');
  assert.equal(JSON.stringify(ui.workflow.capture()),before,label+' must retain project metadata, views and draft');
  assert.equal(ui.context.acceptedReport,prior,label+' must retain the accepted report');assert.equal(ui.context.report,prior,label+' must retain the displayed report');
 }
});
