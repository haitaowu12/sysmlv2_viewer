/* Exercise the shipped workspace controller with a real DOM. The engine fetch
 * and asynchronous diagram mounting boundaries are controlled; this proves
 * lifecycle/selection behavior, not browser layout or language conformance. */
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const {JSDOM}=require('jsdom');

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
const drain=()=>new Promise(resolve=>setImmediate(resolve));
const sourceSha256='a'.repeat(64);
const personal=(id,target)=>({kind:'sysml',id,name:id+' architecture',target,notation:'tree',depth:2});
const first=personal('first','Example::First'),second=personal('second','Example::Second');
function harness(t){
 const ids=['views','view-count','view-search','no-views','model-tree','model-search','model-navigation-note','customize','canvas','scope-surfaces','view-title','view-purpose','view-notation','scope','reference','explanation','fit','minus','plus','readable','actual','nav-model','explore-selection'];
 const dom=new JSDOM('<!doctype html><html><head></head><body><div class="canvas-tools"></div>'+ids.map(id=>['view-search','model-search'].includes(id)?`<input id="${id}">`:`<div id="${id}"></div>`).join('')+'</body></html>');
 t.after(()=>dom.window.close());
 const window=dom.window,document=window.document,timers=[],requests=[],mounts=[],statuses=[],diagnostics=[],refreshSnapshots=[];
 const mountPlans=new Map(),fetchPlans=new Map();
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true};window.HTMLDialogElement.prototype.close=function(){this.open=false};
 window.browserLabReady=true;
 window.scopeWorkbench={export:()=>[],leave(){},openSaved(){throw Error('Unexpected analytical view')},create(){}};
 window.labWorkflow={sourceWitness:()=>true,refreshState(){refreshSnapshots.push(JSON.parse(JSON.stringify(window.labViews?.snapshot()||null)))}};
 window.labDiagramRenderer={async mountDiagram(container,graph,options){
  const plan=mountPlans.get(graph.view);if(plan)await plan.promise;
  const content=document.createElement('section');content.dataset.engineView=graph.view;content.textContent=graph.view;container.append(content);
  const controller={disposed:false,fitCalls:0,summary:{notices:[]},fit(){this.fitCalls++},zoom(){},dispose(){this.disposed=true;content.remove()}};
  mounts.push({view:graph.view,container,content,controller,options});return controller;
 }};
 const context={window,document,structuredClone,console,busy:false,active:0,report:null,selected:null,
  setTimeout:callback=>{timers.push(callback);return timers.length},requestAnimationFrame:callback=>callback(),
  viewLabel:id=>id,human:value=>String(value),stakeholderMode:()=>false,
  status:(...args)=>statuses.push(args),setRuntimeDiagnostic:error=>diagnostics.push(error),resetStory(){},clearSelection(){},show(){},fit(){},
  async fetch(path,options){assert.equal(path,'/diagram');const request=JSON.parse(options.body);requests.push(request);const plan=fetchPlans.get(request.view);if(plan)await plan.promise;return{json:async()=>({sourceSha256:request.sourceSha256,graph:{view:request.view,kind:'tree',nodes:[],edges:[],notices:['Depth bound disclosed']}})}}};
 vm.runInNewContext(readFileSync(__dirname+'/view_workspace.js','utf8'),context);
 const api=window.labViews;
 const report=()=>({source:'package Example;',sourceSha256,elements:[],views:[],viewRecipes:[]});
 async function load(selectedView=null){api.importProject({sysmlViews:[first,second],selectedView});context.report=report();api.onReport(context.report);await flushTimers()}
 async function flushTimers(){for(const callback of timers.splice(0))callback();await drain()}
 return{api,context,document,report,load,flushTimers,timers,requests,mounts,mountPlans,fetchPlans,statuses,diagnostics,refreshSnapshots,canvas:()=>document.getElementById('canvas')};
}

