import test from 'node:test';
import assert from 'node:assert/strict';
import xterm from '@xterm/xterm';
import {XtermObserver} from '../src/xterm-observer.mjs';
import {createHumanViewReader} from '../src/human-view-reader.mjs';
const identity={machineId:'fixture',projectId:'synthetic',incarnation:'one',session:'$0',pane:'%0',streamEpoch:'one'};
const config={identity,version:2,geometry:{atSeq:0,atOffset:0,columns:80,rows:24}};
const resize={version:2,kind:'resize',identity,seq:1,start:0,end:0,data:'',geometry:{columns:80,rows:24}};
const data={version:2,kind:'data',identity,seq:2,start:0,end:3,data:Buffer.from('ABC').toString('base64')};
const eof={version:2,kind:'eof',identity,seq:3,start:3,end:3,data:''};
const transport=()=>Object.assign(Error('synthetic cut'),{code:'VIEW_TRANSPORT'});
function fixture(steps){const calls=[],observers=[],states=[];let cursor=0;
 const reader=createHumanViewReader({fetchJson:async(url)=>{calls.push(url);const step=steps[cursor++];if(step instanceof Error)throw step;if(!step)throw Error('UNEXPECTED_READ');return structuredClone(step);},
 createObserver:c=>{const o=new XtermObserver(xterm.Terminal,c.identity,c.geometry,{version:c.version});observers.push(o);return o;},onStatus:s=>states.push(s),wait:async()=>{}});
 return {reader,calls,observers,states};}
for(const [name,steps]of [
 ['before first frame',[config,transport(),config,resize,data,eof]],
 ['after accepted frame',[config,resize,data,transport(),config,resize,data,eof]],
 ['after response was lost',[config,resize,transport(),config,resize,data,eof]]
])test('rebuilds from zero with same identity '+name,async()=>{
 const f=fixture(steps);const result=await f.reader.done;
 assert.equal(result.state,'eof');assert.equal(result.recoveries,1);assert.equal(f.observers.length,2);
 assert.equal(f.observers[0].screen(),null);assert.match(f.observers[1].screen().lines[0],/^ABC$/);
 assert.equal(f.calls.filter(x=>x==='/frame?afterSeq=0&offset=0').length,2);
 assert(f.calls.every(x=>x==='/config'||x.startsWith('/frame?')));await f.reader.close();
});
test('duplicates do not repeat rendered bytes and repeated duplicates are bounded',async()=>{
 const f=fixture([config,resize,data,data,eof]);assert.equal((await f.reader.done).state,'eof');assert.equal(f.observers[0].screen().lines[0],'ABC');await f.reader.close();
 const repeated=fixture([config,resize,resize,resize,resize]);assert.equal((await repeated.reader.done).reason,'VIEW_NO_PROGRESS');
});
test('missing prefix, changed epoch, unknown geometry and incomplete replay stay closed',async()=>{
 const gap={...resize,kind:'gap'};delete gap.geometry;
 const cases=[
  [config,resize,data,transport(),config,gap],
  [config,resize,transport(),{...config,identity:{...identity,streamEpoch:'two'}}],
  [config,resize,transport(),config,{...resize,geometry:{columns:90,rows:24}}],
  [config,resize,data,transport(),config,resize,{version:2,kind:'idle',identity,seq:1,start:0,end:0,data:''}]
 ];
 for(const steps of cases){const f=fixture(steps);assert.equal((await f.reader.done).state,'closed');assert(f.observers.every(o=>o.screen()===null));}
});
test('recovery budget is lifetime bounded; source revocation is never retried',async()=>{
 const f=fixture([config,resize,transport(),config,resize,transport(),config,resize,transport()]);
 assert.deepEqual(await f.reader.done,{state:'closed',reason:'VIEW_RETRIES_EXHAUSTED',recoveries:2});
 const revoked=fixture([config,resize,Object.assign(Error('closed'),{code:'VIEW_SOURCE_CLOSED'})]);
 assert.equal((await revoked.reader.done).recoveries,0);assert.equal(revoked.calls.length,3);
});
test('cancellation aborts pending read and retry wait; EOF does not poll again',async()=>{
 for(const during of ['read','wait']){
  let notify;const started=new Promise(r=>{notify=r;});let n=0;const calls=[];
  const block=signal=>new Promise((resolve,reject)=>{notify();signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});});
  const reader=createHumanViewReader({fetchJson:async(url,signal)=>{calls.push(url);if(n++===0)return config;if(during==='read')return block(signal);throw transport();},createObserver:c=>new XtermObserver(xterm.Terminal,c.identity,c.geometry,{version:2}),wait:(_,signal)=>block(signal)});
  await started;assert.equal((await reader.close()).state,'cancelled');const count=calls.length;await reader.close();assert.equal(calls.length,count);
 }
 const f=fixture([config,resize,data,eof]);assert.equal((await f.reader.done).state,'eof');assert.equal(f.calls.length,4);await f.reader.close();
});

test('each identity field stays pinned across recovery and frame identity changes are explicit',async()=>{
 for(const key of Object.keys(identity)){
  const f=fixture([config,resize,transport(),{...config,identity:{...identity,[key]:'other'}}]);
  assert.equal((await f.reader.done).reason,'VIEW_IDENTITY_CHANGED');assert(f.observers.every(o=>o.screen()===null));
 }
 const frame=fixture([config,resize,{...data,identity:{...identity,pane:'%1'}}]);assert.equal((await frame.reader.done).reason,'VIEW_IDENTITY_CHANGED');
});
test('cancel while renderer completion is pending joins without a further read',async()=>{
 let notify;const writing=new Promise(resolve=>{notify=resolve;});let count=0;
 class SlowTerminal extends xterm.Terminal{write(bytes,callback){super.write(bytes,()=>{});notify();}}
 const reader=createHumanViewReader({fetchJson:async()=>[config,resize,data][count++],createObserver:c=>new XtermObserver(SlowTerminal,c.identity,c.geometry,{version:2}),wait:async()=>{}});
 await writing;const first=reader.close();assert.equal(reader.close(),first);assert.equal((await first).state,'cancelled');assert.equal(count,3);
});
test('closing an EOF view disposes it and reports disconnected without another poll',async()=>{
 const f=fixture([config,resize,data,eof]);await f.reader.done;assert.equal((await f.reader.close()).state,'cancelled');assert.equal(f.observers[0].screen(),null);assert.equal(f.calls.length,4);
});
