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
 const ids=['views','view-count','view-search','no-views','model-tree','model-search','model-navigation-note','customize','canvas','scope-surfaces','view-title','view-purpose','view-notation','scope','reference','explanation','fit','minus','plus','readable','actual'];
 const dom=new JSDOM('<!doctype html><html><head></head><body><div class="canvas-tools"></div>'+ids.map(id=>['view-search','model-search'].includes(id)?`<input id="${id}">`:`<div id="${id}"></div>`).join('')+'</body></html>');
 t.after(()=>dom.window.close());
 const window=dom.window,document=window.document,timers=[],requests=[],mounts=[],statuses=[],diagnostics=[];
 const mountPlans=new Map(),fetchPlans=new Map();
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true};window.HTMLDialogElement.prototype.close=function(){this.open=false};
 window.browserLabReady=true;
 window.scopeWorkbench={export:()=>[],leave(){},openSaved(){throw Error('Unexpected analytical view')},create(){}};
 window.labWorkflow={sourceWitness:()=>true,refreshState(){}};
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
 return{api,context,document,report,load,flushTimers,timers,requests,mounts,mountPlans,fetchPlans,statuses,diagnostics,canvas:()=>document.getElementById('canvas')};
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
