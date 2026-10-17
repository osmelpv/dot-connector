import {syntheticGeometryProgram as program} from '../scripts/synthetic-geometry-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import xterm from '@xterm/xterm';
import {OrderedOutputJournal,OrderedOutputReceiver} from '../src/ordered-output.mjs';
import {attachSyntheticGeometrySource} from '../src/synthetic-geometry-source.mjs';
import {XtermObserver} from '../src/xterm-observer.mjs';
const identity=()=>({machineId:'fixture',projectId:'synthetic',incarnation:randomUUID(),session:'owned-pty',pane:'output',streamEpoch:randomUUID()});
test('owner event channel rejects wrong boundaries, malformed frames and missing EOF',async()=>{
 for(const events of [[{type:'resize',columns:80,rows:24,atOffset:1}],[{type:'data',base64:'eA=='}],[{type:'resize',columns:80,rows:24,atOffset:0}],[{type:'eof',atOffset:0}], [{type:'resize',columns:80,rows:24,atOffset:0},{type:'resize',columns:999,rows:24,atOffset:0}]]){
  const source=new PassThrough(),journal=new OrderedOutputJournal(identity(),{version:2}),owner=attachSyntheticGeometrySource({source,journal});source.end(events.map(e=>JSON.stringify(e)).join('\n')+'\n');assert.equal((await owner.done).status,'failed');assert.equal(journal.stats().retainedBytes,0);
 }
});
test('native synthetic owner verifies dynamic PTY geometry at drained byte boundaries', {skip:process.platform!=='linux'||process.env.DOT_TMUX_LAB_TEST!=='1',timeout:15000},async t=>{
 const id=identity(),journal=new OrderedOutputJournal(id,{version:2}),child=spawn('/usr/bin/python3',['-c',program],{cwd:tmpdir(),env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe']});let metadata='';child.stderr.on('data',b=>metadata=(metadata+b).slice(-4096));const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await closed;journal.close();});
 const owner=attachSyntheticGeometrySource({source:child.stdout,journal});assert.equal((await owner.done).status,'eof');assert.deepEqual(await closed,{code:0,signal:null});const evidence=JSON.parse(metadata);assert(evidence.closed);assert.deepEqual(evidence.geometries.map(g=>g.slice(0,2)),[[80,24],[40,12],[100,30]]);
 const screens=[];for(const label of ['human','agent']){const client=journal.connect(label),receiver=new OrderedOutputReceiver(id,{version:2}),view=new XtermObserver(xterm.Terminal,id,{atSeq:0,atOffset:0,columns:80,rows:24},{version:2});let resize=0;
  try{while(receiver.state!=='eof'){const f=client.read(receiver.cursor());receiver.accept(f);await view.accept(f);if(f.kind==='resize'){assert.deepEqual([f.geometry.columns,f.geometry.rows,f.start],evidence.geometries[resize++]);assert.equal(view.status().columns,f.geometry.columns);}}assert.equal(resize,3);assert.equal(view.status().forwardedInputBytes,0);assert.equal(view.status().blockedOsc,1);assert.equal(view.status().rows,30);screens.push(view.screen());}finally{view.close();}
 }assert.deepEqual(screens[0],screens[1]);assert(screens[0].lines[2].includes('RED 🧪'));
});
