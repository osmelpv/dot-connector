import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {SnapshotOutputReceiver} from '../src/snapshot-output.mjs';
import {rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
test('native isolated MCP emits opt-in snapshots while paused and closes without grant/input',
 {skip:process.platform!=='linux'||process.env.DOT_TMUX_LAB_TEST!=='1',timeout:15000},async()=>{
 const client=new Client({name:'snapshot-output-test',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:['scripts/tmux-bridge.mjs','--experimental-synthetic','output-test','synthetic'],stderr:'pipe',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:tmpdir()}});
 let log='';transport.stderr.on('data',b=>log=(log+b).slice(-32768));
 try{
  await client.connect(transport);
  const status=JSON.parse((await client.callTool({name:'bridge_status',arguments:{}})).content[0].text);assert.equal(status.paused,true);
  const receiver=new SnapshotOutputReceiver({...status.binding,generation:status.generation});
  const result=await client.callTool({name:'bridge_read',arguments:receiver.begin()});assert(!result.isError,JSON.stringify(result));
  const frame=JSON.parse(result.content[0].text),view=receiver.accept(frame);assert.equal(view.state,'current');assert.equal(view.text,'');assert.equal(frame.seq,1);assert.equal(frame.kind,'snapshot');
  const legacy=JSON.parse((await client.callTool({name:'bridge_read',arguments:{binding:status.binding,after:1}})).content[0].text);assert.equal(legacy.sequence,2);assert.equal(legacy.kind,undefined);
  assert.equal(JSON.parse((await client.callTool({name:'bridge_status',arguments:{}})).content[0].text).paused,true);
 }finally{
  await client.close();let closed;
  for(let i=0;i<100&&!closed;i++){closed=log.split('\n').flatMap(s=>{try{return [JSON.parse(s)];}catch{return [];}}).find(x=>x.event==='closed');if(!closed)await new Promise(r=>setTimeout(r,20));}
  assert.equal(closed?.result.verified,true);assert.equal(path.dirname(closed.retainedState),tmpdir());assert(path.basename(closed.retainedState).startsWith('dot-tmux-session-'));
  await rm(closed.retainedState,{recursive:true,force:true});
 }
});
