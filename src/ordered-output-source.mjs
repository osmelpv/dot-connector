// Owns one supplied binary readable, never opens a PTY or writes terminal input.
const sources=new WeakSet(),journals=new WeakSet();
export function attachOrderedOutputSource({source,journal,onAvailable=()=>{},chunkBytes=16384}){
 if(journal?.version!==1)throw Error('RAW_SOURCE_REQUIRES_V1');
 if(!Number.isInteger(chunkBytes)||chunkBytes<1||chunkBytes>16384||chunkBytes>journal.capacity||typeof onAvailable!=='function')throw Error('OUTPUT_SOURCE_LIMIT');
 claimOutputProducer(source,journal);let settled=false,total=0,events=0,resolve;
 const done=new Promise(r=>resolve=r);
 const stop=(status,reason=null)=>{
  if(settled)return;settled=true;source.off('data',data);source.off('end',end);
  if(status!=='eof')journal.close();
  source.destroy();resolve({status,reason,bytes:total,events,sourceDetached:true,processExitVerified:false});
 };
 const notify=()=>{const result=onAvailable();if(result?.then){result.catch(()=>{});throw Error('OUTPUT_ASYNC_CONSUMER_FORBIDDEN');}};
 const data=chunk=>{
  if(settled)return;
  try{
   if(!Buffer.isBuffer(chunk)||chunk.length>65536)throw Error('OUTPUT_INGRESS_LIMIT');
   for(let offset=0;offset<chunk.length&&!settled;offset+=chunkBytes){
    const bytes=chunk.subarray(offset,offset+chunkBytes);journal.append(bytes);total+=bytes.length;events++;notify();
   }
  }catch(error){stop('failed',/^[A-Z_]+$/.test(error.message)?error.message:'OUTPUT_SOURCE_FAILED');}
 };
 const end=()=>{if(settled)return;try{journal.finish();events++;notify();stop('eof');}catch{stop('failed','OUTPUT_EOF_FAILED');}};
 const error=()=>stop('failed','OUTPUT_SOURCE_ERROR');
 const close=()=>{if(!settled)stop('failed','OUTPUT_SOURCE_PREMATURE_CLOSE');source.off('error',error);source.off('close',close);};
 source.on('error',error);source.once('close',close);source.once('end',end);source.on('data',data);
 return Object.freeze({done,cancel:()=>{stop('cancelled','OUTPUT_CANCELLED');return done;}});
}

export function claimOutputProducer(source,journal){
 if(!source||typeof source.on!=='function'||typeof source.destroy!=='function'||source.readableObjectMode||source.readableEncoding||source.destroyed||source.readableEnded||source.readableDidRead||source.listenerCount('data')||source.listenerCount('readable'))throw Error('OUTPUT_SOURCE_NOT_EXCLUSIVE');
 if(!journal||typeof journal.append!=='function'||journals.has(journal)||sources.has(source))throw Error('OUTPUT_PRODUCER_ALREADY_BOUND');
 const initial=journal.stats();if(initial.seq||initial.closed||initial.eof)throw Error('OUTPUT_SOURCE_REQUIRES_EMPTY_JOURNAL');
 sources.add(source);journals.add(journal);
}