test('saved personal view selection restores after the report transaction clears busy',async t=>{
 const ui=harness(t);ui.api.importProject({sysmlViews:[first,second],selectedView:'sysml:first'});
 ui.context.busy=true;ui.context.report=ui.report();ui.api.onReport(ui.context.report);
 assert.equal(ui.api.snapshot().selected,'sysml:first','saved selection exists before the save baseline is captured');
 assert.equal(ui.requests.length,0,'restore waits until the report transaction ends');
 assert.equal(ui.timers.length,1);
 ui.context.busy=false;await ui.flushTimers();
 assert.equal(ui.requests[0].view,'#tree:Example::First');assert.equal(ui.api.snapshot().selected,'sysml:first');
 assert.equal(ui.api.reader().target,'Example::First');assert.equal(ui.api.reader().sourceSha256,sourceSha256);
 assert.equal(ui.canvas().querySelector('[data-engine-view]').dataset.engineView,'#tree:Example::First');
 // displayReport calls core() while rebuilding its configured drawing. The
 // saved selection must survive that intermediate call on same-source refresh.
 ui.api.beginReport();ui.api.core(0);ui.context.busy=true;ui.context.report=ui.report();ui.api.onReport(ui.context.report);
 ui.context.busy=false;await ui.flushTimers();assert.equal(ui.api.snapshot().selected,'sysml:first');assert.equal(ui.api.reader().target,'Example::First');
 assert.equal(ui.mounts[0].controller.disposed,true);assert.equal(ui.mounts.at(-1).controller.disposed,false);
});

test('failed asynchronous mount retains the previous canvas, controller and selected recipe',async t=>{
 const ui=harness(t);await ui.load();await ui.api.open('sysml:first');
 const previous=ui.mounts[0],plan=deferred();ui.mountPlans.set('#tree:Example::Second',plan);
 const opening=ui.api.open('sysml:second');await drain();
 assert.equal(previous.content.parentElement,ui.canvas());assert.equal(previous.controller.disposed,false);
 assert.equal(ui.api.reader().target,'Example::First','reader metadata belongs to the mounted drawing while the next view is pending');
 plan.reject(Error('Layout could not be completed'));await opening;
 assert.equal(ui.api.snapshot().selected,'sysml:first');assert.equal(ui.api.reader().target,'Example::First');
 assert.equal(previous.content.parentElement,ui.canvas());assert.equal(previous.controller.disposed,false);assert.equal(ui.api.active(),true);
 assert.match(ui.diagnostics.at(-1).message,/Layout could not be completed/);
});

test('a late mount is disposed without replacing a newer selected view',async t=>{
 const ui=harness(t);await ui.load();const slow=deferred();ui.mountPlans.set('#tree:Example::First',slow);
 const firstOpening=ui.api.open('sysml:first');await drain();await ui.api.open('sysml:second');
 const newer=ui.mounts.find(m=>m.view==='#tree:Example::Second');assert.ok(newer);assert.equal(newer.content.parentElement,ui.canvas());
 slow.resolve();await firstOpening;
 const stale=ui.mounts.find(m=>m.view==='#tree:Example::First');assert.ok(stale);assert.equal(stale.controller.disposed,true);
 assert.equal(newer.controller.disposed,false);assert.equal(newer.content.parentElement,ui.canvas());
 assert.equal(ui.api.snapshot().selected,'sysml:second');assert.equal(ui.api.reader().target,'Example::Second');assert.equal(ui.canvas().children.length,1);
});

test('source invalidation suppresses an old transport result and disposes the accepted drawing',async t=>{
 const ui=harness(t);await ui.load();await ui.api.open('sysml:first');
 const pending=deferred();ui.fetchPlans.set('#tree:Example::Second',pending);const opening=ui.api.open('sysml:second');await drain();
 ui.api.invalidate();ui.context.report=null;pending.resolve();await opening;
 assert.equal(ui.requests.length,2);assert.equal(ui.mounts.length,1,'old response never reaches the diagram renderer');
 assert.equal(ui.mounts[0].controller.disposed,true);assert.equal(ui.api.active(),false);assert.equal(ui.api.reader(),null);
 assert.equal(ui.canvas().querySelector('[data-engine-view]'),null);assert.equal(ui.document.body.classList.contains('engine-view-active'),false);
});

 test('an explicit subject beyond the first 200 choices never silently changes target',async t=>{
 const ui=harness(t);await ui.load();const data=ui.report();data.elements=Array.from({length:201},(_,i)=>({qualifiedName:'P::Item'+i,name:'Item'+i,metaclass:'PartDefinition'}));ui.context.report=data;ui.api.onReport(data);ui.api.create('P::Item200');
 const field=label=>ui.document.querySelector('[aria-label="'+label+'"]');assert.equal(field('Subject').value,'P::Item200');assert.equal(field('View name').value,'Item200 view');assert.equal(field('Diagram kind').value,'interconnection');
 field('Find a subject').value='Item199';field('Find a subject').dispatchEvent(new ui.document.defaultView.Event('input'));assert.equal(field('Subject').value,'P::Item199');assert.equal(field('View name').value,'Item199 view');
 });

