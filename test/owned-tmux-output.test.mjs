import {SnapshotBridge} from '../src/tmux-bridge.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createOwnedTmuxOutput} from '../src/owned-tmux-output.mjs';
const identity={machineId:'fixture',projectId:'synthetic',incarnation:'one',session:'$0',pane:'%0',sessionName:'dot-fixture'};
async function fixture(){let valid=true,spawned=0;const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{queueMicrotask(()=>child.emit('close',0));return true;};const owner=await createOwnedTmuxOutput({identity,validate:async()=>{if(!valid)throw Error('TMUX_IDENTITY_CHANGED');},geometry:async()=> '80 24',spawnControl:()=>{spawned++;setImmediate(()=>child.stdout.write('%begin 1 1 0\n%end 1 1 0\n%session-changed $0 dot-fixture\n'));return child;}});return {owner,child,setValid:v=>valid=v,spawned};}
test('owner output read validates owner, bounds slow readers and preserves bytes without writing control stdin',async()=>{
 const f=await fixture(),fast=f.owner.connect('human'),slow=f.owner.connect('agent');let input=0;f.child.stdin.on('data',b=>input+=b.length);
 try{assert.equal((await fast.read({afterSeq:0,offset:0})).kind,'resize');f.child.stdout.write('%output %0 A\\012\\134\n');const frame=await fast.read({afterSeq:1,offset:0});assert.deepEqual(Buffer.from(frame.data,'base64'),Buffer.from('A\n\\'));
  for(let i=0;i<1030;i++)f.child.stdout.write('%output %0 x\n');assert.equal((await slow.read({afterSeq:0,offset:0})).kind,'gap');assert.equal(f.owner.stats().retainedEvents,1024);assert(f.owner.stats().retainedBytes<=262144);assert.equal(input,0);
  f.setValid(false);await assert.rejects(fast.read({afterSeq:0,offset:0}),/OWNER_UNAVAILABLE/);assert.equal(f.owner.stats().closed,true);
 }finally{assert.equal(await f.owner.close(),true);}
});
test('wrong pane/session, changed geometry, oversized line and invalid escapes fence the output source',async()=>{
 for(const line of ['%output %1 bad\n','%session-changed $1 foreign\n','%layout-change @0 abcd,90x24,0,0,0\n','x'.repeat(32769),'%output %0 \\bad\n']){const f=await fixture();f.child.stdout.write(line);assert.equal(f.owner.stats().closed,true);assert.equal(f.owner.stats().retainedBytes,0);assert.equal(await f.owner.close(),true);}
});

test('failed optional output cannot prevent a new human from using legacy control or disconnect',async()=>{
 let next=0;const disconnected=[],session={identity,connect:()=>String(++next),disconnect:id=>disconnected.push(id),orderedOutput:{connect:role=>{if(role==='human')throw Error('OUTPUT_CLOSED');return {close(){}};}}};
 const bridge=new SnapshotBridge(session),human=bridge.openHuman();assert.equal(bridge.human,human);assert.equal(bridge.orderedHuman,null);bridge.disconnectHuman(human);assert.deepEqual(disconnected,[human]);assert.equal(bridge.human,null);
});

test('window rename metadata never fences or enters the owned pane output',async()=>{
 const f=await fixture(),reader=f.owner.connect('human');
 try{
  await reader.read({afterSeq:0,offset:0});
  f.child.stdout.write('%window-renamed @0 harmless untrusted title\n');
  assert.equal(f.owner.stats().closed,false);
  assert.equal(f.owner.stats().seq,1);
  f.child.stdout.write('%output %0 LIVE\n');
  assert.equal(Buffer.from((await reader.read({afterSeq:1,offset:0})).data,'base64').toString(),'LIVE');
 }finally{assert.equal(await f.owner.close(),true);}
});
