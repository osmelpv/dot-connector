import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createOwnedTmuxOutput} from '../src/owned-tmux-output.mjs';
import {TmuxSession} from '../src/tmux-session.mjs';

const identity={machineId:'fixture',projectId:'synthetic',incarnation:'one',session:'$0',pane:'%0',sessionName:'dot-fixture'};
function fixture(kill, {startFailure=false}={}) {
  const child=new EventEmitter(), signals=[], destroys={stdin:0,stdout:0,stderr:0};
  for(const key of Object.keys(destroys)) {
    child[key]=new PassThrough();
    const original=child[key].destroy.bind(child[key]);
    child[key].destroy=(...args)=>{destroys[key]++;return original(...args);};
  }
  child.kill=signal=>{signals.push(signal);return kill(child,signal);};
  const owner=createOwnedTmuxOutput({identity,validate:async()=>{},geometry:async()=>'80 24',spawnControl:()=>{
    setImmediate(()=>{
      if(startFailure){child.emit('error',Error('synthetic spawn failure'));setImmediate(()=>child.emit('close',-2));}
      else {child.emit('spawn');child.stdout.write('%session-changed $0 dot-fixture\n');}
    });
    return child;
  }});
  return {child,signals,destroys,owner};
}

test('kill error without close never proves cleanup, and concurrent close joins once',async()=>{
  const f=fixture(child=>{child.emit('error',Error('synthetic kill failure'));return false;});
  const owner=await f.owner;
  const first=owner.close(),second=owner.close();
  assert.equal(first,second);
  assert.equal(await first,false);
  const session=new TmuxSession({identity,validateOwner:async()=>{},mutate:async()=>{},proveExit:async()=>true});
  session.orderedOutput=owner;
  const result=await session.stop(session.connect('human'));
  assert.equal(result.verified,false);
  assert.equal(result.status,'stop_unverified');
  assert.deepEqual(f.signals,['SIGTERM','SIGKILL']);
  assert.deepEqual(f.destroys,{stdin:1,stdout:1,stderr:1});
  f.child.emit('close',0); // A late event cannot rewrite the completed result.
  assert.equal(await owner.close(),false);
});

test('kill error can be followed by confirmed close after escalation',async()=>{
  const f=fixture((child,signal)=>{
    child.emit('error',Error('synthetic kill failure'));
    if(signal==='SIGKILL')queueMicrotask(()=>child.emit('close',0));
    return false;
  });
  const owner=await f.owner;
  assert.equal(await owner.close(),true);
  assert.deepEqual(f.signals,['SIGTERM','SIGKILL']);
});

test('successful signal delivery without exit or close remains unverified',async()=>{
  const f=fixture(()=>true),owner=await f.owner;
  assert.equal(await owner.close(),false);
  assert.deepEqual(f.signals,['SIGTERM','SIGKILL']);
});

test('exit alone stops further signals but does not prove stdio close',async()=>{
  const f=fixture(child=>{queueMicrotask(()=>child.emit('exit',0));return true;}),owner=await f.owner;
  assert.equal(await owner.close(),false);
  assert.deepEqual(f.signals,['SIGTERM']);
});

test('spawn failure rejects startup and waits for close without signaling',async()=>{
  const f=fixture(()=>false,{startFailure:true});
  await assert.rejects(f.owner,/OUTPUT_CONTROL_START/);
  assert.deepEqual(f.signals,[]);
  assert.deepEqual(f.destroys,{stdin:1,stdout:1,stderr:1});
});

test('synchronous kill failure remains bounded and close is destroyed once',async()=>{
  const f=fixture(()=>{throw Error('synthetic kill throw');}),owner=await f.owner;
  assert.equal(await owner.close(),false);
  assert.deepEqual(f.signals,['SIGTERM','SIGKILL']);
  assert.deepEqual(f.destroys,{stdin:1,stdout:1,stderr:1});
});
