const worker=new Worker(new URL('./lab-worker.js',import.meta.url),{type:'module'});
let next=0,stopped=null;const waiting=new Map();
function stop(message){
 stopped=message;worker.terminate();
 for(const entry of waiting.values()){clearTimeout(entry.timer);entry.resolve({error:message});}
 waiting.clear();
}
worker.onmessage=({data})=>{const entry=waiting.get(data.id);if(!entry)return;waiting.delete(data.id);clearTimeout(entry.timer);entry.resolve(data.result??{error:data.error});};
worker.onerror=event=>stop((event.message||'The browser worker stopped.')+' Your source is retained; reload to restart.');
worker.onmessageerror=()=>stop('The browser response could not be read. Your source is retained; reload to restart.');
const request=(path,data)=>new Promise(resolve=>{
 if(stopped){resolve({error:stopped});return;}
 const id=++next;
 const timer=setTimeout(()=>stop('Browser processing exceeded 60 seconds. Your source is retained; reload to restart.'),60000);
 waiting.set(id,{resolve,timer});
 try{worker.postMessage({id,path,data});}
 catch(error){waiting.delete(id);clearTimeout(timer);resolve({error:error.message||'The request could not be sent.'});}
});
window.browserLabResolve(request);
