import {z} from 'zod';
// Opt-in read capability only. The host supplies identity and an already authorized
// journal consumer; the peer cannot choose a role, grant input, create or adopt PTYs.
const name=z.string().min(1).max(64);
const identitySchema=z.object({machineId:name,projectId:name,incarnation:name,session:name,pane:name,streamEpoch:name}).strict();
const cursorSchema=z.object({afterSeq:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),offset:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict();
export function registerOrderedOutputTools(server,{consumer,identity,version}){
 const bound=Object.freeze(identitySchema.parse(identity));
 if(![1,2].includes(version)||typeof consumer?.read!=='function'||typeof consumer?.close!=='function')throw Error('OUTPUT_CAPABILITY_REQUIRED');
 let closed=false;
 const close=()=>{if(closed)return;closed=true;consumer.close();};
 const reply=fn=>async args=>{try{if(closed)throw Error('OUTPUT_DISCONNECTED');return {content:[{type:'text',text:JSON.stringify(await fn(args))}]};}catch(error){return {isError:true,content:[{type:'text',text:/^[A-Z_]+$/.test(error.message)?error.message:'OUTPUT_OPERATION_FAILED'}]};}};
 server.tool('ordered_output_status','Bound output identity; observation does not grant input or refresh input evidence.',{},reply(async()=>{await consumer.check?.();return {identity:bound,version,input:false,reconnect:'Retain validated cursor/renderer, or replay a complete retained prefix. A gap requires reset.'};}));
 server.tool('ordered_output_read','One ordered output event at a supplied cursor. Read-only and safe to query again; never terminal input.',{identity:identitySchema,cursor:cursorSchema},reply(request=>{
  if(Object.keys(bound).some(k=>bound[k]!==request.identity[k]))throw Error('OUTPUT_IDENTITY_CHANGED');
  return consumer.read(request.cursor);
 }));
 // Preserve the host lifecycle callback while reclaiming this read capability.
 const previous=server.server.onclose;
 server.server.onclose=()=>{close();previous?.();};
 return Object.freeze({close});
}
