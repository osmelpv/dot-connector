import xterm from '@xterm/xterm';
import {writeFile} from 'node:fs/promises';
import {XtermObserver} from '../src/xterm-observer.mjs';
import {createSyntheticSession} from '../src/tmux-session.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {BoundedOutputMcp} from '../src/bounded-output-mcp.mjs';
import {connectLocal} from '../src/tmux-local.mjs';
const native={skip:process.platform!=='linux'||process.env.DOT_TMUX_LAB_TEST!=='1',timeout:20000};
async function until(fn){for(let i=0;i<160;i++){const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,25));}throw Error('RUNTIME_EVIDENCE_TIMEOUT');}
async function start(t,enabled=true){
 const child=spawn(process.execPath,['scripts/tmux-bridge.mjs','--experimental-synthetic','runtime-lab','synthetic',...(enabled?['--ordered-output-v2']:[])],{env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:tmpdir()},stdio:['pipe','pipe','pipe']});let log='',code,signal,human,closing;
 child.stderr.on('data',b=>{log+=b;if(log.length>32768)child.kill('SIGTERM');});const events=()=>log.split('\n').flatMap(s=>{try{return [JSON.parse(s)];}catch{return [];}});
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(c,s)=>{code=c;signal=s;resolve();});});
 const client=new Client({name:'runtime-output-test',version:'1'}),transport=new BoundedOutputMcp(child.stdout,child.stdin);
 const close=()=>closing??=(async()=>{human?.close();await client.close();child.stdin.end();let timer;try{await Promise.race([exit,new Promise((_,reject)=>{timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('RUNTIME_EXIT_TIMEOUT'));},5000);})]);}finally{clearTimeout(timer);}const event=events().find(x=>x.event==='closed');assert.equal(event?.result.verified,true,log);assert.equal(code,0,log);assert.equal(signal,null);assert.equal(path.dirname(event.retainedState),tmpdir());assert(path.basename(event.retainedState).startsWith('dot-tmux-session-'));await rm(event.retainedState,{recursive:true,force:true});})();
 t.after(close);await client.connect(transport);const ready=await until(()=>events().find(x=>x.event==='ready'));
 return {client,ready,close,async human(){human=await connectLocal(ready.humanSocket,'human');return human;},async call(name,args={}){return client.callTool({name,arguments:args},undefined,{timeout:4000});},async value(name,args={}){const r=await this.call(name,args);assert(!r.isError,JSON.stringify(r));return JSON.parse(r.content[0].text);}};
}
test('operational launcher default stays snapshot-only and does not allocate ordered output',native,async t=>{
 const r=await start(t,false);assert.equal(r.ready.orderedOutput,undefined);assert.equal((await r.client.listTools()).tools.length,5);assert.equal((await r.call('ordered_output_status')).isError,true);assert.equal((await r.value('bridge_status')).paused,true);
});
test('opt-in runtime binds real pane output, human and MCP reads agree, cross identity and generation cannot confer input',native,async t=>{
 const r=await start(t),binding=r.ready.binding,identity=r.ready.orderedOutput;assert(identity.streamEpoch);assert.deepEqual((await r.value('ordered_output_status')).identity,identity);
 const h=await r.human();assert.deepEqual((await h.request({action:'status'})).orderedOutput.identity,identity);const cursor={afterSeq:0,offset:0};const first=await r.value('ordered_output_read',{identity,cursor});assert.equal(first.kind,'resize');assert.deepEqual(first.geometry,{columns:80,rows:24});
 assert.deepEqual(await h.request({action:'ordered-read',binding,identity,cursor}),first);
 for(const key of ['machineId','projectId','incarnation','session','pane','streamEpoch'])assert.equal((await r.call('ordered_output_read',{identity:{...identity,[key]:'other'},cursor})).isError,true);
 const before=await r.value('bridge_status');await r.value('ordered_output_read',{identity,cursor});const after=await r.value('bridge_status');assert.equal(after.generation,before.generation);assert.equal(after.paused,true);
 const grant=await h.request({action:'grant',binding,ttlMs:5000});await r.value('ordered_output_read',{identity,cursor});const active=await r.value('bridge_status');assert.equal(active.generation,grant.generation);assert(active.lease.remainingMs<5000);assert.equal((await r.call('bridge_input',{binding,operationId:'no-freshness',kind:'submit',sequence:1,snapshotId:'12345678-1234-4234-8234-123456789abc',generation:grant.generation})).isError,true);
 const snap=await r.value('bridge_read',{binding,after:0});await r.value('ordered_output_read',{identity,cursor});const input={binding,operationId:'runtime-marker',kind:'paste',text:'RUNTIME_🧪',sequence:snap.sequence,snapshotId:snap.snapshotId,generation:grant.generation};assert.equal((await r.value('bridge_input',input)).status,'dispatched');
 const outputCursor={afterSeq:1,offset:0},frames=[first],chunks=[];const observer=new XtermObserver(xterm.Terminal,identity,{atSeq:0,atOffset:0,columns:80,rows:24},{version:2});t.after(()=>observer.close());await observer.accept(first);let frameCursor={...outputCursor};for(let i=0;i<20;i++){const frame=await r.value('ordered_output_read',{identity,cursor:frameCursor});assert.deepEqual(await h.request({action:'ordered-read',binding,identity,cursor:frameCursor}),frame);if(frame.kind==='data'){frames.push(frame);chunks.push(Buffer.from(frame.data,'base64'));await observer.accept(frame);frameCursor={afterSeq:frame.seq,offset:frame.end};}if(Buffer.concat(chunks).toString().includes(input.text))break;await new Promise(res=>setTimeout(res,20));}assert.match(Buffer.concat(chunks).toString(),/RUNTIME_🧪/);assert.match(observer.screen().lines.join('\n'),/RUNTIME_🧪/);if(process.env.DOT_RUNTIME_OUTPUT_TRACE)await writeFile(process.env.DOT_RUNTIME_OUTPUT_TRACE,JSON.stringify({identity,frames,screen:observer.screen(),transport:'operational launcher, bounded MCP stdio, same owned tmux pane',inputGrantUnchanged:true})+'\n');
 const revoked=await h.request({action:'pause',binding});await r.value('ordered_output_read',{identity,cursor:outputCursor});assert.equal((await r.value('bridge_status')).generation,revoked.generation);assert.equal((await r.call('bridge_input',input)).isError,true);
 const old=identity;await r.close();const fresh=await start(t);assert.notEqual(fresh.ready.orderedOutput.incarnation,old.incarnation);assert.notEqual(fresh.ready.orderedOutput.streamEpoch,old.streamEpoch);assert.equal((await fresh.call('ordered_output_read',{identity:old,cursor:outputCursor})).isError,true);assert.equal((await fresh.value('bridge_status')).paused,true);
});

test('native ordered reads share the existing four-read budget and never alter the session lease',native,async t=>{
 const s=await createSyntheticSession({machineId:'budget',projectId:'synthetic',orderedOutput:true}),h=s.connect('human'),a=s.connect(),reader=s.orderedOutput.connect('agent');t.after(async()=>{s.reads=0;reader.close();assert.equal((await s.stop(h)).verified,true);await rm(s.dir,{recursive:true,force:true});});
 s.grant(h,a,5000);const lease=s.lease,generation=s.generation;s.reads=4;await assert.rejects(reader.read({afterSeq:0,offset:0}),/READ_BUSY/);assert.equal(s.reads,4);assert.equal(s.lease,lease);assert.equal(s.generation,generation);s.reads=0;await reader.read({afterSeq:0,offset:0});assert.equal(s.reads,0);assert.equal(s.lease,lease);assert.equal(s.observations.size,0);
});
