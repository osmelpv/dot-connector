import test from 'node:test';
import assert from 'node:assert/strict';
import {SnapshotBridge} from '../src/tmux-bridge.mjs';
import {readSnapshotOutput,SnapshotOutputReceiver} from '../src/snapshot-output.mjs';
const binding={machineId:'local',projectId:'synthetic',incarnation:'12345678-1234-4234-8234-123456789abc',session:'$0',pane:'%0'};
const identity={...binding,generation:0};
function fixture(text='hello',captureMs=0){let time=0;
 const session={identity:binding,connect:()=> 'client',status:()=>({generation:0,paused:true}),snapshot:async()=>{time+=captureMs;return {text,snapshotId:'id',generation:0};}};
 session.observe=(...args)=>session.snapshot(...args);
 const bridge=new SnapshotBridge(session);
 return {bridge,read:(after=0)=>readSnapshotOutput(bridge,bridge.agent,{binding,after,generation:0},{now:()=>time,wall:()=>100000+time})};
}
function frame(seq=1,extra={}){return {version:1,kind:'snapshot',encoding:'literal-text-v1',identity,seq,after:seq-1,baseSeq:seq,resync:false,reason:'current',skippedSnapshots:0,text:'hello',truncated:false,lossless:false,expiresAt:105000,validForMs:5000,...extra};}
test('review: second truncation preserves complete literal escape tokens',async()=>{
 const f=fixture('\x1b'+'a'.repeat(4093)),result=await f.read();
 assert.equal(result.truncated,true);assert.equal(result.text,'a'.repeat(4093));
});
test('review: duplicate cannot bypass intrinsic envelope consistency',()=>{
 const r=new SnapshotOutputReceiver(identity);r.begin();r.accept(frame());r.begin();
 assert.throws(()=>r.accept(frame(1,{after:1})),/OUTPUT_INVALID_FRAME/);assert.equal(r.view().text,'');
});
test('review: coherent duplicate may carry the old request cursor without renewing view',()=>{
 let now=0;const r=new SnapshotOutputReceiver(identity,{now:()=>now});r.begin();r.accept(frame());
 now=4000;r.begin();assert.equal(r.accept(frame()).state,'duplicate');now=5000;assert.equal(r.view().text,'');
});
test('review: output TTL charges capture plus local round trip, independently of wall time',async()=>{
 const f=fixture('read only',2000),result=await f.read();assert.equal(result.validForMs,3000);
 let now=0;const r=new SnapshotOutputReceiver(identity,{now:()=>now});r.begin();now=4000;
 assert.equal(r.accept({...result,expiresAt:1e15}).state,'expired');assert.equal(r.view().text,'');
 const s=new SnapshotOutputReceiver(identity,{now:()=>now});s.begin();now+=8000;
 assert.equal(s.accept(frame()).state,'expired');
});
test('review: OSC CSI DCS C1 bidi and HTML remain literal, never terminal instructions',async()=>{
 for(const text of ['\x1b]52;c;YQ==\x07','\x1b]8;;https://invalid.test\x1b\\link','\x1b[2J','\x1bPbad\x1b\\','\x9b2J','\u202eevil','<img src=x onerror=alert(1)>']){
  const f=fixture(text),result=await f.read();assert(!/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e]/.test(result.text));
  const r=new SnapshotOutputReceiver(identity);r.begin();assert.equal(r.accept(result).state,'current');
 }
});
test('review: bounded latest-only receiver does not accumulate output across 2048 reads',()=>{
 let now=0;const r=new SnapshotOutputReceiver(identity,{now:()=>now});
 for(let seq=1;seq<=2048;seq++){r.begin();r.accept(frame(seq,{text:'x'.repeat(4096),truncated:true}));assert.equal(Buffer.byteLength(r.view().text),4096);now++;}
 assert.equal(r.cursor,2048);assert.equal(r.pending,null);assert.equal(r.truncated,true);
 assert(!Object.values(r).some(Array.isArray));
});
test('review: resync cannot authorize cross-project or cross-generation content',()=>{
 for(const other of [{...identity,projectId:'other'},{...identity,generation:1}]){
  const r=new SnapshotOutputReceiver(identity);r.begin({resync:true});assert.equal(r.accept(frame(9,{identity:other,after:0,resync:true,reason:'cursor_gap',skippedSnapshots:8})).state,'binding_changed');
  assert.equal(r.view().text,'');assert.throws(()=>r.begin({resync:true}),/OUTPUT_BINDING_CHANGED/);
 }
});
