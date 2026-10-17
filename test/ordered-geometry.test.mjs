import test from 'node:test';
import assert from 'node:assert/strict';
import xterm from '@xterm/xterm';
import {OrderedOutputJournal,OrderedOutputReceiver} from '../src/ordered-output.mjs';
import {XtermObserver} from '../src/xterm-observer.mjs';
const identity={machineId:'fixture',projectId:'synthetic',incarnation:'one',session:'pty',pane:'output',streamEpoch:'resize'},initial={atSeq:0,atOffset:0,columns:80,rows:24};
test('v2 geometry shares event sequence but not byte offsets; both renderers agree',async()=>{
 const j=new OrderedOutputJournal(identity,{version:2});assert.throws(()=>j.append(Buffer.from('bad')),/GEOMETRY_REQUIRED/);j.resize(80,24);j.append(Buffer.from('first'));j.resize(40,12);j.append(Buffer.from('\x1b[2;40HXY'));j.resize(100,30);j.finish();
 const screens=[];for(const label of ['human','agent']){const c=j.connect(label),r=new OrderedOutputReceiver(identity,{version:2}),v=new XtermObserver(xterm.Terminal,identity,initial,{version:2});try{while(r.state!=='eof'){const f=c.read(r.cursor()),before=r.cursor().offset;r.accept(f);await v.accept(f);if(f.kind==='resize'){assert.equal(f.start,before);assert.equal(f.end,before);assert.equal(v.status().columns,f.geometry.columns);assert.equal(v.status().rows,f.geometry.rows);}}screens.push(v.screen());assert.equal(v.status().forwardedInputBytes,0);}finally{v.close();}}
 assert.deepEqual(screens[0],screens[1]);assert.equal(screens[0].lines.length,30);
});
test('unapproved geometry, wrong version, gaps and direct resize cannot bypass ordering',async()=>{
 const legacy=new OrderedOutputJournal(identity);assert.throws(()=>legacy.resize(40,12),/VERSION/);
 const j=new OrderedOutputJournal(identity,{version:2,maxEvents:2});for(const dims of [[0,24],[161,24],[80,61],[40.5,12]])assert.throws(()=>j.resize(...dims),/GEOMETRY_LIMIT/);
 j.resize(80,24);j.append(Buffer.from('x'));j.resize(40,12);const c=j.connect('agent'),v=new XtermObserver(xterm.Terminal,identity,initial,{version:2});try{assert.equal((await v.accept(c.read({afterSeq:0,offset:0}))).state,'gap');assert.equal(v.screen(),null);assert.throws(()=>v.resize(100,30),/FIXED_OWNER/);}finally{v.close();}
});
test('resize cannot overtake queued parser bytes; repeated resize event is idempotent',async()=>{
 const j=new OrderedOutputJournal(identity,{version:2}),c=j.connect('human'),v=new XtermObserver(xterm.Terminal,identity,initial,{version:2});let cursor={afterSeq:0,offset:0};const next=()=>{const f=c.read(cursor);cursor={afterSeq:f.seq,offset:f.end};return f;};
 try{j.resize(80,24);await v.accept(next());j.append(Buffer.from('a'.repeat(16384)));const pending=v.accept(next());j.resize(40,12);const resize=next();await assert.rejects(v.accept(resize),/BUSY_NO_QUEUE/);assert.equal(v.status().columns,80);await pending;await v.accept(resize);assert.equal(v.status().columns,40);assert.equal((await v.accept(resize)).duplicate,true);assert.equal(v.status().offset,16384);}finally{v.close();}
});
test('geometry-only flood is bounded by event count and mismatched protocol never auto-upgrades',async()=>{
 const j=new OrderedOutputJournal(identity,{version:2,maxEvents:3});for(let i=0;i<10000;i++)j.resize(i%2?40:80,24);assert.equal(j.stats().retainedEvents,3);assert.equal(j.stats().retainedBytes,0);
 const k=new OrderedOutputJournal(identity,{version:2});k.resize(80,24);const frame=k.connect('human').read({afterSeq:0,offset:0}),legacy=new XtermObserver(xterm.Terminal,identity,initial);try{await assert.rejects(legacy.accept(frame),/VT_FRAME/);assert.equal(legacy.screen(),null);}finally{legacy.close();}
});
