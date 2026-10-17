import {randomUUID} from 'node:crypto';
import {OrderedOutputJournal} from './ordered-output.mjs';

// Created only by the fresh synthetic session owner. No arbitrary attach API or input sink.
export async function createOwnedTmuxOutput({identity,validate,geometry,spawnControl,withRead=fn=>fn()}){
 await validate();if(await geometry()!=='80 24')throw Error('OUTPUT_GEOMETRY_CHANGED');
 const bound=Object.freeze(Object.fromEntries(['machineId','projectId','incarnation','session','pane'].map(k=>[k,identity[k]])));
 const journal=new OrderedOutputJournal({...bound,streamEpoch:randomUUID()},{version:2});
 let child,closed=false,ready=false,pending=Buffer.alloc(0),resolveReady,rejectReady,closing,exited=false,spawned=false,spawnFailed=false,joinedConfirmed=false;
 const started=new Promise((a,b)=>{resolveReady=a;rejectReady=b;});
 const signal=kind=>{
  if(!child||exited||spawnFailed)return;
  // Delivery failure is not exit evidence. Keep cleanup bounded and wait for close.
  try{child.kill(kind);}catch{}
 };
 const fail=(code,terminate=true)=>{if(closed)return;closed=true;pending=Buffer.alloc(0);journal.close();rejectReady(Error(code));if(terminate)signal('SIGTERM');};
 const parse=line=>{
  const text=line.toString('latin1');
  if(text.startsWith('%output ')){
   const prefix=`%output ${identity.pane} `;if(!text.startsWith(prefix))throw Error('OUTPUT_PANE_CHANGED');if(!ready)throw Error('OUTPUT_BEFORE_READY');
   const value=line.subarray(prefix.length),bytes=[];
   for(let i=0;i<value.length;i++){if(value[i]===92){const oct=value.subarray(i+1,i+4).toString('ascii');if(!/^[0-3][0-7]{2}$/.test(oct))throw Error('OUTPUT_CONTROL_ESCAPE');bytes.push(parseInt(oct,8));i+=3;}else bytes.push(value[i]);if(bytes.length>16384)throw Error('OUTPUT_CHUNK_LIMIT');}
   if(bytes.length)journal.append(Buffer.from(bytes));return;
  }
  if(text.startsWith('%session-changed ')){
   if(text!==`%session-changed ${identity.session} ${identity.sessionName}`)throw Error('OUTPUT_SESSION_CHANGED');
   if(!ready)void (async()=>{try{await validate();if(await geometry()!=='80 24')throw Error('OUTPUT_GEOMETRY_CHANGED');if(closed)return;journal.resize(80,24);ready=true;resolveReady();}catch{fail('OUTPUT_OWNER_UNAVAILABLE');}})();return;
  }
  if(text.startsWith('%layout-change ')){
   const layout=text.split(' ')[2];if(!/^[a-f0-9]+,80x24,0,0,\d+$/.test(layout??''))throw Error('OUTPUT_GEOMETRY_CHANGED');return;
  }
  if(/^%(?:begin|end) \d+ \d+ \d+$/.test(text)||/^%window-add @\d+$/.test(text)||text==='%sessions-changed')return;
  if(text.startsWith('%exit'))throw Error('OUTPUT_OWNER_CLOSED');
  throw Error('OUTPUT_CONTROL_UNSUPPORTED');
 };
 child=spawnControl();
 child.once('spawn',()=>{spawned=true;});
 child.once('exit',()=>{exited=true;fail('OUTPUT_OWNER_CLOSED',false);});
 // Node error also covers failed kill/send/abort. Never resolve the join here.
 // Keep the listener for repeated signal errors, including after a timeout.
 child.on('error',()=>{
  spawnFailed=!spawned&&!ready&&child.pid===undefined;
  fail(spawnFailed?'OUTPUT_CONTROL_START':'OUTPUT_CONTROL_ERROR',false);
 });
 const joined=new Promise(resolve=>{child.once('close',()=>{
  exited=true;joinedConfirmed=true;fail('OUTPUT_OWNER_CLOSED',false);resolve();
 });});
 child.stderr?.on('data',()=>fail('OUTPUT_CONTROL_ERROR'));
 child.stdout?.on('data',chunk=>{
  if(closed)return;
  try{if(!Buffer.isBuffer(chunk)||chunk.length>65536)throw Error('OUTPUT_INGRESS_LIMIT');let start=0,count=0;
   while(start<chunk.length){const n=chunk.indexOf(10,start),end=n<0?chunk.length:n;if(pending.length+end-start>32768)throw Error('OUTPUT_LINE_LIMIT');const part=chunk.subarray(start,end);pending=pending.length?Buffer.concat([pending,part]):Buffer.from(part);if(n<0)break;if(++count>64)throw Error('OUTPUT_BURST_LIMIT');const line=pending;pending=Buffer.alloc(0);parse(line);start=n+1;}
  }catch(e){fail(e.message);}
 });
 const waitForClose=async ms=>{
  let timer;
  try{await Promise.race([joined,new Promise(resolve=>{timer=setTimeout(resolve,ms);})]);}
  finally{clearTimeout(timer);}
 };
 const close=()=>closing??=(async()=>{
  closed=true;pending=Buffer.alloc(0);journal.close();rejectReady(Error('OUTPUT_CLOSED'));
  signal('SIGTERM');
  await waitForClose(3000);
  if(!joinedConfirmed){signal('SIGKILL');await waitForClose(1000);}
  child.stdin?.destroy();child.stdout?.destroy();child.stderr?.destroy();
  return joinedConfirmed;
 })();
 const timer=setTimeout(()=>fail('OUTPUT_START_TIMEOUT'),3000);
 try{await started;}catch(e){await close();throw e;}finally{clearTimeout(timer);}
 const check=async()=>{if(closed)throw Error('OUTPUT_CLOSED');try{await validate();if(await geometry()!=='80 24')throw Error('OUTPUT_GEOMETRY_CHANGED');}catch(e){fail('OUTPUT_OWNER_UNAVAILABLE');throw Error('OUTPUT_OWNER_UNAVAILABLE');}if(closed)throw Error('OUTPUT_CLOSED');};
 return Object.freeze({identity:journal.identity,version:2,close,stats:()=>journal.stats(),connect:label=>{
  if(closed)throw Error('OUTPUT_CLOSED');const consumer=journal.connect(label);let disconnected=false;
  return Object.freeze({check:()=>withRead(async()=>{if(disconnected)throw Error('OUTPUT_DISCONNECTED');await check();if(disconnected)throw Error('OUTPUT_DISCONNECTED');}),read:cursor=>withRead(async()=>{if(disconnected)throw Error('OUTPUT_DISCONNECTED');await check();return consumer.read(cursor);}),close:()=>{disconnected=true;consumer.close();}});
 }});
}
