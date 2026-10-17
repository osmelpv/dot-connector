import test from 'node:test';
import assert from 'node:assert/strict';
import {SnapshotBridge} from '../src/tmux-bridge.mjs';
import {readSnapshotOutput,SnapshotOutputReceiver} from '../src/snapshot-output.mjs';
import {registerBridgeTools} from '../src/tmux-bridge-mcp.mjs';
const binding={machineId:'local',projectId:'synthetic',incarnation:'12345678-1234-4234-8234-123456789abc',session:'$0',pane:'%0'};
function fixture(){let time=0,generation=0,captures=0;const calls=[];
 const session={identity:binding,connect:()=>String(calls.length),status:()=>({generation,paused:true}),snapshot:async()=>{captures++;return {text:'hello',snapshotId:'id',generation};},input:()=>calls.push('input'),grant:()=>calls.push('grant')};
 session.observe=(...args)=>session.snapshot(...args);
 const bridge=new SnapshotBridge(session),clocks={now:()=>time,wall:()=>100000+time};
 return {bridge,session,calls,clocks,setTime:v=>time=v,revoke:()=>generation++,captures:()=>captures,request:()=>({binding,after:0,generation})};
}
const identity={...binding,generation:0};
function frame(seq=1,extra={}){return {version:1,kind:'snapshot',encoding:'literal-text-v1',identity,seq,after:seq-1,baseSeq:seq,resync:false,reason:'current',skippedSnapshots:0,text:'hello',truncated:false,lossless:false,expiresAt:105000,validForMs:5000,...extra};}
test('opt-in envelope is bounded, literal, fully identified and never grants or inputs',async()=>{
 const f=fixture();f.session.snapshot=async()=>({text:'x'.repeat(6000)+'\x1b]52;\u202e🧪',snapshotId:'id',generation:0});
 const result=await readSnapshotOutput(f.bridge,f.bridge.agent,f.request(),f.clocks);
 assert.deepEqual(result.identity,identity);assert.equal(result.kind,'snapshot');assert.equal(result.seq,result.baseSeq);assert.equal(result.lossless,false);assert.equal(result.truncated,true);
 assert(Buffer.byteLength(result.text)<=4096);assert(Buffer.byteLength(JSON.stringify(result))<=16384);assert(!/[\x1b\u202e]/.test(result.text));assert.deepEqual(f.calls,[]);
});
test('overlap rejects without queue/capture; expiry and generation are checked after capture',async()=>{
 const f=fixture();let resolve;f.session.snapshot=()=>new Promise(r=>resolve=r);
 const pending=readSnapshotOutput(f.bridge,f.bridge.agent,f.request(),f.clocks);
 await assert.rejects(readSnapshotOutput(f.bridge,f.bridge.agent,f.request(),f.clocks),/OUTPUT_BUSY/);
 f.revoke();resolve({text:'secret-stale',snapshotId:'id',generation:0});await assert.rejects(pending,/OUTPUT_BINDING_CHANGED/);
 const g=fixture();g.session.snapshot=async()=>{g.setTime(5000);return {text:'old',snapshotId:'id',generation:0};};
 await assert.rejects(readSnapshotOutput(g.bridge,g.bridge.agent,g.request(),g.clocks),/OUTPUT_EXPIRED/);
});
test('wrong epoch or cursor rejects before capture and sequence exhaustion stays fenced',async()=>{
 const f=fixture();await assert.rejects(readSnapshotOutput(f.bridge,f.bridge.agent,{...f.request(),generation:1},f.clocks),/OUTPUT_BINDING_CHANGED/);assert.equal(f.captures(),0);
 await assert.rejects(readSnapshotOutput(f.bridge,f.bridge.agent,{...f.request(),after:1},f.clocks),/INVALID_CURSOR/);
 f.bridge.sequence=Number.MAX_SAFE_INTEGER;await assert.rejects(readSnapshotOutput(f.bridge,f.bridge.agent,{...f.request(),after:f.bridge.sequence},f.clocks),/SEQUENCE_EXHAUSTED/);
});
test('receiver replaces snapshots, detects gap, clears text and requires explicit resync',()=>{
 let now=0;const r=new SnapshotOutputReceiver(identity,{now:()=>now});r.begin();assert.equal(r.accept(frame()).state,'current');
 r.begin();assert.equal(r.accept(frame(3,{after:1,resync:true,reason:'cursor_gap',skippedSnapshots:1,text:'suffix'})).state,'gap');assert.equal(r.view().text,'');assert.throws(()=>r.begin(),/OUTPUT_RESYNC_REQUIRED/);
 assert.equal(r.begin({resync:true}).after,0);assert.equal(r.accept(frame(4,{after:0,resync:true,reason:'cursor_gap',skippedSnapshots:3,text:'replacement'})).state,'resynced');assert.equal(r.view().text,'replacement');
 now=5000;assert.equal(r.view().state,'expired');assert.equal(r.view().text,'');
});
test('duplicates do not extend lifetime; single flight and 8s RTT reject',()=>{
 let now=0;const r=new SnapshotOutputReceiver(identity,{now:()=>now});r.begin();assert.throws(()=>r.begin(),/OUTPUT_BUSY/);r.accept(frame());
 now=4000;r.begin();assert.equal(r.accept(frame()).state,'duplicate');now=5000;assert.equal(r.view().state,'expired');
 const s=new SnapshotOutputReceiver(identity,{now:()=>now});s.begin();now+=8000;assert.equal(s.accept(frame()).state,'expired');assert.equal(s.view().text,'');
});
test('identity changes clear old view and never silently adopt generation',()=>{
 for(const key of Object.keys(identity)){const r=new SnapshotOutputReceiver(identity);r.begin();r.accept(frame());r.begin();const other={...identity,[key]:key==='generation'?1:'other'};assert.equal(r.accept(frame(2,{identity:other})).state,'binding_changed');assert.equal(r.view().text,'');assert.throws(()=>r.begin(),/OUTPUT_BINDING_CHANGED/);}
});
test('oversized, malformed, unsafe frames and backward clocks fail closed',()=>{
 for(const extra of [{text:'x'.repeat(4097)},{text:'\x1b]52;bad'},{kind:'vt'},{validForMs:5001},{seq:1.5},{extra:true}]){const r=new SnapshotOutputReceiver(identity);r.begin();assert.throws(()=>r.accept(frame(1,extra)),/OUTPUT_INVALID_FRAME/);assert.equal(r.view().text,'');}
 let now=10;const r=new SnapshotOutputReceiver(identity,{now:()=>now});r.begin();now=9;assert.equal(r.accept(frame()).state,'expired');
});
test('MCP legacy response remains unchanged; format is explicit and offers no new tool',async()=>{
 const f=fixture(),tools=new Map();registerBridgeTools({tool:(n,d,s,fn)=>tools.set(n,fn)},f.bridge);
 assert.equal(tools.size,5);const legacy=JSON.parse((await tools.get('bridge_read')({binding,after:0})).content[0].text);assert.equal(legacy.sequence,1);assert.equal(legacy.kind,undefined);
 const result=JSON.parse((await tools.get('bridge_read')({binding,after:1,generation:0,format:'snapshot-v1'})).content[0].text);assert.equal(result.kind,'snapshot');assert.equal(result.seq,2);
 assert.equal((await tools.get('bridge_read')({binding,after:2,format:'snapshot-v1'})).isError,true);assert.deepEqual(f.calls,[]);
});
