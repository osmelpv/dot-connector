import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {BoundedOutputJsonl} from '../src/bounded-output-jsonl.mjs';
import {BoundedOutputMcp} from '../src/bounded-output-mcp.mjs';
import {BoundedMcpStdio} from '../src/bounded-mcp-stdio.mjs';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
test('JSONL rejects pre-parse length, partial EOF, invalid UTF8, malformed JSON and burst',()=>{
 for(const chunks of [[Buffer.alloc(32769,120)],[Buffer.alloc(65537)],[Buffer.from([255,10])],[Buffer.from('bad\n')],[Buffer.from('{}\n'.repeat(65))]]){
  let seen=0;const p=new BoundedOutputJsonl(()=>{seen++;});assert.throws(()=>chunks.forEach(c=>p.push(c)));assert.equal(p.retainedBytes,0);assert(seen<=64);assert.throws(()=>p.push(Buffer.from('{}\n')),/CLOSED/);
 }
 const p=new BoundedOutputJsonl(()=>{});p.push(Buffer.from('{'));assert.throws(()=>p.end(),/OUTPUT_TRUNCATED_LINE/);assert.equal(p.retainedBytes,0);
});
test('JSONL fragmented input retains only fixed capacity and dispatches in order',()=>{
 const seen=[],p=new BoundedOutputJsonl(x=>{seen.push(x);});
 const bytes=Buffer.from('{"text":"🧪"}\n{"text":"done"}\n');for(const b of bytes)p.push(Buffer.from([b]));
 assert.deepEqual(seen,[{text:'🧪'},{text:'done'}]);assert.equal(p.retainedBytes,32768);p.end();assert.equal(p.retainedBytes,0);
});
test('MCP output stream cap rejects a newline-free response before schema callback',async()=>{
 const input=new PassThrough(),output=new PassThrough(),t=new BoundedOutputMcp(input,output);let seen=0,closed=0;
 t.onmessage=()=>seen++;t.onclose=()=>closed++;await t.start();input.write(Buffer.alloc(32768,120));input.write(Buffer.from('x'));assert.equal(seen,0);assert.equal(closed,1);assert.equal(t.closed,true);input.destroy();output.destroy();
});
test('bounded client and existing bounded server exchange real MCP over in-memory streams',async()=>{
 const requests=new PassThrough(),responses=new PassThrough();const server=new McpServer({name:'bounded-fixture',version:'1'}),client=new Client({name:'bounded-fixture-client',version:'1'});
 server.tool('fixture_read','Synthetic output only',{},async()=>({content:[{type:'text',text:'x'.repeat(20000)}]}));
 try{await server.connect(new BoundedMcpStdio(requests,responses));await client.connect(new BoundedOutputMcp(responses,requests));const result=await client.callTool({name:'fixture_read',arguments:{}});assert.equal(result.content[0].text.length,20000);}
 finally{await client.close();await server.close();requests.destroy();responses.destroy();}
});