test('rapid selections roll back to the displayed view when the latest render fails',async t=>{
 const ui=harness(t),third=personal('third','Example::Third');ui.api.importProject({sysmlViews:[first,second,third]});ui.context.report=ui.report();ui.api.onReport(ui.context.report);await ui.flushTimers();await ui.api.open('sysml:first');
 const slow=deferred();ui.mountPlans.set('#tree:Example::Second',slow);const secondOpen=ui.api.open('sysml:second');await drain();const failed=deferred();failed.reject(Error('Third view unavailable'));ui.mountPlans.set('#tree:Example::Third',failed);await ui.api.open('sysml:third');slow.resolve();await secondOpen;
 assert.equal(ui.api.snapshot().selected,'sysml:first');assert.equal(ui.api.reader().target,'Example::First');assert.equal(ui.canvas().querySelector('[data-engine-view]').dataset.engineView,'#tree:Example::First');
});

test('a personal semantic view survives editing and revalidation against the new accepted revision',async t=>{
 const ui=harness(t);await ui.load('sysml:first');ui.api.invalidate();ui.context.report=null;ui.api.beginReport();const next={...ui.report(),source:'package Example { part changed; }',sourceSha256:'b'.repeat(64)};ui.context.report=next;ui.api.onReport(next);await ui.flushTimers();assert.equal(ui.requests.at(-1).sourceSha256,next.sourceSha256);assert.equal(ui.api.snapshot().selected,'sysml:first');assert.equal(ui.api.reader().target,'Example::First');assert.equal(ui.api.reader().sourceSha256,next.sourceSha256);
});

test('an intentional component focus opens its definition instead of restoring a prior personal view',async t=>{
 const ui=harness(t);await ui.load('sysml:first');const data={...ui.report(),views:[{id:'focused',targets:['Example::Second'],view:'INTERCONNECTION'}]};ui.api.beginReport(data,false,{target:'Example::Second'});ui.context.report=data;ui.api.core(0);ui.api.onReport(data);await ui.flushTimers();assert.equal(ui.requests.at(-1).view,'#interconnection:Example::Second');assert.equal(ui.api.reader().target,'Example::Second');assert.equal(ui.api.snapshot().selected,'review:focused');await ui.api.open('sysml:first');assert.equal(ui.api.reader().target,'Example::First');
});

test('interface and exhibited behavior subjects retain the chosen semantic target and useful notation',async t=>{
 const ui=harness(t);await ui.load();const cases=[['InterfaceDefinition','interconnection'],['ExhibitStateUsage','state'],['PerformActionUsage','action']];const data={...ui.report(),elements:cases.map(([metaclass],i)=>({qualifiedName:'P::Subject'+i,name:'Subject'+i,metaclass}))};ui.context.report=data;ui.api.onReport(data);for(const [i,[,notation]] of cases.entries()){ui.api.create('P::Subject'+i);assert.equal(ui.document.querySelector('[aria-label="Subject"]').value,'P::Subject'+i);assert.equal(ui.document.querySelector('[aria-label="Diagram kind"]').value,notation);ui.document.querySelector('dialog').close();}
});

test('failed first engine drawing replaces pending placeholder and retry mounts the exact view',async t=>{
 const ui=harness(t);await ui.load();const data={...ui.report(),views:[{id:'focused',targets:['Example::Second'],view:'STATE',error:'Legacy scope limit',engineView:{supported:true,sourceSha256,viewquery:'#state:Example::Second',kind:'state',nodeCount:3,rowCount:0}}]};ui.context.report=data;ui.api.onReport(data);ui.canvas().textContent='Preparing SysML view';
 const failure=deferred();ui.fetchPlans.set('#state:Example::Second',failure);const opening=ui.api.open('review:focused');failure.reject(Error('Worker rendering failed'));await opening;
 assert.equal(ui.api.reader(),null);assert.doesNotMatch(ui.canvas().textContent,/Preparing/);assert.match(ui.canvas().textContent,/Worker rendering failed/);assert.equal(ui.statuses.at(-1)[0],'View could not be opened · retry available');
 const retry=[...ui.canvas().querySelectorAll('button')].find(b=>b.textContent==='Retry view');assert.ok(retry);assert.equal(retry.hidden,false);
 ui.fetchPlans.delete('#state:Example::Second');retry.click();await drain();
 assert.equal(ui.requests.at(-1).view,'#state:Example::Second');assert.equal(ui.api.snapshot().selected,'review:focused');assert.equal(ui.api.reader().target,'Example::Second');assert.equal(ui.api.reader().sourceSha256,sourceSha256);assert.equal(ui.canvas().querySelector('[data-engine-view]').dataset.engineView,'#state:Example::Second');assert.equal(ui.statuses.at(-1)[0],'SysML view ready');
});

