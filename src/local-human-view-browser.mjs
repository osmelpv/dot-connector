import {XtermObserver} from './observer.mjs';
import {createHumanViewReader} from './reader.mjs';
const status=document.querySelector('#status'),surface=document.querySelector('#terminal');
const error=code=>Object.assign(Error(code),{code});
async function read(url,signal){
 const request=new AbortController(),abort=()=>request.abort();signal.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,10000);if(signal.aborted)abort();
 try{
  let response;try{response=await fetch(url,{signal:request.signal,credentials:'omit',cache:'no-store',redirect:'error'});}catch{throw error('VIEW_TRANSPORT');}
  if(!response.ok)throw error('VIEW_SOURCE_CLOSED');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){let part;try{part=await reader.read();}catch{throw error('VIEW_TRANSPORT');}if(part.done)break;size+=part.value.length;if(size>32768)throw error('VIEW_FRAME_LIMIT');chunks.push(part.value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
const reader=createHumanViewReader({fetchJson:read,
 createObserver:config=>{
  const observer=new XtermObserver(globalThis.Terminal,config.identity,config.geometry,{version:config.version});observer.open(surface);
  document.querySelector('#identity').textContent=`${config.identity.machineId} / ${config.identity.projectId} / ${config.identity.session} / ${config.identity.pane}`;return observer;
 },onStatus:state=>{
  if(state.state==='observing')status.textContent=`Observing · 80×24 · frame ${state.seq} · ${state.offset} bytes · no input`;
  else if(state.state==='recovering')status.textContent=`Connection interrupted — read-only recovery ${state.recoveries}/2.`;
  else if(state.state==='rebuilding')status.textContent='Rebuilding from retained beginning — not yet caught up.';
  else if(state.state==='eof')status.textContent='Output ended — read-only view.';
  else if(state.state==='cancelled')status.textContent='Disconnected — terminal input and CLI controls are unchanged.';
  else status.textContent=state.reason==='VIEW_PREFIX_MISSING'?'Prefix unavailable — stopped. Start a fresh owned session; no resync is possible.':state.reason==='VIEW_GEOMETRY_UNKNOWN'?'Unknown geometry — stopped.':state.reason==='VIEW_IDENTITY_CHANGED'?'Session identity changed — stopped.':'View unavailable or recovery limit reached — stopped. Use the CLI for control.';
 }});
document.querySelector('#disconnect').addEventListener('click',()=>{void reader.close();});
addEventListener('pagehide',()=>{void reader.close();});
await reader.done;
