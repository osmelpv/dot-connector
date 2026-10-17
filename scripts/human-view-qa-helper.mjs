// Only fresh synthetic processes created here; never discovers/adopts a terminal.
import {spawn} from 'node:child_process';
import {rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
export async function until(fn){for(let i=0;i<240;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,25));}throw Error('OWNED_VIEW_TIMEOUT');}
function launch(args){
 const child=spawn(process.execPath,args,{env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:tmpdir()},stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='';for(const [stream,key]of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',b=>{if(key==='stdout')stdout+=b;else stderr+=b;if(stdout.length+stderr.length>65536)child.kill('SIGTERM');});
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 return {child,exit,out:()=>stdout,err:()=>stderr};
}
export async function startHumanView(){
 const runtime=launch(['scripts/tmux-bridge.mjs','--experimental-synthetic','human-view-lab','synthetic','--ordered-output-v2']);
 const events=()=>runtime.err().split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 let cli,closing;
 const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('OWNED_EXIT_UNVERIFIED')),10000);})]);}finally{clearTimeout(timer);}};
 const close=()=>closing??=(async()=>{
  if(cli){cli.child.stdin.end('/quit\n');assert.deepEqual(await bounded(cli.exit),{code:0,signal:null},cli.err());}
  runtime.child.stdin.end();assert.deepEqual(await bounded(runtime.exit),{code:0,signal:null},runtime.err());
  const event=events().find(e=>e.event==='closed');assert.equal(event?.result.verified,true,runtime.err());
  assert.equal(path.dirname(event.retainedState),tmpdir());assert(path.basename(event.retainedState).startsWith('dot-tmux-session-'));
  await rm(event.retainedState,{recursive:true,force:true});return {runtimeExit:0,cliExit:0,verified:true,fixturesRemoved:true};
 })();
 try{
  const ready=await until(()=>events().find(e=>e.event==='ready'));
  cli=launch(['scripts/tmux-bridge-view.mjs',ready.humanSocket,'--ordered-view']);
  const url=await until(()=>cli.out().match(/Read-only browser view: (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1]);
  await until(()=>cli.out().includes('Local cooperative human.'));
  return {url,ready,cli,close,runtimeError:runtime.err,async marker(){
   // Explicit harness-owned human command to seed its own cat pane. Browser has no writer.
   cli.child.stdin.write('/paste LIVE_HUMAN_VIEW\n');await until(()=>cli.out().includes('"status":"dispatched"'));
  }};
 }catch(error){await close();throw error;}
}