test('an unmatched view search shows zero of total with empty groups hidden and clearing restores the list',async t=>{
 const ui=harness(t);await ui.load();
 const search=ui.document.getElementById('view-search'),count=ui.document.getElementById('view-count'),empty=ui.document.getElementById('no-views');
 assert.equal(count.textContent,'2 views');assert.equal(empty.hidden,true);
 search.value='no matching architecture';search.dispatchEvent(new ui.document.defaultView.Event('input'));
 assert.equal(count.textContent,'0 / 2');assert.equal(empty.hidden,false);
 assert.ok([...ui.document.querySelectorAll('#views button[data-view-key]')].every(button=>button.hidden));
 assert.ok([...ui.document.querySelectorAll('#views .view-group')].every(heading=>heading.hidden));
 search.value='';search.dispatchEvent(new ui.document.defaultView.Event('input'));
 assert.equal(count.textContent,'2 views');assert.equal(empty.hidden,true);
 assert.equal(ui.document.querySelectorAll('#views button[data-view-key]:not([hidden])').length,2);
 assert.equal(ui.document.querySelectorAll('#views .view-group:not([hidden])').length,1);
});

test('a review route filter preserves original review indices and leaves personal views available',async t=>{
 const ui=harness(t);await ui.load();const shown=[];ui.context.routeIndices=()=>[1];ui.context.show=index=>shown.push(index);
 const data={...ui.report(),views:[{id:'first-review',targets:['Example::First'],view:'TREE'},{id:'second-review',targets:['Example::Second'],view:'TREE'}]};
 ui.context.report=data;ui.api.onReport(data);
 assert.equal(ui.document.querySelector('[data-view-key="review:first-review"]'),null);
 assert.ok(ui.document.querySelector('[data-view-key="review:second-review"]'));
 assert.ok(ui.document.querySelector('[data-view-key="sysml:first"]'));assert.ok(ui.document.querySelector('[data-view-key="sysml:second"]'));
 assert.equal(ui.document.getElementById('view-count').textContent,'3 views');
 await ui.api.open('review:second-review');assert.deepEqual(shown,[1],'the allowed second review retains its original index');
 assert.equal(ui.api.snapshot().selected,'review:second-review');
});


// Explicit declarations follow the larger self-model's surfaces.sysml:623–624
// and pipeline.sysml:728–731. This fixture intentionally keeps occurrence and
// definition in different packages, as the real source does.
function navigationReport(ui){
 const e=(sessionElementId,name,qualifiedName,metaclass,owner,type=[])=>({sessionElementId,name,qualifiedName,metaclass,semantics:{owner:owner?{id:owner}:null,type}});
 return {...ui.report(),elements:[
  e('surfaces','OpenSysMLSurfaces','OpenSysMLSurfaces','Package'),
  e('toolchain','Toolchain','OpenSysMLSurfaces::Toolchain','PartDefinition','surfaces'),
  e('pipeline','pipeline','OpenSysMLSurfaces::Toolchain::pipeline','PartUsage','toolchain',[{id:'analysis'}]),
  e('pipeline-package','OpenSysMLPipeline','OpenSysMLPipeline','Package'),
  e('analysis','AnalysisPipeline','OpenSysMLPipeline::AnalysisPipeline','PartDefinition','pipeline-package'),
  e('sources','sources','OpenSysMLPipeline::AnalysisPipeline::sources','PartUsage','analysis'),
  e('authored','pipelineStructure','OpenSysMLViews::pipelineStructure','ViewUsage')
 ],views:[{id:'overview',targets:['OpenSysMLSurfaces::Toolchain'],view:'INTERCONNECTION'}],
 viewRecipes:[{id:'overview',names:['OpenSysMLSurfaces::Toolchain'],view:'INTERCONNECTION',renderer:'engineering'}]};
}
async function loadNavigation(ui){
 ui.api.importProject({sysmlViews:[first,second],selectedView:'sysml:first'});const data=navigationReport(ui);ui.context.report=data;ui.api.onReport(data);await ui.flushTimers();return data;
}
function setSearch(ui,value){const input=ui.document.getElementById('model-search');input.value=value;input.dispatchEvent(new ui.document.defaultView.Event('input'))}
const locationButton=(ui,name)=>[...ui.document.querySelectorAll('.model-location button')].find(b=>b.textContent===name);
const viewKeys=ui=>[...ui.document.querySelectorAll('#views [data-view-key]')].map(b=>b.dataset.viewKey);

