import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function transport(){
 let worker,request,nextTimer=0;const timers=new Map();
 class Worker{
  constructor(){worker=this;this.messages=[];this.terminated=false;}
  postMessage(message){if(this.failSend)throw Error('Cannot clone request');this.messages.push(message);}
  terminate(){this.terminated=true;}
 }
 const source=readFileSync(new URL('./lab-runtime.js',import.meta.url),'utf8')
  .replace("import './diagram-renderer.ts';",'')
  .replace("new URL('./lab-worker.js',import.meta.url)","'lab-worker.js'");
 vm.runInNewContext(source,{Worker,window:{browserLabResolve:fn=>request=fn},
  setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)});
 return {worker,request,timers};
}

test('timeout settles every queued request, clears timers and rejects further work immediately',async()=>{
 const {worker,request,timers}=transport();
 const pending=[request('/render',{}),request('/compose',{})];
 [...timers.values()][0]();
 for(const response of await Promise.all(pending))assert.match(response.error,/60 seconds.*reload/);
 assert.equal(worker.terminated,true);assert.equal(timers.size,0);
 assert.match((await request('/initial',{})).error,/reload/);
 assert.equal(worker.messages.length,2);
});

for(const event of ['onerror','onmessageerror'])test(`${event} settles queued work and blocks requests to the stopped worker`,async()=>{
 const {worker,request,timers}=transport();const pending=request('/render',{});
 worker[event]({message:'Worker crashed'});
 assert.match((await pending).error,/reload/);assert.equal(timers.size,0);assert.equal(worker.terminated,true);
 assert.match((await request('/initial',{})).error,/reload/);assert.equal(worker.messages.length,1);
});

test('out-of-order replies settle their own requests and leave the worker usable',async()=>{
 const {worker,request,timers}=transport();const first=request('/render',{}),second=request('/compose',{});
 worker.onmessage({data:{id:2,result:{label:'second'}}});worker.onmessage({data:{id:1,result:{label:'first'}}});
 assert.equal((await first).label,'first');assert.equal((await second).label,'second');assert.equal(timers.size,0);
 const failed=request('/inspect',{});worker.onmessage({data:{id:3,error:'Invalid source'}});
 assert.equal((await failed).error,'Invalid source');assert.equal(worker.terminated,false);
});

test('an unsendable request clears its timer without stopping the healthy worker',async()=>{
 const {worker,request,timers}=transport();worker.failSend=true;
 assert.equal((await request('/render',{})).error,'Cannot clone request');assert.equal(timers.size,0);
 worker.failSend=false;const pending=request('/initial',{});worker.onmessage({data:{id:2,result:{ok:true}}});
 assert.equal((await pending).ok,true);assert.equal(worker.terminated,false);
});

test('malformed and unknown replies do not consume pending work; an empty matching reply is an error',async()=>{
 const {worker,request,timers}=transport();const pending=request('/render',{});
 for(const data of [null,{}, {id:'1',result:{ok:true}}, {id:99,result:{ok:true}}])worker.onmessage({data});
 assert.equal(timers.size,1);
 worker.onmessage({data:{id:1}});
 assert.match((await pending).error,/no result/);assert.equal(timers.size,0);
});
