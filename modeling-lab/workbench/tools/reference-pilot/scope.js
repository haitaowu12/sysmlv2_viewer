/* Read-only perspective workspace. Canonical source is never edited here. */
(() => {
  let catalog, recipe=null, result=null, epoch=0, surface='diagram', saved=[], page=0, rowFilter='', columnFilter='';
  const el=id=>document.getElementById(id);
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
  const button=(text,action)=>{const b=node('button',text);b.type='button';b.addEventListener('click',action);return b};
  const option=(label,value)=>{const o=node('option',label);o.value=value;return o};
  const entry=id=>report?.elements.find(e=>e.sessionElementId===id);
  const label=id=>entry(id)?.qualifiedName||entry(id)?.name||entry(id)?.metaclass||id;
  const shortKey=n=>{const value=n.key===n.root?n.name:n.key.slice(n.root.length+1);return stakeholderMode()?value.split('/').map(human).join(' / '):value};
  const matches=(value,query)=>{const text=(value+' '+human(value)).toLowerCase();return query.trim().toLowerCase().split(/\s+/).every(term=>text.includes(term))};
  const key=()=>`sysml-perspectives-v1:${initial?.workspaceKey||'unassigned'}`;
  let draftPins=new Set(),draftHidden=new Set(),expanded=new Set(),childPages=new Map(),lastEvidence=null,workingViews=[],loadedWorkspace=null,scopeHistory=[],creatingNew=false,modelPage=0,subjectPage=0,rulePage=0,transient=false,restoreContext=null,activeViewName=null,modelSelection=null;
  function newViewName(base){const names=new Set([...saved,...workingViews].map(v=>v.name));let name=base,index=2;while(names.has(name)){name=base+' ('+index+')';index++}return name}
  const subjectLabel=n=>{const context=entry(n.elementId)?.qualifiedName?.split('::').slice(0,-1).map(human).join(' / ');return friendlyPath(n.key)+' · '+scopeKind(n)+(context?' · '+context:'')};
  const friendlyPath=value=>value.split('/').map(x=>human(x.split('::').pop())).join(' / ');
  const displayLabel=id=>{const name=label(id),leaf=name.split('::').pop();const peers=report.elements.filter(e=>(e.qualifiedName||e.name||'').split('::').pop()===leaf);return readableName(peers.length>1?name.split('::').slice(-2).join(' / '):leaf)};
  const traceLabel=t=>t.kind==='verify'?'V · planned':t.polarity==='positive'?'S · asserted':t.polarity==='negative'?'Not satisfied · asserted':'Satisfaction polarity unknown';
  const customStatus=s=>{const kept=saved.find(v=>v.name===s.name);return 'Custom view · '+(!kept?'session view':JSON.stringify(kept.recipe)===JSON.stringify(s.recipe)&&kept.surface===s.surface?'saved recipe':'unsaved view changes')};
  function savedNavigation(){
    el('saved-perspectives').replaceChildren();
    el('views').querySelectorAll('[data-custom]').forEach(b=>b.remove());
    const entries=[...workingViews,...saved.filter(s=>!workingViews.some(v=>v.name===s.name))];
    for(const s of entries){const b=button(s.name,()=>{transient=false;el('view-save-feedback').textContent='';activeViewName=s.name;el('perspective-name').value=s.name;surface=['diagram','interfaces','register','requirements','traces','responsibilities'].includes(s.surface)?s.surface:'diagram';apply(s.recipe)});b.dataset.custom=s.name;b.className='custom-view';b.title=customStatus(s);if(recipe&&s.name===el('perspective-name').value){b.classList.add('active');b.setAttribute('aria-current','true')}el('views').append(b)}
    filterViews();
  }
  function renderExceptions(){
    el('scope-exceptions').replaceChildren();
    const nodes=catalog.nodes.filter(n=>n.root===el('scope-root').value&&matches(n.key,el('scope-find').value));
    const counts=node('p',undefined,'note');const updateCounts=()=>counts.textContent=`${nodes.length} matching elements · ${draftPins.size} included · ${draftHidden.size} hidden`;updateCounts();el('scope-exceptions').append(counts);
    rulePage=Math.min(rulePage,Math.max(0,Math.ceil(nodes.length/60)-1));el('scope-exceptions').append(pageNavigation(nodes.length,rulePage,value=>{rulePage=value;renderExceptions()},'element rules'));
    for(const n of nodes.slice(rulePage*60,rulePage*60+60)){const row=node('label',undefined,'exception-rule'),select=node('select');select.setAttribute('aria-label','Rule for '+n.key);select.append(option('Auto','auto'),option('Include','include'),option('Hide','hide'));select.value=draftHidden.has(n.key)?'hide':draftPins.has(n.key)?'include':'auto';select.options[2].disabled=n.key===el('scope-focus').value;select.addEventListener('change',()=>{draftPins.delete(n.key);draftHidden.delete(n.key);if(select.value==='include')draftPins.add(n.key);if(select.value==='hide')draftHidden.add(n.key);updateCounts()});row.append(node('span',friendlyPath(n.key)),select);el('scope-exceptions').append(row)}
  }
  const scopeKind=n=>{if(!n)return 'model scope';const root=catalog.nodes.find(c=>c.key===n.root&&c.root===n.root);return entry(root?.elementId)?.metaclass==='PartDefinition'?'definition':'model occurrence'};
  function rootOptions(focus){
    const matchesAll=catalog.nodes.filter(n=>(matches(n.key,el('scope-find').value)||n.key===focus));
    if(focus&&matchesAll.some(n=>n.key===focus))subjectPage=Math.floor(matchesAll.findIndex(n=>n.key===focus)/60);
    subjectPage=Math.min(subjectPage,Math.max(0,Math.ceil(matchesAll.length/60)-1));
    const nodes=matchesAll.slice(subjectPage*60,subjectPage*60+60);
    el('scope-match-count').replaceChildren(pageNavigation(matchesAll.length,subjectPage,value=>{subjectPage=value;rootOptions()},'subjects'));
    el('scope-focus').replaceChildren(...nodes.map(n=>option(subjectLabel(n),n.key)));
    if(nodes.some(n=>n.key===focus))el('scope-focus').value=focus;
    const chosen=catalog.nodes.find(n=>n.key===el('scope-focus').value);if(chosen)el('scope-root').value=chosen.root;
    draftHidden.delete(el('scope-focus').value);renderExceptions();
  }
  function navigation(mode){el('model-browser').hidden=mode!=='model';el('view-browser').hidden=mode==='model';el('nav-model').setAttribute('aria-pressed',String(mode==='model'));el('nav-views').setAttribute('aria-pressed',String(mode!=='model'))}
  function selectedModelNode(){return catalog?.nodes.find(n=>n.key===modelSelection?.key&&n.root===modelSelection?.root&&n.elementId===modelSelection?.elementId)}
  function modelSelectionActions(){
    const panel=el('model-selection-actions');if(!panel)return;
    const chosen=selectedModelNode();panel.replaceChildren();panel.hidden=!chosen;if(!chosen)return;
    const name=node('p','Selected · '+friendlyPath(chosen.key),'model-selection-path');name.title=chosen.key;
    const open=button('Open component view',()=>{const current=selectedModelNode();if(current){focusNode(current);closeInspector()}});open.id='model-open-component-view';open.disabled=busy;
    panel.append(name,open);
    const model=entry(chosen.elementId);
    if(['PartDefinition','PartUsage'].includes(model?.metaclass)&&model.qualifiedName){
      const sheet=button('Open SysML part/port sheet',()=>{const current=selectedModelNode(),part=current&&entry(current.elementId);if(part?.qualifiedName&&['PartDefinition','PartUsage'].includes(part.metaclass))window.openSysmlComponent?.(part.qualifiedName)});
      sheet.id='model-open-sysml-sheet';sheet.title='Selected element and its direct features; custom scope filters do not apply.';sheet.disabled=busy||typeof window.openSysmlComponent!=='function';panel.append(sheet);
    }
  }
  function selectModelNode(n,trigger){
    if(!catalog||!report||busy)return;
    modelSelection={key:n.key,root:n.root,elementId:n.elementId};revealModelPath(n.key);
    el('model-tree').querySelectorAll('.focus-node').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.key===n.key&&b.dataset.root===n.root&&b.dataset.elementId===n.elementId)));
    modelSelectionActions();inspect(n.elementId,trigger);
  }
  function focusNode(n){
    if(!catalog||!report||busy)return;
    if(recipe)scopeHistory.push({recipe:structuredClone(recipe),name:el('perspective-name').value,surface,transient,activeViewName});if(scopeHistory.length>20)scopeHistory.shift();
    transient=true;el('view-save-feedback').textContent='';activeViewName=null;el('perspective-name').value=newViewName(human(n.name)+' review');
    surface='diagram';
    apply({schemaVersion:1,root:n.root,focus:n.key,depth:1,neighbors:0,kinds:['connection','binding','flow'],pinned:[],hidden:[]});
  }
  function revealModelPath(focus){
    let n=catalog?.nodes.find(n=>n.key===focus);const seen=new Set();
    while(n?.parent&&!seen.has(n.key)){seen.add(n.key);const siblings=catalog.nodes.filter(c=>c.parent===n.parent&&c.root===n.root);childPages.set(n.parent,Math.floor(siblings.findIndex(c=>c.key===n.key)/60));expanded.add(n.parent);n=catalog.nodes.find(c=>c.key===n.parent&&c.root===n.root)}
  }
  function modelBrowser(){
    el('model-tree').replaceChildren();if(!catalog)return;
    const query=el('model-search').value,all=catalog.nodes;
    const actions=node('div',undefined,'model-selection-actions');actions.id='model-selection-actions';el('model-tree').append(actions);modelSelectionActions();
    const list=node('ul');el('model-tree').append(list);
    function childrenPage(children,parent,key,page=childPages.get(key)||0){
      page=Math.min(page,Math.max(0,Math.ceil(children.length/60)-1));childPages.set(key,page);
      parent.replaceChildren();children.slice(page*60,page*60+60).forEach(c=>add(c,parent));
      if(children.length>60){const li=node('li');li.append(pageNavigation(children.length,page,value=>childrenPage(children,parent,key,value),'children of '+friendlyPath(key)));parent.append(li)}
    }
    function add(n,parent,search=false){
      const li=node('li'),row=node('div',undefined,'model-branch'),children=all.filter(c=>c.parent===n.key&&c.root===n.root),sub=node('ul');li.append(row);parent.append(li);
      if(children.length&&!search){const toggle=button(expanded.has(n.key)?'−':'+',()=>{if(expanded.has(n.key))expanded.delete(n.key);else expanded.add(n.key);toggle.textContent=expanded.has(n.key)?'−':'+';toggle.setAttribute('aria-expanded',String(expanded.has(n.key)));sub.replaceChildren();sub.hidden=!expanded.has(n.key);if(!sub.hidden)childrenPage(children,sub,n.key)});toggle.className='expand-node';toggle.setAttribute('aria-label','Expand '+friendlyPath(n.key));toggle.setAttribute('aria-expanded',String(expanded.has(n.key)));row.append(toggle);sub.hidden=!expanded.has(n.key);li.append(sub);if(!sub.hidden)childrenPage(children,sub,n.key)}else row.append(node('span',undefined,'leaf-space'));
      const context=entry(n.elementId)?.qualifiedName?.split('::').slice(0,-1).map(human).join(' / ');
      const focus=button(human(n.name)+(!n.parent?' · '+scopeKind(n):''),event=>selectModelNode(n,event.currentTarget));focus.className='focus-node';focus.title=n.key;focus.dataset.key=n.key;focus.dataset.root=n.root;focus.dataset.elementId=n.elementId;focus.setAttribute('aria-label','Select '+n.key);focus.setAttribute('aria-pressed',String(n.key===modelSelection?.key&&n.root===modelSelection?.root&&n.elementId===modelSelection?.elementId));if(recipe?.focus===n.key&&recipe?.root===n.root)focus.setAttribute('aria-current','true');if(search||!n.parent)focus.append(node('span',(search?friendlyPath(n.key):context||friendlyPath(n.key))+' · '+scopeKind(n),'model-search-path'));row.append(focus);
    }
    const hits=query?all.filter(n=>matches(n.key,query)):all.filter(n=>!n.parent).sort((a,b)=>Number(entry(a.elementId)?.metaclass==='PartDefinition')-Number(entry(b.elementId)?.metaclass==='PartDefinition'));
    modelPage=Math.min(modelPage,Math.max(0,Math.ceil(hits.length/60)-1));hits.slice(modelPage*60,modelPage*60+60).forEach(n=>add(n,list,!!query));
    if(query||hits.length>60)el('model-tree').prepend(pageNavigation(hits.length,modelPage,value=>{modelPage=value;modelBrowser()},'components'));
  }
  function open(){
    if(!catalog||busy)return;
    el('scope-dialog-title').textContent=creatingNew?'Create a view':'Edit view scope';el('apply-scope').textContent=creatingNew?'Create view':'Apply changes';
    subjectPage=0;rulePage=0;draftPins=new Set(recipe?.pinned||[]);draftHidden=new Set(recipe?.hidden||[]);el('scope-root').replaceChildren(...catalog.roots.map(r=>option(friendlyPath(r)+' · '+scopeKind(catalog.nodes.find(n=>n.key===r&&n.root===r)),r)));
    const presetRoot=report?.views[active]?.targets[0];
    el('scope-root').value=recipe?.root||(catalog.roots.includes(presetRoot)?presetRoot:catalog.roots[0]);
    el('scope-find').value='';rootOptions(recipe?.focus||el('scope-root').value);
    el('scope-depth').value=String(recipe?.depth??1);el('scope-neighbors').value=String(recipe?.neighbors??0);
    ['connection','binding','flow'].forEach(k=>el('scope-'+k).checked=recipe?recipe.kinds.includes(k):true);
    el('scope-error').textContent='';el('scope-advanced').open=false;el('scope-dialog').showModal();
    el('scope-question').value=surface==='diagram'&&recipe?.depth>=2?'breakdown':surface;el('scope-find').focus();
  }
  function getRecipe(){return {schemaVersion:1,root:el('scope-root').value,focus:el('scope-focus').value,depth:Number(el('scope-depth').value),neighbors:Number(el('scope-neighbors').value),kinds:['connection','binding','flow'].filter(k=>el('scope-'+k).checked),pinned:[...draftPins],hidden:[...draftHidden]}}
  async function apply(next,fromValidation=false){
    if(busy&&!fromValidation)return;
    if(recipe?.focus!==next.focus||recipe?.root!==next.root)revealModelPath(next.focus);
    recipe=JSON.parse(JSON.stringify(next));result=null;const ticket=++epoch,sha=report?.sourceSha256,reportSha=report?.reportIntegrity?.reportSha256;
    if(!sha||!catalog)return;
    el('scope-surfaces').hidden=false;el('scope-summary').textContent='Resolving perspective against the current model…';el('scope-brief').textContent='Updating view…';
    el('reference').disabled=true;el('apply-scope').disabled=true;clearSelection();empty('Building your perspective','Resolving selected components and explicit interface neighbors.');
    try{
      const res=await fetch('/compose',{method:'POST',headers:{'Content-Type':'application/json','X-Session':'__TOKEN__'},body:JSON.stringify({sourceSha256:sha,reportSha256:reportSha,recipe})});
      const data=await res.json();
      if(ticket!==epoch||report?.sourceSha256!==sha||report?.reportIntegrity?.reportSha256!==reportSha)return;
      if(data.error)throw Error(data.error);if(data.sourceSha256!==sha||data.reportSha256!==reportSha)throw Error('Perspective source or report revision mismatch');
      result=data;page=0;el('scope-dialog').close();
      if(!el('perspective-name').value.trim())el('perspective-name').value=newViewName(human(result.nodes.find(n=>n.key===recipe.focus)?.name||recipe.focus.split('::').pop())+' review');
      if(!transient&&!activeViewName)activeViewName=el('perspective-name').value;
      const name=activeViewName||el('perspective-name').value;if(!transient&&new Set([...saved,...workingViews].map(v=>v.name)).size>=30&&![...saved,...workingViews].some(v=>v.name===name))throw Error('This project supports 30 custom views. Reuse a view name to replace it.');if(!transient){workingViews=workingViews.filter(v=>v.name!==name);workingViews.push({name,recipe:structuredClone(recipe),surface})}savedNavigation();draw();
    }catch(error){if(ticket===epoch){el('scope-error').textContent=String(error);el('scope-summary').textContent=String(error);el('scope-brief').textContent='View needs review — open details';empty('Perspective needs review',String(error))}}
    finally{if(ticket===epoch)el('apply-scope').disabled=false}
  }
  function sourceButton(id,text){const b=button(text||displayLabel(id),event=>{inspect(id,event?.currentTarget);});b.title=label(id);return b}
  function relationLabel(r){return `${r.source.node} / ${r.source.port} ${r.kind==='flow'?'→':'—'} ${r.target.node} / ${r.target.port}${r.item?' · '+r.item:''}`}
  function evidence(relations,title){
    lastEvidence={relations,title};clearSelection();openInspector();el('selected').textContent=title;el('selection-hint').hidden=true;
    el('selection-meta').textContent=`${relations.length} explicit relationship records · revision ${result.sourceSha256.slice(0,12)}`;
    el('snippet').replaceChildren();
    for(const r of relations){const short=key=>key.startsWith(recipe.root+'/')?key.slice(recipe.root.length+1):key;const p=node('div',undefined,'link-evidence');p.append(node('strong',r.kind==='flow'?'Transfer · '+human(r.item):human(r.kind)),node('div',readablePath(short(r.source.node))+' / '+readableName(r.source.port)+' '+(r.kind==='flow'?'→':'—')+' '+readablePath(short(r.target.node))+' / '+readableName(r.target.port)));const d=node('details');d.append(node('summary','Full model paths'),node('p',relationLabel(r)));p.append(d,sourceButton(r.elementId,'Inspect '+r.kind+' source'));el('snippet').append(p)}
  }
  function controlsForTable(){
    const controls=node('div',undefined,'table-search');
    for(const [name,current,update] of [['Filter rows',rowFilter,v=>rowFilter=v],['Filter columns',columnFilter,v=>columnFilter=v]]){
      if(name==='Filter columns'&&!['interfaces','requirements'].includes(surface))continue;
      const input=node('input');input.type='search';input.placeholder=name;input.setAttribute('aria-label',name);input.value=current;
      input.addEventListener('input',()=>{update(input.value);page=0;renderTableBody()});controls.append(input);
    }
    el('canvas').append(controls,node('div',undefined,'table-body'));
  }
  function table(title,headers){const wrap=node('div',undefined,'table-wrap'),t=node('table',undefined,'model-table');t.append(node('caption',title));const head=node('thead'),tr=node('tr');headers.forEach(h=>{const th=node('th',h);th.scope='col';tr.append(th)});head.append(tr);const body=node('tbody');t.append(head,body);wrap.append(t);return {wrap,body}}
  function td(tr,content,cls){const d=node('td',undefined,cls);if(typeof content==='string')d.textContent=content;else if(content)d.append(content);tr.append(d);return d}
  function paged(items,body,drawRow,container){
    page=Math.min(page,Math.max(0,Math.ceil(items.length/50)-1));items.slice(page*50,page*50+50).forEach(x=>drawRow(x,body));
    const nav=node('div',undefined,'table-pagination'),prev=button('Previous',()=>{page--;renderTableBody()}),next=button('Next',()=>{page++;renderTableBody()});prev.disabled=page===0;next.disabled=(page+1)*50>=items.length;nav.append(prev,node('span',`${items.length? page*50+1:0}–${Math.min((page+1)*50,items.length)} of ${items.length}`),next);container.append(nav);
  }
  function tableHelp(container,text){const d=node('details',undefined,'table-help');d.append(node('summary','How to read this table'),node('p',text,'table-caption'));container.append(d)}
  function matrixKeyboard(body){
    const rows=Array.from(body.rows),headers=Array.from(body.closest('table').tHead.rows[0].cells).slice(1),width=headers.length;const cells=rows.flatMap(r=>Array.from(r.cells).slice(1));
    cells.forEach((cell,i)=>{cell.tabIndex=i===0?0:-1;cell.setAttribute('aria-label',rows[Math.floor(i/width)]?.cells[0].textContent+' to '+headers[i%width]?.textContent+': '+(cell.querySelector('button')?.textContent||'no extracted relationship'));const b=cell.querySelector('button');if(b)b.tabIndex=-1;cell.addEventListener('focus',()=>{cells.forEach(c=>{c.tabIndex=c===cell?0:-1;c.classList.toggle('selected-cell',c===cell)})});cell.addEventListener('keydown',event=>{const r=Math.floor(i/width),c=i%width,targets={ArrowRight:r*width+Math.min(width-1,c+1),ArrowLeft:r*width+Math.max(0,c-1),ArrowDown:Math.min(rows.length-1,r+1)*width+c,ArrowUp:Math.max(0,r-1)*width+c};if(event.key in targets){event.preventDefault();cells[targets[event.key]]?.focus()}else if(event.key==='Enter'||event.key===' '){event.preventDefault();if(b){b.click();lastInspectionTrigger=cell}}})});
  }
  function renderTableBody(){
    const container=el('canvas').querySelector('.table-body');if(!container||!result)return;container.replaceChildren();
    if(surface==='interfaces'){
      const rows=result.nodes.filter(n=>matches(n.key,rowFilter)),cols=result.nodes.filter(n=>matches(n.key,columnFilter));
      container.append(node('p',stakeholderMode()?'Transfers run from row to column · — = no extracted link':'C = connection · B = binding · F = transfer (row → column) · — = no extracted link','table-caption'));tableHelp(container,'Counts retain parallel records. No extracted link does not establish physical absence. Select a populated cell for ports and source evidence.');
      if(rows.length>40||cols.length>40){container.append(node('p',`Matrix is ${rows.length} × ${cols.length}. Filter either axis to at most 40 elements or use the register. No cells have been truncated.`));return}
      const t=table('Interfaces · selected component occurrences',['From / to',...cols.map(shortKey)]);
      for(const a of rows){const tr=node('tr');td(tr,sourceButton(a.elementId,shortKey(a)));for(const b of cols){const links=result.relations.filter(r=>(r.source.node===a.key&&r.target.node===b.key)||(r.kind!=='flow'&&r.source.node===b.key&&r.target.node===a.key));let content='—';if(links.length){const counts=['connection','binding','flow'].map(k=>{const count=links.filter(r=>r.kind===k).length;return count?(stakeholderMode()?`${count} ${k==='flow'?'transfer':k}${count>1?'s':''}`:`${k[0].toUpperCase()} ${count}`):''}).filter(Boolean).join(' · ');content=button(counts,event=>{lastInspectionTrigger=event.currentTarget;evidence(links,`${human(a.name)} / ${human(b.name)}`)});content.setAttribute('aria-label',`${a.key} to ${b.key}: ${counts}`)}td(tr,content,'matrix-cell')}t.body.append(tr)}container.append(t.wrap);matrixKeyboard(t.body);
    }else if(surface==='register'){
      container.append(node('p','One row per declared interface record · connections are not directional.','table-caption'));tableHelp(container,'Owner, ICD approval and acceptance are not supplied by this model projection. Select Inspect source for the exact model statement.');
      const rows=result.relations.filter(r=>matches(relationLabel(r)+' '+r.kind+' '+r.name+' '+readableName(r.name)+' '+readableName(r.item)+' '+readablePath(r.source.node)+' '+readablePath(r.target.node)+' '+readableName(r.source.port)+' '+readableName(r.target.port),rowFilter));const t=table('Interface register',['Relationship','Endpoint A / source','Endpoint B / target','Payload / direction','Evidence']);container.append(t.wrap);
      paged(rows,t.body,(r,body)=>{const tr=node('tr');td(tr,r.kind+' · '+readableName(r.name));td(tr,endpointCard(r.source,catalog.nodes));td(tr,endpointCard(r.target,catalog.nodes));td(tr,r.kind==='flow'?readableName(r.item)+' →':'Not directional');td(tr,sourceButton(r.elementId,'Inspect source'));body.append(tr)},container);
    }else if(surface==='requirements'){
      const kind=el('trace-kind').value;
      const selectedKeys=new Set(result.nodes.map(n=>n.key));
      const allLinks=catalog.traces.filter(t=>t.kind===kind);
      const occurrences=t=>t.sourceOccurrences??(catalog.nodes.filter(n=>n.elementId===t.sourceId).length===1?catalog.nodes.filter(n=>n.elementId===t.sourceId).map(n=>n.key):[]);
      const links=kind==='satisfy'?allLinks.flatMap(t=>occurrences(t).filter(k=>selectedKeys.has(k)).map(k=>({...t,column:k}))):allLinks.map(t=>({...t,column:t.sourceId}));
      const columnLabel=id=>kind==='satisfy'?(stakeholderMode()?friendlyPath(id):id):displayLabel(id);
      const ids=[...new Set(links.map(t=>t.column))].filter(id=>matches(columnLabel(id),columnFilter));
      const rows=catalog.requirements.filter(r=>matches(r.qualifiedName,rowFilter));
      container.append(node('p',kind==='satisfy'?'Rows: all extracted requirements. Columns: explicit satisfaction targets present in this perspective. An absent link may be outside the selected scope. Satisfaction is a design assertion, not an execution result.':'Rows: all extracted requirements. Columns: planned verification cases in the whole source model, independent of component selection. These links do not establish executed tests or acceptance.','table-caption'));
      if(rows.length>40||ids.length>40){container.append(node('p','Filter the matrix to at most 40 rows and 40 columns. No cells have been truncated.'));return}
      const t=table(kind==='satisfy'?'Requirement satisfaction · scoped targets':'Requirement verification · model-wide plans',['Requirement',...ids.map(columnLabel),'Link visibility']);
      rows.forEach(r=>{const tr=node('tr');td(tr,sourceButton(r.elementId,stakeholderMode()?human(r.name||r.qualifiedName.split('::').pop()):r.qualifiedName));ids.forEach(id=>{const hits=links.filter(t=>t.column===id&&t.targetId===r.elementId);const cell=td(tr,'');if(!hits.length)cell.textContent='—';else hits.forEach(t=>cell.append(sourceButton(t.elementId,traceLabel(t))))});const global=allLinks.filter(t=>t.targetId===r.elementId),shown=links.filter(t=>t.targetId===r.elementId);td(tr,shown.length?`${shown.length} in scope${ids.length<new Set(links.map(t=>t.column)).size?' · column filter active':''}`:global.length?`${global.length} outside component scope${kind==='satisfy'&&global.some(t=>!occurrences(t).length)?' · occurrence unresolved':''}`:'No extracted '+kind+' link');t.body.append(tr)});container.append(t.wrap);
    }else if(surface==='responsibilities'){
      container.append(node('p','Declared performance assignments in this component scope.','table-caption'));tableHelp(container,'A shared definition can appear in several occurrences. These are model assertions, not executed behaviour or inferred allocations.');
      const rows=[];
      for(const n of result.nodes){const model=entry(n.elementId),ids=new Set((model?.semantics?.feature||[]).map(r=>r.id));for(const e of report.elements.filter(e=>e.metaclass==='PerformActionUsage'&&ids.has(e.sessionElementId))){for(const target of e.semantics?.type||[])if(target.metaclass==='ActionDefinition')rows.push({node:n,element:e,target})}}
      const filtered=rows.filter(r=>matches(r.node.key+' '+r.target.qualifiedName+' '+readablePath(r.node.key)+' '+readableName(r.target.name),rowFilter));const t=table('Responsibilities · selected component occurrences',['Component','Performs scenario','Assignment scope','Source witness']);container.append(t.wrap);paged(filtered,t.body,(r,body)=>{const tr=node('tr'),component=modelCard(r.node.key,'model occurrence'),scenario=modelCard(r.target.qualifiedName,'scenario definition');component.append(sourceButton(r.node.elementId,'Inspect component'));scenario.append(sourceButton(r.target.id,'Inspect scenario'));td(tr,component);td(tr,scenario);td(tr,assignmentScope);td(tr,sourceButton(r.element.sessionElementId,'Inspect assignment'));body.append(tr)},container);
      if(!rows.length)container.append(node('p','No performance assignments extracted in this scope. This does not establish that the system has no responsibilities.'));
    }else if(surface==='traces'){
      container.append(node('p','Explicit links across the model · source witnesses available for every row.','table-caption'));tableHelp(container,'No transitive relationship is asserted. Source selection drills back to the model. Parent requirements, external design artifacts and executed evidence are not covered by this bounded extractor.');
      const rows=catalog.traces.filter(t=>matches(label(t.sourceId)+' '+label(t.targetId)+' '+t.kind+' '+traceLabel(t),rowFilter));const t=table('Traceability links · explicit model evidence',['From','Relationship','To','Source witness']);container.append(t.wrap);paged(rows,t.body,(r,body)=>{const tr=node('tr');td(tr,sourceButton(r.sourceId));td(tr,traceLabel(r));td(tr,sourceButton(r.targetId));td(tr,sourceButton(r.elementId,'Inspect statement'));body.append(tr)},container);
    }
  }
  function draw(){
    if(el('return-view'))el('return-view').hidden=true;
    if(!result||!report||result.sourceSha256!==report.sourceSha256)return;
    if(!transient&&!activeViewName)activeViewName=el('perspective-name').value;
      const name=activeViewName||el('perspective-name').value;if(!transient){workingViews=workingViews.filter(v=>v.name!==name);workingViews.push({name,recipe:structuredClone(recipe),surface,savedSourceSha256:result.sourceSha256})}
    resetStory();lastEvidence=null;clearSelection();el('scope-surfaces').hidden=false;el('canvas').closest('.workspace').classList.toggle('table-mode',surface!=='diagram');
    el('view-title').textContent=activeViewName||el('perspective-name').value||'Custom perspective';el('view-purpose').textContent=recipe.focus.split('/').map(x=>human(x.split('::').pop())).join(' › ')+' · '+scopeKind({root:recipe.root})+' · analytical view';el('view-purpose').title=recipe.focus;document.title=el('view-title').textContent+' · Modeling lab';el('view-notation').textContent=surface==='diagram'?'Analytical diagram':'Analytical table';
    el('scope').textContent='Revision '+result.sourceSha256.slice(0,12);
    el('scope').title=recipe.focus;
    const trail=node('div');trail.className='scope-trail';
    if(scopeHistory.length)trail.append(button('Back to previous scope',()=>{const prior=scopeHistory.pop();el('perspective-name').value=prior.name;surface=prior.surface;transient=prior.transient;activeViewName=prior.activeViewName;apply(prior.recipe)}));
    const parent=result.nodes.find(n=>n.key===recipe.focus)?.parent||catalog.nodes.find(n=>n.key===recipe.focus)?.parent;
    if(parent)trail.append(button('Up one level',()=>{const n=catalog.nodes.find(n=>n.key===parent);if(n)focusNode(n)}));
    el('scope-trail').replaceChildren(...(trail.childNodes.length?[trail]:[]));
    const selectedKeys=new Set(result.nodes.map(n=>n.key)),selectedIds=new Set([...result.nodes.map(n=>n.elementId),...result.relations.map(r=>r.elementId)]);
    const selectedWarnings=result.warnings.filter(w=>selectedKeys.has(w.scope)||(w.elementId&&selectedIds.has(w.elementId)));
    const otherWarnings=result.warnings.filter(w=>!selectedWarnings.includes(w));
    el('scope-summary').textContent=`${result.nodes.length} elements · ${result.relations.length} interface records · ${result.hiddenCount} elements outside view · ${result.crossing.length} crossing records not shown · ${result.filteredRelations} filtered records · ${selectedWarnings.length} limitations tied to shown elements · ${otherWarnings.length} other model extraction limitations`;
    el('scope-brief').textContent=`${result.nodes.length} elements · ${result.relations.length} interface records`+(result.crossing.length?` · ${result.crossing.length} crossing`:'')+(result.filteredRelations?` · ${result.filteredRelations} filtered`:'')+(selectedWarnings.length?` · ${selectedWarnings.length} scope limits`:'');
    modelBrowser();const stored=saved.find(s=>s.name===el('perspective-name').value);el('save-label').textContent=stored?(JSON.stringify(stored.recipe)===JSON.stringify(recipe)&&stored.surface===surface?'View options':'Save view changes'):'Save view';
    el('scope-brief').title='Inspect full scope and omissions';
    Array.from(el('views').children).forEach(b=>{const chosen=b.dataset.custom===el('perspective-name').value;b.classList.toggle('active',chosen);if(chosen){b.setAttribute('aria-current','true');b.title=customStatus({name:activeViewName||el('perspective-name').value,recipe,surface})}else b.removeAttribute('aria-current')});
    document.querySelectorAll('[data-surface]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.surface===surface)));
    el('trace-kind-label').hidden=surface!=='requirements';
    el('reference').disabled=true;el('canvas').replaceChildren();
    el('explanation').replaceChildren(node('div','Analytical projection · source unchanged · acceptance not assessed'));
    const details=node('details'),summary=node('summary','Scope and extraction limitations');details.append(summary,node('p','Component hierarchy is contextual expansion of resolved features, not physical inventory. Multiplicity instances, arbitrary nested connector chains, native SysML view declarations and inferred indirect links are not represented.'));
    for(const [title,warnings] of [['Limitations tied to shown elements',selectedWarnings],['Other model extraction limitations',otherWarnings]]){if(!warnings.length)continue;const group=node('details');group.append(node('summary',title+' ('+warnings.length+')'));for(const w of warnings){const item=node('p',w.scope+': '+w.reason);if(w.elementId)item.append(document.createTextNode(' '),sourceButton(w.elementId,'Inspect source'));group.append(item)}details.append(group)}
    if(result.crossing.length){details.append(node('p',`${result.crossing.length} explicit relationship records cross the selected boundary.`));const list=node('ul');for(const r of result.crossing)list.append(node('li',relationLabel(r)));el('scope-summary').append(list,button('Show crossing endpoints',()=>{el('scope-info').open=false;const endpoints=[...new Set(result.crossing.flatMap(r=>[r.source.node,r.target.node]))];apply({...recipe,pinned:[...new Set([...recipe.pinned,...endpoints])],hidden:recipe.hidden.filter(k=>!endpoints.includes(k))})}));}el('explanation').append(details);
    if(surface==='diagram'){if(result.svg){mountSvg(stakeholderMode()&&narrowReview()?result.portraitSvg||result.svg:result.svg,result.graphSources);if(stakeholderMode())storyView({viewKind:'custom',title:el('view-title').textContent,takeaway:`${result.nodes.length} components and ${result.relations.length} interface records are included in this perspective.`,discussion:'Does this selection give us the context needed to discuss the component?',scopeElementId:result.nodes.find(n=>n.key===recipe.focus)?.elementId,legendItems:['Lines: connections','Arrows: declared transfers','Dashed lines: same-value bindings','Dotted lines: component hierarchy'],rows:result.nodes.map(n=>({title:human(n.name),elementIds:[n.elementId]})),warnings:selectedWarnings},true)}else empty('Narrow the diagram',result.diagramError)}else controlsForTable();
    if(surface!=='diagram')renderTableBody();
    for(const id of ['fit','minus','plus','readable','actual'])el(id).disabled=surface!=='diagram'||!result.svg;window.labWorkflow?.refreshState();
  }
  el('nav-model').addEventListener('click',()=>navigation('model'));el('nav-views').addEventListener('click',()=>navigation('views'));el('model-search').addEventListener('input',()=>{modelPage=0;modelBrowser()});
  el('customize').addEventListener('click',()=>{creatingNew=true;open()});el('edit-perspective').addEventListener('click',()=>{creatingNew=false;open()});
  for(const id of ['close-scope','cancel-scope'])el(id).addEventListener('click',()=>el('scope-dialog').close());el('scope-root').addEventListener('change',()=>{draftPins.clear();draftHidden.clear();el('scope-find').value='';rootOptions(el('scope-root').value)});el('scope-find').addEventListener('input',()=>{subjectPage=0;rulePage=0;rootOptions()});el('scope-focus').addEventListener('change',()=>{const n=catalog.nodes.find(n=>n.key===el('scope-focus').value);if(n)el('scope-root').value=n.root;draftHidden.delete(el('scope-focus').value);renderExceptions()});
  el('scope-question').addEventListener('change',()=>{const kind=el('scope-question').value;el('scope-depth').value=kind==='diagram'?'1':'2';el('scope-neighbors').value=kind==='interfaces'||kind==='register'?'1':'0'});
  el('apply-scope').addEventListener('click',()=>{if(creatingNew){transient=false;activeViewName=null;el('perspective-name').value=''}creatingNew=false;surface=el('scope-question').value==='breakdown'?'diagram':el('scope-question').value;apply(getRecipe())});
  document.querySelectorAll('[data-surface]').forEach(b=>b.addEventListener('click',()=>{surface=b.dataset.surface;rowFilter='';columnFilter='';page=0;draw()}));
  el('trace-kind').addEventListener('change',()=>{columnFilter='';draw()});
  function saveView(copy=false){
    let name=el('perspective-name').value.trim();const feedback=el('view-save-feedback');
    if(!name||!recipe||!result){feedback.textContent='Enter a name and apply a valid view before saving.';return}
    if(copy&&name===activeViewName)name=newViewName(name+' copy');
    const others=[...saved,...workingViews].filter(v=>copy||v.name!==activeViewName);
    if(others.some(v=>v.name===name)){feedback.textContent='A different view already uses this name. Choose another name; the existing view is unchanged.';return}
    if(new Set(others.map(v=>v.name)).size>=30){feedback.textContent='This project supports 30 custom views. Rename or update an existing view.';return}
    const next=saved.filter(v=>copy||v.name!==activeViewName);next.push({name,recipe:structuredClone(recipe),surface,savedSourceSha256:result.sourceSha256});
    try{localStorage.setItem(key(),JSON.stringify(next));if(!copy||saved.some(v=>v.name===activeViewName))workingViews=workingViews.filter(v=>v.name!==activeViewName);activeViewName=name;el('perspective-name').value=name;transient=false;saved=next;feedback.textContent='View saved in this browser. Save the project file to keep it.';savedNavigation();draw();el('save-menu').open=false;window.labWorkflow?.refreshState()}
    catch{feedback.textContent='Browser storage unavailable. Your current view is retained; retry saving.'}
  }
  el('perspective-name').addEventListener('input',()=>{el('view-save-feedback').textContent=''});
  el('save-perspective').addEventListener('click',()=>saveView());
  el('save-view-copy').addEventListener('click',()=>saveView(true));
  window.scopeWorkbench={
    captureContext:()=>recipe?{recipe:structuredClone(recipe),surface,transient,activeViewName,name:el('perspective-name').value,sourceSha256:report?.sourceSha256,workspaceKey:key(),history:structuredClone(scopeHistory)}:null,
    returnToScope(context){
      if(!context?.recipe||!catalog||!report||busy||context.sourceSha256!==report.sourceSha256||context.workspaceKey!==key()||context.recipe.schemaVersion!==1||!catalog.nodes.some(n=>n.root===context.recipe.root&&n.key===context.recipe.focus))return false;
      transient=context.transient;surface=context.surface;activeViewName=context.activeViewName;el('perspective-name').value=context.name;scopeHistory=structuredClone(context.history||[]);apply(context.recipe);return true;
    },
    active:()=>!!recipe,capture:()=>{restoreContext={transient,surface,activeViewName,name:el('perspective-name').value};return recipe},review:()=>result,appendNavigation:savedNavigation,export:()=>[...workingViews,...saved.filter(s=>!workingViews.some(v=>v.name===s.name))],import(views){el('view-save-feedback').textContent='';saved=views;workingViews=[];scopeHistory=[];restoreContext=null;activeViewName=null;modelPage=0;childPages.clear();expanded.clear();savedNavigation()},selection(id){
      const panel=el('explore-selection');panel.replaceChildren();
      const model=entry(id),basis=report,sourceSha=basis?.sourceSha256,reportSha=basis?.reportIntegrity?.reportSha256;
      const current=()=>report===basis&&report?.sourceSha256===sourceSha&&report?.reportIntegrity?.reportSha256===reportSha;
      if(model?.metaclass==='RequirementUsage'){
        const seen=new Set();
        for(const ref of Array.isArray(model.semantics?.type)?model.semantics.type:[]){
          if(ref?.metaclass!=='RequirementDefinition'||typeof ref.id!=='string'||!ref.id.trim()||ref.id===id||seen.has(ref.id))continue;
          const loaded=entry(ref.id);if(loaded&&loaded.metaclass!=='RequirementDefinition')continue;
          seen.add(ref.id);
          const action=button('Read requirement definition · '+readableName(ref.name||ref.qualifiedName||'Requirement definition'),event=>{if(current())inspect(ref.id,event.currentTarget)});
          action.title=ref.qualifiedName||ref.id;panel.append(action);
        }
      }
      if(!catalog)return;
      const basisCatalog=catalog;
      const choices=(result?.nodes||catalog.nodes).filter(n=>n.elementId===id);
      for(const n of choices.slice(0,8))panel.append(button('Explore '+friendlyPath(n.key),()=>{focusNode(n);closeInspector()}));
      const links=(Array.isArray(catalog.traces)?catalog.traces:[]).filter(t=>t.kind==='satisfy'&&(t.elementId===id||(['RequirementUsage','RequirementDefinition'].includes(model?.metaclass)&&t.targetId===id)));
      const seenLinks=new Set();
      for(const trace of links){
        const keys=trace.sourceOccurrences;
        const destinations=Array.isArray(keys)&&keys.length===1?catalog.nodes.filter(n=>n.key===keys[0]):[];
        if(destinations.length!==1||destinations[0].elementId!==trace.sourceId){panel.append(node('p','Linked target occurrence is unavailable or ambiguous · '+traceLabel(trace)+'. No target has been inferred.','note'));continue}
        const destination=destinations[0],identity=trace.elementId+'|'+destination.key;
        if(seenLinks.has(identity))continue;seenLinks.add(identity);
        const action=button('Explore linked target · '+friendlyPath(destination.key)+' · '+traceLabel(trace),()=>{if(current()&&catalog===basisCatalog){focusNode(destination);closeInspector()}});
        action.title=destination.key;panel.append(action);
      }
    },refresh(){const id=selected?.sessionElementId,wasOpen=!el('inspector').hidden,records=lastEvidence;draw();if(wasOpen&&id)inspect(id);else if(wasOpen&&records)evidence(records.relations,records.title)},setBusy(value){el('customize').disabled=value||!catalog?.roots?.length;if(el('model-open-component-view'))el('model-open-component-view').disabled=value;if(el('model-open-sysml-sheet'))el('model-open-sysml-sheet').disabled=value||typeof window.openSysmlComponent!=='function'},
    leave(){el('canvas').closest('.workspace').classList.remove('table-mode');epoch++;recipe=null;result=null;transient=false;activeViewName=null;el('model-tree').querySelectorAll('[aria-current]').forEach(b=>b.removeAttribute('aria-current'));el('scope-surfaces').hidden=true;el('apply-scope').disabled=false},
    invalidate(){epoch++;result=null;catalog=null;modelSelection=null;el('model-tree').replaceChildren();el('customize').disabled=true;el('scope-surfaces').hidden=true;el('scope-dialog').close()},
    load(data,restore){catalog=data.catalogue;el('customize').disabled=!catalog?.roots?.length;el('customize').title=data.catalogueError||'';if(loadedWorkspace!==key()){loadedWorkspace=key();workingViews=[];modelSelection=null;modelPage=0;childPages.clear();expanded.clear();try{const data=JSON.parse(localStorage.getItem(key())||'[]');saved=Array.isArray(data)?data.filter(s=>typeof s.name==='string'&&s.recipe?.schemaVersion===1).slice(0,30):[]}catch{saved=[]}}savedNavigation();modelBrowser();if(restore&&catalog){if(restoreContext){transient=restoreContext.transient;surface=restoreContext.surface;activeViewName=restoreContext.activeViewName;el('perspective-name').value=restoreContext.name}apply(restore,true)}}
  };
})();