test('occurrence to definition and Back restore the semantic location, search, hierarchy and useful view registry',async t=>{
 const ui=harness(t),data=await loadNavigation(ui),usage=data.elements.find(e=>e.sessionElementId==='pipeline'),definition=data.elements.find(e=>e.sessionElementId==='analysis');
 const keys=viewKeys(ui);assert.deepEqual(keys,['review:overview','authored:OpenSysMLViews::pipelineStructure','sysml:first','sysml:second']);
 ui.api.reveal(usage);assert.ok(ui.document.querySelector('[aria-label="Collapse OpenSysMLSurfaces"]'));assert.ok(ui.document.querySelector('[aria-label="Collapse Toolchain"]'));
 assert.equal(ui.document.querySelector('#model-tree [aria-current="true"]').dataset.modelTarget,usage.qualifiedName);
 setSearch(ui,'pipeline occurrence');await ui.api.navigate(usage);
 assert.equal(ui.requests.at(-1).view,'#interconnection:OpenSysMLSurfaces::Toolchain::pipeline');
 assert.equal(ui.document.querySelector('.model-role').textContent,'Occurrence');
 assert.ok(locationButton(ui,'Definition: AnalysisPipeline'));
 setSearch(ui,'pipeline');locationButton(ui,'Definition: AnalysisPipeline').click();await drain();
 assert.equal(ui.requests.at(-1).view,'#interconnection:OpenSysMLPipeline::AnalysisPipeline');assert.equal(ui.document.querySelector('.model-role').textContent,'Definition');
 assert.ok(locationButton(ui,'Usages (1)'));
 await ui.api.back();
 assert.equal(ui.requests.at(-1).view,'#interconnection:OpenSysMLSurfaces::Toolchain::pipeline');
 assert.equal(ui.api.reader().target,usage.qualifiedName);assert.equal(ui.document.getElementById('model-search').value,'pipeline');
 assert.equal(ui.document.querySelector('#model-tree [aria-current="true"]').dataset.modelTarget,usage.qualifiedName);
 assert.equal(ui.document.querySelector('.model-role').textContent,'Occurrence');
 assert.deepEqual(viewKeys(ui),keys);assert.deepEqual(JSON.parse(JSON.stringify(ui.api.snapshot().views)),[first,second]);
 setSearch(ui,'');assert.ok(ui.document.querySelector('[aria-label="Collapse OpenSysMLSurfaces"]'));assert.ok(ui.document.querySelector('[aria-label="Collapse Toolchain"]'));
 assert.equal(ui.document.querySelector('[data-model-target="OpenSysMLSurfaces::Toolchain::pipeline"]').parentElement.nextElementSibling?.classList.contains('model-children')||false,false,'occurrence has no fabricated inherited branch');
 await ui.api.forward();assert.equal(ui.requests.at(-1).view,'#interconnection:OpenSysMLPipeline::AnalysisPipeline');assert.equal(ui.document.getElementById('model-search').value,'pipeline');
 await ui.api.open('sysml:second');assert.equal(ui.api.reader().target,second.target);assert.deepEqual(viewKeys(ui),keys);
});

