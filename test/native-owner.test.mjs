import {test} from 'node:test';import assert from 'node:assert/strict';
import {ownerIdentity,createWindowsOwnerProbe} from '../src/native-owner.mjs';
test('owner identity is canonical, immutable, and distinguishes creation/user/session',()=>{
 const valid={pid:42,startTimeTicks:'123',userSid:'S-1-5-21-1',sessionId:1};
 assert.ok(Object.isFrozen(ownerIdentity(valid)));
 for(const delta of [{pid:0},{pid:2147483648},{startTimeTicks:'0123'},{startTimeTicks:123},{userSid:'not-a-sid'},{sessionId:-1}])assert.throws(()=>ownerIdentity({...valid,...delta}),/INVALID/);
 if(process.platform!=='win32')assert.throws(()=>createWindowsOwnerProbe('/tmp/DotConnector.Owner.exe'),/WINDOWS/);
});
test('real Windows identity helper binds to this live Node caller repeatedly', {skip:process.platform!=='win32'||!process.env.DOT_OWNER_PROBE},async()=>{
 const probe=createWindowsOwnerProbe(process.env.DOT_OWNER_PROBE),a=await probe(),b=await probe();
 assert.equal(a.pid,process.pid);assert.deepEqual(a,b);assert.ok(BigInt(a.startTimeTicks)>0n);assert.match(a.userSid,/^S-1-/);
});
