import './diagram-renderer.ts';
const worker=new Worker(new URL('./lab-worker.js',import.meta.url),{type:'module'});
let next=0,stopped=null;const waiting=new Map();
const recovery='Export model source or copy it and retain unsaved project notes before reloading to restart.';
function stop(message){
 if(stopped!==null)return;
 stopped=message;worker.terminate();
 for(const entry of waiting.values()){clearTimeout(entry.timer);entry.resolve({error:message});}
 waiting.clear();
}
worker.onmessage=({data})=>{if(stopped!==null||!data||!Number.isSafeInteger(data.id))return;const entry=waiting.get(data.id);if(!entry)return;waiting.delete(data.id);clearTimeout(entry.timer);entry.resolve(data.result??{error:data.error||'The browser worker returned no result.'});};
worker.onerror=event=>stop((event.message||'The browser worker stopped.')+' '+recovery);
worker.onmessageerror=()=>stop('The browser response could not be decoded. '+recovery);
const request=(path,data)=>new Promise(resolve=>{
 if(stopped){resolve({error:stopped});return;}
 const id=++next;
 const timer=setTimeout(()=>stop('Browser processing exceeded 60 seconds, including queue wait. '+recovery),60000);
 waiting.set(id,{resolve,timer});
 try{worker.postMessage({id,path,data});}
 catch(error){waiting.delete(id);clearTimeout(timer);resolve({error:error.message||'The request could not be sent.'});}
});
window.browserLabResolve(request);
