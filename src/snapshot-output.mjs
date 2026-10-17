// Read-only snapshot presentation contract. No transport, files, PTY or input API.
import {performance} from 'node:perf_hooks';
import {safeScreen} from './tmux-bridge.mjs';
const busy=new WeakSet(),TTL=5000,MAX_TEXT=4096,MAX_FRAME=16384;
const keys=['machineId','projectId','incarnation','session','pane','generation'];
const fields=['version','kind','encoding','identity','seq','after','baseSeq','resync','reason','skippedSnapshots','text','truncated','lossless','expiresAt','validForMs'];
const fail=code=>{throw Error(code);};
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const exact=(x,names)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
function validIdentity(x){return exact(x,keys)&&keys.slice(0,5).every(k=>typeof x[k]==='string'&&x[k].length>0&&x[k].length<=64)&&integer(x.generation);}
function same(a,b){return keys.every(k=>a[k]===b[k]);}
function boundedLiteral(text){
 // bridge.read already escaped controls. Preserve those tokens during the smaller cut.
 const safe=safeScreen(text,8192),tokens=Array.from(safe.text.matchAll(/\\u[0-9a-f]{4}|[\s\S]/gu),m=>m[0]);
 let bytes=0,start=tokens.length;
 while(start>0){const size=Buffer.byteLength(tokens[start-1]);if(bytes+size>MAX_TEXT)break;bytes+=size;start--;}
 return {text:tokens.slice(start).join(''),truncated:safe.truncated||start>0};
}
export async function readSnapshotOutput(bridge,client,{binding,after,generation},{now=()=>performance.now(),wall=()=>Date.now()}={}){
 bridge.check(binding);
 if(!integer(generation)||bridge.session.status(client).generation!==generation)fail('OUTPUT_BINDING_CHANGED');
 if(busy.has(bridge))fail('OUTPUT_BUSY');
 busy.add(bridge);const start=now();
 try{
  const view=await bridge.readOutput(client,binding,after);
  bridge.check(binding);
  if(view.generation!==generation||bridge.session.status(client).generation!==generation)fail('OUTPUT_BINDING_CHANGED');
  const elapsed=now()-start;if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=TTL)fail('OUTPUT_EXPIRED');
  const safe=boundedLiteral(view.text),validForMs=Math.floor(TTL-elapsed);
  if(validForMs<1)fail('OUTPUT_EXPIRED');
  const frame={version:1,kind:'snapshot',encoding:'literal-text-v1',identity:{...view.binding,generation},seq:view.sequence,after,baseSeq:view.sequence,
   resync:view.resync,reason:view.resync?'cursor_gap':'current',skippedSnapshots:view.skippedSnapshots,
   text:safe.text,truncated:view.truncated||safe.truncated,lossless:false,expiresAt:wall()+validForMs,validForMs};
  if(!validIdentity(frame.identity)||Buffer.byteLength(JSON.stringify(frame))>MAX_FRAME)fail('OUTPUT_FRAME_LIMIT');
  return frame;
 }finally{busy.delete(bridge);}
}
function validateFrame(f){
 if(!exact(f,fields)||f.version!==1||f.kind!=='snapshot'||f.encoding!=='literal-text-v1'||f.lossless!==false||!validIdentity(f.identity)||
  !integer(f.seq)||f.seq<1||!integer(f.after)||f.after>f.seq||f.baseSeq!==f.seq||!integer(f.skippedSnapshots)||
  typeof f.resync!=='boolean'||f.skippedSnapshots!==f.seq-f.after-1||f.resync!==(f.skippedSnapshots>0)||
  f.reason!==(f.resync?'cursor_gap':'current')||typeof f.truncated!=='boolean'||
  !Number.isFinite(f.expiresAt)||!Number.isInteger(f.validForMs)||f.validForMs<1||f.validForMs>TTL||
  typeof f.text!=='string'||f.text.length>MAX_TEXT||Buffer.byteLength(f.text)>MAX_TEXT||!f.text.isWellFormed()||safeScreen(f.text,MAX_TEXT).text!==f.text||
  Buffer.byteLength(JSON.stringify(f))>MAX_FRAME)fail('OUTPUT_INVALID_FRAME');
}
export class SnapshotOutputReceiver {
 constructor(identity,{now=()=>performance.now()}={}){
  if(!validIdentity(identity))fail('OUTPUT_INVALID_IDENTITY');
  this.identity=Object.freeze({...identity});this.now=now;this.cursor=0;this.text='';this.state='empty';this.deadline=0;this.pending=null;this.needsResync=false;this.truncated=false;
 }
 clear(state){this.text='';this.deadline=0;this.truncated=false;this.state=state;return this.view();}
 begin({resync=false}={}){
  if(this.pending)fail('OUTPUT_BUSY');if(this.state==='binding_changed')fail('OUTPUT_BINDING_CHANGED');
  if(this.needsResync&&!resync)fail('OUTPUT_RESYNC_REQUIRED');
  const after=resync?0:this.cursor;this.pending={started:this.now(),after,resync};
  const {generation,...binding}=this.identity;return {binding,after,generation,format:'snapshot-v1'};
 }
 accept(frame){
  if(!this.pending)fail('OUTPUT_NO_REQUEST');const request=this.pending;this.pending=null;
  try{validateFrame(frame);}catch(e){this.needsResync=true;this.clear('invalid');throw e;}
  if(!same(this.identity,frame.identity))return this.clear('binding_changed');
  const now=this.now(),elapsed=now-request.started;
  // Remote wall time is informational. Budget starts before the request locally.
  if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=frame.validForMs)return this.clear('expired');
  if(frame.seq<=this.cursor){this.view();return {...this.view(),state:this.state==='expired'?'expired':'duplicate'};}
  if(frame.after!==request.after){
   this.needsResync=true;this.clear('invalid');fail('OUTPUT_INVALID_FRAME');
  }
  if(!request.resync&&frame.seq!==this.cursor+1){this.needsResync=true;return this.clear('gap');}
  this.cursor=frame.seq;this.text=frame.text;this.truncated=frame.truncated;this.deadline=request.started+frame.validForMs;
  this.needsResync=false;this.state=request.resync?'resynced':'current';return this.view();
 }
 failed(){this.pending=null;this.needsResync=true;return this.clear('unavailable');}
 view(){
  if(this.deadline&&this.now()>=this.deadline){this.text='';this.deadline=0;this.truncated=false;this.state='expired';}
  return {state:this.state,identity:this.identity,after:this.cursor,text:this.text,truncated:this.truncated,lossless:false,kind:'snapshot'};
 }
}