test('a failed navigation preserves current occurrence and does not become a Back or Forward destination',async t=>{
 const ui=harness(t),data=await loadNavigation(ui),usage=data.elements.find(e=>e.sessionElementId==='pipeline'),definition=data.elements.find(e=>e.sessionElementId==='analysis');
 await ui.api.navigate(usage);const displayed=ui.mounts.at(-1),failure=deferred();ui.fetchPlans.set('#interconnection:'+definition.qualifiedName,failure);
 const opening=ui.api.navigate(definition);failure.reject(Error('Definition unavailable'));assert.equal(await opening,false);
 assert.equal(ui.api.reader().target,usage.qualifiedName);assert.equal(displayed.controller.disposed,false);
 assert.equal(ui.document.querySelector('[aria-label="Forward to next model view"]').disabled,true);
 await ui.api.back();assert.equal(ui.api.reader().target,first.target,'Back returns to prior saved view, skipping failed definition');
 await ui.api.forward();assert.equal(ui.api.reader().target,usage.qualifiedName,'Forward restores the successful occurrence only');
 assert.equal(ui.document.querySelector('[aria-label="Forward to next model view"]').disabled,true);
});

test('a late occurrence render cannot replace a newer definition or add a ghost history entry',async t=>{
 const ui=harness(t),data=await loadNavigation(ui),usage=data.elements.find(e=>e.sessionElementId==='pipeline'),definition=data.elements.find(e=>e.sessionElementId==='analysis');
 const slow=deferred();ui.mountPlans.set('#interconnection:'+usage.qualifiedName,slow);
 const old=ui.api.navigate(usage);await drain();assert.equal(await ui.api.navigate(definition),true);slow.resolve();assert.equal(await old,false);
 assert.equal(ui.api.reader().target,definition.qualifiedName);assert.equal(ui.canvas().querySelector('[data-engine-view]').dataset.engineView,'#interconnection:'+definition.qualifiedName);
 assert.equal(ui.mounts.find(m=>m.view==='#interconnection:'+usage.qualifiedName).controller.disposed,true);
 await ui.api.back();assert.equal(ui.api.reader().target,first.target,'stale completion never inserts occurrence into history');
});

test('opening a replacement project clears previous navigation, search and expansion state',async t=>{
 const ui=harness(t),data=await loadNavigation(ui),usage=data.elements.find(e=>e.sessionElementId==='pipeline');
 ui.api.reveal(usage);await ui.api.navigate(usage);setSearch(ui,'old pipeline');
 const replacement={...ui.report(),source:'package Replacement;',sourceSha256:'b'.repeat(64),elements:[{sessionElementId:'new-root',name:'Replacement',qualifiedName:'Replacement',metaclass:'Package',semantics:{}}]};
 ui.api.importProject({sysmlViews:[second],selectedView:'sysml:second'});ui.context.report=replacement;ui.api.onReport(replacement);await ui.flushTimers();
 assert.equal(ui.api.reader().target,second.target);assert.equal(ui.api.reader().sourceSha256,replacement.sourceSha256);
 assert.equal(ui.document.getElementById('model-search').value,'');assert.deepEqual(viewKeys(ui),['sysml:second']);
 assert.equal(ui.document.querySelector('[data-model-target="OpenSysMLSurfaces::Toolchain::pipeline"]'),null);
 assert.equal(ui.document.querySelector('#model-tree [aria-current="true"]'),null);
 const back=ui.document.querySelector('[aria-label="Back to previous model view"]');assert.ok(!back||back.disabled);
 const requests=ui.requests.length;await ui.api.back();assert.equal(ui.requests.length,requests,'replacement cannot return to a prior project diagram');
});


test('definition Usages action reveals declared occurrences without changing the open diagram',async t=>{
 const ui=harness(t),data=await loadNavigation(ui),definition=data.elements.find(e=>e.sessionElementId==='analysis');
 await ui.api.navigate(definition);const drawing=ui.mounts.at(-1),requests=ui.requests.length;
 locationButton(ui,'Usages (1)').click();
 assert.equal(ui.requests.length,requests);assert.equal(drawing.controller.disposed,false);assert.equal(ui.api.reader().target,definition.qualifiedName);
 assert.equal(ui.document.querySelector('#model-tree [role="status"]').textContent,'Usages of AnalysisPipeline');
 const uses=[...ui.document.querySelectorAll('#model-tree [data-model-target]')];assert.deepEqual(uses.map(b=>b.dataset.modelTarget),['OpenSysMLSurfaces::Toolchain::pipeline']);
 assert.match(uses[0].textContent,/Occurrence · AnalysisPipeline/);
 assert.ok([...ui.document.querySelectorAll('#model-tree button')].some(b=>b.textContent==='Browse hierarchy'));
});


