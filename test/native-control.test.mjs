import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {NativeControl} from '../src/native-control.mjs';
import {createNativeMcpServer} from '../src/native-mcp-server.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
const target={hwnd:'123',pid:42,startTimeTicks:'456',panePath:[[1],[2]]};
async function fixture(){
 const dir=await mkdtemp(path.join(tmpdir(),'dot-native-control-'));let writes=0,cancels=0;
 const provider={observe:async()=>({target,capturedAtMs:Date.now(),foregroundHwnd:target.hwnd,focusedPanePath:target.panePath}),getVisibleRanges:async()=>({target,capturedAtMs:Date.now(),source:'TextPattern.GetVisibleRanges',ranges:[{text:'synthetic fixture',visible:true}],truncated:false}),nativeWrite:async a=>{writes++;return {target,operationId:a.operationId,dispatched:true};},cancel:()=>{cancels++;}};
 const c=new NativeControl({target,provider,stateDir:path.join(dir,'state'),claimsDir:path.join(dir,'claims'),simulation:true});await c.open();
 const grant=async(operationId,kind,text)=>writeFile(path.join(c.dir,'control.json'),JSON.stringify({paused:false,operationId,kind,text,expiresAtMs:Date.now()+10000}));
 return {dir,c,provider,grant,get writes(){return writes;},get cancels(){return cancels;},cleanup:()=>rm(dir,{recursive:true,force:true})};
}
test('native adapter requires exact human grant, separates paste/submit, and consumes operation IDs',async()=>{
 const f=await fixture();try{
 let s=await f.c.snapshot();const a={snapshotId:s.snapshotId,operationId:'one',kind:'paste',text:'abc'};
 await assert.rejects(f.c.write(a),/approval/);assert.equal(f.writes,0);
 await f.grant('one','paste','other');await assert.rejects(f.c.write(a),/approval/);
 await f.grant('one','paste','abc');assert.equal((await f.c.write(a)).dispatched,true);
 s=await f.c.snapshot();await assert.rejects(f.c.write({...a,snapshotId:s.snapshotId}),/EEXIST/);assert.equal(f.writes,1);
 await assert.rejects(f.c.write({...a,text:'abc\r'}),/invalid/);
 await assert.rejects(f.c.write({...a,kind:'submit',snapshotId:s.snapshotId}),/approval/);
 await f.grant('two','submit','abc');assert.equal((await f.c.write({...a,operationId:'two',kind:'submit',snapshotId:s.snapshotId})).dispatched,true);
 }finally{await f.cleanup();}
});
test('persistent target claim excludes another installation and sibling pane',async()=>{
 const f=await fixture();try{
 const other=new NativeControl({target:{...target,panePath:[[1],[3]]},provider:f.provider,stateDir:path.join(f.dir,'other'),claimsDir:f.c.claims,simulation:true});
 await assert.rejects(other.open(),/EEXIST|CLAIM_EXISTS/);assert.equal(f.writes,0);
 }finally{await f.cleanup();}
});
test('pause invalidates snapshots and cancels owned worker; unknown send is never retried',async()=>{
 const f=await fixture();try{
 let s=await f.c.snapshot();await f.grant('one','paste','x');await f.c.pause();
 await assert.rejects(f.c.write({snapshotId:s.snapshotId,operationId:'one',kind:'paste',text:'x'}),/snapshot/);assert.equal(f.cancels,1);
 s=await f.c.snapshot();await f.grant('two','paste','x');f.provider.nativeWrite=async()=>{throw Error('timeout');};
 await assert.rejects(f.c.write({snapshotId:s.snapshotId,operationId:'two',kind:'paste',text:'x'}),/unknown/);
 assert.equal(JSON.parse(await readFile(path.join(f.c.dir,'operations','two.json'))).status,'attempted');
 s=await f.c.snapshot();await assert.rejects(f.c.write({snapshotId:s.snapshotId,operationId:'two',kind:'paste',text:'x'}),/EEXIST/);
 }finally{await f.cleanup();}
});
test('real MCP protocol covers native snapshot/paste/separate submit/pause against simulated provider',async()=>{
 const f=await fixture(),server=createNativeMcpServer(f.c),client=new Client({name:'native-fixture',version:'1'});
 const [a,b]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(a);await client.connect(b);
  assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(),['terminal_input','terminal_pause','terminal_snapshot','terminal_status']);
  const snap=async()=>JSON.parse((await client.callTool({name:'terminal_snapshot',arguments:{}})).content[0].text);
  let s=await snap();await f.grant('mcp-paste','paste','SAFE');
  let r=await client.callTool({name:'terminal_input',arguments:{snapshotId:s.snapshotId,operationId:'mcp-paste',kind:'paste',text:'SAFE'}});assert.ok(!r.isError);assert.equal(f.writes,1);
  s=await snap();await f.grant('mcp-submit','submit','SAFE');
  r=await client.callTool({name:'terminal_input',arguments:{snapshotId:s.snapshotId,operationId:'mcp-submit',kind:'submit',text:'SAFE'}});assert.ok(!r.isError);assert.equal(f.writes,2);
  await client.callTool({name:'terminal_pause',arguments:{}});assert.equal(f.cancels,1);
 }finally{await client.close();await server.close();await f.cleanup();}
});
test('MCP boundary withholds raw grant parse errors and private paths',async()=>{
 const f=await fixture(),server=createNativeMcpServer(f.c),client=new Client({name:'native-error',version:'1'});
 const [a,b]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(a);await client.connect(b);const s=await f.c.snapshot();
  await writeFile(path.join(f.c.dir,'control.json'),'private fixture malformed text');
  const r=await client.callTool({name:'terminal_input',arguments:{snapshotId:s.snapshotId,operationId:'bad',kind:'paste',text:'x'}});
  assert.equal(r.isError,true);assert.equal(r.content[0].text,'NATIVE_OPERATION_REFUSED_OR_UNCONFIRMED_NO_RETRY');assert.equal(f.writes,0);
 }finally{await client.close();await server.close();await f.cleanup();}
});
