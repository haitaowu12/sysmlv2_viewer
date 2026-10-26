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
  const matches=(value,query)=>value.toLowerCase().includes(query.toLowerCase());
  const key=()=>`sysml-perspectives-v1:${initial?.workspaceKey||'unassigned'}`;
  let draftPins=new Set(),draftHidden=new Set(),expanded=new Set(),lastEvidence=null;
  const friendlyPath=value=>value.split('/').map(x=>human(x.split('::').pop())).join(' / ');
  const displayLabel=id=>stakeholderMode()?human(label(id).split('::').pop()):label(id);
  function savedNavigation(){
    el('saved-perspectives').replaceChildren();
    if(saved.length)el('saved-perspectives').append(node('h2','Saved locally'));
    saved.forEach(s=>el('saved-perspectives').append(button(s.name,()=>{el('perspective-name').value=s.name;surface=['diagram','interfaces','register','requirements','traces'].includes(s.surface)?s.surface:'diagram';apply(s.recipe)})));
  }
  function renderExceptions(){
    el('scope-exceptions').replaceChildren();
    const nodes=catalog.nodes.filter(n=>n.root===el('scope-root').value&&matches(n.key,el('scope-find').value));
    const counts=node('p',undefined,'note');const updateCounts=()=>counts.textContent=`${Math.min(nodes.length,60)} of ${nodes.length} matching elements · ${draftPins.size} included · ${draftHidden.size} hidden`;updateCounts();el('scope-exceptions').append(counts);
    for(const n of nodes.slice(0,60)){const row=node('label',undefined,'exception-rule'),select=node('select');select.setAttribute('aria-label','Rule for '+n.key);select.append(option('Auto','auto'),option('Include','include'),option('Hide','hide'));select.value=draftHidden.has(n.key)?'hide':draftPins.has(n.key)?'include':'auto';select.options[2].disabled=n.key===el('scope-focus').value;select.addEventListener('change',()=>{draftPins.delete(n.key);draftHidden.delete(n.key);if(select.value==='include')draftPins.add(n.key);if(select.value==='hide')draftHidden.add(n.key);updateCounts()});row.append(node('span',friendlyPath(n.key)),select);el('scope-exceptions').append(row)}
  }
  function rootOptions(focus){
    const nodes=catalog.nodes.filter(n=>n.root===el('scope-root').value&&(matches(n.key,el('scope-find').value)||n.key===focus));
    el('scope-focus').replaceChildren(...nodes.map(n=>option(friendlyPath(n.key),n.key)));
    if(nodes.some(n=>n.key===focus))el('scope-focus').value=focus;
    draftHidden.delete(el('scope-focus').value);renderExceptions();
  }
  function navigation(mode){el('model-browser').hidden=mode!=='model';el('view-browser').hidden=mode==='model';el('nav-model').setAttribute('aria-pressed',String(mode==='model'));el('nav-views').setAttribute('aria-pressed',String(mode!=='model'))}
  function focusNode(n){
    if(!catalog||!report||busy)return;
    el('perspective-name').value=human(n.name)+' review';
    const sameRoot=recipe?.root===n.root;
    apply({schemaVersion:1,root:n.root,focus:n.key,depth:recipe?.depth??1,neighbors:recipe?.neighbors??0,kinds:recipe?.kinds||['connection','binding','flow'],pinned:sameRoot?recipe.pinned:[],hidden:sameRoot?recipe.hidden.filter(k=>k!==n.key):[]});
  }
  function modelBrowser(){
    el('model-tree').replaceChildren();if(!catalog)return;
    const query=el('model-search').value,all=catalog.nodes;
    const list=node('ul');el('model-tree').append(list);
    function add(n,parent,search=false){
      const li=node('li'),row=node('div',undefined,'model-branch'),children=all.filter(c=>c.parent===n.key&&c.root===n.root),sub=node('ul');li.append(row);parent.append(li);
      if(children.length&&!search){const toggle=button(expanded.has(n.key)?'−':'+',()=>{if(expanded.has(n.key))expanded.delete(n.key);else expanded.add(n.key);toggle.textContent=expanded.has(n.key)?'−':'+';toggle.setAttribute('aria-expanded',String(expanded.has(n.key)));sub.replaceChildren();sub.hidden=!expanded.has(n.key);if(!sub.hidden)children.forEach(c=>add(c,sub))});toggle.className='expand-node';toggle.setAttribute('aria-label','Expand '+friendlyPath(n.key));toggle.setAttribute('aria-expanded',String(expanded.has(n.key)));row.append(toggle);sub.hidden=!expanded.has(n.key);li.append(sub);if(!sub.hidden)children.forEach(c=>add(c,sub))}else row.append(node('span',undefined,'leaf-space'));
      const focus=button(human(n.name),()=>focusNode(n));focus.className='focus-node';focus.title=n.key;focus.setAttribute('aria-label','Focus '+n.key);if(recipe?.focus===n.key)focus.setAttribute('aria-current','true');if(search)focus.append(node('span',friendlyPath(n.key),'model-search-path'));row.append(focus);
    }
    if(query){const hits=all.filter(n=>matches(n.key,query));hits.slice(0,60).forEach(n=>add(n,list,true));el('model-tree').append(node('p',`${Math.min(60,hits.length)} of ${hits.length} matches`,'note'))}else all.filter(n=>!n.parent).sort((a,b)=>Number(entry(a.elementId)?.metaclass==='PartDefinition')-Number(entry(b.elementId)?.metaclass==='PartDefinition')).forEach(n=>add(n,list));
  }
  function open(){
    if(!catalog||busy)return;
    draftPins=new Set(recipe?.pinned||[]);draftHidden=new Set(recipe?.hidden||[]);el('scope-root').replaceChildren(...catalog.roots.map(r=>option(friendlyPath(r),r)));
    const presetRoot=report?.views[active]?.targets[0];
    el('scope-root').value=recipe?.root||(catalog.roots.includes(presetRoot)?presetRoot:catalog.roots[0]);
    el('scope-find').value='';rootOptions(recipe?.focus);
    el('scope-depth').value=String(recipe?.depth??1);el('scope-neighbors').value=String(recipe?.neighbors??0);
    ['connection','binding','flow'].forEach(k=>el('scope-'+k).checked=recipe?recipe.kinds.includes(k):true);
    el('scope-error').textContent='';el('scope-advanced').open=false;el('scope-dialog').showModal();
  }
  function getRecipe(){return {schemaVersion:1,root:el('scope-root').value,focus:el('scope-focus').value,depth:Number(el('scope-depth').value),neighbors:Number(el('scope-neighbors').value),kinds:['connection','binding','flow'].filter(k=>el('scope-'+k).checked),pinned:[...draftPins],hidden:[...draftHidden]}}
  async function apply(next,fromValidation=false){
    if(busy&&!fromValidation)return;
    recipe=JSON.parse(JSON.stringify(next));result=null;const ticket=++epoch,sha=report?.sourceSha256;
    if(!sha||!catalog)return;
    el('scope-surfaces').hidden=false;el('scope-summary').textContent='Resolving perspective against the current model…';el('scope-brief').textContent='Updating view…';
    el('reference').disabled=true;el('apply-scope').disabled=true;clearSelection();empty('Building your perspective','Resolving selected components and explicit interface neighbors.');
    try{
      const res=await fetch('/compose',{method:'POST',headers:{'Content-Type':'application/json','X-Session':'__TOKEN__'},body:JSON.stringify({sourceSha256:sha,recipe})});
      const data=await res.json();
      if(ticket!==epoch||report?.sourceSha256!==sha)return;
      if(data.error)throw Error(data.error);if(data.sourceSha256!==sha)throw Error('Perspective revision mismatch');
      result=data;page=0;el('scope-dialog').close();draw();
    }catch(error){if(ticket===epoch){el('scope-error').textContent=String(error);el('scope-summary').textContent=String(error);el('scope-brief').textContent='View needs review — open details';empty('Perspective needs review',String(error))}}
    finally{if(ticket===epoch)el('apply-scope').disabled=false}
  }
  function sourceButton(id,text){const b=button(text||displayLabel(id),event=>{inspect(id,event?.currentTarget);});b.title=label(id);return b}
  function relationLabel(r){return `${r.source.node} / ${r.source.port} ${r.kind==='flow'?'→':'—'} ${r.target.node} / ${r.target.port}${r.item?' · '+r.item:''}`}
  function evidence(relations,title){
    lastEvidence={relations,title};clearSelection();openInspector();el('selected').textContent=title;el('selection-hint').hidden=true;
    el('selection-meta').textContent=`${relations.length} explicit relationship records · revision ${result.sourceSha256.slice(0,12)}`;
    el('snippet').replaceChildren();
    for(const r of relations){const short=key=>key.startsWith(recipe.root+'/')?key.slice(recipe.root.length+1):key;const p=node('div',undefined,'link-evidence');p.append(node('strong',r.kind==='flow'?'Transfer · '+human(r.item):human(r.kind)),node('div',short(r.source.node)+' / '+r.source.port+' '+(r.kind==='flow'?'→':'—')+' '+short(r.target.node)+' / '+r.target.port));const d=node('details');d.append(node('summary','Full model paths'),node('p',relationLabel(r)));p.append(d,sourceButton(r.elementId,'Inspect '+r.kind+' source'));el('snippet').append(p)}
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
      container.append(node('p','One row per contextual connection, binding or declared transfer. Connections have no inferred direction. Owner, ICD approval and acceptance are not supplied by this model projection.','table-caption'));
      const rows=result.relations.filter(r=>matches(relationLabel(r)+' '+r.kind+' '+r.name,rowFilter));const t=table('Interface register',['Relationship','Endpoint A / source','Endpoint B / target','Payload / direction','Evidence']);container.append(t.wrap);
      paged(rows,t.body,(r,body)=>{const tr=node('tr');td(tr,r.kind+' · '+r.name);td(tr,r.source.node+' / '+r.source.port);td(tr,r.target.node+' / '+r.target.port);td(tr,r.kind==='flow'?r.item+' →':'Not directional');td(tr,sourceButton(r.elementId,'Inspect source'));body.append(tr)},container);
    }else if(surface==='requirements'){
      const kind=el('trace-kind').value;
      const selectedIds=new Set(result.nodes.map(n=>n.elementId));
      const allLinks=catalog.traces.filter(t=>t.kind===kind);
      const links=kind==='satisfy'?allLinks.filter(t=>selectedIds.has(t.sourceId)):allLinks;
      const ids=[...new Set(links.map(t=>t.sourceId))].filter(id=>matches(label(id),columnFilter));
      const rows=catalog.requirements.filter(r=>matches(r.qualifiedName,rowFilter));
      container.append(node('p',kind==='satisfy'?'Rows: all extracted requirements. Columns: explicit satisfaction targets present in this perspective. An absent link may be outside the selected scope. Satisfaction is a design assertion, not an execution result.':'Rows: all extracted requirements. Columns: planned verification cases in the whole source model, independent of component selection. These links do not establish executed tests or acceptance.','table-caption'));
      if(rows.length>40||ids.length>40){container.append(node('p','Filter the matrix to at most 40 rows and 40 columns. No cells have been truncated.'));return}
      const t=table(kind==='satisfy'?'Requirement satisfaction · scoped targets':'Requirement verification · model-wide plans',['Requirement',...ids.map(displayLabel),'Link visibility']);
      rows.forEach(r=>{const tr=node('tr');td(tr,sourceButton(r.elementId,stakeholderMode()?human(r.name||r.qualifiedName.split('::').pop()):r.qualifiedName));ids.forEach(id=>{const hits=links.filter(t=>t.sourceId===id&&t.targetId===r.elementId);const cell=td(tr,'');if(!hits.length)cell.textContent='—';else hits.forEach(t=>cell.append(sourceButton(t.elementId,kind==='satisfy'?'S · asserted':'V · planned')))});const global=allLinks.filter(t=>t.targetId===r.elementId),shown=links.filter(t=>t.targetId===r.elementId);td(tr,shown.length?`${shown.length} in scope${ids.length<new Set(links.map(t=>t.sourceId)).size?' · column filter active':''}`:global.length?`${global.length} outside component scope`:'No extracted '+kind+' link');t.body.append(tr)});container.append(t.wrap);
    }else if(surface==='traces'){
      container.append(node('p','Direct model-wide links with exact source witnesses. No transitive relationship is asserted. Source selection drills back to the model. Parent requirements, external design artifacts and executed evidence are not covered by this bounded extractor.','table-caption'));
      const rows=catalog.traces.filter(t=>matches(label(t.sourceId)+' '+label(t.targetId)+' '+t.kind,rowFilter));const t=table('Traceability links · explicit model evidence',['From','Relationship','To','Source witness']);container.append(t.wrap);paged(rows,t.body,(r,body)=>{const tr=node('tr');td(tr,sourceButton(r.sourceId));td(tr,r.kind==='satisfy'?'satisfy · asserted':'verify · planned');td(tr,sourceButton(r.targetId));td(tr,sourceButton(r.elementId,'Inspect statement'));body.append(tr)},container);
    }
  }
  function draw(){
    if(!result||!report||result.sourceSha256!==report.sourceSha256)return;
    resetStory();lastEvidence=null;clearSelection();el('scope-surfaces').hidden=false;el('canvas').closest('.workspace').classList.toggle('table-mode',surface!=='diagram');
    el('view-title').textContent=el('perspective-name').value||'Custom perspective';el('view-purpose').textContent=recipe.focus.split('/').map(x=>human(x.split('::').pop())).join(' › ')+' · analytical view';el('view-purpose').title=recipe.focus;document.title=el('view-title').textContent+' · Modeling lab';
    el('scope').textContent='Revision '+result.sourceSha256.slice(0,12);
    el('scope-summary').textContent=`${result.nodes.length} elements · ${result.relations.length} interface records · ${result.hiddenCount} elements outside view · ${result.crossing.length} crossing records not shown · ${result.filteredRelations} filtered records · ${result.warnings.length} extraction limitations`;
    el('scope-brief').textContent=`${result.nodes.length} elements · ${result.relations.length} interface records`+(result.crossing.length?` · ${result.crossing.length} crossing records not shown`:'')+(result.filteredRelations?` · ${result.filteredRelations} filtered`:'')+(result.warnings.length?` · ${result.warnings.length} extraction limits`:'');
    modelBrowser();const stored=saved.find(s=>s.name===el('perspective-name').value);el('save-label').textContent=stored?(JSON.stringify(stored.recipe)===JSON.stringify(recipe)&&stored.surface===surface?'Saved locally':'Save changes'):'Save view';
    el('scope-brief').title='Inspect full scope and omissions';
    for(const b of el('saved-perspectives').querySelectorAll('button')){if(b.textContent===el('perspective-name').value)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current')}
    Array.from(el('views').children).forEach(b=>{b.classList.remove('active');b.removeAttribute('aria-current')});
    document.querySelectorAll('[data-surface]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.surface===surface)));
    el('trace-kind-label').hidden=surface!=='requirements';
    el('reference').disabled=true;el('canvas').replaceChildren();
    el('explanation').replaceChildren(node('div','Analytical projection · source unchanged · acceptance not assessed'));
    const details=node('details'),summary=node('summary','Scope and extraction limitations');details.append(summary,node('p','Component hierarchy is contextual expansion of resolved features, not physical inventory. Multiplicity instances, arbitrary nested connector chains, native SysML view declarations and inferred indirect links are not represented.'));
    result.warnings.forEach(w=>details.append(node('p',w.scope+': '+w.reason)));
    if(result.crossing.length){details.append(node('p',`${result.crossing.length} explicit relationship records cross the selected boundary.`));const list=node('ul');for(const r of result.crossing)list.append(node('li',relationLabel(r)));el('scope-summary').append(list,button('Show crossing endpoints',()=>{el('scope-info').open=false;const endpoints=[...new Set(result.crossing.flatMap(r=>[r.source.node,r.target.node]))];apply({...recipe,pinned:[...new Set([...recipe.pinned,...endpoints])],hidden:recipe.hidden.filter(k=>!endpoints.includes(k))})}));}el('explanation').append(details);
    if(surface==='diagram'){if(result.svg){mountSvg(stakeholderMode()&&narrowReview()?result.portraitSvg||result.svg:result.svg,result.graphSources);if(stakeholderMode())storyView({viewKind:'custom',title:el('view-title').textContent,takeaway:`${result.nodes.length} components and ${result.relations.length} interface records are included in this perspective.`,discussion:'Does this selection give us the context needed to discuss the component?',scopeElementId:result.nodes.find(n=>n.key===recipe.focus)?.elementId,legendItems:['Lines: connections','Arrows: declared transfers','Dashed lines: same-value bindings','Dotted lines: component hierarchy'],rows:result.nodes.map(n=>({title:human(n.name),elementIds:[n.elementId]})),warnings:result.warnings},true)}else empty('Narrow the diagram',result.diagramError)}else controlsForTable();
    if(surface!=='diagram')renderTableBody();
    for(const id of ['fit','minus','plus','actual'])el(id).disabled=surface!=='diagram'||!result.svg;
  }
  el('nav-model').addEventListener('click',()=>navigation('model'));el('nav-views').addEventListener('click',()=>navigation('views'));el('model-search').addEventListener('input',modelBrowser);
  el('customize').addEventListener('click',open);el('edit-perspective').addEventListener('click',open);
  for(const id of ['close-scope','cancel-scope'])el(id).addEventListener('click',()=>el('scope-dialog').close());el('scope-root').addEventListener('change',()=>{draftPins.clear();draftHidden.clear();el('scope-find').value='';rootOptions()});el('scope-find').addEventListener('input',()=>rootOptions(el('scope-focus').value));el('scope-focus').addEventListener('change',()=>{draftHidden.delete(el('scope-focus').value);renderExceptions()});
  el('apply-scope').addEventListener('click',()=>apply(getRecipe()));
  document.querySelectorAll('[data-surface]').forEach(b=>b.addEventListener('click',()=>{surface=b.dataset.surface;rowFilter='';columnFilter='';page=0;draw()}));
  el('trace-kind').addEventListener('change',()=>{columnFilter='';draw()});
  el('save-perspective').addEventListener('click',()=>{
    const name=el('perspective-name').value.trim();if(!name||!recipe||!result){el('scope-summary').textContent='Enter a name and apply a valid perspective before saving.';return}
    const next=saved.filter(s=>s.name!==name);if(next.length>=30){el('scope-summary').textContent='Local limit: 30 perspectives. Reuse an existing name to update it.';return}
    next.push({name,recipe,surface,savedSourceSha256:result.sourceSha256});
    try{localStorage.setItem(key(),JSON.stringify(next));saved=next;savedNavigation();draw();el('save-menu').open=false;el('scope-brief').textContent+=' · saved locally';el('scope-summary').textContent+=' · saved on this browser'}catch{el('scope-summary').textContent='Browser storage unavailable; the perspective remains usable for this session.'}
  });
  window.scopeWorkbench={
    active:()=>!!recipe,capture:()=>recipe,refresh(){const id=selected?.sessionElementId,wasOpen=!el('inspector').hidden,records=lastEvidence;draw();if(wasOpen&&id)inspect(id);else if(wasOpen&&records)evidence(records.relations,records.title)},setBusy(value){el('customize').disabled=value||!catalog},
    leave(){el('canvas').closest('.workspace').classList.remove('table-mode');epoch++;recipe=null;result=null;el('scope-surfaces').hidden=true;el('apply-scope').disabled=false},
    invalidate(){epoch++;result=null;catalog=null;el('model-tree').replaceChildren();el('customize').disabled=true;el('scope-surfaces').hidden=true;el('scope-dialog').close()},
    load(data,restore){catalog=data.catalogue;el('customize').disabled=!catalog;el('customize').title=data.catalogueError||'';try{const data=JSON.parse(localStorage.getItem(key())||'[]');saved=Array.isArray(data)?data.filter(s=>typeof s.name==='string'&&s.recipe?.schemaVersion===1).slice(0,30):[]}catch{saved=[]}savedNavigation();modelBrowser();if(restore&&catalog)apply(restore,true)}
  };
})();
