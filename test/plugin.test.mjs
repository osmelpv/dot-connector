import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
test('two installed plugin clients cannot adopt inherited development target or expose input',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'dot-plugin-test-'));const marker='do not change';
 await writeFile(path.join(dir,'session.json'),marker);const clients=[];
 try {
  for(let i=0;i<2;i++){
   const c=new Client({name:'plugin-test',version:'1'});clients.push(c);
   await c.connect(new StdioClientTransport({command:process.execPath,args:['src/plugin-server.mjs'],env:{PATH:process.env.PATH,DOT_STATE:dir,DOT_WEZTERM:'/must-not-execute'}}));
   assert.deepEqual((await c.listTools()).tools.map(t=>t.name),['terminal_status']);
   const r=await c.callTool({name:'terminal_status',arguments:{}});assert.ok(!r.isError);const s=JSON.parse(r.content[0].text);
   assert.equal(s.target,null);assert.equal(s.capabilities.terminalInput,false);assert.equal(s.capabilities.terminalRead,false);
   assert.equal((await c.callTool({name:'terminal_input',arguments:{}})).isError,true);
  }
  assert.deepEqual(await readdir(dir),['session.json']);assert.equal(await readFile(path.join(dir,'session.json'),'utf8'),marker);
 }finally{await Promise.all(clients.map(c=>c.close()));await rm(dir,{recursive:true,force:true});}
});
test('plugin package and MCP manifest agree on diagnostic entrypoint',async()=>{
 const plugin=JSON.parse(await readFile('.codex-plugin/plugin.json'));const pkg=JSON.parse(await readFile('package.json'));
 assert.equal(plugin.version,pkg.version);assert.equal(plugin.name,pkg.name);assert.equal(plugin.mcpServers,'./.mcp.json');
 const mcp=JSON.parse(await readFile('.mcp.json'));assert.deepEqual(mcp.mcpServers['dot-connector'],{command:'/usr/bin/node',args:['src/plugin-server.mjs'],cwd:'.'});
});
