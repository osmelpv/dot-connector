import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {z} from 'zod';

const paneId=z.number().int().nonnegative();
const action={paneId,snapshotId:z.string().min(1),operationId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)};
const input=z.discriminatedUnion('kind',[
  z.object({...action,kind:z.literal('paste'),text:z.string().min(1).max(4096).regex(/^[^\x00-\x1f\x7f-\x9f\u2028\u2029]+$/)}).strict(),
  z.object({...action,kind:z.literal('submit')}).strict(),
  z.object({...action,kind:z.literal('key'),key:z.enum(['Escape','Ctrl+C','Backspace','Up','Down','Left','Right'])}).strict(),
]);
const schemas={terminal_status:z.object({}).strict(),terminal_snapshot:z.object({paneId}).strict(),terminal_input:input,terminal_pause:z.object({}).strict()};
const request=z.object({id:z.string().min(1).max(80),tool:z.enum(Object.keys(schemas)),arguments:z.record(z.unknown())}).strict();
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const client=new Client({name:'dot-connector-executor-client',version:'1.0.0'});
let lines;
const started=performance.now();
try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/server.mjs',import.meta.url))],env:{...process.env}}));
  emit({event:'ready',transport:'local MCP stdio via executor',connectMs:Math.round(performance.now()-started),automaticRetries:false});
  lines=createInterface({input:process.stdin,crlfDelay:Infinity});
  for await(const line of lines){
    const start=performance.now();let id=null;
    try {
      if(Buffer.byteLength(line)>12000)throw Error('request exceeds 12000 bytes');
      const r=request.parse(JSON.parse(line));id=r.id;
      const args=schemas[r.tool].parse(r.arguments);
      const result=await client.callTool({name:r.tool,arguments:args});
      const block=result.content?.find(c=>c.type==='text');
      if(result.isError)throw Error(block?.text??'MCP tool error');
      emit({id,ok:true,elapsedMs:Math.round(performance.now()-start),result:JSON.parse(block.text)});
    } catch(e){emit({id,ok:false,elapsedMs:Math.round(performance.now()-start),error:e.message});}
  }
} finally {lines?.close();await client.close();}
