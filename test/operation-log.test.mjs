import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,stat,rm,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {OperationLog,readLogs,readActivity} from '../src/operation-log.mjs';
import {createCommandDispatcher} from '../src/cli-command.mjs';
const fixture=async t=>{const root=await mkdtemp(path.join(tmpdir(),'dot-log-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;};
test('logs expose incremental start/end, duration, timeout, activity and stale uncertainty without payloads',async t=>{
 const root=await fixture(t),log=await new OperationLog(root,'native').open();
 const id=await log.start('read');const first=await readLogs(root);assert.equal(first.at(-1).phase,'start');assert.equal(first.at(-1).requestId,id);
 const active=await readActivity(root);assert.equal(active.state,'active');assert.equal(active.requests[0].operation,'read');assert.equal(active.lastPhase.phase,'start');
 assert.equal((await readActivity(root,active.lastActivityMs+7000)).state,'unknown');
 await log.end(id,'OPERATION_TIMEOUT_OUTCOME_UNKNOWN_NO_RETRY');
 const secret='terminal text and grant SECRET_CANARY';const invalid=await log.start(secret);await log.end(invalid,secret);
 await log.close();const records=await readLogs(root);assert.ok(records.some(r=>r.phase==='timeout'));assert.ok(records.every(r=>r.durationMs>=0));assert.equal(records.at(-1).error,'OPERATION_FAILED');
 assert.equal(JSON.stringify(records).includes(secret),false);assert.equal((await readActivity(root)).state,'closed');
});
test('rotation bounds three files and tails at 50 records',async t=>{
 const root=await fixture(t),log=await new OperationLog(root,'diagnostic').open();
 for(let i=0;i<350;i++){const id=await log.start('status');await log.end(id);}await log.close();
 const names=(await readdir(root)).filter(n=>n.endsWith('.jsonl'));assert.equal(names.length,3);for(const name of names)assert.ok((await stat(path.join(root,name))).size<=32768);
 assert.equal((await readLogs(root)).length,50);
});
test('orphan logger lock is unknown and concurrent logger cannot overwrite activity',async t=>{
 const root=await fixture(t);await writeFile(path.join(root,'log-session.lock'),'owned');assert.equal((await readActivity(root)).state,'unknown');
 await assert.rejects(new OperationLog(root,'native').open(),{code:'EEXIST'});
});
test('uncertain completion preserves own metadata lock and reports unknown',async t=>{
 const root=await fixture(t),log=await new OperationLog(root,'native').open();await log.close(true);
 assert.equal((await readActivity(root)).state,'unknown');assert.ok((await readdir(root)).includes('log-session.lock'));
});
test('metadata reader rejects symlink log files without exposing linked contents',async t=>{
 const root=await fixture(t),outside=path.join(root,'private');await writeFile(outside,'SECRET_CANARY');await symlink(outside,path.join(root,'events.jsonl'));
 await assert.rejects(readLogs(root),/LOG_UNAVAILABLE/);
});
test('delayed logging cannot queue input or delay close admission; failed logging never calls MCP',async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve;});const calls=[];
 const dispatch=createCommandDispatcher({callTool:async request=>{calls.push(request);return {content:[{type:'text',text:'{}'}]};}},'native');
 const first=dispatch({id:'first',command:'read'},()=>blocked);
 assert.equal((await dispatch({id:'second',command:'read'},()=>assert.fail('busy request must not wait for logs'))).error,'BUSY_NO_QUEUE');
 const closing=dispatch({id:'close',command:'close'},()=>blocked);
 assert.equal((await dispatch({id:'later',command:'read'})).error,'SESSION_CLOSING');release();await first;await closing;assert.equal(calls.length,2);
 const failedCalls=[];const other=createCommandDispatcher({callTool:async a=>failedCalls.push(a)},'native');
 assert.equal((await other({id:'failure',command:'read'},async()=>{throw Error('log failure');})).ok,false);assert.equal(failedCalls.length,0);
});


test('heartbeat freshness is separate from unchanged last operation activity',async t=>{
 const root=await fixture(t),log=await new OperationLog(root,'diagnostic').open();const id=await log.start('read');const before=await readActivity(root);
 await new Promise(resolve=>setTimeout(resolve,2100));const after=await readActivity(root);
 assert.ok(after.heartbeatMs>before.heartbeatMs);assert.equal(after.lastActivityMs,before.lastActivityMs);assert.ok(after.requests[0].elapsedMs>=2000);
 await log.end(id);await log.close();
});
