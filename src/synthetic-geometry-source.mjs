// Test-owned supervisor events only. Not a remote protocol or a PTY opener.
import {BoundedOutputJsonl} from './bounded-output-jsonl.mjs';
import {claimOutputProducer} from './ordered-output-source.mjs';
export function attachSyntheticGeometrySource({source,journal}){
 if(journal?.version!==2)throw Error('OUTPUT_VERSION');claimOutputProducer(source,journal);
 let settled=false,eof=false,resolve;const done=new Promise(r=>resolve=r);
 const stop=(status,reason=null)=>{if(settled)return;settled=true;source.off('data',data);source.off('end',end);parser.close();if(status!=='eof')journal.close();source.destroy();resolve({status,reason,processExitVerified:false});};
 const exact=(v,keys)=>v&&typeof v==='object'&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
 const parser=new BoundedOutputJsonl(event=>{
  if(eof)throw Error('OWNER_AFTER_EOF');
  if(event?.type==='resize'&&exact(event,['type','columns','rows','atOffset'])){
   const current=journal.stats();if(event.atOffset!==current.offset)throw Error('OWNER_BOUNDARY');if(current.seq===0&&(event.columns!==80||event.rows!==24))throw Error('OWNER_INITIAL_GEOMETRY');journal.resize(event.columns,event.rows);
  }else if(event?.type==='data'&&exact(event,['type','base64'])&&typeof event.base64==='string'&&event.base64.length<=21848){
   const bytes=Buffer.from(event.base64,'base64');if(!bytes.length||bytes.length>16384||bytes.toString('base64')!==event.base64)throw Error('OWNER_BYTES');journal.append(bytes);
  }else if(event?.type==='eof'&&exact(event,['type','atOffset'])&&event.atOffset===journal.stats().offset){journal.finish();eof=true;}
  else throw Error('OWNER_FRAME');
 });
 const data=bytes=>{try{parser.push(bytes);}catch(error){stop('failed',/^[A-Z_]+$/.test(error.message)?error.message:'OWNER_FAILED');}};
 const end=()=>{try{parser.end();if(!eof)throw Error('OWNER_EOF_MISSING');stop('eof');}catch(error){stop('failed',/^[A-Z_]+$/.test(error.message)?error.message:'OWNER_FAILED');}};
 const error=()=>stop('failed','OWNER_SOURCE_ERROR'),close=()=>{if(!settled)stop('failed','OWNER_SOURCE_CLOSED');source.off('error',error);};
 source.on('error',error);source.once('close',close);source.once('end',end);source.on('data',data);
 return Object.freeze({done,cancel:()=>{stop('cancelled','OWNER_CANCELLED');return done;}});
}
