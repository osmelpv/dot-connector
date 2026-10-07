import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
export function createNativeMcpServer(control){
 const server=new McpServer({name:'dot-connector-manual-native',version:'0.1.7'});
 const reply=fn=>async args=>{try{return {content:[{type:'text',text:JSON.stringify(await fn(args))}]};}catch{return {isError:true,content:[{type:'text',text:'NATIVE_OPERATION_REFUSED_OR_UNCONFIRMED_NO_RETRY'}]};}};
 server.tool('terminal_status','Report the explicitly claimed manual native target; no GUI access.',{},reply(()=>control.status()));
 server.tool('terminal_snapshot','Read bounded visible text of the claimed foreground target; no activation.',{},reply(()=>control.snapshot()));
 server.tool('terminal_input','One human-approved paste or separate submit; no queue or automatic retry.',{snapshotId:z.string(),operationId:z.string(),kind:z.enum(['paste','submit']),text:z.string().max(256).default('')},reply(a=>control.write(a)));
 server.tool('terminal_pause','Pause undispatched input; cannot recall queued OS events.',{},reply(()=>control.pause()));
 return server;
}
