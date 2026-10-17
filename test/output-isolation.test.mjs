import test from 'node:test';
import assert from 'node:assert/strict';
import {TmuxSession} from '../src/tmux-session.mjs';
import {SnapshotBridge} from '../src/tmux-bridge.mjs';
import {readSnapshotOutput} from '../src/snapshot-output.mjs';
const binding={machineId:'local',projectId:'synthetic',incarnation:'12345678-1234-4234-8234-123456789abc',session:'$0',pane:'%0'};
function fixture(){let now=0;const session=new TmuxSession({identity:binding,dir:'unused',now:()=>now,validateOwner:async()=>{},mutate:()=>{throw Error('NO_WRITES_IN_FIXTURE');},proveExit:async()=>true,invoke:async()=> 'fixture only'});return {session,bridge:new SnapshotBridge(session),advance:n=>now=n};}
test('output capture neither replaces nor creates input observation/token or lease',async()=>{
 const {session,bridge,advance}=fixture(),lease=session.grant(bridge.owner,bridge.agent,5000),legacy=await bridge.read(bridge.agent,binding,0),seen=session.observations.get(bridge.agent),token=bridge.agentSnapshot;
 advance(4000);const frame=await readSnapshotOutput(bridge,bridge.agent,{binding,after:legacy.sequence,generation:lease.generation});
 assert.equal(frame.kind,'snapshot');assert.equal(session.observations.get(bridge.agent),seen);assert.equal(bridge.agentSnapshot,token);assert.equal(session.status(bridge.agent).lease.remainingMs,1000);
 const other=session.connect();await session.observe(other);assert(!session.observations.has(other));
 advance(5000);assert.equal(session.status(bridge.agent).paused,true);await assert.rejects(session.input(bridge.agent,{operationId:'blocked',kind:'submit',snapshotId:legacy.snapshotId,generation:lease.generation}),/NO_CURRENT_GRANT/);
});
test('expired opt-in capture does not overwrite a valid legacy observation',async()=>{
 const {session,bridge}=fixture();const legacy=await bridge.read(bridge.agent,binding,0),seen=session.observations.get(bridge.agent),token=bridge.agentSnapshot;let tick=0;
 await assert.rejects(readSnapshotOutput(bridge,bridge.agent,{binding,after:legacy.sequence,generation:0},{now:()=>tick++?8000:0,wall:()=>0}),/OUTPUT_EXPIRED/);
 assert.equal(session.observations.get(bridge.agent),seen);assert.equal(bridge.agentSnapshot,token);
});
