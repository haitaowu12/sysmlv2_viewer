/* One view registry. Engine drawing IDs never become saved model identity. */
((root) => {
  const NOTATIONS = {tree:'Structure',interconnection:'Interconnections',state:'States',action:'Actions',requirement:'Requirements',definition:'Definitions',package:'Packages'};
  function admitViews(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 30) throw Error('A project supports up to 30 personal SysML views.');
    const ids = new Set();
    return value.map(v => {
      if (!v || v.kind !== 'sysml' || typeof v.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(v.id) || ids.has(v.id) || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 80 || typeof v.target !== 'string' || !v.target || v.target.length > 1000 || !Object.hasOwn(NOTATIONS,v.notation) || !Number.isInteger(v.depth) || v.depth < 1 || v.depth > 4) throw Error('Invalid personal SysML view. Choose a name, model subject, diagram kind and depth.');
      ids.add(v.id);
      return {kind:'sysml',id:v.id,name:v.name.trim(),target:v.target,notation:v.notation,depth:v.depth};
    });
  }
  function viewRegistry(configured, analytical, authored, personal) {
    return [
      ...configured.map((v,index)=>({key:'review:'+v.id,kind:'review',name:v.label||v.id,index,...(v.engineRecipe?{target:v.engineRecipe.names[0],notation:v.engineRecipe.view.toLowerCase(),engine:true}:{}),detail:v.engineRecipe?'SysML review view':'Review view'})),
      ...authored.map(e=>({key:'authored:'+e.qualifiedName,kind:'authored',name:e.name||e.qualifiedName,target:e.qualifiedName,detail:'Authored SysML view',element:e})),
      ...personal.map(v=>({...v,key:'sysml:'+v.id,detail:NOTATIONS[v.notation]+' · personal SysML view'})),
      ...analytical.map(v=>({key:'analytical:'+v.name,kind:'analytical',name:v.name,detail:'Analytical '+(v.surface==='diagram'?'diagram':v.surface||'diagram')})),
    ];
  }
  function sourceSlice(source,origin){
    const lines=source.split('\n'),startLine=origin.startLine,endLine=origin.endLine;
    if(!Number.isInteger(startLine)||startLine<1||!Number.isInteger(endLine)||endLine<startLine||endLine>lines.length)return null;
    function columnOffset(text,column){if(!Number.isInteger(column)||column<1)return null;let bytes=0,offset=0;for(const char of text){if(bytes===column-1)return offset;const cp=char.codePointAt(0);bytes+=cp<=0x7f?1:cp<=0x7ff?2:cp<=0xffff?3:4;offset+=char.length;if(bytes>column-1)return null}return bytes===column-1?offset:null}
    const startColumn=columnOffset(lines[startLine-1],origin.startCol??1),endColumn=origin.endCol===undefined?lines[endLine-1].length:columnOffset(lines[endLine-1],origin.endCol);
    if(startColumn===null||endColumn===null)return null;
    const start=lines.slice(0,startLine-1).reduce((n,l)=>n+l.length+1,0)+startColumn;
    const end=lines.slice(0,endLine-1).reduce((n,l)=>n+l.length+1,0)+endColumn;if(end<start)return null;
    return {start,end,text:source.slice(start,end)};
  }
  const helpers={admitViews,viewRegistry,NOTATIONS,sourceSlice};
  if (typeof module !== 'undefined') module.exports=helpers;
  root.labViewDefinitions=helpers;
  if (!root.document || !root.browserLabReady) return;

  const el=id=>document.getElementById(id),make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
  const action=(text,run)=>{const b=make('button',text);b.type='button';b.addEventListener('click',run);return b};
  let personal=[],selectedKey=null,committedKey=null,pendingSelection=null,basis=null,registry=[],controller=null,mounted=null,ticket=0,modelPage=0,sourceElements=[],restoringReport=false,priorSelection=null;
  const dialog=make('dialog');dialog.id='sysml-view-dialog';dialog.setAttribute('aria-label','Create a view');document.body.append(dialog);
  const tools=make('div');tools.className='sysml-view-tools';tools.hidden=true;
  const depthLabel=make('label','Depth '),depth=make('select');depth.setAttribute('aria-label','Diagram depth');
  for(let i=1;i<=4;i++){const o=make('option',String(i));o.value=String(i);depth.append(o)}depth.value='2';depthLabel.append(depth);
  const saveAs=action('Save as view',()=>createDialog(current()?.target));
  const manage=action('Edit view',()=>manageView());manage.hidden=true;
  tools.append(depthLabel,saveAs,manage,action('Full canvas',()=>toggleCanvas()));
  document.querySelector('.canvas-tools').after(tools);
  const expand=action('Full canvas',()=>toggleCanvas());expand.id='full-canvas';document.querySelector('.canvas-tools').append(expand);
  const style=make('style');style.textContent=`
    .sysml-view-tools{display:flex;align-items:center;gap:12px;padding:5px 28px 10px;font-size:12px}.sysml-view-tools[hidden]{display:none}.sysml-view-tools label{display:flex;align-items:center;gap:6px}.sysml-view-tools select{min-width:50px}.view-group{margin:12px 6px 5px;font-size:11px;color:var(--muted)}#views .workspace-view{grid-template-columns:1fr}#views .workspace-view small{display:block;font-size:10px;color:var(--muted);overflow-wrap:anywhere}.model-result{display:block;width:100%;text-align:left;margin-bottom:4px}.model-result small{display:block;color:var(--muted);font-size:10px;overflow-wrap:anywhere}.model-kind-filter{width:100%;margin-bottom:8px}.model-context{font-size:11px;color:var(--muted);overflow-wrap:anywhere}body.diagram-expanded main{grid-template-columns:minmax(0,1fr)}body.diagram-expanded main.has-inspector{grid-template-columns:minmax(0,1fr) 300px}body.diagram-expanded .workspace{grid-column:1;grid-row:1}body.diagram-expanded .inspector{grid-column:2;grid-row:1}.diagram-expanded .navigation{display:none}.diagram-expanded #canvas{min-height:380px}#canvas.engine-diagram{padding:8px;min-height:360px;position:relative}.engine-view-active .canvas-tools{display:none}#canvas.engine-diagram{flex:1 1 200px;min-height:240px;overflow:hidden}#canvas.engine-diagram .lab-donor-diagram{height:100%;display:flex;flex-direction:column}#canvas.engine-diagram .diagram-stage{flex:1;min-height:200px;height:auto}#canvas.engine-diagram svg.opensysml-canvas{height:100%;max-height:none}#sysml-view-dialog label{display:block;margin:12px 0;font-size:12px}#sysml-view-dialog input,#sysml-view-dialog select{display:block;width:100%;margin-top:5px}#sysml-view-dialog .dialog-actions{display:flex;gap:8px;justify-content:flex-end}.sysml-origin-context{font-size:11px;color:var(--muted)}@media(max-width:900px){body.diagram-expanded main.has-inspector{grid-template-columns:minmax(0,1fr)}body.diagram-expanded .inspector{grid-column:1;grid-row:2}.sysml-view-tools{padding-left:14px;flex-wrap:wrap}}
  `;document.head.append(style);
  function toggleCanvas(){const wide=document.body.classList.toggle('diagram-expanded');for(const b of [expand,...tools.querySelectorAll('button')].filter(b=>['Full canvas','Restore panels'].includes(b.textContent)))b.textContent=wide?'Restore panels':'Full canvas';requestAnimationFrame(()=>controller?controller.fit():fit(false))}
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')&&document.body.classList.contains('diagram-expanded'))toggleCanvas()});
  function sourceOwned(e){return !!root.labWorkflow?.sourceWitness?.(e,basis?.source)}
  function elements(){return sourceElements}
  function authored(){return elements().filter(e=>e.metaclass==='ViewUsage')}
  function current(){return registry.find(v=>v.key===selectedKey)}
  function rebuild(){
    if(!basis)return;
    registry=viewRegistry(basis.views.map(v=>{const recipe=(basis.viewRecipes||[]).find(r=>r.id===v.id)||(v.id==='focused'&&v.targets?.length===1&&v.view==='INTERCONNECTION'?{names:v.targets,view:v.view,renderer:'engineering'}:null);return {...v,label:viewLabel(v.id),engineRecipe:recipe?.names?.length===1&&['engineering','behavior'].includes(recipe.renderer)&&Object.hasOwn(NOTATIONS,recipe.view.toLowerCase())?recipe:null}}),root.scopeWorkbench?.export()||[],authored(),personal);
    const host=el('views');host.replaceChildren();let group='';
    for(const item of registry){
      const next={review:'Review views',authored:'From the model',sysml:'My SysML views',analytical:'Analytical views'}[item.kind];
      if(next!==group){host.append(make('p',next));host.lastChild.className='view-group';group=next}
      const b=action(human(item.name),()=>open(item.key));b.className='workspace-view';b.dataset.viewKey=item.key;b.append(make('small',item.detail));
      b.classList.toggle('active',item.key===selectedKey);if(item.key===selectedKey)b.setAttribute('aria-current','true');host.append(b);
    }
    el('view-count').textContent=registry.length+' views';filter();
  }
  function filter(){const terms=el('view-search').value.toLowerCase().trim().split(/\s+/).filter(Boolean);for(const b of el('views').querySelectorAll('button[data-view-key]'))b.hidden=!terms.every(t=>b.textContent.toLowerCase().includes(t))}
  el('view-search').addEventListener('input',filter);
  function leave(){ticket++;controller?.dispose();controller=null;mounted=null;tools.hidden=true;el('canvas').classList.remove('engine-diagram');document.body.classList.remove('engine-view-active');}
  async function open(key){
    const item=registry.find(v=>v.key===key);if(!item||!basis||busy)return;
    if(item.kind==='review'&&(!item.engine||stakeholderMode())){leave();selectedKey=key;show(item.index);rebuild();return}
    if(item.kind==='analytical'){leave();selectedKey=key;root.scopeWorkbench.openSaved(item.name);rebuild();return}
    const previousKey=selectedKey;await draw(item,previousKey);
  }
  async function draw(item,previousKey=selectedKey){
    const base=basis,revision=base.sourceSha256,request=++ticket;
    status('Rendering SysML view…');
    const view=item.kind==='authored'?item.target:'#'+item.notation+':'+item.target;
    try{
      const response=await fetch('/diagram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceSha256:revision,view,ports:'full'})}),data=await response.json();
      if(data.error)throw Error(data.error);if(request!==ticket||basis!==base||report!==base)return;
      if(data.sourceSha256!==revision)throw Error('Model changed while this diagram was rendering.');
      if(!root.labDiagramRenderer)throw Error('The SysML diagram renderer has not loaded. Try the view again.');
      const staged=document.createElement('div');
      const selectedDepth=item.depth||Number(depth.value)||2;
      const graph=data.graph;
      const nextController=await root.labDiagramRenderer.mountDiagram(staged,graph,{audience:stakeholderMode()?'stakeholder':'engineering',depth:selectedDepth,onSelect:(origin,context)=>inspectOrigin(origin,context)});
      if(request!==ticket||basis!==base){nextController.dispose();return}
      controller?.dispose();root.scopeWorkbench.leave();resetStory();clearSelection();el('canvas').replaceChildren(...staged.childNodes);el('canvas').classList.remove('fit');el('canvas').classList.add('engine-diagram');document.body.classList.add('engine-view-active');el('scope-surfaces').hidden=true;tools.hidden=false;controller=nextController;manage.hidden=item.kind!=='sysml';saveAs.hidden=item.kind==='authored';depth.value=String(selectedDepth);selectedKey=item.key;committedKey=item.key;mounted={name:item.name,target:item.target,kind:graph.kind,depth:selectedDepth,sourceSha256:revision,notices:[...new Set([...(graph.notices||[]),...(controller.summary?.notices||[])])]};controller.fit();
      el('view-title').textContent=human(item.name);el('view-purpose').textContent=human(item.target)+(item.kind==='authored'?' · view declared in source':'');
      el('view-notation').textContent=(stakeholderMode()?'Stakeholder · ':'SysML · ')+human(graph.kind);
      el('scope').textContent='Revision '+revision.slice(0,12);el('scope').title=item.target;el('reference').disabled=true;
      el('explanation').replaceChildren();
      const notices=[...new Set([...(graph.notices||[]),...(controller.summary?.notices||[])])];
      if(notices.length){const details=make('details');details.append(make('summary','View scope and limitations'));for(const n of notices)details.append(make('p',n));el('explanation').append(details)}
      for(const id of ['fit','minus','plus','readable','actual'])el(id).disabled=false;
      rebuild();root.syncSysmlReturn?.();status('SysML view ready','valid');root.labWorkflow.refreshState();
    }catch(error){if(request!==ticket||basis!==base)return;selectedKey=committedKey||previousKey;status('View could not be opened · previous drawing retained','error');setRuntimeDiagnostic(error);rebuild()}
  }
  depth.addEventListener('change',()=>{const item=current();if(!item||!['authored','sysml','review'].includes(item.kind))return;const d=Number(depth.value);if(item.kind==='sysml'){personal=personal.map(v=>v.id===item.id?{...v,depth:d}:v);rebuild()}draw({...item,depth:d})});
  async function inspectOrigin(origin,context={}){
    if(!origin||!basis||basis!==report)return;inspectionEpoch++;
    if(origin.file&&origin.file!=='<content>'){openInspector();el('selected').textContent=context.element?.name||'External declaration';el('selection-meta').textContent=origin.file+' · line '+origin.startLine;el('snippet').textContent='';el('selection-hint').hidden=false;el('selection-hint').textContent='This declaration belongs to an engine library, outside the opened model source.';el('explore-selection').replaceChildren();selected=null;el('jump-source').hidden=true;return}
    const line=origin.startLine,end=origin.endLine;if(!Number.isInteger(line)||line<1||!Number.isInteger(end)||end<line)return;
    const span=sourceSlice(basis.source,origin);if(!span)return;
    const candidates=elements().filter(e=>e.line===line&&e.endLine===end&&e.source?.trim()===span.text.trim());
    if(candidates.length===1){const e=candidates[0],base=basis;await inspect(e.sessionElementId);if(basis!==base||report!==base||selected?.sessionElementId!==e.sessionElementId)return;selected={...selected,startOffset:span.start,endOffset:span.end};inspectionActions(e);return}
    openInspector();el('selected').textContent=context.element?.name||context.element?.type||'Model declaration';el('selection-meta').textContent='Source line '+line+' · '+(context.kind||'diagram element');
    el('selection-hint').textContent='Selected from the current SysML view.';el('selection-hint').hidden=false;el('snippet').textContent=span.text;el('explore-selection').replaceChildren();
    selected={line,endLine:end,startOffset:span.start,endOffset:span.end,source:span.text};el('jump-source').hidden=false;
  }

  function inspectionActions(e){
    const panel=el('explore-selection');panel.replaceChildren();if(/^Part/.test(e.metaclass)&&root.openSysmlComponent)panel.append(action('Open SysML view',()=>root.openSysmlComponent(e.qualifiedName)));panel.append(action('Create SysML view',()=>createDialog(e.qualifiedName)));
    for(const type of e.semantics?.type||[]){const definition=elements().find(x=>(type.qualifiedName&&x.qualifiedName===type.qualifiedName)||(type.id&&x.sessionElementId===type.id));if(definition)panel.append(action((/^Part/.test(definition.metaclass)?'Open definition: ':'Create definition view: ')+human(definition.name||definition.qualifiedName),()=>root.openSysmlComponent&&/^Part/.test(definition.metaclass)?root.openSysmlComponent(definition.qualifiedName):createDialog(definition.qualifiedName)))}
  }
  function manageView(){
    const item=current();if(item?.kind!=='sysml')return;dialog.replaceChildren();dialog.append(make('h2','Edit personal view'));const name=field('View name');name.value=item.name;const feedback=make('p');feedback.setAttribute('role','alert');dialog.append(feedback);const buttons=make('div');buttons.className='dialog-actions';
    buttons.append(action('Delete view',()=>{personal=personal.filter(v=>v.id!==item.id);dialog.close();leave();selectedKey=null;rebuild();if(registry[0])open(registry[0].key);root.labWorkflow.refreshState()}),action('Cancel',()=>dialog.close()),action('Keep changes',()=>{try{const next=admitViews(personal.map(v=>v.id===item.id?{...v,name:name.value}:v));personal=next;dialog.close();rebuild();open(item.key);root.labWorkflow.refreshState()}catch(e){feedback.textContent=e.message}}));dialog.append(buttons);dialog.showModal();
  }

  function field(label,tag='input'){const wrap=make('label',label),control=make(tag);control.setAttribute('aria-label',label);wrap.append(control);dialog.append(wrap);return control}
  function createDialog(target){
    if(!basis||busy)return;target=target||current()?.target;dialog.replaceChildren();dialog.append(make('h2','Create a view'));
    const name=field('View name'),find=field('Find a subject'),subject=field('Subject','select'),kind=field('Diagram kind','select');
    for(const [value,label] of Object.entries(NOTATIONS)){const o=make('option',label);o.value=value;kind.append(o)}
    let automaticName='';const choices=elements().filter(e=>!e.qualifiedName.split('::').some(part=>part.startsWith('@'))&&(e.metaclass==='Package'||(/(?:Definition|Usage)$/.test(e.metaclass)&&!/^(View|Metadata|Annotation|Documentation|Comment)/.test(e.metaclass))));
    let preferredTarget=target;
    const update=()=>{const prior=preferredTarget||subject.value,terms=find.value.toLowerCase().trim().split(/\s+/).filter(Boolean);preferredTarget=null;const matched=choices.filter(e=>terms.every(t=>(e.qualifiedName+' '+e.metaclass).toLowerCase().includes(t))),shown=matched.slice(0,200),chosen=matched.find(e=>e.qualifiedName===prior);if(chosen&&!shown.includes(chosen))shown.unshift(chosen);subject.replaceChildren();for(const e of shown){const o=make('option',human(e.qualifiedName)+' · '+human(e.metaclass));o.value=e.qualifiedName;subject.append(o)}if(chosen)subject.value=chosen.qualifiedName};
    find.addEventListener('input',()=>{update();recommend()});update();
    const recommend=()=>{const e=choices.find(e=>e.qualifiedName===subject.value);if(e)kind.value=/^(Part|Port|Interface|Connection)/.test(e.metaclass)?'interconnection':/^(State|ExhibitState)/.test(e.metaclass)?'state':/^(Action|PerformAction)/.test(e.metaclass)?'action':/^Requirement/.test(e.metaclass)?'requirement':'tree';if(!name.value||name.value===automaticName){automaticName=human(e?.name||'System')+' view';name.value=automaticName}};subject.addEventListener('change',recommend);recommend();
    const feedback=make('p');feedback.setAttribute('role','alert');dialog.append(feedback);
    const buttons=make('div');buttons.className='dialog-actions';
    buttons.append(action('Analytical view',()=>{dialog.close();root.scopeWorkbench.create()}),action('Cancel',()=>dialog.close()),action('Create view',async()=>{
      try{const v={kind:'sysml',id:crypto.randomUUID(),name:name.value.trim(),target:subject.value,notation:kind.value,depth:2};personal=admitViews([...personal,v]);rebuild();dialog.close();await open('sysml:'+v.id);root.labWorkflow.refreshState()}catch(e){feedback.textContent=e.message}
    }));dialog.append(buttons);dialog.showModal();
  }
  const modelHost=el('model-tree'),modelFilter=make('select');modelFilter.className='model-kind-filter';modelFilter.setAttribute('aria-label','Model element kind');
  for(const [value,label] of [['','All model elements'],['Part','Components'],['Requirement','Requirements'],['Action|State|Perform|Exhibit','Behavior'],['View','Authored views'],['Package','Packages']]){const o=make('option',label);o.value=value;modelFilter.append(o)}
  el('model-search').after(modelFilter);modelFilter.addEventListener('change',()=>{modelPage=0;renderModel()});el('model-search').addEventListener('input',()=>{modelPage=0;renderModel()});
  function renderModel(){
    if(!basis)return;const terms=el('model-search').value.toLowerCase().trim().split(/\s+/).filter(Boolean),kind=modelFilter.value&&new RegExp('^(?:'+modelFilter.value+')');
    const all=elements().filter(e=>(!kind||kind.test(e.metaclass))&&terms.every(t=>(e.qualifiedName+' '+e.metaclass).toLowerCase().includes(t))).sort((a,b)=>a.qualifiedName.localeCompare(b.qualifiedName));
    modelHost.replaceChildren();modelPage=Math.max(0,Math.min(modelPage,Math.ceil(all.length/50)-1));
    const count=make('p',all.length+' model elements');count.className='model-context';modelHost.append(count);
    for(const e of all.slice(modelPage*50,modelPage*50+50)){
      const b=action(human(e.name||e.qualifiedName),()=>{
        inspect(e.sessionElementId,b);const panel=el('explore-selection');panel.replaceChildren();
        if(e.metaclass==='ViewUsage')panel.append(action('Open authored view',()=>open('authored:'+e.qualifiedName)));
        else inspectionActions(e);
      });b.className='model-result';b.append(make('small',human(e.metaclass)+' · '+e.qualifiedName));modelHost.append(b);
    }
    if(all.length>50){const pages=make('div');const prev=action('Previous',()=>{modelPage--;renderModel()}),next=action('Next',()=>{modelPage++;renderModel()});prev.disabled=modelPage===0;next.disabled=(modelPage+1)*50>=all.length;pages.append(prev,make('span',' '+(modelPage+1)+' / '+Math.ceil(all.length/50)+' '),next);modelHost.append(pages)}
  }
  root.labViews={
    rebuild,filter,renderModel,open,has:key=>registry.some(v=>v.key===key),create:createDialog,leave,
    snapshot:()=>({views:structuredClone(personal),selected:selectedKey}),
    importProject(data){personal=admitViews(data.sysmlViews);pendingSelection=typeof data.selectedView==='string'?data.selectedView:null;selectedKey=null;committedKey=null;leave()},
    restore(state){personal=admitViews(state?.views);pendingSelection=state?.selected||null;selectedKey=null;committedKey=null;leave()},
    beginReport(_data,focused=false,payload={}){priorSelection=focused||payload.target?null:selectedKey;restoringReport=true},
    onReport(data){basis=data;sourceElements=(data.elements||[]).filter(e=>e.qualifiedName&&sourceOwned(e));const chosen=pendingSelection||priorSelection||(!stakeholderMode()&&data.views[active]?'review:'+data.views[active].id:null);pendingSelection=null;restoringReport=false;rebuild();if(chosen&&registry.some(v=>v.key===chosen))selectedKey=chosen;rebuild();renderModel();el('model-search').disabled=false;el('model-navigation-note').hidden=true;el('customize').disabled=false;if(chosen&&registry.some(v=>v.key===chosen))setTimeout(()=>{if(basis===data&&!busy)open(chosen)},0)},
    core(index){leave();committedKey='review:'+report?.views[index]?.id;if(restoringReport)return;selectedKey=committedKey;rebuild()},
    analytical(name){leave();selectedKey='analytical:'+name;committedKey=selectedKey;rebuild()},
    active:()=>!!controller,
    reader:()=>controller&&mounted?structuredClone(mounted):null,
    refresh(){if(current()?.kind==='review'){open(selectedKey);return true}if(controller&&current()){draw(current());return true}return false},
    control(kind,value){if(!controller)return false;if(kind==='fit')controller.fit();else controller.zoom(value);return true},
    invalidate(){leave();committedKey=null;basis=null;registry=[]},
  };
})(typeof window==='undefined'?globalThis:window);
