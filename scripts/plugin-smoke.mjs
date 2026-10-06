import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(new URL('../.mcp.json',import.meta.url),'utf8'));
const config=manifest.mcpServers['dot-connector'];
assert.equal(config.command,'/usr/bin/node');assert.equal(config.cwd,'.');
const client=new Client({name:'isolated-consumer-check',version:'1.0.0'});
await client.connect(new StdioClientTransport({command:config.command,args:config.args,cwd:root,env:{PATH:'/usr/bin:/bin'}}));
try {
 const list=await client.listTools();assert.deepEqual(list.tools.map(t=>t.name),['terminal_status']);
 const result=await client.callTool({name:'terminal_status',arguments:{}});assert.ok(!result.isError);
 const status=JSON.parse(result.content[0].text);assert.equal(status.target,null);assert.equal(status.capabilities.terminalInput,false);
 console.log(JSON.stringify({mcpHandshake:true,manifestLaunch:true,status,consumer:'isolated fixture; not ArtisanFeed or dot registration',uiCalls:0}));
} finally {await client.close();}
