import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
import {OperationLog,readLogs} from '../src/operation-log.mjs';
import {operationDeadline} from '../src/operation-deadline.mjs';
import {bridgeCapability} from '../src/project-wsl.mjs';
const run=promisify(execFile),cli='scripts/dot-connector.mjs';
test('real CLI exposes live operation metadata and safe incremental logs while its session is open',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'dot-cli-logs-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const child=spawn(process.execPath,[cli,'session','--log-dir',root],{stdio:['pipe','pipe','pipe']});
 const lines=createInterface({input:child.stdout}),iterator=lines[Symbol.asyncIterator]();const ended=new Promise(resolve=>child.once('close',resolve));
 const next=async()=>JSON.parse((await operationDeadline(iterator.next(),5000)).value);
 try{
  assert.equal((await next()).event,'ready');
  const active=JSON.parse((await run(process.execPath,[cli,'status','--local','--log-dir',root])).stdout);assert.equal(active.activity.state,'active');assert.equal(active.activity.lastPhase.operation,'connect');
  child.stdin.write(JSON.stringify({id:'SECRET_CLIENT_ID',command:'paste',arguments:{snapshotId:'no-snapshot',operationId:'SECRET_GRANT_ID',text:'SECRET_TERMINAL_CONTENT'}})+'\n');
  const refused=await next();assert.equal(refused.error,'DIAGNOSTIC_ONLY');assert.match(refused.requestId,/^[a-f0-9-]{36}$/);
  const result=JSON.parse((await run(process.execPath,[cli,'logs','--log-dir',root])).stdout);assert.ok(result.events.some(e=>e.requestId===refused.requestId&&e.phase==='error'));
  assert.equal(JSON.stringify(result).includes('SECRET_'),false);assert.equal((await readFile(path.join(root,'events.jsonl'),'utf8')).includes('SECRET_'),false);
  child.stdin.write('{"id":"close","command":"close"}\n');assert.equal((await next()).result.closed,true);child.stdin.end();assert.equal(await ended,0);
  const final=JSON.parse((await run(process.execPath,[cli,'status','--local','--log-dir',root])).stdout);assert.equal(final.activity.state,'closed');assert.equal(final.activity.lastPhase.operation,'disconnect');
 }finally{child.stdin.end();lines.close();if(child.exitCode===null)child.kill();}
});
test('real timer deadline records timeout and unknown cleanup instead of success',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'dot-deadline-'));t.after(()=>rm(root,{recursive:true,force:true}));const log=await new OperationLog(root,'windows-native').open();const id=await log.start('connect');
 let error;try{await operationDeadline(new Promise(()=>{}),15);}catch(e){error=e;}
 assert.equal(error.message,'OPERATION_TIMEOUT_OUTCOME_UNKNOWN_NO_RETRY');await log.end(id,error.message);await log.close(true);
 const events=await readLogs(root);assert.equal(events.at(-1).phase,'timeout');assert.ok(events.at(-1).durationMs>=10);
});
test('capability detection separates WSL transport from unsupported native Linux window control',()=>{
 assert.deepEqual(bridgeCapability('linux','6.6.87.2-microsoft-standard-WSL2'),{wsl:true,nativeLinuxTerminalControl:false,windowsHelperRequired:true});
 assert.equal(bridgeCapability('linux','6.8.0-generic').wsl,false);assert.equal(bridgeCapability('win32','microsoft').wsl,false);
});
