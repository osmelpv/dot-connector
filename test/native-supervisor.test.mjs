import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {NativeWorkerSupervisor,workerDiagnostic} from '../src/native-supervisor.mjs';
import {NativeReader} from '../src/native-reader.mjs';
const target={hwnd:'123',pid:7,startTimeTicks:'123456',panePath:[[42,7]]};
async function fixture(t){
  const dir=await mkdtemp(path.join(tmpdir(),'dot-owned-worker-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const workerPath=path.join(dir,'worker.mjs');
  await writeFile(workerPath,`import {readFileSync,writeFileSync} from 'node:fs';
const r=JSON.parse(readFileSync(0,'utf8'));const target=r.arguments.target;
if(r.method==='observe'){process.stdout.write(JSON.stringify({target,capturedAtMs:Date.now(),foregroundHwnd:target.hwnd,focusedPanePath:target.panePath}));}
else{writeFileSync(new URL('./owned-pid',import.meta.url),String(process.pid));setInterval(()=>{},1000);}`);
  const provider=new NativeWorkerSupervisor({workerPath,timeoutMs:1000});
  return {provider,dir};
}
test('supervisor deadline kills and reaps only its owned stalled fixture, releasing reader busy state',async t=>{
  const {provider,dir}=await fixture(t);const reader=new NativeReader({target,provider});
  const started=Date.now();await assert.rejects(reader.snapshot(),/native provider failed/);assert.ok(Date.now()-started<4000);
  const pid=Number(await readFile(path.join(dir,'owned-pid'),'utf8'));assert.throws(()=>process.kill(pid,0),e=>e.code==='ESRCH');assert.equal(reader.busy,false);assert.equal(provider.active,null);assert.equal(provider.poisoned,false);assert.equal(reader.last,null);
});
test('supervisor explicit cancellation terminates its owned child without queue or retry',async t=>{
  const {provider,dir}=await fixture(t);const running=provider.getVisibleRanges({target});const rejected=assert.rejects(running,/worker cancelled/);
  let pid;for(let i=0;i<100;i++){try{pid=Number(await readFile(path.join(dir,'owned-pid'),'utf8'));break;}catch{await new Promise(r=>setTimeout(r,5));}}
  assert.ok(pid);await assert.rejects(provider.observe({target}),/busy/);assert.equal(provider.cancel(),true);await rejected;
  assert.throws(()=>process.kill(pid,0),e=>e.code==='ESRCH');assert.equal(provider.active,null);assert.equal(provider.cancel(),false);
});

test('native executable supervision refuses WSL interop and ambiguous worker selection',()=>{
  assert.throws(()=>new NativeWorkerSupervisor({nativeHostPath:'relative.exe'}),/direct Windows/);
  assert.throws(()=>new NativeWorkerSupervisor({nativeHostPath:'C:\\native\\host.exe',workerPath:'/tmp/worker.mjs'}),/direct Windows/);
  if(process.platform!=='win32')assert.throws(()=>new NativeWorkerSupervisor({nativeHostPath:'C:\\native\\host.exe'}),/WSL interop/);
});

test('manual diagnostics distinguish deadline and refusal without propagating unknown payloads',()=>{
  assert.equal(workerDiagnostic(Error('worker deadline exceeded')),'WORKER_DEADLINE_EXCEEDED');
  assert.equal(workerDiagnostic(Error('worker failed')),'WORKER_EXIT_FAILED');
  assert.equal(workerDiagnostic(Error('invalid worker JSON response')),'WORKER_INVALID_JSON');
  assert.equal(workerDiagnostic(Error('secret terminal contents')),'WORKER_START_OR_PROTOCOL_FAILED');
  assert.equal(workerDiagnostic(undefined),'WORKER_START_OR_PROTOCOL_FAILED');
});

test('shutdown closes the gate, reaps own worker and forbids new dispatch',async t=>{
 const {provider,dir}=await fixture(t);
 const running=provider.getVisibleRanges({target}),failed=assert.rejects(running,/cancelled/);
 for(let i=0;i<100;i++){try{await readFile(path.join(dir,'owned-pid'));break;}catch{await new Promise(r=>setTimeout(r,5));}}
 await provider.shutdown();await failed;
 assert.equal(provider.active,null);await assert.rejects(provider.observe({target}),/permanently stopped/);
});
test('synchronous spawn failure settles completion; shutdown never hangs', {timeout:2000},async t=>{
 const {provider}=await fixture(t);provider.command='invalid'+String.fromCharCode(0);
 await assert.rejects(provider.observe({target}),/worker launch failed/);
 await assert.rejects(provider.shutdown(),/cleanup unconfirmed/);
 assert.equal(provider.completions.size,0);
});
