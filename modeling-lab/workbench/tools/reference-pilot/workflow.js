/* One local project, one language model. Project downloads are explicit user actions. */
(() => {
  let project=null, pending=null, importedViews=null, lastSaved=null,opening=false,preparedUrl=null;
  const el=id=>document.getElementById(id);
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
  const button=(label,action)=>{const n=node('button',label);n.type='button';n.addEventListener('click',action);return n};
  const dialog=node('dialog');dialog.id='project-dialog';dialog.setAttribute('aria-label','Project workspace');document.body.append(dialog);
  const toolbar=node('div');toolbar.className='project-toolbar';
  toolbar.append(button('Project',()=>projectPanel()),button('Develop model',()=>develop()),button('Review changes',()=>review()));
  document.querySelector('.app-header').insertBefore(toolbar,document.querySelector('.audience'));
  const context=node('div');context.className='project-context';context.setAttribute('aria-label','Current project');
  const projectName=node('strong','Opening study…'),fileState=node('span','Checking model…');fileState.setAttribute('role','status');fileState.id='project-file-state';
  context.append(projectName,fileState,button('Save project file',save));document.querySelector('.app-header').after(context);context.querySelector('button').disabled=true;
  const downloadPanel=node('div');downloadPanel.id='prepared-download';downloadPanel.className='note';downloadPanel.hidden=true;downloadPanel.setAttribute('aria-label','Prepared file');downloadPanel.style.cssText='min-width:0;overflow-wrap:anywhere';
  const downloadLink=node('a');downloadLink.id='prepared-file-link';downloadLink.title='Prepared snapshot. Select to download or retry; prepare a new file after further edits.';
  downloadPanel.append(downloadLink);context.append(downloadPanel);dialog.addEventListener('close',()=>context.append(downloadPanel));
  function refreshState(){
    if(!project)return;projectName.textContent=project.title;
    const changed=stateKey(snapshot())!==lastSaved;fileState.dataset.dirty=String(changed);
    fileState.textContent=lastSaved===null?'Not saved':changed?'Unsaved changes':'Saved snapshot · check Downloads';
    context.querySelector('button').disabled=!report||busy;document.title=project.title+' · '+el('view-title').textContent+' · Modeling lab';
  }
  document.addEventListener('input',refreshState);document.addEventListener('change',refreshState);
  function start(title){if(downloadPanel.parentElement===dialog)context.append(downloadPanel);dialog.replaceChildren();const head=node('div');head.className='dialog-heading';head.append(node('h2',title),button('Close',()=>dialog.close()));dialog.append(head);dialog.showModal();return dialog}
  function field(parent,label,type='input',value=''){const wrap=node('label',label),input=node(type);input.setAttribute('aria-label',label);input.value=value;wrap.append(input);parent.append(wrap);return input}
  function message(parent,text){const n=node('p',text);n.className='note';parent.append(n);return n}
  function error(parent,value){
    if(parent===dialog&&!dialog.open)start('Project needs attention');const full=String(value),technical=full.includes('\n')||full.length>400;
    let message=full;if(technical){const last=full.trim().split('\n').at(-1).replace(/^(?:Error|ValueError|RuntimeError|TypeError):\s*/,'');const viewLine=full.split('\n').find(line=>line.includes('Required view ')),view=viewLine?viewLine.split('Traceback')[0].replace(/^Error:\s*/,'').trim():'';message=last.length<=240&&!/Traceback|wasm-function|syscall\/js/.test(last)?(view&&view!==last?view+' '+last:last):'This step could not be completed. Open technical details for the runtime message.'}
    const n=node('p',message);n.setAttribute('role','alert');n.className='workflow-error';parent.append(n);
    if(technical){const details=node('details');details.append(node('summary','Technical details'),node('pre',full));parent.append(details)}
  }
  function select(parent,label,items){const input=field(parent,label,'select');for(const [value,text] of items){const o=node('option',text);o.value=value;input.append(o)}return input}
  function download(name,content,type){
    const url=URL.createObjectURL(new Blob([content],{type})),previous=preparedUrl;preparedUrl=url;
    downloadLink.href=url;downloadLink.download=name;downloadLink.textContent='Download '+name;downloadPanel.hidden=false;
    if(dialog.open)dialog.append(downloadPanel);else context.append(downloadPanel);
    if(previous)URL.revokeObjectURL(previous);
    // Keep the actual link attached for a fresh user gesture if an automatic request is blocked.
    downloadLink.click();
  }
  function snapshot(){if(!project)return null;return {...project,source:el('source').value,views:project.views,customViews:window.scopeWorkbench.export(),audience:el('audience').value}}
  function stateKey(data){return JSON.stringify(data,(_key,value)=>value!==null&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value)}
  async function inspectSource(source,views,baselineSource){const response=await fetch('/inspect',{method:'POST',headers:{'Content-Type':'application/json','X-Session':'__TOKEN__'},body:JSON.stringify({source,views,baselineSource})}),data=await response.json();if(data.error)throw Error(data.error);if(!data.staticChecksPassed)throw Error('Imported model failed language validation: '+data.diagnostics.map(d=>d.message).join(' '));return data}
  function filename(){return (project.title||'modeling-project').replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,70)}
  function projectPanel(){
    const p=start('Project');if(!project){message(p,'Wait for the initial model to finish validation.');return}
    const title=field(p,'Project name','input',project.title),brief=field(p,'Brief and source basis','textarea',project.brief),questions=field(p,'Assumptions, decisions and open questions','textarea',project.questions);

    const retain=()=>{project.title=title.value.trim()||'Untitled study';project.brief=brief.value;project.questions=questions.value};for(const input of [title,brief,questions])input.addEventListener('input',retain);

    p.append(button('Export recovery project',()=>{retain();recovery()}));
    p.append(button('Export model source',()=>{retain();download(filename()+'.sysml',el('source').value,'text/plain')}));
    p.append(button('Keep notes',()=>{retain();dialog.close()}),button('Save project file',()=>{retain();save()}),button('Export reader review',()=>{retain();exportReview()}));
    const upload=field(p,'Open project file','input');upload.type='file';upload.accept='.json';
    upload.addEventListener('change',async()=>{try{const file=upload.files[0];if(!file)return;if(file.size>8_388_608)throw Error('Project exceeds 8 MiB.');await openProject(JSON.parse(await file.text()));dialog.close()}catch(e){error(p,String(e))}});

    const source=field(p,'Import model source','input');source.type='file';source.accept='.sysml';source.multiple=true;
    const folder=field(p,'Import source folder','input');folder.type='file';folder.setAttribute('webkitdirectory','');folder.multiple=true;
    const intake=node('div');intake.id='source-intake';p.append(intake);let ticket=0;
    const selectedFiles=async(files,directory=false)=>{
      const current=++ticket,revision=editRevision,basis=acceptedReport;intake.replaceChildren();
      try{
        if(!window.sourceSetIntake)throw Error('Source-file import is unavailable. Reload the Lab.');
        const all=Array.from(files||[]),eligible=directory?all.filter(f=>f.name.toLowerCase().endsWith('.sysml')):all;if(!eligible.length)throw Error('Select at least one .sysml source file.');
        const showExcluded=()=>{if(all.length!==eligible.length){const omitted=node('details');omitted.append(node('summary',(all.length-eligible.length)+' other files not imported (.sysml only)'));const names=node('ul');for(const f of all.filter(f=>!eligible.includes(f)))names.append(node('li',f.webkitRelativePath||f.name));omitted.append(names);intake.append(omitted)}};
        const checking=message(intake,'Checking '+eligible.length+' source file'+(eligible.length===1?'':'s')+'…');checking.setAttribute('role','status');intake.setAttribute('aria-busy','true');showExcluded();
        const prepared=await window.sourceSetIntake.fromFiles(eligible);const discovered=await inspectSource(prepared.source);
        if(current!==ticket)return;if(revision!==editRevision||basis!==acceptedReport)throw Error('Current work changed during import. Select the source files again.');
        const targets=sourceTargets(discovered);if(!targets.length)throw Error('The source is valid, but no supported drawing scope was found. Current project is retained.');intake.replaceChildren();
        const details=node('details');details.append(node('summary',prepared.sourceSet.files.length+' source file'+(prepared.sourceSet.files.length===1?'':'s')));const list=node('ul');for(const file of prepared.sourceSet.files)list.append(node('li',file.path));details.append(list);intake.append(details);
        showExcluded();
        const find=field(intake,'Find a model scope to open','input');find.type='search';find.placeholder='Search names or model paths…';
        const target=select(intake,'Open at model scope',[]),count=message(intake,''),pages=node('div');count.id='intake-scope-count';count.setAttribute('role','status');pages.id='intake-scope-pages';pages.className='choice-pagination';pages.style.display='flex';intake.append(pages);let page=0;
        function choices(){
          const state=sourceScopePage(targets,find.value,page);page=state.page;target.replaceChildren();const blank=node('option','Choose a model scope…');blank.value='';target.append(blank);
          for(const e of state.items){const path=e.qualifiedName.split('::'),leaf=human(e.name||path.pop()),namespace=e.name?path.slice(0,-1).join('::'):path.join('::'),context=namespace.length>96?'…'+namespace.slice(-95):namespace;const option=node('option',leaf+(context?' · '+context:'')+' · '+(e.metaclass.endsWith('Definition')?'definition':'model usage'));option.value=e.qualifiedName;option.title=e.qualifiedName;target.append(option)}
          count.textContent=state.total?'Showing '+(page*40+1)+'–'+(page*40+state.items.length)+' of '+state.total+(state.defaultDefinitions?' source-backed part definitions. Search all '+targets.length+' scopes.':' matching model scopes.'):'No matching model scopes.';
          pages.replaceChildren();pages.hidden=state.total<=40;if(!pages.hidden){const previous=button('Previous scopes',()=>{page--;choices()}),next=button('Next scopes',()=>{page++;choices()});previous.disabled=page===0;next.disabled=(page+1)*40>=state.total;pages.append(previous,next)}
          target.title='';open.disabled=true;
        }

        let submitting=false;const cancel=button('Cancel import',()=>{if(submitting)return;ticket++;intake.replaceChildren();source.value='';folder.value=''});
        const open=button('Open selected model',async()=>{if(submitting||!target.value)return;submitting=true;open.disabled=true;cancel.disabled=true;target.disabled=true;find.disabled=true;pages.querySelectorAll('button').forEach(b=>b.disabled=true);try{if(current!==ticket)throw Error('Source selection was cancelled. Choose files again.');if(revision!==editRevision||basis!==acceptedReport)throw Error('Current work changed. Select the source files again.');const chosen=targets.find(e=>e.qualifiedName===target.value),recipe=sourceRecipe(chosen);await openProject({schemaVersion:1,id:crypto.randomUUID(),title:human(chosen.name||chosen.qualifiedName),brief:'',questions:'',source:prepared.source,baselineSource:prepared.source,baselineHash:prepared.sourceSet.assembledSourceSha256,sourceSet:prepared.sourceSet,views:[recipe],customViews:[],history:[]});lastSaved=null;refreshState();dialog.close()}catch(e){error(intake,String(e))}finally{submitting=false;open.disabled=!target.value;cancel.disabled=false;target.disabled=false;find.disabled=false;const total=sourceScopePage(targets,find.value,page).total;pages.querySelectorAll('button').forEach((b,i)=>b.disabled=i===0?page===0:(page+1)*40>=total)}});open.disabled=true;target.addEventListener('change',()=>{open.disabled=submitting||!target.value;target.title=target.value});find.addEventListener('input',()=>{page=0;choices()});choices();
        intake.append(open,cancel);
      }catch(e){if(current===ticket){intake.querySelector('[role=status]')?.remove();error(intake,String(e).replace('The project baseline does not pass browser validation.','The selected source files do not pass validation. Your current project was retained.'))}}finally{if(current===ticket)intake.removeAttribute('aria-busy')}
    };
    source.addEventListener('change',()=>selectedFiles(source.files));folder.addEventListener('change',()=>selectedFiles(folder.files,true));

  }
  function sourceTargets(data){const kinds=new Set(['PartDefinition','PartUsage','ActionDefinition','ActionUsage','PerformActionUsage','StateDefinition','StateUsage','ExhibitStateUsage','RequirementDefinition','RequirementUsage','VerificationCaseDefinition','VerificationCaseUsage']);const seen=new Set();return(data.elements||[]).filter(e=>e.qualifiedName&&kinds.has(e.metaclass)&&!seen.has(e.qualifiedName)&&seen.add(e.qualifiedName)).sort((a,b)=>a.qualifiedName.localeCompare(b.qualifiedName))}
  function sourceScopePage(targets,query='',page=0){const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean),definitions=targets.filter(e=>e.metaclass==='PartDefinition'&&Number.isInteger(e.line)&&e.line>0&&typeof e.source==='string'&&e.source.trim()),defaultDefinitions=!terms.length&&definitions.length>0,pool=defaultDefinitions?definitions:targets,matched=terms.length?pool.filter(e=>{const haystack=(e.qualifiedName+' '+(e.name||'')+' '+human(e.name||e.qualifiedName)+' '+e.metaclass).toLowerCase();return terms.every(term=>haystack.includes(term))}):pool,total=matched.length,last=Math.max(0,Math.ceil(total/40)-1),current=Math.max(0,Math.min(page,last));return{items:matched.slice(current*40,current*40+40),total,page:current,defaultDefinitions}}
  function sourceRecipe(e){const behavior=/^(Action|PerformAction|State|ExhibitState)/.test(e.metaclass);return{id:'overview',names:[e.qualifiedName],view:/^(State|ExhibitState)/.test(e.metaclass)?'STATE':behavior?'ACTION':e.metaclass.startsWith('Part')?'INTERCONNECTION':'TREE',styles:[],...(behavior?{renderer:'behavior'}:e.metaclass.startsWith('Part')?{renderer:'engineering'}:{})}}
  async function validateCandidate(data,payload,future){
    const next=structuredClone(future||(project?snapshot():{schemaVersion:1,id:crypto.randomUUID(),title:'System study',brief:'',questions:'',baselineSource:initial.baselineSource??initial.source,views:initial.presets,customViews:[],history:[],...(initial.sourceSet?{sourceSet:initial.sourceSet}:{})}));
    next.source=data.source;if(data.viewRecipes)next.views=data.viewRecipes;
    const metadata=payload.sourceSet??null;if(stateKey(next.sourceSet??null)!==stateKey(metadata))throw Error('Source-file provenance does not match this project transaction.');
    admitFields(next);if(next.sourceSet!==undefined){if(!window.sourceSetIntake)throw Error('Source-file metadata cannot be checked. Reload the Lab.');next.sourceSet=(await window.sourceSetIntake.admit(next.sourceSet,next.baselineSource)).sourceSet}admitFields(next);return next;
  }
  async function sourceSetStatus(source=el('source').value){const metadata=project?.sourceSet??initial?.sourceSet;if(!metadata)return{status:'untracked',sourceSha256:await sourceHash(source),sourceMap:[]};if(!window.sourceSetIntake)throw Error('Source-file mapping is unavailable.');return window.sourceSetIntake.mappingFor(metadata,source)}
  async function save(){
    if(window.scopeWorkbench.active()&&!window.scopeWorkbench.review()){error(dialog,'The selected view is still building or needs review. Select a valid view before saving.');return}
    if(!report||busy||report.source!==el('source').value){error(dialog,'Validate the current model before saving a project.');return}
    try{const data=structuredClone(snapshot());admitFields(data);await admitRecords(data);admitFields(data);const serialized=stateKey(data),fileContent=JSON.stringify(data,null,2)+'\n';lastSaved=serialized;refreshState();download(filename()+'.modeling.json',fileContent,'application/json');status('Project file download requested · check Downloads for the file','valid')}
    catch(e){error(dialog,String(e)+' Your entered work is retained.');status('Project file not exported · entered work retained','error')}
  }
  async function recovery(){
    if(!project)return;
    try{const data={...structuredClone(snapshot()),recovery:{validation:'unvalidated-draft',acceptedSource:acceptedReport?.source||null,acceptedSourceSha256:acceptedReport?.sourceSha256||null}};admitFields(data);await admitRecords(data);admitFields(data);download(filename()+'.recovery.modeling.json',JSON.stringify(data,null,2)+'\n','application/json');status('Recovery file download requested · check Downloads; includes draft, notes, views and history','valid')}
    catch(e){error(dialog,String(e)+' Your entered work is retained. Copy the affected notes or source before shortening them.');status('Recovery file not exported · entered work retained','error')}
  }
  function admitFields(data){
    if(!data||data.schemaVersion!==1||typeof data.source!=='string'||typeof data.baselineSource!=='string'||!Array.isArray(data.views)||!data.views.length||data.views.length>32||!Array.isArray(data.customViews)||data.customViews.length>30||!Array.isArray(data.history)||data.history.length>100)throw Error('Unsupported project file. Expected a complete Modeling Lab project.');
    for(const key of ['title','brief','questions'])if(typeof data[key]!=='string'||data[key].length>20000)throw Error(({title:'Project name',brief:'Brief and source basis',questions:'Assumptions, decisions and open questions'})[key]+' must contain at most 20,000 characters.');
    if([data.source,data.baselineSource].some(value=>new TextEncoder().encode(value).length>524288))throw Error('Model source and baseline must each fit within 512 KiB.');
    if(new TextEncoder().encode(JSON.stringify(data,null,2)+'\n').length>8_388_608)throw Error('Project exceeds the supported 8 MiB file size.');
  }
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const text=(value,limit)=>typeof value==='string'&&value.length<=limit;
  const optional=(value,fallback)=>value===undefined?fallback:value;
  const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  async function sourceHash(source){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))].map(n=>n.toString(16).padStart(2,'0')).join('')}
  function admitViews(views,label){
    const ids=new Set();
    if(!Array.isArray(views)||views.length<1||views.length>32)throw Error(label+' needs 1–32 view recipes.');
    for(const v of views){
      if(!record(v)||typeof v.id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(v.id)||ids.has(v.id)||!Array.isArray(v.names)||v.names.length!==1||!text(v.names[0],500)||!v.names[0]||!['DEFAULT','TREE','INTERCONNECTION','ACTION','STATE','SEQUENCE','MIXED'].includes(v.view)||!['pilot','engineering','summary','behavior'].includes(optional(v.renderer,'pilot'))||!Array.isArray(optional(v.styles,[]))||(optional(v.styles,[])).some(s=>!['LR','TB','POLYLINE','ORTHOLINE'].includes(s)))throw Error(label+' contains an unsupported or repeated view recipe.');
      ids.add(v.id);
    }
  }
  async function admitRecords(data){
    admitViews(data.views,'Project');const names=new Set(),checks=[];
    for(const v of data.customViews){
      if(!record(v)||!text(v.name,80)||!v.name.trim()||names.has(v.name)||!record(v.recipe)||v.recipe.schemaVersion!==1)throw Error('Invalid or repeated custom view name/recipe.');
      const r=v.recipe,path=value=>text(value,5000)&&value.length>0,paths=value=>Array.isArray(value)&&value.length<=2000&&value.every(path);
      if(!path(r.root)||!path(r.focus)||!Number.isInteger(optional(r.depth,1))||(optional(r.depth,1))<0||(optional(r.depth,1))>4||!Number.isInteger(optional(r.neighbors,0))||(optional(r.neighbors,0))<0||(optional(r.neighbors,0))>2||!Array.isArray(optional(r.kinds,[]))||(optional(r.kinds,[])).some(k=>!['connection','binding','flow'].includes(k))||!paths(optional(r.pinned,[]))||!paths(optional(r.hidden,[]))||!['diagram','interfaces','register','requirements','traces','responsibilities'].includes(optional(v.surface,'diagram')))throw Error('Custom view "'+v.name+'" has an invalid scope, presentation or relationship filter.');
      // Older files may omit default fields. Materialize the existing defaults so UI consumers receive a complete recipe.
      v.recipe={depth:1,neighbors:0,kinds:['connection','binding','flow'],pinned:[],hidden:[],...r};names.add(v.name);
    }
    for(const [i,h] of data.history.entries()){
      const label='Change history entry '+(i+1);
      if(!record(h)||!['minimum','component','scenario','responsibility'].includes(h.operation)||!text(h.target,500)||!h.target||!text(h.description,5000)||!text(h.reason,4000)||!text(h.baseSource,524288)||new TextEncoder().encode(h.baseSource).length>524288||!hash(h.baseSourceSha256)||!hash(h.candidateSourceSha256)||!text(h.before,524288)||!h.before||!text(h.after,524288))throw Error(label+' has incomplete source, hash or change fields.');
      admitViews(h.baseViews,label);
      const at=h.baseSource.indexOf(h.before);
      if(at<0||at!==h.baseSource.lastIndexOf(h.before))throw Error(label+' does not identify one exact source change.');
      const candidate=h.baseSource.slice(0,at)+h.after+h.baseSource.slice(at+h.before.length);
      if(new TextEncoder().encode(candidate).length>524288)throw Error(label+' exceeds the model source size limit.');
      checks.push(()=>Promise.all([sourceHash(h.baseSource),sourceHash(candidate)]).then(([base,next])=>{if(base!==h.baseSourceSha256||next!==h.candidateSourceSha256)throw Error(label+' source and recorded hashes do not match.')}));
    }
    if(data.artifacts!==undefined){
      if(!Array.isArray(data.artifacts)||data.artifacts.length>100||data.artifacts.some(a=>!record(a)||!text(a.name,200)||!a.name||!hash(a.sourceSha256)||a.kind!=='reader-review'||a.status!=='download-requested'||!Array.isArray(a.targets)||a.targets.length>32||a.targets.some(t=>!text(t,500))))throw Error('Invalid reader artifact record. Current project is retained.');
    }
    if(data.recovery!==undefined){
      const r=data.recovery;
      if(!record(r)||r.validation!=='unvalidated-draft'||!text(r.acceptedSource,524288)||new TextEncoder().encode(r.acceptedSource).length>524288||!hash(r.acceptedSourceSha256))throw Error('Recovery project is missing its retained accepted source and hash.');
      checks.push(()=>sourceHash(r.acceptedSource).then(value=>{if(value!==r.acceptedSourceSha256)throw Error('Recovery accepted source and recorded hash do not match.')}));
    }
    if(data.sourceSet!==undefined){if(!window.sourceSetIntake)throw Error('Source-file metadata cannot be checked. Reload the Lab.');checks.push(async()=>{data.sourceSet=(await window.sourceSetIntake.admit(data.sourceSet,data.baselineSource)).sourceSet})}
    for(const [i,h] of data.history.entries())if(h.baseSourceSet!==undefined){if(!window.sourceSetIntake)throw Error('Historical source-file metadata cannot be checked. Reload the Lab.');checks.push(async()=>{try{h.baseSourceSet=(await window.sourceSetIntake.admit(h.baseSourceSet)).sourceSet}catch(e){throw Error('Change history entry '+(i+1)+': '+e.message)}})}
    await Promise.all(checks.map(check=>check()));
  }
  async function openProject(data){
    if(busy||opening)throw Error('Wait for the current model check before opening another project.');
    admitFields(data);
    if(data.id!==undefined&&(typeof data.id!=='string'||!data.id.trim()||data.id.length>200))throw Error('Project identity must contain 1–200 characters. Current project is retained.');
    const revision=editRevision,basis=acceptedReport,candidate=structuredClone(data);
    const recoveryDraft=candidate.recovery?.validation==='unvalidated-draft'?candidate.source:null;
    const checkedSource=recoveryDraft!==null?candidate.recovery.acceptedSource:candidate.source;
    if(typeof checkedSource!=='string'||new TextEncoder().encode(checkedSource).length>524288)throw Error('Recovery project needs its retained accepted model source. Exported draft and notes remain available in the file.');
    candidate.id=typeof data.id==='string'?data.id:crypto.randomUUID();
    opening=true;status('Opening project · checking model and baseline…');dialog.setAttribute('aria-busy','true');
    try{
      await admitRecords(candidate);
      await inspectSource(checkedSource,candidate.views,candidate.baselineSource);
      if(revision!==editRevision||basis!==acceptedReport)throw Error('Draft changed while opening the project. Current work is retained.');
      const accepted=await render(false,{source:checkedSource,project:candidate,payload:{views:candidate.views,baselineSource:candidate.baselineSource,workspaceKey:candidate.id,sourceSet:candidate.sourceSet??null},commit(){
        project=candidate;delete project.recovery;pending=null;importedViews=candidate.customViews;initial.workspaceKey=project.id;initial.source=project.baselineSource;
        el('source').value=checkedSource;el('audience').value=data.audience==='stakeholder'?'stakeholder':'engineering';document.body.classList.toggle('stakeholder',stakeholderMode());window.scopeWorkbench.leave();el('view-search').value='';el('model-search').value='';
      }});
      if(!accepted){const reason=el('diagnostics').textContent.trim();throw Error('Project was not opened. Current project and draft are retained.'+(reason?'\n'+reason:''))}
      if(recoveryDraft!==null){el('source').value=recoveryDraft;invalidateDraft();el('editor').open=true;lastSaved=null;status('Recovery draft and project restored · validate the draft before normal saving','valid')}else lastSaved=stateKey(snapshot());refreshState();
    }catch(error){status('Project not opened · current project retained','error');throw error}
    finally{opening=false;dialog.removeAttribute('aria-busy')}
  }
  function supportedTargets(operation){const kinds={minimum:['RequirementUsage','RequirementDefinition'],component:['PartDefinition','PartUsage','Package'],scenario:['Package'],responsibility:['PartDefinition','PartUsage']}[operation];return report.elements.filter(e=>e.qualifiedName&&kinds.includes(e.metaclass)&&(operation!=='minimum'||(/\bdoc\s*\/\*/.test(e.source||'')&&(e.source.match(/>=\s*-?\d+/g)||[]).length===1))&&(!['component','responsibility'].includes(operation)||e.source?.trim().endsWith('}'))).map(e=>[e.qualifiedName,human(e.name||e.qualifiedName)+' · '+e.qualifiedName])}
  function develop(){
    if(!report||busy){start('Develop model');message(dialog,'Validate the current model before developing it.');return}
    const p=start('Develop model');message(p,'Make a small, explicit engineering change. Review and validate it before applying it to this project.');
    const task=select(p,'Engineering task',[['minimum','Revise an integer requirement minimum'],['scenario','Add an ordered operational scenario'],['responsibility','Assign a scenario to a component'],['component','Add a component']]);
    const fields=node('div');fields.className='workflow-fields';p.append(fields);
    function form(){
      pending=null;fields.replaceChildren();const op=task.value,target=select(fields,'In this scope',supportedTargets(op));if(selected?.qualifiedName&&[...target.options].some(o=>o.value===selected.qualifiedName))target.value=selected.qualifiedName;
      let value,statement,name,description,steps,action;
      if(op==='minimum'){value=field(fields,'Required minimum');value.type='number';value.min='0';value.max='1000000';statement=field(fields,'Complete requirement statement','textarea');const fill=()=>{const e=report.elements.find(e=>e.qualifiedName===target.value);statement.value=e?.source?.match(/\bdoc\s*\/\*([\s\S]*?)\*\//)?.[1].trim()||'';value.value=e?.source?.match(/>=\s*(-?\d+)/)?.[1]||''};fill();target.addEventListener('change',fill)}
      else{name=field(fields,'Short model name');name.maxLength=64;name.placeholder=op==='component'?'maintenancePanel':op==='scenario'?'reviewAlarm':'performAlarmReview';const nameHint=message(fields,'Start with a letter or underscore; use letters, numbers or underscores, with no spaces (up to 64 characters). Display labels add spaces automatically.');nameHint.id='model-name-hint';name.setAttribute('aria-describedby',nameHint.id);if(op==='responsibility')action=select(fields,'Scenario to perform',report.elements.filter(e=>e.metaclass==='ActionDefinition'&&e.qualifiedName).map(e=>[e.qualifiedName,human(e.name)+' · '+e.qualifiedName]));else description=field(fields,'Engineering description','textarea');if(op==='scenario'){steps=field(fields,'Ordered steps: shortName | engineering description, one per line','textarea');steps.placeholder='request | Operator requests service\nrespond | System responds to the request';message(fields,'This creates an abstract declared sequence. Conditions, timing, safeguards and successful execution are not inferred.')}}
      const reason=field(fields,'Source quotation or decision supporting this change','textarea');
      message(fields,'Edits to a shared definition affect all its uses. Unsupported constructs remain available in the source editor.');
      fields.append(button('Prepare change',async()=>{
        const old=fields.querySelector('[role=alert]');old?.remove();if(busy||!report)return;
        const req={operation:op,target:target.value,baseSourceSha256:report.sourceSha256,reason:reason.value};
        if(op==='minimum'){req.value=Number(value.value);req.statement=statement.value;if(value.value.trim()===''){error(fields,'Enter a required minimum.');return}}
        else{req.name=name.value;if(description)req.description=description.value;if(action)req.action=action.value;if(steps)req.steps=steps.value.split('\n').filter(s=>s.trim()).map(s=>{const i=s.indexOf('|');return {name:i<0?s.trim():s.slice(0,i).trim(),description:i<0?'':s.slice(i+1).trim()}})}
        const revision=report.sourceSha256,projectId=project.id,source=report.source;const prepareButton=fields.querySelector('button');prepareButton.disabled=true;status('Validating the proposed engineering change…');
        try{const response=await fetch('/prepare',{method:'POST',headers:{'Content-Type':'application/json','X-Session':'__TOKEN__'},body:JSON.stringify(req)}),data=await response.json();if(data.error)throw Error(data.error+(data.diagnostics?' '+data.diagnostics.map(d=>d.message).join(' '):''));if(report?.sourceSha256!==revision||report.source!==source||project.id!==projectId)throw Error('Model changed during preparation. Reopen the task.');pending={...data,baseSource:report.source,baseViews:structuredClone(project.views),...(project.sourceSet?{baseSourceSet:structuredClone(project.sourceSet)}:{})};proposalPanel();status('Proposal validated · review before applying','valid')}catch(e){error(fields,String(e));status('Proposed change was not applied','error')}finally{prepareButton.disabled=false}
      }));
    }
    task.addEventListener('change',form);form();
  }
  function proposalPanel(){
    const p=start('Review proposed change');p.append(node('p',pending.proposal.description));message(p,'Basis: '+pending.proposal.reason);
    for(const change of pending.changeSummary||[]){p.append(node('p',change.text),node('p',change.consequence))}
    message(p,'Potentially affected information follows explicit model references. This is not a complete causal or safety impact analysis.');
    const target=report.elements.find(e=>e.qualifiedName===pending.proposal.target);const linked=target?report.elements.filter(e=>e!==target&&e.qualifiedName&&/^(Part|Action|Requirement|VerificationCase|Interface|Connection|Perform)/.test(e.metaclass)&&Object.entries(e.semantics||{}).some(([role,value])=>!/^(owner|ownedElement|ownedFeature|feature|inheritedFeature)$/.test(role)&&JSON.stringify(value).includes(target.sessionElementId))):[];
    const list=node('ul');for(const e of linked.slice(0,20))list.append(node('li',e.qualifiedName||e.name||e.metaclass));p.append(list);if(linked.length>20)message(p,`${linked.length-20} additional references omitted; steward review required.`);if(!linked.length)message(p,'No direct references extracted by this bounded check; absence is not proof of no impact.');
    const details=node('details');details.append(node('summary','Inspect exact source change'),node('pre',pending.proposal.before+'\n→\n'+pending.proposal.after));p.append(details);
    p.append(button('Apply to project',async()=>{if(!report||report.sourceSha256!==pending.proposal.baseSourceSha256){error(p,'The model changed. Reopen the task.');return}const proposed=pending,entry={...proposed.proposal,baseSource:proposed.baseSource,baseViews:proposed.baseViews,...(proposed.baseSourceSet?{baseSourceSet:proposed.baseSourceSet}:{})},future={...snapshot(),source:proposed.source,views:proposed.views,history:[...project.history,entry].slice(-100)};try{admitFields(future)}catch(e){error(p,String(e));return}const accepted=await render(false,{source:proposed.source,project:future,payload:{views:proposed.views,baselineSource:project.baselineSource,workspaceKey:initial.workspaceKey,sourceSet:project.sourceSet??null},validate(data){if(data.source!==proposed.source||data.sourceSha256!==proposed.proposal.candidateSourceSha256)throw Error('Validated result does not match the prepared change.');},commit(){project.views=proposed.views;project.history.push(entry);if(project.history.length>100)project.history.shift();el('source').value=proposed.source;pending=null;}});if(accepted){dialog.close();el('editor').open=false;syncEditor()}}),button('Discard proposal',()=>{pending=null;dialog.close()}));
  }
  function review(){
    const p=start('Change review');if(!project)return;
    message(p,'Current baseline: '+(project.baselineHash||'the source opened with this project')+'. Historical results retain their original revision; a model change does not establish a new pass.');
    for(const h of project.history){const section=node('section');section.append(node('h3',h.description),node('p','Basis: '+h.reason),node('p',h.baseSourceSha256.slice(0,12)+' → '+h.candidateSourceSha256.slice(0,12)));p.append(section)}
    if(!project.history.length)message(p,'No engineering task changes recorded yet. Source-editor changes are shown by the current model and declaration comparison.');
    for(const a of project.artifacts||[])message(p,a.name+' · prepared at '+a.sourceSha256.slice(0,12)+(a.sourceSha256===report?.sourceSha256?' · current model basis':' · model basis changed; review applicability and reissue if needed')+'. Historical export is retained; no execution result is inferred.');
    for(const c of report?.changeSummary||[])p.append(node('p',c.text),node('p',c.consequence));
    if(project.history.length)p.append(button('Undo last engineering change',async()=>{const last=project.history.at(-1);if(!report||report.sourceSha256!==last.candidateSourceSha256){error(p,'Later changes exist. Reconcile them before undoing this task.');return}const restoredSourceSet=last.baseSourceSet??project.sourceSet,future={...snapshot(),source:last.baseSource,views:last.baseViews,history:project.history.slice(0,-1),...(restoredSourceSet?{sourceSet:restoredSourceSet}:{})};try{admitFields(future)}catch(e){error(p,String(e));return}const accepted=await render(false,{source:last.baseSource,project:future,payload:{views:last.baseViews,baselineSource:project.baselineSource,workspaceKey:initial.workspaceKey,sourceSet:restoredSourceSet??null},validate(data){if(data.source!==last.baseSource||data.sourceSha256!==last.baseSourceSha256)throw Error('Undo result does not match the recorded base.');},commit(){project.history.pop();project.views=last.baseViews;if(restoredSourceSet)project.sourceSet=restoredSourceSet;el('source').value=last.baseSource;}});if(accepted)dialog.close()}));
    p.append(button('Export reader review',exportReview));
  }
  function safeSvg(content){const doc=new DOMParser().parseFromString(content||'','image/svg+xml');if(doc.documentElement.localName!=='svg')return node('p','View unavailable.');const svg=doc.documentElement;svg.querySelectorAll('script,foreignObject,iframe,image,use,style,animate,set').forEach(e=>e.remove());for(const e of [svg,...svg.querySelectorAll('*')])for(const a of [...e.attributes])if(a.name.startsWith('on')||a.localName==='href')e.removeAttributeNode(a);return document.importNode(svg,true)}
  function exportReview(){
    if(window.scopeWorkbench.active()&&!window.scopeWorkbench.review()){error(dialog,'The selected view is still building or needs review. Select a valid view before exporting.');return}
    if(!report||busy||report.source!==el('source').value){error(dialog,'Validate the model before exporting a reader review.');return}
    project.artifacts??=[];const artifactName=filename()+'.review.html';project.artifacts.push({name:artifactName,sourceSha256:report.sourceSha256,kind:'reader-review',status:'download-requested',targets:report.views.flatMap(v=>v.targets)});if(project.artifacts.length>100)project.artifacts.shift();
    const doc=document.implementation.createHTMLDocument(project.title+' · review');doc.documentElement.lang='en';const charset=doc.createElement('meta');charset.setAttribute('charset','utf-8');const viewport=doc.createElement('meta');viewport.name='viewport';viewport.content='width=device-width,initial-scale=1';doc.head.prepend(charset,viewport);const meta=doc.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'";doc.head.append(meta);const style=doc.createElement('style');style.textContent='body{font:16px/1.6 system-ui;color:#203d4c;max-width:1100px;margin:40px auto;padding:0 24px}section{border-top:1px solid #d6e0e5;padding:24px 0;break-inside:avoid}svg{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}.reader-notes{white-space:pre-wrap}details{margin:18px 0}summary{cursor:pointer;font-weight:600}h1,h2{line-height:1.25}.endpoint{display:grid;gap:5px}.endpoint-context,.endpoint-port{font-size:12px}.endpoint details{font-size:11px}.endpoint code{display:block;overflow-wrap:anywhere;white-space:normal}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:13px}td,th{border:1px solid #ccd;padding:8px;text-align:left;overflow-wrap:anywhere}';doc.head.append(style);
    const body=doc.body;body.append(node('h1',project.title),node('p','Frozen reader review · revision '+report.sourceSha256.slice(0,12)+' · static checks passed; execution and acceptance not assessed.'));const notes=node('details');notes.append(node('summary','Brief, decisions and engineering change record'),node('p','Full model revision: '+report.sourceSha256),node('h2','Brief and source basis'));const brief=node('div',project.brief),questions=node('div',project.questions);brief.className=questions.className='reader-notes';notes.append(brief,node('h2','Assumptions, decisions and open questions'),questions);body.append(notes);
    for(const a of project.artifacts)notes.append(node('p',a.name+' · revision '+a.sourceSha256.slice(0,12)+(a.sourceSha256===report.sourceSha256?' · current basis':' · earlier basis: review applicability; historical artifact retained')));
    for(const h of project.history)notes.append(node('p',h.description+' Basis: '+h.reason));if(report.changeSummary?.length)body.append(node('h2','Change for review'));for(const c of report.changeSummary||[])body.append(node('p',c.text+' '+c.consequence));
    function readerFacts(section,p,behavior){
      if(p?.question)section.append(node('h3',p.question));if(p?.takeaway)section.append(node('p',p.takeaway));
      const source=new Map(report.elements.map(e=>[e.sessionElementId,e]));for(const e of behavior?.evidence||[])if(!source.has(e.elementId))source.set(e.elementId,e);
      function detailsValue(value){if(Array.isArray(value)){const list=node('ul');for(const item of value){const li=node('li');li.append(detailsValue(item));list.append(li)}return list}if(value&&typeof value==='object'){const list=node('dl');for(const [key,item] of Object.entries(value)){list.append(node('dt',human(key)));const dd=node('dd');dd.append(detailsValue(item));list.append(dd)}return list}return node('span',value===null?'No value supplied':String(value))}
      if(p?.rows?.length){const facts=node('div'),material=node('div');facts.className='reader-facts';material.className='reader-facts reader-material';for(const row of p.rows){const entry=node('div');entry.append(node('h4',row.title),node('p',row.body));if(row.textTruncated)entry.append(node('p','Source excerpt truncated; consult the editable model for the complete declaration.'));const metadata=Object.fromEntries(Object.entries(row).filter(([key])=>!['title','body','textTruncated','elementIds'].includes(key)));if(Object.keys(metadata).length){const more=node('details');more.append(node('summary','Comparison and evidence details'),detailsValue(metadata));entry.append(more)}if(row.elementIds?.length){const witness=node('details');witness.append(node('summary','Source evidence for this fact'));for(const id of row.elementIds){const e=source.get(id);witness.append(node('p',e?.qualifiedName||e?.name||'Model evidence '+id));if(e?.source||e?.excerpt)witness.append(node('pre',e.source||e.excerpt));else witness.append(node('p','Exact source excerpt is not included in this reader; use the editable project to inspect evidence '+id+'.'));if(e?.excerptTruncated)witness.append(node('p','Evidence excerpt truncated.'))}entry.append(witness)}(row.kind==='declared-capacity-comparison'||row.status==='declared-design-shortfall'?material:facts).append(entry)}if(material.childElementCount)section.append(material);if(facts.childElementCount){const disclosure=node('details');disclosure.className='reader-facts-disclosure';disclosure.append(node('summary','Declared facts and conditions ('+facts.childElementCount+' records)'),facts);section.append(disclosure)}}
      if(behavior){
        if(behavior.coverage==='partial'){const partial=node('p','Partial behavior projection');partial.className='reader-partial';section.append(partial)}
        const disclosure=node('details'),content=node('div');disclosure.className='reader-behavior';disclosure.append(node('summary','Behavior conditions ('+(behavior.relations||[]).length+' relationships, '+(behavior.nodes||[]).length+' nodes)'),content);section.append(disclosure);
        content.append(node('p',behavior.boundary));const nodes=new Map((behavior.nodes||[]).map(n=>[n.id,n]));
        for(const n of behavior.nodes||[]){if(['StateDefinition','StateUsage','ExhibitStateUsage'].includes(n.kind))content.append(node('p',human(n.name)+' · Parallel regions: '+(n.parallel===true?'yes, declared concurrent.':n.parallel===false?'no, exported false.':'evidence unavailable; do not infer absence.')));for(const [key,label] of [['entryAction','Entry'],['doAction','During'],['exitAction','Exit']])for(const item of n.subactions?.[key]||[])content.append(node('p',human(n.name)+' / '+label+': '+item.text+(item.textTruncated?' [excerpt truncated]':'')));for(const item of n.entryDeclarations||[])content.append(node('p',human(n.name)+' / Entry declaration: '+item.text+(item.textTruncated?' [excerpt truncated]':'')));for(const item of n.constraints||[])content.append(node('p',human(n.name)+' / Constraint: '+item.text+(item.textTruncated?' [excerpt truncated]':'')))}
        for(const [i,r] of (behavior.relations||[]).entries()){content.append(node('h4','R'+(i+1)+': '+human(nodes.get(r.source)?.name||r.source)+' → '+human(nodes.get(r.target)?.name||r.target)));for(const [key,label] of [['triggers','Trigger'],['guards','Guard'],['effects','Effect']]){for(const item of r[key]||[])content.append(node('p',label+': '+item.text+(item.textTruncated?' [excerpt truncated]':'')));const status=r.conditionStatus?.[key];if(status==='not-declared')content.append(node('p',label+': no explicit declaration in the exported field.'));else if(status==='unknown'||status==='unavailable'||(r.kind==='TransitionUsage'&&!status))content.append(node('p',label+': evidence unavailable; do not infer absence.'))}if(r.entryDeclaration)content.append(node('p','Initial entry succession has an explicit declaration witness; no action identity is inferred.'));if(r.declaration)content.append(node('pre',r.declaration+(r.declarationTruncated?'\n[excerpt truncated]':'')))}
      }
      if(p?.acceptance){const acceptance=node('p','Acceptance: '+p.acceptance);acceptance.className='reader-acceptance';section.append(acceptance)}
      const groups=new Map();for(const [origin,records] of [['stakeholder',p?.warnings||[]],['behavior',behavior?.warnings||[]]])for(const warning of records){const reason=typeof warning==='string'?warning:warning.reason,group=groups.get(reason)||{stakeholder:0,behavior:0,objects:new Map()};group[origin]++;if(typeof warning==='object')group.objects.set(JSON.stringify(warning),warning);groups.set(reason,group)}
      const scopeNotes=[...new Set([...(p?.omissions||[]),...(behavior?.limits||[])])];
      if(groups.size||scopeNotes.length||p?.discussion){
        const limits=node('details');limits.className='reader-limits';limits.append(node('summary','Scope and evidence limits ('+groups.size+' warning groups, '+scopeNotes.length+' scope notes)'));
        for(const [reason,group] of groups){const item=node('details');item.append(node('summary',reason),node('p','Stakeholder warning records: '+group.stakeholder+'; behavior warning records: '+group.behavior+'.'));for(const warning of group.objects.values()){const metadata={...warning};delete metadata.reason;item.append(detailsValue(metadata));const witness=source.get(warning.elementId);if(witness?.source||witness?.excerpt)item.append(node('pre',witness.source||witness.excerpt));if(witness?.excerptTruncated)item.append(node('p','Evidence excerpt truncated.'))}limits.append(item)}
        for(const note of scopeNotes)limits.append(node('p',note));if(p?.discussion)limits.append(node('p','For discussion: '+p.discussion));section.append(limits);
        if(groups.size&&behavior?.coverage!=='partial'){const indicator=node('p','Projection limitations: '+groups.size+' warning group'+(groups.size===1?'':'s'));indicator.className='reader-partial';section.append(indicator)}
      }
    }
    for(const v of report.views){const section=node('section');section.className='reader-view';section.dataset.viewId=v.id;section.append(node('h2',v.stakeholder?.title||viewLabel(v.id)),node('p','Scope'));for(const target of v.targets){const e=report.elements.find(e=>e.qualifiedName===target);section.append(modelCard(target,e?.metaclass?.endsWith('Definition')?'definition':e?.metaclass==='PartUsage'?'model occurrence':''))}section.append(safeSvg(v.stakeholderSvg||v.svg));if(v.stakeholder?.statement)section.append(node('blockquote',v.stakeholder.statement));readerFacts(section,v.stakeholder,v.behavior||v.stakeholder?.behavior);if(v.error)section.append(node('p',v.error));body.append(section)}
    const custom=window.scopeWorkbench.active();if(custom){const section=node('section');section.append(node('h2',el('view-title').textContent),node('p',el('scope-brief').textContent+' · scope and omissions are recorded in the interface register below'));const current=el('canvas').querySelector('svg');if(current)section.append(safeSvg(new XMLSerializer().serializeToString(current)));else{const table=el('canvas').querySelector('table');if(table){const clone=table.cloneNode(true);clone.querySelectorAll('button').forEach(b=>b.replaceWith(node('span',b.textContent.startsWith('Inspect')?'See source register below':b.textContent)));section.append(clone)}}body.append(section)}
    function readerTable(title,headers,rows,note,scope='Model-wide'){
      const appendix=node('details');appendix.className='reader-appendix';appendix.append(node('summary',scope+' '+title.toLowerCase()+' ('+rows.length+' records'+(rows.length>500?'; 500 included, '+(rows.length-500)+' omitted':'')+')'));
      const section=node('section');section.append(node('h2',title),node('p',note));const table=node('table'),head=node('tr');headers.forEach(h=>head.append(node('th',h)));table.append(head);for(const row of rows.slice(0,500)){const tr=node('tr');row.forEach(value=>{const cell=node('td');cell.append(value instanceof Node?value:document.createTextNode(value));tr.append(cell)});table.append(tr)}section.append(table);if(rows.length>500)section.append(node('p',`${rows.length-500} records omitted from this export; narrow the view and re-export. The full model remains in the project file.`));appendix.append(section);body.append(appendix);
    }
    const scoped=window.scopeWorkbench.review(),relations=scoped?.relations||report.catalogue?.relations||[],coverage=report.catalogue?.coverage,configured=coverage?.mode==='configured-part-scopes',configuredRoots=coverage?.configuredRoots||report.catalogue?.roots||[];
    const coverageLabel=configured?'configured part scopes ('+configuredRoots.length+' included roots; '+(Number.isInteger(coverage.excludedRootCount)?coverage.excludedRootCount:'unknown')+' excluded roots)':'';
    if(configured){const qualification=node('p','Interface coverage: '+coverageLabel+'. '+(coverage.traceabilityLimit||'Only configured part scopes have occurrence coverage; absence here does not establish absence elsewhere.'));qualification.className='reader-coverage';body.append(qualification)}
    const scopeNote=(scoped?`${scoped.nodes.length} elements · ${scoped.relations.length} interface records · ${scoped.hiddenCount} elements outside view · ${scoped.crossing.length} crossing records not shown · ${scoped.filteredRelations} filtered records · ${scoped.warnings.length} extraction limitations`:configured?'Contextual records from configured part scopes; repeated definitions may occur in several scopes. This is not a physical inventory or a controlled ICD.':'Model-wide contextual records; repeated definitions may occur in several scopes. This is not a physical inventory or a controlled ICD.')+(configured?' Included roots: '+configuredRoots.join(', ')+'. Global extraction unavailable: '+(coverage.globalUnavailableReason||'reason not supplied')+'. '+(coverage.traceabilityLimit||''):'');
    readerTable('Interface register',['Kind','Scope','Endpoint A / source','Endpoint B / target','Direction / payload','Source witness'],relations.map(r=>[r.kind,modelCard(r.scope||'','model scope'),endpointCard(r.source,report.catalogue?.nodes),endpointCard(r.target,report.catalogue?.nodes),r.kind==='flow'?'→ '+readableName(r.item):'Not directional',report.elements.find(e=>e.sessionElementId===r.elementId)?.source||'Source unavailable']),scopeNote,configured?(scoped?'Current perspective within ':'')+coverageLabel:scoped?'Current perspective':'Model-wide');
    const assignments=[];for(const e of report.elements.filter(e=>e.metaclass==='PerformActionUsage'))for(const t of e.semantics?.type||[])if(t.metaclass==='ActionDefinition')assignments.push([modelCard(e.semantics?.owner?.qualifiedName||'Unknown owner',e.semantics?.owner?.metaclass==='PartDefinition'?'component definition':'component'),modelCard(t.qualifiedName,'scenario definition'),assignmentScope,e.source||'']);
    readerTable('Declared responsibilities',['Component / definition','Performs scenario','Assignment scope','Source witness'],assignments,'Source-defined performance assignments, not inferred allocation or execution evidence.');
    const requirements=report.catalogue?.requirements||[],requirementAppendix=node('details');requirementAppendix.className='reader-appendix';requirementAppendix.append(node('summary',report.catalogue?'Model-wide requirements register ('+requirements.length+' records)':'Requirements register · extraction unavailable'));
    const register=node('section');register.append(node('h2','Requirements register'));for(const r of requirements){const e=report.elements.find(e=>e.sessionElementId===r.elementId);register.append(node('h3',e?.qualifiedName||r.qualifiedName||r.name||r.elementId),node('pre',e?.source||'Source unavailable in this reader; inspect the editable project.'))}if(!report.catalogue)register.append(node('p','Requirement extraction unavailable for this scope; inspect the project source. Absence of this register is not absence of requirements.'));requirementAppendix.append(register);body.append(requirementAppendix);
    const recipes=node('details');recipes.append(node('summary','Saved custom view definitions and scope'),node('pre',JSON.stringify(window.scopeWorkbench.export(),null,2)));body.append(recipes);
    download(filename()+'.review.html','<!doctype html>\n'+doc.documentElement.outerHTML,'text/html');status('Reader review download requested · check Downloads for the file','valid');refreshState();
  }
  window.labWorkflow={
    payload(){return project?{views:project.views,baselineSource:project.baselineSource,workspaceKey:initial.workspaceKey,sourceSet:project.sourceSet??null}:{views:initial.presets,baselineSource:initial.baselineSource??initial.source,workspaceKey:initial.workspaceKey,sourceSet:initial.sourceSet??null}},
    onReport(data){
      if(!project)project={schemaVersion:1,id:initial.acceptedReport&&typeof initial.workspaceKey==='string'&&initial.workspaceKey.trim()&&initial.workspaceKey.length<=200?initial.workspaceKey:crypto.randomUUID(),title:(text(initial.title,20000)?initial.title.trim():'')||'System study',brief:text(initial.brief,20000)?initial.brief:'',questions:text(initial.questions,20000)?initial.questions:'',baselineSource:initial.baselineSource??initial.source,baselineHash:hash(initial.baselineHash)?initial.baselineHash:(!initial.baselineSource||initial.baselineSource===initial.source?data.sourceSha256:undefined),views:initial.presets,history:[],...(initial.sourceSet?{sourceSet:initial.sourceSet}:{})};
      if(data.viewRecipes)project.views=data.viewRecipes;
      if(importedViews){window.scopeWorkbench.import(importedViews);importedViews=null}
      toolbar.querySelectorAll('button').forEach(b=>b.disabled=false);refreshState();
    },
    snapshot,openProject,refreshState,recovery,validateCandidate,sourceSetStatus,sourceTargets,sourceScopePage,sourceRecipe,
    capture(){return {project:structuredClone(project),pending:structuredClone(pending),lastSaved,source:el('source').value,audience:el('audience').value,initialSource:initial.source,workspaceKey:initial.workspaceKey,customViews:window.scopeWorkbench.export()}},
    restore(state){if(!state)return;project=state.project;pending=state.pending;lastSaved=state.lastSaved;importedViews=null;el('source').value=state.source;el('audience').value=state.audience;initial.source=state.initialSource;initial.workspaceKey=state.workspaceKey;document.body.classList.toggle('stakeholder',stakeholderMode());window.scopeWorkbench.import(state.customViews);refreshState()},
    dirty(){return project&&stateKey(snapshot())!==lastSaved},
  };
})();
