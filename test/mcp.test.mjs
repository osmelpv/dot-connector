import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
test('real MCP stdio initialize/list and fail-closed missing session; no GUI',async()=>{
 const client=new Client({name:'protocol-test',version:'1.0.0'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:['src/server.mjs'],env:{PATH:process.env.PATH}}));
 try{const listed=await client.listTools();assert.deepEqual(listed.tools.map(t=>t.name).sort(),['terminal_input','terminal_pause','terminal_snapshot','terminal_status']);const r=await client.callTool({name:'terminal_status',arguments:{}});assert.equal(r.isError,true);}finally{await client.close();}
});
