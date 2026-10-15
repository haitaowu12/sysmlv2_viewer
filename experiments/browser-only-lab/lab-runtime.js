const worker=new Worker(new URL('./lab-worker.js',import.meta.url),{type:'module'});
let next=0;const waiting=new Map();
worker.onmessage=({data})=>{const entry=waiting.get(data.id);if(!entry)return;waiting.delete(data.id);clearTimeout(entry.timer);entry.resolve(data.result??{error:data.error});};
worker.onerror=event=>{for(const e of waiting.values()){clearTimeout(e.timer);e.resolve({error:event.message||'The browser worker stopped. Reload to retry.'});}waiting.clear();};
const request=(path,data)=>new Promise(resolve=>{const id=++next;const timer=setTimeout(()=>{worker.terminate();for(const e of waiting.values())e.resolve({error:'Browser processing exceeded 60 seconds. Your source is retained; reload to restart.'});waiting.clear();},60000);waiting.set(id,{resolve,timer});worker.postMessage({id,path,data});});
window.browserLabResolve(request);
