import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ClaimLease} from './claim-lifecycle.mjs';
const target={hwnd:'123',pid:42,startTimeTicks:'456',panePath:[[1],[2]]};
const owner={pid:101,startTimeTicks:'900',userSid:'S-test',sessionId:1};
function fixture(){
 const records=new Map();
 // Synchronous check+mutation is atomic in this JS simulation only.
 const store={async compareExchange(k,expected,next){if((records.get(k)??null)!==expected)return false;if(next===null)records.delete(k);else records.set(k,next);return true;}};
 const evidence={callerBound:true,alive:true,identity:{...owner},dispatchGateHeld:true,workersStopped:true,pendingOperations:0,unknownOutcome:false};
 const proof={inspectCaller:async()=>structuredClone(evidence)};
 const make=(t=target,o=owner)=>new ClaimLease({store,proof,target:t,owner:o});
 return {records,store,evidence,proof,make};
}
test('clean close releases and new session reacquires with distinct nonce',async()=>{
 const f=fixture(),a=f.make();await a.acquire();const first=a.record;await a.close();
 const b=f.make();await b.acquire();assert.notEqual(first,b.record);await assert.rejects(a.close(),/STATE/);assert.equal(f.records.size,1);
});
test('simultaneous contenders including sibling panes have exactly one owner',async()=>{
 const f=fixture(),all=Array.from({length:30},(_,i)=>f.make({...target,panePath:[[i]]}));
 const r=await Promise.allSettled(all.map(a=>a.acquire()));assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.records.size,1);
});
test('same lease cannot race acquire and close or acquire twice',async()=>{
 const f=fixture(),a=f.make();let release;f.proof.inspectCaller=()=>new Promise(r=>{release=r;});
 const p=a.acquire();await assert.rejects(a.close(),/STATE/);await assert.rejects(a.acquire(),/STATE/);
 release(f.evidence);await p;assert.equal(f.records.size,1);
});
test('owner pid, creation time, user and session must all match at close',async()=>{
 for(const [field,value] of Object.entries({pid:102,startTimeTicks:'901',userSid:'other',sessionId:2})){
  const f=fixture(),a=f.make();await a.acquire();f.evidence.identity[field]=value;
  await assert.rejects(a.close(),/OWNER/);assert.equal(f.records.size,1);
 }
});
test('unknown/dead owner or non-bound caller never releases',async()=>{
 for(const delta of [{alive:false},{alive:null},{callerBound:false}]){
  const f=fixture(),a=f.make();await a.acquire();Object.assign(f.evidence,delta);
  await assert.rejects(a.close(),/OWNER/);assert.equal(f.records.size,1);
 }
});
test('pending work, active worker, unknown input or open dispatch gate retain claim',async()=>{
 for(const delta of [{pendingOperations:1},{workersStopped:false},{unknownOutcome:true},{dispatchGateHeld:false}]){
  const f=fixture(),a=f.make();await a.acquire();Object.assign(f.evidence,delta);
  await assert.rejects(a.close(),/QUIESCENT/);assert.equal(f.records.size,1);
 }
});
test('crashed lease and arbitrarily old legacy claim never auto-recover',async()=>{
 const f=fixture(),a=f.make();await a.acquire();await assert.rejects(f.make().acquire(),/NO_RECOVERY/);
 f.records.set(a.key,JSON.stringify({session:'legacy',createdAt:0}));
 await assert.rejects(f.make().acquire(),/NO_RECOVERY/);assert.equal(f.records.size,1);
});
test('replacement owner cannot be unlinked after proof/check race',async()=>{
 const f=fixture(),a=f.make();await a.acquire();
 f.proof.inspectCaller=async()=>{f.records.set(a.key,'replacement');return f.evidence;};
 await assert.rejects(a.close(),/OWNERSHIP_CHANGED/);assert.equal(f.records.get(a.key),'replacement');
});
test('failed proof and unavailable atomic store fail closed',async()=>{
 const f=fixture();f.evidence.callerBound=false;await assert.rejects(f.make().acquire(),/OWNER/);assert.equal(f.records.size,0);
 f.evidence.callerBound=true;const a=f.make();await a.acquire();f.store.compareExchange=async()=>{throw Error('I/O uncertainty');};
 await assert.rejects(a.close(),/uncertainty/);assert.equal(f.records.size,1);await assert.rejects(a.close(),/STATE/);
});
test('concurrent close attempts cannot remove subsequent owner',async()=>{
 const f=fixture(),a=f.make();await a.acquire();
 const r=await Promise.allSettled([a.close(),a.close()]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
 const b=f.make();await b.acquire();await assert.rejects(a.close(),/STATE/);assert.equal(f.records.get(b.key),b.record);
});
test('different HWND may coexist in one host PID; same HWND remains exclusive',async()=>{
 const f=fixture();await f.make().acquire();await f.make({...target,hwnd:'124'}).acquire();assert.equal(f.records.size,2);
});


test('noncanonical numeric aliases and invalid owner fields are rejected',()=>{
 const f=fixture();
 for(const field of ['hwnd','startTimeTicks'])for(const value of [123,'0123','0','-1','9223372036854775808'])assert.throws(()=>f.make({...target,[field]:value}),/TARGET/);
 for(const delta of [{startTimeTicks:900},{startTimeTicks:'0900'},{sessionId:-1},{userSid:7},{pid:2147483648}])assert.throws(()=>f.make(target,{...owner,...delta}),/OWNER/);
});
test('proof adapter cannot mutate expected owner through its argument',async()=>{
 const f=fixture(),a=f.make();await a.acquire();
 f.proof.inspectCaller=async passed=>{passed.startTimeTicks='901';return {...f.evidence,identity:passed};};
 await assert.rejects(a.close(),/OWNER/);assert.equal(f.records.get(a.key),a.record);
});
test('commit followed by lost response blocks without retry for acquire and close',async()=>{
 for(const closing of [false,true]){
  const f=fixture(),a=f.make();if(closing)await a.acquire();
  let calls=0;const cas=f.store.compareExchange;
  f.store.compareExchange=async(...args)=>{calls++;await cas(...args);throw Error('response lost');};
  await assert.rejects(closing?a.close():a.acquire(),/response lost/);
  assert.equal(a.state,'blocked');assert.equal(f.records.size,closing?0:1);
  await assert.rejects(closing?a.close():a.acquire(),/STATE/);assert.equal(calls,1);
 }
});
