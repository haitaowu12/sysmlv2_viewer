import { connectWasm } from '@openmbee/opensysml/browser';
import wasmUrl from './browser-engine.wasm?url';
import execUrl from './wasm_exec.js?url';
import cases from './cases.json';
const byId=id=>document.getElementById(id), json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
let connection;
byId('source').value=cases[1].source;
const evidence={runtime:'OpenSysML 0.10.0 with experimental Lab renderer/API-JSON adapter',cases:[],network:'same-origin static assets only'};
async function validate(source){const t=performance.now();const m=await connection.loads(source,{strictConformance:true});return {model:m,elapsedMs:Math.round(performance.now()-t),hasErrors:m.hasErrors,diagnostics:m.diagnostics};}
byId('run').onclick=async()=>{
 byId('run').disabled=true;byId('results').replaceChildren();evidence.cases=[];if(connection){await connection.close();connection=null;}
 try{
  byId('status').textContent='Loading WebAssembly and the embedded language library…';
  const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  const t=performance.now();connection=await connectWasm({wasm:wasmUrl,wasmExec:execUrl,worker,timeoutMs:20000});
  evidence.startupMs=Math.round(performance.now()-t);evidence.capabilities=[...connection.info.capabilities];
  for(const test of cases){
   byId('status').textContent='Checking '+test.id+'…';
   let result;
   try {const v=await validate(test.source);result={id:test.id,expectedErrors:test.expectedErrors,hasErrors:v.hasErrors,elapsedMs:v.elapsedMs,diagnostics:v.diagnostics,passed:v.hasErrors===test.expectedErrors};
    if(test.id==='valid-reviewed'&&!v.hasErrors){
     result.symbols=[];
     for(const name of ['AlarmReview::Controller','AlarmReview::Controller::sampleCapacity','AlarmReview::ReviewTemperatureAlarm','AlarmReview::sampleRetention','AlarmReview::MonitoringSystem::coldRoom0','AlarmReview::MonitoringSystem::room0Observations','AlarmReview::Controller::reviewTemperatureAlarm']){
      try{const s=await v.model.symbol(name);result.symbols.push({requested:name,id:s.id,name:s.name,kind:s.kind,metadata:s.metadata,type:s.type,attributes:s.attributes,children:s.childIds,childFacts:await Promise.all(s.childIds.map(async id=>{try{const c=await v.model.symbol(id);return {requested:id,id:c.id,kind:c.kind,metadata:c.metadata};}catch(e){return {requested:id,error:e.message};}}))});}catch(e){result.symbols.push({requested:name,error:e.message});}
     }
     try {result.capacity=await v.model.eval('AlarmReview::monitoringSystem.controller.sampleCapacity');}catch(e){result.capacityError=e.message;}
     try {result.render=await v.model.renderView('#interconnection:AlarmReview::monitoringSystem');}catch(e){result.renderError=e.message;}
     try {result.apiJson=await v.model.toApiJson();}catch(e){result.apiJsonError=e.message;}
    }
   }catch(e){result={id:test.id,passed:false,error:e.message};}
   evidence.cases.push(result);const tr=document.createElement('tr');for(const text of [test.id,test.expectedErrors?'Reject':'Accept',result.error|| (result.hasErrors?'Rejected':'Accepted'),result.passed?'PASS':'FAIL']){const td=document.createElement('td');td.textContent=text;tr.append(td);}tr.lastChild.className=result.passed?'pass':'fail';byId('results').append(tr);byId('evidence').textContent=json(evidence);
  }
  byId('validate').disabled=false;byId('status').textContent=evidence.cases.every(c=>c.passed)?'Validation cases pass. Semantic and view parity still require assessment.':'Compatibility failures found. The released Lab is unchanged.';
 }catch(e){evidence.error=e.stack;byId('status').textContent='Browser trial failed: '+e.message;}
 finally{byId('evidence').textContent=json(evidence);byId('run').disabled=false;}
};
byId('validate').onclick=async()=>{byId('manual').textContent='Validating…';try{const v=await validate(byId('source').value);byId('manual').textContent=json({hasErrors:v.hasErrors,elapsedMs:v.elapsedMs,diagnostics:v.diagnostics});}catch(e){byId('manual').textContent=e.message;}};
