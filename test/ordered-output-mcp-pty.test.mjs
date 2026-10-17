import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import xterm from '@xterm/xterm';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {BoundedMcpStdio} from '../src/bounded-mcp-stdio.mjs';
import {OrderedOutputJournal,OrderedOutputReceiver} from '../src/ordered-output.mjs';
import {attachSyntheticGeometrySource} from '../src/synthetic-geometry-source.mjs';
import {XtermObserver} from '../src/xterm-observer.mjs';
import {registerOrderedOutputTools} from '../src/ordered-output-mcp.mjs';
import {syntheticGeometryProgram} from '../scripts/synthetic-geometry-fixture.mjs';
const native={skip:process.platform!=='linux'||process.env.DOT_TMUX_LAB_TEST!=='1',timeout:20000};
const delay=()=>new Promise(r=>setTimeout(r,5));
async function until(fn){const end=Date.now()+4000;while(!fn()){if(Date.now()>end)throw Error('FIXTURE_WAIT_TIMEOUT');await delay();}}
const childProgram=`
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {BoundedOutputMcp} from './src/bounded-output-mcp.mjs';
const client=new Client({name:'owned-stdio-reader',version:'1'});
await client.connect(new BoundedOutputMcp(process.stdin,process.stdout));
process.send({ready:true});
process.on('message',async m=>{if(m.close){await client.close();process.send({closed:true},()=>process.exit(0));return;}
 try{const result=await client.callTool(m.request,undefined,{timeout:3000});process.send({id:m.id,result});}catch(e){process.send({id:m.id,error:e.message});}});
`;
async function endpoint(journal,label){
 const child=spawn(process.execPath,['--input-type=module','-e',childProgram],{cwd:process.cwd(),env:{PATH:process.env.PATH,LANG:'C.UTF-8'},stdio:['pipe','pipe','pipe','ipc']});
 let ready=false,closed=false,stderr='',next=0;const pending=new Map(),calls=[];child.stderr.on('data',b=>stderr=(stderr+b).slice(-4096));
 const exited=new Promise((res,rej)=>{child.once('error',rej);child.once('close',(code,signal)=>{closed=true;for(const p of pending.values())p.reject(Error('CLIENT_EXITED'));pending.clear();res({code,signal});});});
 child.on('message',m=>{if(m.ready)ready=true;const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);}});
 const server=new McpServer({name:'owned-output-host',version:'1'}),transport=new BoundedMcpStdio(child.stdout,child.stdin);
 const capability=registerOrderedOutputTools(server,{consumer:journal.connect(label),identity:journal.identity,version:2});
 await server.connect(transport);const received=transport.onmessage;transport.onmessage=m=>{if(m.method==='tools/call')calls.push(m.params.name);received(m);};
 let loseNext=false;const send=transport.send.bind(transport);transport.send=async m=>{if(loseNext&&m.result?.content?.[0]?.text?.includes('"kind"')){loseNext=false;await transport.close();child.stdin.end();return;}return send(m);};
 try{await until(()=>ready||closed);if(closed)throw Error('CLIENT_START_FAILED '+stderr);}catch(e){child.kill('SIGTERM');await exited;await server.close();throw e;}
 return {calls,loseNext:()=>loseNext=true,call:request=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});child.send({id,request});}),
  async close(){if(!closed){child.send({close:true});await until(()=>closed);}const result=await exited;await server.close();capability.close();child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();assert.deepEqual(result,{code:0,signal:null});assert.equal(stderr,'');return result;}};
}
async function owner(t,limits={}){
 const identity={machineId:'fixture',projectId:'synthetic',incarnation:randomUUID(),session:'owned-pty',pane:'output',streamEpoch:randomUUID()},journal=new OrderedOutputJournal(identity,{version:2,...limits});
 const child=spawn('/usr/bin/python3',['-c',syntheticGeometryProgram,'--stepped'],{env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['pipe','pipe','pipe']});let lines='',reports=[];
 child.stderr.on('data',b=>{lines+=b;if(lines.length>4096){child.kill('SIGTERM');return;}let i;while((i=lines.indexOf('\n'))>=0){reports.push(JSON.parse(lines.slice(0,i)));lines=lines.slice(i+1);}});
 const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});const source=attachSyntheticGeometrySource({source:child.stdout,journal});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited;await source.cancel();journal.close();});
 await until(()=>reports.some(x=>x.ready===0));
 return {journal,identity,async advance(){const count=reports.filter(x=>'ready'in x).length;child.stdin.write('n');await until(()=>reports.filter(x=>'ready'in x).length>count);const ready=reports.filter(x=>'ready'in x).at(-1).ready;await until(()=>journal.stats().offset===ready);},
  async finish(){child.stdin.end('n');assert.equal((await source.done).status,'eof');assert.deepEqual(await exited,{code:0,signal:null});const proof=reports.find(x=>x.closed);assert(proof);assert.deepEqual(proof.geometries.map(x=>x.slice(0,2)),[[80,24],[40,12],[100,30]]);return proof;}};
}
function view(identity){const receiver=new OrderedOutputReceiver(identity,{version:2}),observer=new XtermObserver(xterm.Terminal,identity,{atSeq:0,atOffset:0,columns:80,rows:24},{version:2}),frames=[],bytes=[];
 return {receiver,observer,frames,bytes,async read(endpoint){const response=await endpoint.call({name:'ordered_output_read',arguments:{identity,cursor:receiver.cursor()}});assert(!response.isError,JSON.stringify(response));const frame=JSON.parse(response.content[0].text);const result=receiver.accept(frame);await observer.accept(frame);if(!['idle','gap'].includes(frame.kind)){frames.push(frame);bytes.push(result.bytes);}return frame;},close(){receiver.close();observer.close();}};
}
async function drain(v,e){for(let n=0;n<32;n++){const f=await v.read(e);if(['idle','eof','gap'].includes(f.kind))return f;}throw Error('FIXTURE_DRAIN_BOUND');}
test('owned PTY -> one journal -> two real stdio MCP clients -> existing observers; retained reconnect and cleanup',native,async t=>{
 const o=await owner(t),endpoints=[],a=view(o.identity),b=view(o.identity);t.after(async()=>{a.close();b.close();for(const e of endpoints)await e.close();});
 const human=await endpoint(o.journal,'human');endpoints.push(human);let agent=await endpoint(o.journal,'agent');endpoints.push(agent);
 await o.advance();await drain(a,human);await drain(b,agent);assert.deepEqual(a.frames,b.frames);
 await agent.close();assert.equal(o.journal.stats().consumers,1);await o.advance();await drain(a,human);agent=await endpoint(o.journal,'agent');endpoints.push(agent);await drain(b,agent);
 await o.advance();await drain(a,human);await drain(b,agent);const proof=await o.finish();await drain(a,human);await drain(b,agent);
 assert.deepEqual(a.frames,b.frames);assert.deepEqual(Buffer.concat(a.bytes),Buffer.concat(b.bytes));assert.deepEqual(a.observer.screen(),b.observer.screen());assert.match(a.observer.screen().lines.join('\n'),/RED 🧪/);assert.equal(a.receiver.state,'eof');assert.equal(b.receiver.state,'eof');assert.equal(a.observer.status().forwardedInputBytes,0);
 if(process.env.DOT_OUTPUT_INTEGRATION_EVIDENCE)await writeFile(process.env.DOT_OUTPUT_INTEGRATION_EVIDENCE,JSON.stringify({identity:o.identity,frames:a.frames,screen:a.observer.screen(),ptyProof:proof,transport:'OS pipes; SDK MCP; unchanged bounded transports',reconnected:true})+'\n');
 await human.close();await agent.close();assert.equal(o.journal.stats().consumers,0);
});
test('disconnected slow consumer gets explicit gap over MCP; no suffix render or hidden full-prefix recovery',native,async t=>{
 const o=await owner(t,{maxEvents:16}),a=view(o.identity),b=view(o.identity),endpoints=[];t.after(async()=>{a.close();b.close();for(const e of endpoints)await e.close();});
 const human=await endpoint(o.journal,'human');endpoints.push(human);let agent=await endpoint(o.journal,'agent');endpoints.push(agent);
 await o.advance();await drain(a,human);await drain(b,agent);await agent.close();await o.advance();await drain(a,human);await o.advance();await drain(a,human);
 agent=await endpoint(o.journal,'agent');endpoints.push(agent);const f=await b.read(agent);assert.equal(f.kind,'gap');assert.equal(b.observer.screen(),null);assert.equal(b.receiver.state,'gap');assert(o.journal.stats().retainedEvents<=16);
 b.receiver.resync();const again=await agent.call({name:'ordered_output_read',arguments:{identity:o.identity,cursor:b.receiver.cursor()}});assert.equal(JSON.parse(again.content[0].text).kind,'gap');await o.finish();
});
test('lost read response does not auto-retry; explicit cursor query is output-only and input tools are absent',native,async t=>{
 const o=await owner(t),endpoints=[];t.after(async()=>{for(const e of endpoints)await e.close();});await o.advance();
 let agent=await endpoint(o.journal,'agent');endpoints.push(agent);const request={name:'ordered_output_read',arguments:{identity:o.identity,cursor:{afterSeq:0,offset:0}}};agent.loseNext();await assert.rejects(agent.call(request));assert.deepEqual(agent.calls,['ordered_output_read']);await agent.close();
 agent=await endpoint(o.journal,'agent');endpoints.push(agent);const response=await agent.call(request);assert.equal(JSON.parse(response.content[0].text).kind,'resize');assert.equal((await agent.call({name:'bridge_input',arguments:{operationId:'unknown'}})).isError,true);assert.deepEqual(agent.calls,['ordered_output_read','bridge_input']);
 await o.advance();await o.advance();await o.finish();
});
