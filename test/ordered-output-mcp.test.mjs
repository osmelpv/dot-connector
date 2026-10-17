import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {OrderedOutputJournal} from '../src/ordered-output.mjs';
import {BoundedMcpStdio} from '../src/bounded-mcp-stdio.mjs';
import {BoundedOutputMcp} from '../src/bounded-output-mcp.mjs';
import {registerOrderedOutputTools} from '../src/ordered-output-mcp.mjs';
const identity={machineId:'fixture',projectId:'synthetic',incarnation:'unit',session:'owned',pane:'output',streamEpoch:'one'};
test('opt-in MCP capability exposes only bound reads, keeps original frame limits and closes its consumer',async()=>{
 const journal=new OrderedOutputJournal(identity,{version:2}),consumer=journal.connect('agent'),requests=new PassThrough(),responses=new PassThrough();
 const server=new McpServer({name:'output-fixture',version:'1'}),client=new Client({name:'output-fixture-client',version:'1'});let hostClosed=0;server.server.onclose=()=>hostClosed++;
 registerOrderedOutputTools(server,{consumer,identity,version:2});const incoming=new BoundedMcpStdio(requests,responses),outgoing=new BoundedOutputMcp(responses,requests);
 try{
  await server.connect(incoming);await client.connect(outgoing);assert.equal(incoming.frameLimit,16384);assert.equal(outgoing.frameLimit,32768);
  assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(),['ordered_output_read','ordered_output_status']);
  journal.resize(80,24);journal.append(Buffer.alloc(16384,120));journal.finish();
  const read=async(identity,cursor)=>{const result=await client.callTool({name:'ordered_output_read',arguments:{identity,cursor}},undefined,{timeout:3000});await new Promise(resolve=>setImmediate(resolve));return result;};
  assert.equal((await read({...identity,streamEpoch:'wrong'},{afterSeq:0,offset:0})).isError,true);
  const first=await read(identity,{afterSeq:0,offset:0});assert.equal(JSON.parse(first.content[0].text).kind,'resize');
  const data=JSON.parse((await read(identity,{afterSeq:1,offset:0})).content[0].text);assert.equal(Buffer.from(data.data,'base64').length,16384);
  assert.deepEqual(JSON.parse((await read(identity,{afterSeq:1,offset:0})).content[0].text),data);
  assert.equal((await client.callTool({name:'bridge_input',arguments:{}})).isError,true);
  await server.close();assert.equal(journal.stats().consumers,0);assert.equal(hostClosed,1);assert.throws(()=>consumer.read({afterSeq:0,offset:0}),/OUTPUT_DISCONNECTED/);
 }finally{await client.close();await server.close();requests.destroy();responses.destroy();journal.close();}
});
