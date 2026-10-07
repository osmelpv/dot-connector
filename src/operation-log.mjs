import {mkdir,readFile,writeFile,appendFile,rename,unlink,lstat,realpath,open} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const maxBytes=32768;
const operations=new Set(['connect','disconnect','status','read','paste','submit','pause','close','invalid','update','bridge-check','bridge-verify','bridge-prepare']);
const backends=new Set(['diagnostic','native','wezterm','windows-native','update']);
const phases=new Set(['start','end','error','timeout']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const errors=new Set(['INVALID_REQUEST','DIAGNOSTIC_ONLY','BUSY_NO_QUEUE','SESSION_CLOSING','MCP_REFUSED_OR_OUTCOME_UNKNOWN_NO_RETRY','OPERATION_TIMEOUT_OUTCOME_UNKNOWN_NO_RETRY','CONNECTION_OR_RUNTIME_UNAVAILABLE','BRIDGE_VALIDATION_FAILED','BRIDGE_VERIFICATION_TIMEOUT','BRIDGE_PREPARATION_FAILED','BRIDGE_PREPARATION_CLEANUP_UNKNOWN','BRIDGE_REQUIRES_WSL','BRIDGE_HELPER_MISMATCH','BRIDGE_SOURCE_MISMATCH','BRIDGE_NODE_MISMATCH','LOG_UNAVAILABLE','OPERATION_FAILED']);
export const safeError=value=>errors.has(value)?value:'OPERATION_FAILED';
const fail=()=>{throw Error('LOG_UNAVAILABLE');};
async function regular(file,limit){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>limit)fail();}
async function directory(root,create=false){if(!path.isAbsolute(root))fail();if(create)await mkdir(root,{recursive:true});const s=await lstat(root);const same=process.platform==='win32'?(await realpath(root)).toLowerCase()===path.resolve(root).toLowerCase():await realpath(root)===path.resolve(root);if(!s.isDirectory()||s.isSymbolicLink()||!same)fail();}
async function optional(file,limit){try{await regular(file,limit);return await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function cleanRecord(value){
 if(!value||!uuid.test(value.runId)||!uuid.test(value.requestId)||!operations.has(value.operation)||!backends.has(value.backend)||!phases.has(value.phase)||!Number.isSafeInteger(value.timeMs)||!Number.isFinite(value.durationMs)||value.durationMs<0||value.durationMs>86400000)fail();
 return {runId:value.runId,requestId:value.requestId,operation:value.operation,backend:value.backend,phase:value.phase,timeMs:value.timeMs,durationMs:value.durationMs,...(value.error?{error:safeError(value.error)}:{})};
}
export async function readLogs(root){
 try{await directory(root);}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const records=[];for(const name of ['events.2.jsonl','events.1.jsonl','events.jsonl']){const text=await optional(path.join(root,name),maxBytes);if(text)for(const line of text.trim().split('\n'))records.push(cleanRecord(JSON.parse(line)));}
 return records.slice(-50);
}
export async function readActivity(root,now=Date.now()){
 try{await directory(root);}catch(e){if(e.code==='ENOENT')return {state:'idle',operation:null};throw e;}
 const raw=await optional(path.join(root,'active.json'),4096);if(!raw){try{await lstat(path.join(root,'log-session.lock'));return {state:'unknown',operation:null,reason:'LOGGER_LOCK_WITHOUT_ACTIVE_METADATA'};}catch(e){if(e.code==='ENOENT')return {state:'idle',operation:null};throw e;}}
 const s=JSON.parse(raw);if(!uuid.test(s.runId)||!backends.has(s.backend)||!['running','closed','unknown'].includes(s.state)||!Number.isSafeInteger(s.lastActivityMs)||!Number.isSafeInteger(s.heartbeatMs)||!Array.isArray(s.requests)||s.requests.length>8)fail();
 const requests=s.requests.map(x=>{if(!uuid.test(x.requestId)||!operations.has(x.operation)||!Number.isSafeInteger(x.startedAtMs))fail();return {requestId:x.requestId,operation:x.operation,startedAtMs:x.startedAtMs,elapsedMs:Math.max(0,now-x.startedAtMs)};});
 const stale=now<s.heartbeatMs||now-s.heartbeatMs>6000;
 return {runId:s.runId,backend:s.backend,state:s.state==='running'?(stale?'unknown':'active'):s.state,lastActivityMs:s.lastActivityMs,heartbeatMs:s.heartbeatMs,heartbeatFresh:!stale,lastPhase:s.lastEvent?cleanRecord(s.lastEvent):null,requests};
}
export class OperationLog {
 constructor(root,backend){if(!backends.has(backend))fail();this.root=path.resolve(root);this.backend=backend;this.runId=randomUUID();this.requests=new Map();this.queue=Promise.resolve();this.state='running';this.failed=false;this.startedAtMs=Date.now();this.lastEvent=null;}
 async open(){
  await directory(this.root,true);
  this.lock=await open(path.join(this.root,'log-session.lock'),'wx',0o600);await this.lock.writeFile(this.runId);
  await this.persist();this.timer=setInterval(()=>{this.serialize(()=>this.persist()).catch(()=>{this.failed=true;});},2000);this.timer.unref();return this;
 }
 serialize(fn){const task=this.queue.then(fn);this.queue=task.catch(()=>{this.failed=true;});return task;}
 async persist(){
  const file=path.join(this.root,'active.tmp');const data=JSON.stringify({runId:this.runId,backend:this.backend,state:this.state,heartbeatMs:Date.now(),lastActivityMs:this.lastEvent?.timeMs??this.startedAtMs,lastEvent:this.lastEvent,requests:[...this.requests.values()].map(({requestId,operation,startedAtMs})=>({requestId,operation,startedAtMs}))});
  if(Buffer.byteLength(data)>4096)fail();
  const old=await optional(file,4096);if(old!==null)fail();
  await writeFile(file,data,{flag:'wx',mode:0o600});await rename(file,path.join(this.root,'active.json'));
 }
 async record(request,phase,error){
  const value=cleanRecord({runId:this.runId,requestId:request.requestId,operation:request.operation,backend:this.backend,phase,timeMs:Date.now(),durationMs:Math.min(86400000,Math.max(0,Math.round(performance.now()-request.clock))),...(error?{error:safeError(error)}:{})});
  const line=JSON.stringify(value)+'\n';if(Buffer.byteLength(line)>768)fail();
  const current=path.join(this.root,'events.jsonl');let size=0;try{await regular(current,maxBytes);size=(await lstat(current)).size;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(size+Buffer.byteLength(line)>maxBytes){
   for(const name of ['events.1.jsonl','events.2.jsonl'])await optional(path.join(this.root,name),maxBytes);
   try{await unlink(path.join(this.root,'events.2.jsonl'));}catch(e){if(e.code!=='ENOENT')throw e;}
   try{await rename(path.join(this.root,'events.1.jsonl'),path.join(this.root,'events.2.jsonl'));}catch(e){if(e.code!=='ENOENT')throw e;}
   await rename(current,path.join(this.root,'events.1.jsonl'));
  }
  await appendFile(current,line,{mode:0o600});this.lastEvent=value;
 }
 async start(operation){
  if(this.failed||this.state!=='running'||this.requests.size>=8)fail();const request={requestId:randomUUID(),operation:operations.has(operation)?operation:'invalid',startedAtMs:Date.now(),clock:performance.now()};
  // Reserve synchronously so overlapping dispatches cannot exceed the bound.
  this.requests.set(request.requestId,request);
  await this.serialize(async()=>{await this.record(request,'start');await this.persist();});return request.requestId;
 }
 async end(requestId,error){const request=this.requests.get(requestId);if(!request)fail();await this.serialize(async()=>{await this.record(request,error?(error.includes('TIMEOUT')?'timeout':'error'):'end',error);this.requests.delete(requestId);await this.persist();});}
 async close(uncertain=false){clearInterval(this.timer);await this.queue;this.state=uncertain||this.failed?'unknown':'closed';await this.serialize(()=>this.persist());await this.lock?.close();if(this.state==='closed')await unlink(path.join(this.root,'log-session.lock'));}
}
