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
  function acceptsEngineView(report,view){
    const proof=view?.engineView,kind=String(view?.view||'').toLowerCase();return proof?.supported===true&&view.targets?.length===1&&proof.sourceSha256===report.sourceSha256&&proof.viewquery==='#'+kind+':'+view.targets[0]&&proof.kind===kind&&((Number.isInteger(proof.nodeCount)&&proof.nodeCount>0)||(Number.isInteger(proof.rowCount)&&proof.rowCount>0));
  }
  function engineRecipeFor(report,view){return (report.viewRecipes||[]).find(r=>r.id===view.id)||(view.id==='focused'&&view.targets?.length===1&&(view.view==='INTERCONNECTION'||acceptsEngineView(report,view))?{names:view.targets,view:view.view,renderer:['STATE','ACTION'].includes(view.view)?'behavior':'engineering'}:null);}
  function modelIndex(elements){
    const all=new Map(elements.map(e=>[e.sessionElementId,e]));
    const entries=elements.filter(e=>e.sessionElementId&&e.qualifiedName&&typeof e.name==='string'&&e.name&&!e.name.startsWith('@')&&(e.metaclass==='Package'||(/(?:Definition|Usage)$/.test(e.metaclass)&&!/^(Metadata|Annotation|Documentation|Comment)/.test(e.metaclass))));
    const byId=new Map(entries.map(e=>[e.sessionElementId,e])),byName=new Map(),parents=new Map(),children=new Map(),usages=new Map();
    for(const e of entries){const list=byName.get(e.qualifiedName)||[];list.push(e);byName.set(e.qualifiedName,list)}
    const resolve=ref=>{if(!ref)return null;if(typeof ref==='string'){const matches=byName.get(ref);return matches?.length===1?matches[0]:null}return byId.get(ref.id)||(byName.get(ref.qualifiedName)?.length===1?byName.get(ref.qualifiedName)[0]:null)};
    for(const e of entries){let owner=all.get(e.semantics?.owner?.id);const seen=new Set([e.sessionElementId]);while(owner&&!byId.has(owner.sessionElementId)&&!seen.has(owner.sessionElementId)){seen.add(owner.sessionElementId);owner=all.get(owner.semantics?.owner?.id)}if(owner&&!seen.has(owner.sessionElementId))parents.set(e.sessionElementId,owner.sessionElementId)}
    // Source ownership alone supplies ancestry. Cycles never become nested UI.
    for(const e of entries){const seen=new Set([e.sessionElementId]);let id=parents.get(e.sessionElementId);while(id){if(seen.has(id)){parents.delete(e.sessionElementId);break}seen.add(id);id=parents.get(id)}}
    for(const e of entries){const key=parents.get(e.sessionElementId)||null,list=children.get(key)||[];list.push(e);children.set(key,list);if(/Usage$/.test(e.metaclass))for(const type of e.semantics?.type||[]){const definition=resolve(type);if(!definition||!/Definition$/.test(definition.metaclass))continue;const uses=usages.get(definition.sessionElementId)||[];if(!uses.includes(e))uses.push(e);usages.set(definition.sessionElementId,uses)}}
    const sort=(a,b)=>(a.metaclass==='Package'?-1:0)-(b.metaclass==='Package'?-1:0)||a.name.localeCompare(b.name)||a.qualifiedName.localeCompare(b.qualifiedName);
    for(const list of children.values())list.sort(sort);
    const path=e=>{const result=[],seen=new Set();while(e&&!seen.has(e.sessionElementId)){result.unshift(e);seen.add(e.sessionElementId);e=byId.get(parents.get(e.sessionElementId))}return result};
    return {entries,byId,resolve,parents,children,usages,path,types:e=>(e.semantics?.type||[]).map(resolve).filter(e=>e&&/Definition$/.test(e.metaclass))};
  }
  function modelRole(e){return e.metaclass==='Package'?'Package':/Definition$/.test(e.metaclass)?'Definition':/^(Part|Item|Occurrence)Usage$/.test(e.metaclass)?'Occurrence':'Usage'}
  function modelNotation(e){return e.metaclass==='Package'?'package':/^(Part|Port|Interface|Connection)/.test(e.metaclass)?'interconnection':/^(State|ExhibitState)/.test(e.metaclass)?'state':/^(Action|PerformAction)/.test(e.metaclass)?'action':/^Requirement/.test(e.metaclass)?'requirement':'tree'}
  const helpers={admitViews,viewRegistry,NOTATIONS,sourceSlice,acceptsEngineView,engineRecipeFor,modelIndex,modelRole,modelNotation};
  if (typeof module !== 'undefined') module.exports=helpers;
  root.labViewDefinitions=helpers;
  if (!root.document || !root.browserLabReady) return;

  const el=id=>document.getElementById(id),make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
  const action=(text,run)=>{const b=make('button',text);b.type='button';b.addEventListener('click',run);return b};
  let personal=[],selectedKey=null,committedKey=null,pendingSelection=null,basis=null,registry=[],controller=null,mounted=null,ticket=0,modelPage=0,sourceElements=[],restoringReport=false,priorSelection=null,priorLocation=null;
  let index=modelIndex([]),exploration=null,backStack=[],forwardStack=[],expanded=new Set(),modelSelection=null,branchPages=new Map(),usageFilter=null;
  const dialog=make('dialog');dialog.id='sysml-view-dialog';dialog.setAttribute('aria-label','Create a view');document.body.append(dialog);
  const tools=make('div');tools.className='sysml-view-tools';tools.hidden=true;
  const depthLabel=make('label','Depth '),depth=make('select');depth.setAttribute('aria-label','Diagram depth');
  for(let i=1;i<=4;i++){const o=make('option',String(i));o.value=String(i);depth.append(o)}depth.value='2';depthLabel.append(depth);
  const saveAs=action('Save as view',()=>createDialog(current()?.target));
  const manage=action('Edit view',()=>manageView());manage.hidden=true;
  tools.append(depthLabel,saveAs,manage,action('Full canvas',()=>toggleCanvas()));
  const viewOptions=make('details');viewOptions.className='sysml-view-options';viewOptions.hidden=true;viewOptions.append(make('summary','View options'),tools);
  const viewActions=document.querySelector('.view-actions');if(viewActions)viewActions.append(viewOptions);else document.querySelector('.canvas-tools').after(viewOptions);
  document.addEventListener('pointerdown',event=>{if(viewOptions.open&&!viewOptions.contains(event.target))viewOptions.open=false});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')viewOptions.open=false});
  const expand=action('Full canvas',()=>toggleCanvas());expand.id='full-canvas';document.querySelector('.canvas-tools').append(expand);
  const style=make('style');style.textContent=`
    .sysml-view-tools{display:flex;align-items:center;gap:12px;padding:5px 28px 10px;font-size:12px}.sysml-view-tools[hidden]{display:none}.sysml-view-tools label{display:flex;align-items:center;gap:6px}.sysml-view-tools select{min-width:50px}.view-group{margin:12px 6px 5px;font-size:11px;color:var(--muted)}#views .workspace-view{grid-template-columns:1fr}#views .workspace-view small{display:block;font-size:10px;color:var(--muted);overflow-wrap:anywhere}.model-result{display:block;width:100%;text-align:left;margin-bottom:4px}.model-result small{display:block;color:var(--muted);font-size:10px;overflow-wrap:anywhere}.model-kind-filter{width:100%;margin-bottom:8px}.model-context{font-size:11px;color:var(--muted);overflow-wrap:anywhere}body.diagram-expanded main{grid-template-columns:minmax(0,1fr)}body.diagram-expanded main.has-inspector{grid-template-columns:minmax(0,1fr) 300px}body.diagram-expanded .workspace{grid-column:1;grid-row:1}body.diagram-expanded .inspector{grid-column:2;grid-row:1}.diagram-expanded .navigation{display:none}.diagram-expanded #canvas{min-height:380px}#canvas.engine-diagram{padding:8px;min-height:360px;position:relative}.engine-view-active .canvas-tools{display:none}#canvas.engine-diagram{flex:1 1 200px;min-height:240px;overflow:hidden}#canvas.engine-diagram .lab-donor-diagram{height:100%;display:flex;flex-direction:column}#canvas.engine-diagram .diagram-stage{flex:1;min-height:200px;height:auto}#canvas.engine-diagram svg.opensysml-canvas{height:100%;max-height:none}#sysml-view-dialog label{display:block;margin:12px 0;font-size:12px}#sysml-view-dialog input,#sysml-view-dialog select{display:block;width:100%;margin-top:5px}#sysml-view-dialog .dialog-actions{display:flex;gap:8px;justify-content:flex-end}.sysml-origin-context{font-size:11px;color:var(--muted)}@media(max-width:900px){body.diagram-expanded main.has-inspector{grid-template-columns:minmax(0,1fr)}body.diagram-expanded .inspector{grid-column:1;grid-row:2}.sysml-view-tools{padding-left:14px;flex-wrap:wrap}}

    .model-location{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:0 28px 10px;font-size:12px}.model-location[hidden]{display:none}.model-location button{font-size:12px;padding:5px 8px}.model-location nav{display:flex;gap:5px;align-items:center;flex-wrap:wrap;max-width:100%}.model-location nav button{width:auto;display:inline-block;color:var(--accent);padding:3px;border:0;background:transparent}.model-role{color:var(--muted);border-left:1px solid var(--line);padding-left:7px}.model-row{display:flex;align-items:center;gap:2px;min-width:0}.model-result{flex:1;min-width:0;border-color:transparent;background:transparent;padding:6px;text-align:left;overflow-wrap:anywhere}.model-result[aria-current]{background:var(--pale);border-color:var(--accent)}.model-result small{font-size:10px;color:var(--muted);display:block}.model-expand{border:0;background:transparent;padding:6px 2px;min-width:21px}.model-expand:disabled{visibility:hidden}.model-inspect{border:0;background:transparent;padding:5px;color:var(--muted)}.model-children{margin-left:11px;padding-left:5px;border-left:1px solid var(--line)}@media(max-width:900px){.model-location{padding-left:14px}}

    .sysml-view-options{position:relative;font-size:12px}.sysml-view-options[hidden]{display:none}.sysml-view-options>summary{list-style:none;min-height:32px;line-height:22px;padding:5px 10px;border:1px solid var(--line);border-radius:4px;cursor:pointer;background:#fff}.sysml-view-options>summary:focus-visible{outline:3px solid var(--accent)}
    .sysml-view-options .sysml-view-tools{position:absolute;right:0;top:100%;z-index:12;min-width:260px;max-width:min(340px,90vw);padding:12px!important;margin-top:4px;display:flex;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:4px;box-shadow:0 6px 20px #203d4c18}.sysml-view-options .sysml-view-tools[hidden]{display:none}
    .engine-view-active .view-header{align-items:center}.engine-view-active .view-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 10px}.engine-view-active .view-heading .view-notation{margin-top:0}.engine-view-active .view-actions{display:flex;flex-direction:row;align-items:center;gap:6px;flex-wrap:wrap}
    /* Keep discovery controls outside the scrolling result regions. */
    .navigation{display:flex;flex-direction:column;overflow:hidden;min-height:0}.navigation .nav-modes{flex:none}
    #model-browser:not([hidden]),#view-browser:not([hidden]){display:flex;flex-direction:column;min-height:0;flex:1}
    #model-search,.model-kind-filter,#view-search,.navigation .section-heading,#customize{flex:none}
    #model-tree,#views{overflow:auto;min-height:64px;flex:1;overscroll-behavior:contain}#views{display:block}
    #scope-tools{flex:none;max-height:35vh;overflow:auto}.navigation #notation-note{flex:none}
    .engine-view-active .view-header{padding:6px 16px 4px;min-height:0}.engine-view-active #view-purpose{display:none}
    .engine-view-active .model-location{padding:0 16px 6px;gap:4px}.engine-view-active .sysml-view-tools{padding:0 16px 6px;gap:8px}
    .model-location nav{flex:1;min-width:140px;flex-wrap:nowrap;overflow:auto;white-space:nowrap;overscroll-behavior:contain}.model-location nav>*{flex:none}
    #canvas.engine-diagram{min-height:0;flex:1 1 0;padding:6px}#canvas.engine-diagram .lab-donor-diagram{min-height:0}
    #canvas.engine-diagram .diagram-stage{min-height:100px}
    @media(min-width:651px){body.engine-view-active:not(.editing) .workspace{overflow:hidden}}
    @media(max-width:650px){.navigation{max-height:55dvh}#model-browser:not([hidden]),#view-browser:not([hidden]){min-height:150px}#model-tree,#views{max-height:35dvh}#canvas.engine-diagram{min-height:350px;flex:auto}.model-location nav{max-width:100%}}
  `;document.head.append(style);
  function toggleCanvas(){const wide=document.body.classList.toggle('diagram-expanded');for(const b of [expand,...tools.querySelectorAll('button')].filter(b=>['Full canvas','Restore panels'].includes(b.textContent)))b.textContent=wide?'Restore panels':'Full canvas';requestAnimationFrame(()=>controller?controller.fit():fit(false))}
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]')&&document.body.classList.contains('diagram-expanded'))toggleCanvas()});
  function sourceOwned(e){return !!root.labWorkflow?.sourceWitness?.(e,basis?.source)}
  function elements(){return sourceElements}
  function authored(){return elements().filter(e=>e.metaclass==='ViewUsage')}
  function current(){return registry.find(v=>v.key===selectedKey)||(exploration?.key===selectedKey?exploration:null)}
  function rebuild(){
    if(!basis)return;
    registry=viewRegistry(basis.views.map(v=>{const recipe=engineRecipeFor(basis,v);return {...v,label:viewLabel(v.id),engineRecipe:recipe?.names?.length===1&&['engineering','behavior'].includes(recipe.renderer)&&Object.hasOwn(NOTATIONS,recipe.view.toLowerCase())?recipe:null}}),root.scopeWorkbench?.export()||[],authored(),personal);
    if(typeof routeIndices==='function'){const allowed=new Set(routeIndices());registry=registry.filter(item=>item.kind!=='review'||allowed.has(item.index))}
    const valid=state=>state.item.kind==='explore'?!!index.resolve(state.item.target):registry.some(item=>item.key===state.item.key);for(const stack of [backStack,forwardStack])for(let i=stack.length-1;i>=0;i--)if(!valid(stack[i]))stack.splice(i,1);
    const host=el('views');host.replaceChildren();let group='';
    for(const item of registry){
      const next={review:'Review views',authored:'From the model',sysml:'My SysML views',analytical:'Analytical views'}[item.kind];
      if(next!==group){host.append(make('p',next));host.lastChild.className='view-group';group=next}
      const b=action(human(item.name),()=>open(item.key));b.className='workspace-view';b.dataset.viewKey=item.key;b.append(make('small',item.detail));
      b.classList.toggle('active',item.key===selectedKey);if(item.key===selectedKey)b.setAttribute('aria-current','true');host.append(b);
    }
    el('view-count').textContent=registry.length+' views';filter();
  }
  function filter(){const terms=el('view-search').value.toLowerCase().trim().split(/\s+/).filter(Boolean);const host=el('views'),buttons=[...host.querySelectorAll('button[data-view-key]')];let visible=0;for(const b of buttons){b.hidden=!terms.every(t=>b.textContent.toLowerCase().includes(t));if(!b.hidden)visible++}let heading=null,shown=false;for(const node of host.children){if(node.classList.contains('view-group')){if(heading)heading.hidden=!shown;heading=node;shown=false}else if(!node.hidden)shown=true}if(heading)heading.hidden=!shown;el('view-count').textContent=terms.length?visible+' / '+buttons.length:buttons.length+' views';if(el('no-views'))el('no-views').hidden=visible>0||!basis}
  el('view-search').addEventListener('input',filter);
  function leave(){ticket++;controller?.dispose();controller=null;mounted=null;tools.hidden=true;viewOptions.hidden=true;el('canvas').classList.remove('engine-diagram');document.body.classList.remove('engine-view-active');}
  async function open(key){
    const item=registry.find(v=>v.key===key)||(exploration?.key===key&&index.resolve(exploration.target)?exploration:null);if(!item||!basis||busy)return;
    if(item.kind==='review'&&(!item.engine||stakeholderMode())){const previous=captureLocation();leave();selectedKey=key;show(item.index);rebuild();remember(previous);locationControls();return true}
    if(item.kind==='analytical'){const previous=captureLocation();leave();selectedKey=key;root.scopeWorkbench.openSaved(item.name);rebuild();remember(previous);locationControls();return true}
    const previous=captureLocation();if(await draw(item,selectedKey)){remember(previous);locationControls()}
  }
  function showScopeNotices(graph,summary){const notices=[...new Set([...(graph.notices||[]),...(summary?.notices||[])])];el('explanation').replaceChildren();if(notices.length){const details=make('details');details.append(make('summary','View scope and limitations'));for(const notice of notices)details.append(make('p',notice));el('explanation').append(details)}}
  async function draw(item,previousKey=selectedKey){
    const base=basis,revision=base.sourceSha256,request=++ticket,retained=selectedKey===item.key&&mounted?.sourceSha256===base.sourceSha256?captureLocation():null;
    status('Rendering SysML view…');
    const view=item.kind==='authored'?item.target:'#'+item.notation+':'+item.target;let stagedController=null;
    try{
      const response=await fetch('/diagram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceSha256:revision,view,ports:'full'})}),data=await response.json();
      if(data.error)throw Error(data.error);if(request!==ticket||basis!==base||report!==base)return;
      if(data.sourceSha256!==revision)throw Error('Model changed while this diagram was rendering.');
      if(!root.labDiagramRenderer)throw Error('The SysML diagram renderer has not loaded. Try the view again.');
      const staged=document.createElement('div');
      const selectedDepth=item.depth||Number(depth.value)||2;
      const graph=data.graph;
      const nextController=stagedController=await root.labDiagramRenderer.mountDiagram(staged,graph,{audience:stakeholderMode()?'stakeholder':'engineering',depth:selectedDepth,onPresentationChange:summary=>{if(stagedController&&controller===stagedController&&request===ticket&&basis===base)showScopeNotices(graph,summary)},onSelect:(origin,context)=>inspectOrigin(origin,context)});
      if(retained?.presentation)await nextController.restorePresentation?.(retained.presentation);
      if(request!==ticket||basis!==base){nextController.dispose();return}
      controller?.dispose();root.scopeWorkbench.leave();resetStory();clearSelection();el('canvas').replaceChildren(...staged.childNodes);el('canvas').classList.remove('fit');el('canvas').classList.add('engine-diagram');document.body.classList.add('engine-view-active');el('scope-surfaces').hidden=true;tools.hidden=false;viewOptions.hidden=false;viewOptions.open=false;controller=nextController;manage.hidden=item.kind!=='sysml';saveAs.hidden=item.kind==='authored';depth.value=String(selectedDepth);depth.disabled=graph.kind==='table';selectedKey=item.key;committedKey=item.key;exploration=item.kind==='explore'?item:null;mounted={name:item.name,target:item.target,kind:graph.kind,depth:selectedDepth,sourceSha256:revision,notices:[...(graph.notices||[])]};controller.fit();if(retained?.viewport)controller.restoreViewport?.(retained.viewport);
      el('view-title').textContent=human(item.name);el('view-purpose').textContent=human(item.target)+(item.kind==='authored'?' · view declared in source':'');
      el('view-notation').textContent=(stakeholderMode()?'Stakeholder · ':'SysML · ')+human(graph.kind);
      el('scope').textContent='Revision '+revision.slice(0,12);el('scope').title=item.target;el('reference').disabled=true;
      el('explanation').replaceChildren();
      showScopeNotices(graph,controller.summary);
      for(const id of ['fit','minus','plus','readable','actual'])el(id).disabled=false;
      const subject=index.resolve(item.target);if(subject){modelSelection=subject.qualifiedName;for(const parent of index.path(subject).slice(0,-1))expanded.add(parent.qualifiedName)}renderModel();rebuild();locationControls();root.syncSysmlReturn?.();status('SysML view ready','valid');root.labWorkflow.refreshState();return true;
    }catch(error){if(stagedController&&controller!==stagedController)stagedController.dispose();if(request!==ticket||basis!==base)return;selectedKey=committedKey||previousKey;if(!mounted&&!el('canvas').querySelector('svg')){el('canvas').replaceChildren(make('strong','View could not be opened'),make('p',error.message||'Try opening the view again.'),action('Retry view',()=>open(item.key)));status('View could not be opened · retry available','error')}else status('View could not be opened · previous drawing retained','error');setRuntimeDiagnostic(error);rebuild();return false}
  }
  depth.addEventListener('change',()=>{const item=current();if(!item||!['authored','sysml','review','explore'].includes(item.kind))return;const d=Number(depth.value);if(item.kind==='sysml'){personal=personal.map(v=>v.id===item.id?{...v,depth:d}:v);rebuild()}draw({...item,depth:d})});
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
    const panel=el('explore-selection');panel.replaceChildren();
    if(e.metaclass==='ViewUsage')panel.append(action('Open authored view',()=>open('authored:'+e.qualifiedName)));
    else panel.append(action('Open '+modelRole(e).toLowerCase(),()=>navigate(e)));
    for(const definition of index.types(e))panel.append(action('Open definition: '+human(definition.name),()=>navigate(definition)));
    const uses=index.usages.get(e.sessionElementId);if(uses?.length)panel.append(action('Find usages ('+uses.length+')',()=>findUsages(e)));
    panel.append(action('Show in model',()=>reveal(e)),action('Create SysML view',()=>createDialog(e.qualifiedName)));
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
  for(const [value,label] of [['','All declarations'],['Part','Components'],['Requirement','Requirements'],['Action|State|Perform|Exhibit','Behavior'],['View','Authored views'],['Package','Packages']]){const o=make('option',label);o.value=value;modelFilter.append(o)}
  el('model-search').after(modelFilter);modelFilter.addEventListener('change',()=>{modelPage=0;usageFilter=null;renderModel()});el('model-search').addEventListener('input',()=>{modelPage=0;usageFilter=null;renderModel()});
  const location=make('div');location.className='model-location';location.setAttribute('aria-label','Model location');document.querySelector('.canvas-tools').after(location);location.hidden=true;
  function captureLocation(){const item=current();return item?{sourceSha256:basis?.sourceSha256,item:{...item},query:el('model-search').value,filter:modelFilter.value,usageFilter,expanded:[...expanded],selection:modelSelection,page:modelPage,scroll:modelHost.scrollTop||0,presentation:controller?.capturePresentation?.(),viewport:controller?.captureViewport?.()}:null}
  function remember(previous){if(!previous||previous.item.key===selectedKey)return;backStack.push(previous);if(backStack.length>30)backStack.shift();forwardStack=[];root.labWorkflow.refreshState()}
  function restoreModel(state){el('model-search').value=state.query;modelFilter.value=state.filter;usageFilter=state.usageFilter;expanded=new Set(state.expanded);modelSelection=state.selection;modelPage=state.page;renderModel();modelHost.scrollTop=state.scroll}
  async function historyMove(direction){if(busy)return;rebuild();const from=direction==='back'?backStack:forwardStack,to=direction==='back'?forwardStack:backStack,state=from.at(-1);if(!state)return;const previous=captureLocation(),destination=state.item.kind==='explore'?state.item:registry.find(item=>item.key===state.item.key);if(!destination)return;let ok;
    if(destination.kind==='review'&&(!destination.engine||stakeholderMode())){leave();selectedKey=destination.key;show(destination.index);ok=true}
    else if(destination.kind==='analytical'){leave();selectedKey=destination.key;root.scopeWorkbench.openSaved(destination.name);ok=true}
    else ok=await draw(destination);
    if(ok){from.pop();if(previous)to.push(previous);restoreModel(state);const restoredController=controller,restoredTicket=ticket,restoredBasis=basis,restoredKey=selectedKey;const presentationRestored=state.presentation?await restoredController?.restorePresentation?.(state.presentation):true;if(presentationRestored===false||controller!==restoredController||ticket!==restoredTicket||basis!==restoredBasis||selectedKey!==restoredKey)return;if(state.viewport)restoredController?.restoreViewport?.(state.viewport);rebuild();locationControls();root.labWorkflow.refreshState()}
  }
  async function navigate(e){if(!basis||busy||!index.byId.has(e.sessionElementId))return false;if(e.metaclass==='ViewUsage'){await open('authored:'+e.qualifiedName);return true}
    const previous=captureLocation(),item={key:'explore:'+e.qualifiedName,kind:'explore',name:e.name,target:e.qualifiedName,notation:modelNotation(e),depth:2};
    if(await draw(item)){remember(previous);modelSelection=e.qualifiedName;for(const parent of index.path(e).slice(0,-1))expanded.add(parent.qualifiedName);renderModel();locationControls();return true}return false;
  }
  function reveal(e){modelSelection=e.qualifiedName;el('model-search').value='';modelFilter.value='';usageFilter=null;for(const node of index.path(e)){if(node!==e)expanded.add(node.qualifiedName);const owner=index.parents.get(node.sessionElementId)||null,siblings=index.children.get(owner)||[];branchPages.set(owner,Math.max(50,siblings.indexOf(node)+1))}el('nav-model')?.click();renderModel();modelHost.querySelector('[aria-current="true"]')?.scrollIntoView?.({block:'nearest'})}
  function findUsages(e){usageFilter=e.qualifiedName;modelFilter.value='';el('model-search').value='';modelPage=0;el('nav-model')?.click();renderModel()}
  function inspectModel(e,trigger){const base=basis;Promise.resolve(inspect(e.sessionElementId,trigger)).then(()=>{if(basis===base&&report===base)inspectionActions(e)})}
  function locationControls(){
    location.replaceChildren();const e=index.resolve(current()?.target),hasHistory=backStack.length||forwardStack.length;location.hidden=!e&&!hasHistory;if(location.hidden)return;
    const back=action('Back',()=>historyMove('back'));back.disabled=!backStack.length||busy;back.setAttribute('aria-label','Back to previous model view');
    const forward=action('Forward',()=>historyMove('forward'));forward.disabled=!forwardStack.length||busy;forward.setAttribute('aria-label','Forward to next model view');location.append(back,forward);
    if(!e)return;const trail=make('nav');trail.setAttribute('aria-label','Model ancestry');const all=action('Model',()=>{el('nav-model')?.click();reveal(e)});all.setAttribute('aria-label','Show current element in model');trail.append(all);
    for(const parent of index.path(e)){trail.append(make('span','›'));if(parent===e){const label=make('span',human(parent.name));label.setAttribute('aria-current','location');trail.append(label)}else trail.append(action(human(parent.name),()=>navigate(parent)))}location.append(trail);
    const role=make('span',modelRole(e));role.className='model-role';location.append(role);
    for(const definition of index.types(e))location.append(action('Definition: '+human(definition.name),()=>navigate(definition)));
    const uses=index.usages.get(e.sessionElementId);if(uses?.length)location.append(action('Usages ('+uses.length+')',()=>findUsages(e)));
    location.append(action('Inspect source',()=>inspectModel(e)));
  }
  function renderModel(){
    if(!basis)return;const terms=el('model-search').value.toLowerCase().trim().split(/\s+/).filter(Boolean),kind=modelFilter.value&&new RegExp('^(?:'+modelFilter.value+')'),filtered=terms.length||kind||usageFilter;
    const uses=usageFilter?new Set((index.usages.get(index.resolve(usageFilter)?.sessionElementId)||[]).map(e=>e.sessionElementId)):null;
    const matches=index.entries.filter(e=>(!kind||kind.test(e.metaclass))&&(!uses||uses.has(e.sessionElementId))&&terms.every(t=>(e.qualifiedName+' '+e.metaclass+' '+modelRole(e)).toLowerCase().includes(t)));
    modelHost.replaceChildren();const count=make('p',usageFilter?'Usages of '+human(index.resolve(usageFilter)?.name||usageFilter):filtered?matches.length+' matching declarations':index.entries.length+' declarations');count.className='model-context';count.setAttribute('role','status');modelHost.append(count);
    if(filtered){const clear=action('Browse hierarchy',()=>{const selected=index.resolve(modelSelection)||index.resolve(current()?.target);if(selected)reveal(selected);else{el('model-search').value='';modelFilter.value='';usageFilter=null;modelPage=0;renderModel()}});modelHost.append(clear);if(!matches.length)modelHost.append(make('p','No matching declarations.'));modelPage=Math.max(0,Math.min(modelPage,Math.ceil(matches.length/50)-1));for(const e of matches.slice(modelPage*50,modelPage*50+50))row(e,modelHost,true);if(matches.length>50){const pages=make('div'),prev=action('Previous results',()=>{modelPage--;renderModel()}),next=action('Next results',()=>{modelPage++;renderModel()});prev.disabled=modelPage===0;next.disabled=(modelPage+1)*50>=matches.length;pages.append(prev,make('span',' '+(modelPage+1)+' / '+Math.ceil(matches.length/50)+' '),next);modelHost.append(pages)}}
    else branch(null,modelHost);
    function row(e,host,search){const wrap=make('div');wrap.className='model-row';const children=index.children.get(e.sessionElementId)||[];
      if(!search){const toggle=action(expanded.has(e.qualifiedName)?'▾':'▸',()=>{if(expanded.has(e.qualifiedName))expanded.delete(e.qualifiedName);else expanded.add(e.qualifiedName);renderModel();[...modelHost.querySelectorAll('.model-expand')].find(button=>button.dataset.modelTarget===e.qualifiedName)?.focus()});toggle.dataset.modelTarget=e.qualifiedName;toggle.className='model-expand';toggle.disabled=!children.length;toggle.setAttribute('aria-label',(expanded.has(e.qualifiedName)?'Collapse ':'Expand ')+human(e.name));if(children.length)toggle.setAttribute('aria-expanded',String(expanded.has(e.qualifiedName)));wrap.append(toggle)}
      const b=action(human(e.name),()=>navigate(e));b.className='model-result';b.title=e.qualifiedName;b.dataset.modelTarget=e.qualifiedName;b.setAttribute('aria-label','Open '+modelRole(e).toLowerCase()+' '+human(e.name));if(modelSelection===e.qualifiedName)b.setAttribute('aria-current','true');
      const type=index.types(e).map(d=>human(d.name)).join(', '),detail=make('small',modelRole(e)+(type?' · '+type:''));b.append(detail);if(search)b.append(make('small',index.path(e).slice(0,-1).map(p=>human(p.name)).join(' › ')||'Model root'));wrap.append(b);const inspectButton=action('⋯',()=>inspectModel(e,inspectButton));inspectButton.setAttribute('aria-label','Inspect '+human(e.name));inspectButton.className='model-inspect';wrap.append(inspectButton);host.append(wrap);
      if(!search&&expanded.has(e.qualifiedName)&&children.length){const nested=make('div');nested.className='model-children';host.append(nested);branch(e.sessionElementId,nested)}
    }
    function branch(id,host){const children=index.children.get(id)||[],limit=branchPages.get(id)||50;for(const e of children.slice(0,limit))row(e,host,false);if(children.length>limit)host.append(action('Show '+Math.min(50,children.length-limit)+' more',()=>{branchPages.set(id,limit+50);renderModel()}))}
  }
  function resetNavigation(){priorLocation=null;exploration=null;backStack=[];forwardStack=[];expanded=new Set();branchPages=new Map();modelSelection=null;usageFilter=null;modelPage=0;el('model-search').value='';modelFilter.value='';location.hidden=true}
  root.labViews={
    rebuild,filter,renderModel,open,navigate,reveal,back:()=>historyMove('back'),forward:()=>historyMove('forward'),hasAuthored:()=>authored().length>0,has:key=>registry.some(v=>v.key===key),create:createDialog,leave,
    snapshot:()=>({views:structuredClone(personal),selected:current()?.kind==='explore'?([...backStack].reverse().find(state=>state.item.kind!=='explore')?.item.key||null):selectedKey}),
    importProject(data){resetNavigation();personal=admitViews(data.sysmlViews);pendingSelection=typeof data.selectedView==='string'?data.selectedView:null;selectedKey=null;committedKey=null;leave()},
    restore(state){resetNavigation();personal=admitViews(state?.views);pendingSelection=state?.selected||null;selectedKey=null;committedKey=null;leave()},
    beginReport(_data,focused=false,payload={}){priorSelection=focused||payload.target?null:selectedKey;priorLocation=priorSelection?captureLocation():null;restoringReport=true},
    onReport(data){const retainedLocation=priorLocation;priorLocation=null;if(basis&&basis.sourceSha256!==data.sourceSha256){if(priorSelection===exploration?.key)priorSelection=[...backStack].reverse().find(state=>state.item.kind!=='explore')?.item.key||null;backStack=[];forwardStack=[];exploration=null}basis=data;sourceElements=(data.elements||[]).filter(e=>e.qualifiedName&&sourceOwned(e));index=modelIndex(sourceElements);let chosen=pendingSelection||priorSelection||(!stakeholderMode()&&data.views[active]?'review:'+data.views[active].id:null);pendingSelection=null;restoringReport=false;rebuild();const available=key=>registry.some(v=>v.key===key)||(exploration?.key===key&&index.resolve(exploration.target));if(chosen?.startsWith('explore:')&&!available(chosen)){exploration=null;chosen=data.views[active]?'review:'+data.views[active].id:registry[0]?.key;selectedKey=chosen||null}if(chosen&&available(chosen))selectedKey=chosen;rebuild();renderModel();locationControls();el('model-search').disabled=false;el('model-navigation-note').hidden=true;el('customize').disabled=false;if(chosen&&available(chosen))setTimeout(async()=>{if(basis!==data||busy)return;await open(chosen);if(basis===data&&selectedKey===chosen&&retainedLocation?.sourceSha256===data.sourceSha256&&retainedLocation.item.key===chosen){const restoredController=controller,restoredTicket=ticket;const presentationRestored=retainedLocation.presentation?await restoredController?.restorePresentation?.(retainedLocation.presentation):true;if(presentationRestored===false||controller!==restoredController||ticket!==restoredTicket||basis!==data||selectedKey!==chosen)return;if(retainedLocation.viewport)restoredController?.restoreViewport?.(retainedLocation.viewport)}},0)},
    core(index){leave();committedKey='review:'+report?.views[index]?.id;if(restoringReport)return;selectedKey=committedKey;rebuild();locationControls()},
    analytical(name){leave();selectedKey='analytical:'+name;committedKey=selectedKey;rebuild();locationControls()},
    active:()=>!!controller,
    reader:()=>controller&&mounted?structuredClone({...mounted,presentation:controller.capturePresentation?.()?.mode||'diagram',focusSubject:controller.capturePresentation?.()?.selectedWitness?.name||null,notices:[...new Set([...(mounted.notices||[]),...(controller.summary?.notices||[])])]}):null,
    refresh(){if(current()?.kind==='review'){open(selectedKey);return true}if(controller&&current()){draw(current());return true}return false},
    control(kind,value){if(!controller)return false;if(kind==='fit')controller.fit();else controller.zoom(value);return true},
    invalidate(){if(current()?.kind==='explore')selectedKey=[...backStack].reverse().find(state=>state.item.kind!=='explore')?.item.key||null;backStack=[];forwardStack=[];exploration=null;leave();committedKey=null;basis=null;registry=[];index=modelIndex([]);location.hidden=true},
  };
})(typeof window==='undefined'?globalThis:window);
