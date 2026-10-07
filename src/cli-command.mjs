import {z} from 'zod';
import {normalizeUtf16} from './native-reader.mjs';
export function createCommandDispatcher(client,backend){
 if(!['diagnostic','native','wezterm'].includes(backend))throw Error('INVALID_BACKEND');
 let busy=false,closing=false;
 const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
 const base=z.object({id,command:z.enum(['status','read','paste','submit','pause','close']),arguments:z.record(z.unknown()).default({})}).strict();
 const pane=backend==='wezterm'?{paneId:z.number().int().nonnegative()}:{};
 const text=z.string().min(1).max(backend==='native'?256:4096).regex(/^[^\x00-\x1f\x7f-\x9f\u2028\u2029]+$/).refine(v=>{try{normalizeUtf16(v);return true;}catch{return false;}});
 const schemas={status:z.object({}).strict(),read:z.object(pane).strict(),pause:z.object({}).strict(),close:z.object({}).strict(),paste:z.object({...pane,snapshotId:id,operationId:id,text}).strict(),submit:z.object({...pane,snapshotId:id,operationId:id,...(backend==='native'?{text}:{})}).strict()};
 return async value=>{
  let request,args;
  try{request=base.parse(value);args=schemas[request.command].parse(request.arguments);}catch{return {ok:false,error:'INVALID_REQUEST'};}
  const {command}=request;
  if(closing)return {id:request.id,ok:false,error:'SESSION_CLOSING'};
  if(command==='close')closing=true;
  if(backend==='diagnostic'&&command==='close')return {id:request.id,ok:true,closing:true,result:{closed:true}};
  if(backend==='diagnostic'&&command!=='status')return {id:request.id,ok:false,error:'DIAGNOSTIC_ONLY'};
  if(busy&&!['pause','close'].includes(command))return {id:request.id,ok:false,error:'BUSY_NO_QUEUE'};
  const ownsBusy=!['pause','close'].includes(command);if(ownsBusy)busy=true;
  try{
   const name={status:'terminal_status',read:'terminal_snapshot',paste:'terminal_input',submit:'terminal_input',pause:'terminal_pause',close:'terminal_pause'}[command];
   const result=await client.callTool({name,arguments:['paste','submit'].includes(command)?{...args,kind:command}:args});
   if(result.isError)throw Error();
   const block=result.content?.find(x=>x.type==='text');return {id:request.id,ok:true,...(command==='close'?{closing:true}:{}),result:{...JSON.parse(block.text),...(command==='close'?{closed:true}:{})}};
  }catch{return {id:request.id,ok:false,...(command==='close'?{closing:true}:{}),error:'MCP_REFUSED_OR_OUTCOME_UNKNOWN_NO_RETRY'};}
  finally{if(ownsBusy)busy=false;}
 };
}
