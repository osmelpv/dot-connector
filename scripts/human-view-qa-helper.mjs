// Only fresh synthetic processes created here; never discovers/adopts a terminal.
import {spawn} from 'node:child_process';
import {rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
// QA-only diagnostics (#12): phases, millisecond timings and close causes.
// Raw output is never kept: only event names, known markers and UPPER_CASE codes.
const DIAGNOSTIC_LIMIT=200;
// Only the runtime's own stderr announces lifecycle events, and only these names.
const RUNTIME_EVENTS=new Set(['ready','closed']);
const MARKERS=[['Read-only browser view: ','view-url'],['Local cooperative human.','cli-ready'],['"status":"dispatched"','dispatched']];
export function createDiagnostics(){
 const started=performance.now(),entries=[],partial=new Map();let dropped=0;
 const record=entry=>{if(entries.length>=DIAGNOSTIC_LIMIT){dropped++;return;}entries.push({ms:Math.round(performance.now()-started),...entry});};
 // Codes come only from stderr lines made entirely of UPPER_CASE codes; stdout
 // can echo synthetic pane content, so it contributes events and markers only.
 const line=(source,stream,text)=>{
  // JSON-shaped lines elsewhere (e.g. pane content echoed by the CLI) are dropped, never recorded.
  let parsed;try{parsed=JSON.parse(text);}catch{}
  if(parsed&&typeof parsed==='object'&&'event' in parsed){
   if(source==='runtime'&&stream==='stderr'&&RUNTIME_EVENTS.has(parsed.event))record({source,kind:'event',name:parsed.event});
   return;
  }
  const marker=MARKERS.find(([needle])=>text.includes(needle));if(marker)return record({source,kind:'marker',name:marker[1]});
  const codes=text.trim().split(/\s+/);
  if(stream==='stderr'&&codes.length<=8&&codes.every(code=>code.length<=64&&/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(code)))record({source,kind:'codes',codes});
 };
 return {
  step:name=>record({kind:'step',name}),
  phase:(phase,state)=>record({phase,state}),
  output(source,stream,chunk){
   const key=source+':'+stream,lines=((partial.get(key)??'')+chunk).split('\n');
   partial.set(key,lines.pop().slice(-4096));for(const text of lines)line(source,stream,text.slice(0,4096));
  },
  exit:(source,code,signal)=>record({source,kind:'exit',code,signal}),
  cleanup:(resource,code)=>record({kind:'cleanup',resource,code}),
  snapshot:()=>({limit:DIAGNOSTIC_LIMIT,dropped,entries:structuredClone(entries)})
 };
}
export async function until(fn,{phase='unlabeled',diagnostics}={}){
 diagnostics?.phase(phase,'wait');
 for(let i=0;i<240;i++){const value=await fn();if(value){diagnostics?.phase(phase,'ok');return value;}await new Promise(r=>setTimeout(r,25));}
 diagnostics?.phase(phase,'expired');throw Object.assign(Error('OWNED_VIEW_TIMEOUT'),{phase});
}
// Error messages may carry raw stderr; only an UPPER_CASE message or error code of at most 64 characters is recorded.
const cleanupCode=(error,fallback='CLEANUP_FAILED')=>[error?.message,error?.code].find(c=>typeof c==='string'&&c.length<=64&&/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(c))??fallback;
// Attempts every step even after a failure; no retries. Returns the failures, never throws.
export async function closeEach(steps,diagnostics){
 const errors=[];
 for(const [resource,fn] of steps){try{await fn();}catch(error){const code=cleanupCode(error);errors.push({resource,code,error});diagnostics?.cleanup(resource,code);}}
 return errors;
}
// Artifact writes must never replace the run's primary error: failures are collected by code.
export async function writeArtifact(file,value,failures){
 try{await writeFile(file,JSON.stringify(value,null,2)+'\n');}catch(error){failures.push({artifact:path.basename(file),code:cleanupCode(error,'ARTIFACT_WRITE_FAILED'),error});}
}
function launch(args,source,diagnostics){
 const child=spawn(process.execPath,args,{env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:tmpdir()},stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='';for(const [stream,key]of [[child.stdout,'stdout'],[child.stderr,'stderr']])stream.on('data',b=>{diagnostics.output(source,key,String(b));if(key==='stdout')stdout+=b;else stderr+=b;if(stdout.length+stderr.length>65536)child.kill('SIGTERM');});
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{diagnostics.exit(source,code,signal);resolve({code,signal});});});
 return {child,exit,out:()=>stdout,err:()=>stderr};
}
// The caller may own the collector so it survives a failed startup; commands are
// replaceable only so tests can stop at a given phase with synthetic stand-ins.
export async function startHumanView({diagnostics=createDiagnostics(),commands={}}={}){
 const {runtime:runtimeArgs=['scripts/tmux-bridge.mjs','--experimental-synthetic','human-view-lab','synthetic','--ordered-output-v2'],cli:cliArgs=ready=>['scripts/tmux-bridge-view.mjs',ready.humanSocket,'--ordered-view']}=commands;
 const runtime=launch(runtimeArgs,'runtime',diagnostics);
 const events=()=>runtime.err().split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 let cli,closing;
 const bounded=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('OWNED_EXIT_UNVERIFIED')),10000);})]);}finally{clearTimeout(timer);}};
 const close=()=>closing??=(async()=>{
  diagnostics.step('close');let event;
  const errors=await closeEach([
   ...(cli?[['cli',async()=>{cli.child.stdin.end('/quit\n');assert.deepEqual(await bounded(cli.exit),{code:0,signal:null},cli.err());}]]:[]),
   ['runtime',async()=>{runtime.child.stdin.end();assert.deepEqual(await bounded(runtime.exit),{code:0,signal:null},runtime.err());}],
   ['runtime-closed',()=>{event=events().find(e=>e.event==='closed');assert.equal(event?.result.verified,true,runtime.err());}],
   ['fixtures',async()=>{
    // Retained state (socket, ledger) is deleted only after a verified close; otherwise it is kept for inspection.
    if(event?.result?.verified!==true||typeof event.retainedState!=='string')throw Error('OWNED_FIXTURES_UNVERIFIED');
    assert.equal(path.dirname(event.retainedState),tmpdir());assert(path.basename(event.retainedState).startsWith('dot-tmux-session-'));
    await rm(event.retainedState,{recursive:true,force:true});
   }]
  ],diagnostics);
  if(errors.length)throw Object.assign(Error('OWNED_CLEANUP_FAILED'),{cleanupErrors:errors});
  return {runtimeExit:0,cliExit:0,verified:true,fixturesRemoved:true};
 })();
 try{
  const ready=await until(()=>events().find(e=>e.event==='ready'),{phase:'runtime-ready',diagnostics});
  cli=launch(cliArgs(ready),'cli',diagnostics);
  const url=await until(()=>cli.out().match(/Read-only browser view: (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1],{phase:'view-url',diagnostics});
  await until(()=>cli.out().includes('Local cooperative human.'),{phase:'cli-ready',diagnostics});
  return {url,ready,cli,close,runtimeError:runtime.err,step:diagnostics.step,diagnostics:diagnostics.snapshot,async marker(){
   // Explicit harness-owned human command to seed its own cat pane. Browser has no writer.
   cli.child.stdin.write('/paste LIVE_HUMAN_VIEW\n');await until(()=>cli.out().includes('"status":"dispatched"'),{phase:'marker-dispatched',diagnostics});
  }};
 }catch(error){
  // The startup error stays primary; cleanup failures travel beside it.
  try{await close();}catch(cleanupError){error.cleanupErrors=cleanupError.cleanupErrors??[{resource:'fixture',code:cleanupCode(cleanupError),error:cleanupError}];}
  error.diagnostics=diagnostics.snapshot;throw error;
 }
}
