import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';
test('actual stdio EOF and POSIX signal release read-only claims; abrupt kill retains them', {timeout:12000},async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'dot-close-process-')),children=new Map();
 t.after(async()=>{
  const pending=[...children.entries()];
  for(const [child] of pending)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  await Promise.all(pending.map(([,exited])=>exited));
  await rm(root,{recursive:true,force:true});
 });
 const imports=Object.fromEntries(['native-control','native-mcp-server','native-lifecycle'].map(n=>[n,new URL('../src/'+n+'.mjs',import.meta.url).href]));
 const sdk=new URL('../node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js',import.meta.url).href;
 const fixture=path.join(root,'fixture.mjs');
 await writeFile(fixture,`import {NativeControl} from ${JSON.stringify(imports['native-control'])};
 import {createNativeMcpServer} from ${JSON.stringify(imports['native-mcp-server'])};
 import {bindNativeLifecycle} from ${JSON.stringify(imports['native-lifecycle'])};
 import {StdioServerTransport} from ${JSON.stringify(sdk)};
 import path from 'node:path';
 const dir=process.argv[2],target={hwnd:'123',pid:42,startTimeTicks:'456',panePath:[[1]]};
 const provider={observe:async()=>{},getVisibleRanges:async()=>{},cancel(){}};
 const control=new NativeControl({target,provider,simulation:true,stateDir:path.join(dir,'helper'),claimsDir:path.join(dir,'claims')});
 const server=createNativeMcpServer(control),transport=new StdioServerTransport();
 bindNativeLifecycle({control,server,transport,input:process.stdin,signals:process,onFailure:()=>{process.exitCode=1;}});
 await control.open();await server.connect(transport);process.stdout.write('READY\\n');`);
 const start=dir=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fixture,dir],{stdio:['pipe','pipe','pipe'],windowsHide:true});let ready=false;
  const exited=new Promise(r=>child.once('close',(code,signal)=>r({code,signal})));
  children.set(child,exited);child.once('close',()=>children.delete(child));
  child.stderr.resume();child.once('error',reject);child.stdout.once('data',()=>{ready=true;resolve({child,exited});});
  child.once('close',()=>{if(!ready)reject(Error('fixture exited before ready'));});
 });
 for(const kind of ['eof',...(process.platform==='win32'?[]:['signal']),'crash']){
  const dir=path.join(root,kind),{child,exited}=await start(dir);
  if(kind==='eof')child.stdin.end();else child.kill(kind==='signal'?'SIGTERM':'SIGKILL');
  const result=await exited,claims=await readdir(path.join(dir,'claims'));
  if(kind==='crash')assert.equal(claims.filter(n=>n.endsWith('.json')).length,1);
  else{assert.equal(result.code,0);assert.deepEqual(claims,[]);const again=await start(dir);again.child.stdin.end();assert.equal((await again.exited).code,0);}
 }
});
