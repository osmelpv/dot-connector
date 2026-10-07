import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {EventEmitter} from 'node:events';
import {NativeControl} from '../src/native-control.mjs';import {bindNativeLifecycle} from '../src/native-lifecycle.mjs';
const target={hwnd:'123',pid:42,startTimeTicks:'456',panePath:[[1],[2]]};
const owner={pid:process.pid,startTimeTicks:'789',userSid:'S-1-0-0',sessionId:1};
async function setup(t){
 const root=await mkdtemp(path.join(tmpdir(),'dot-close-'));t.after(()=>rm(root,{recursive:true,force:true}));
 let identity={...owner},writes=0;
 const provider={observe:async()=>({target,capturedAtMs:Date.now(),foregroundHwnd:target.hwnd,focusedPanePath:target.panePath}),getVisibleRanges:async()=>({target,capturedAtMs:Date.now(),source:'TextPattern.GetVisibleRanges',ranges:[{text:'fixture',visible:true}],truncated:false}),nativeWrite:async a=>{writes++;return {target,operationId:a.operationId,dispatched:true};},cancel(){}};
 const options={target,provider,stateDir:path.join(root,'helper'),claimsDir:path.join(root,'claims'),simulation:true,ownerProbe:async()=>identity};
 return {root,options,provider,make:()=>new NativeControl(options),setIdentity:x=>identity=x,writes:()=>writes};
}
test('clean read session closes, reopens same helper/window and resets grant',async t=>{
 const f=await setup(t),a=f.make();await a.open();const old=await a.snapshot();await a.close();
 const b=f.make();await b.open();assert.equal(JSON.parse(await readFile(path.join(b.dir,'control.json'),'utf8')).paused,true);
 await assert.rejects(b.write({snapshotId:old.snapshotId,operationId:'old',kind:'paste',text:'x'}),/snapshot/);
 await b.close();assert.deepEqual(await readdir(b.claims),[]);assert.equal(f.writes(),0);
});
test('owner change fails closed without releasing reservation',async t=>{
 const f=await setup(t),a=f.make();await a.open();f.setIdentity({...owner,startTimeTicks:'790'});
 await assert.rejects(a.close(),/unconfirmed/);assert.equal((await readdir(a.claims)).filter(n=>n.endsWith('.json')).length,1);
});
test('possible dispatched input prevents release even when worker reports success',async t=>{
 const f=await setup(t),a=f.make();await a.open();const s=await a.snapshot();
 await writeFile(path.join(a.dir,'control.json'),JSON.stringify({paused:false,operationId:'one',kind:'paste',text:'x',expiresAtMs:Date.now()+10000}));
 await a.write({snapshotId:s.snapshotId,operationId:'one',kind:'paste',text:'x'});
 await assert.rejects(a.close(),/unconfirmed/);await assert.rejects(f.make().open(),/CLAIM_EXISTS/);assert.equal(f.writes(),1);
});
test('close during deferred owner probe blocks opening and never dispatches',async t=>{
 const f=await setup(t);let release;f.options.ownerProbe=()=>new Promise(r=>{release=r;});
 const a=f.make(),opening=a.open();const failed=assert.rejects(opening,/cancelled/);
 while(!release)await new Promise(r=>setImmediate(r));
 const closing=a.close();release(owner);await failed;await assert.rejects(closing,/unconfirmed/);
 assert.equal(a.opened,false);assert.equal(f.writes(),0);assert.deepEqual(await readdir(a.claims),[]);
});
test('close drains in-flight read, rejects new work and does not release early',async t=>{
 const f=await setup(t),a=f.make();await a.open();let release;
 f.provider.getVisibleRanges=()=>new Promise(r=>{release=r;});
 const snapshot=a.snapshot();const failed=assert.rejects(snapshot,/closing/);
 while(!release)await new Promise(r=>setImmediate(r));
 let closed=false;const closing=a.close().then(()=>closed=true);
 await assert.rejects(a.snapshot(),/closing/);assert.equal(closed,false);
 release({target,capturedAtMs:Date.now(),source:'TextPattern.GetVisibleRanges',ranges:[],truncated:false});
 await failed;await closing;assert.equal(closed,true);assert.equal(f.writes(),0);
});
test('EOF, transport close and signals share one awaited cleanup',async()=>{
 const input=new EventEmitter(),signals=new EventEmitter(),transport={};let closes=0,serverCloses=0,failures=0,release;
 const control={close(){closes++;return new Promise(r=>{release=r;});}};
 const server={async close(){serverCloses++;transport.onclose();}};
 const lifecycle=bindNativeLifecycle({control,server,transport,input,signals,onFailure:()=>failures++});
 input.emit('end');signals.emit('SIGTERM');input.emit('close');release();
 await lifecycle.shutdown();assert.equal(closes,1);assert.equal(serverCloses,1);assert.equal(failures,0);assert.equal(signals.listenerCount('SIGTERM'),0);
});