function button(ui,text){const result=[...ui.document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(result,'Expected button: '+text);return result}
function changeDepth(ui,value){const control=ui.document.querySelector('[aria-label="Diagram depth"]');control.value=String(value);control.dispatchEvent(new ui.document.defaultView.Event('change'))}

test('exploring at depth four redraws the exact occurrence and Back retains that presentation depth',async t=>{
 const ui=harness(t),data=await loadNavigation(ui),usage=data.elements.find(e=>e.sessionElementId==='pipeline'),definition=data.elements.find(e=>e.sessionElementId==='analysis');
 await ui.api.navigate(usage);const requests=ui.requests.length;changeDepth(ui,4);await drain();
 assert.equal(ui.requests.length,requests+1);assert.equal(ui.requests.at(-1).view,'#interconnection:'+usage.qualifiedName);
 assert.equal(ui.mounts.at(-1).options.depth,4,'depth is supplied to the diagram renderer');assert.equal(ui.api.reader().depth,4);
 await ui.api.navigate(definition);await ui.api.back();
 assert.equal(ui.requests.at(-1).view,'#interconnection:'+usage.qualifiedName);assert.equal(ui.mounts.at(-1).options.depth,4);assert.equal(ui.api.reader().depth,4);assert.equal(ui.document.querySelector('[aria-label="Diagram depth"]').value,'4');
});

test('deleting a personal view removes all historical routes that could resurrect it',async t=>{
 const ui=harness(t),data=await loadNavigation(ui),usage=data.elements.find(e=>e.sessionElementId==='pipeline');
 await ui.api.navigate(usage);await ui.api.open('sysml:first');button(ui,'Edit view').click();button(ui,'Delete view').click();await drain();
 assert.equal(ui.api.has('sysml:first'),false);assert.deepEqual(JSON.parse(JSON.stringify(ui.api.snapshot().views)),[second]);
 const requests=ui.requests.length;await ui.api.back();assert.equal(ui.api.reader().target,usage.qualifiedName,'Back skips the deleted saved view and returns to a valid occurrence');
 await ui.api.back();assert.equal(ui.requests.length,requests+1,'no older copy of the deleted view can be drawn');
 assert.equal(ui.document.querySelector('[aria-label="Back to previous model view"]').disabled,true);
 assert.ok(ui.requests.slice(requests).every(request=>request.view!=='#tree:'+first.target));assert.equal(ui.api.has('sysml:first'),false);
});

test('older history resolves the current personal recipe after rename and depth edit',async t=>{
 const ui=harness(t),data=await loadNavigation(ui),usage=data.elements.find(e=>e.sessionElementId==='pipeline'),definition=data.elements.find(e=>e.sessionElementId==='analysis');
 await ui.api.navigate(usage);await ui.api.open('sysml:first');
 button(ui,'Edit view').click();ui.document.querySelector('[aria-label="View name"]').value='Renamed engineering view';button(ui,'Keep changes').click();await drain();changeDepth(ui,4);await drain();
 await ui.api.navigate(definition);await ui.api.back();assert.equal(ui.api.reader().name,'Renamed engineering view');assert.equal(ui.api.reader().depth,4);
 await ui.api.back();assert.equal(ui.api.reader().target,usage.qualifiedName);
 await ui.api.back();assert.equal(ui.requests.at(-1).view,'#tree:'+first.target);assert.equal(ui.api.reader().name,'Renamed engineering view','the original history entry must not restore its stale name');assert.equal(ui.api.reader().depth,4,'the original history entry must not restore its stale depth');assert.equal(ui.mounts.at(-1).options.depth,4);
});

test('first occurrence navigation and history refresh saved-state status after committing the history change',async t=>{
 const ui=harness(t),data=await loadNavigation(ui),usage=data.elements.find(e=>e.sessionElementId==='pipeline'),baseline=JSON.parse(JSON.stringify(ui.api.snapshot()));
 await ui.api.navigate(usage);assert.deepEqual(ui.refreshSnapshots.at(-1),baseline,'the final refresh keeps the saved selected view while browsing an occurrence');
 await ui.api.back();assert.deepEqual(ui.refreshSnapshots.at(-1),baseline);assert.equal(ui.api.reader().target,first.target);
 await ui.api.forward();assert.deepEqual(ui.refreshSnapshots.at(-1),baseline,'Forward also refreshes after restoring navigation history');assert.equal(ui.api.reader().target,usage.qualifiedName);
});
