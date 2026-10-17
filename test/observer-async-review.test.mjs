import test from 'node:test';
import assert from 'node:assert/strict';
import xterm from '@xterm/xterm';
import {XtermObserver} from '../src/xterm-observer.mjs';
const identity={machineId:'fixture',projectId:'synthetic',incarnation:'async',session:'pty',pane:'output',streamEpoch:'one'},geometry={atSeq:0,atOffset:0,columns:80,rows:24};
const frame=()=>({version:1,kind:'data',identity,seq:1,start:0,end:3,data:'YWJj'});
test('frame mutation during actual parser callback wait cannot poison committed cursor/EOF',async()=>{
 let release;class DelayedAcknowledgement extends xterm.Terminal{write(bytes,callback){super.write(bytes,()=>{release=callback;});}}
 const observer=new XtermObserver(DelayedAcknowledgement,identity,geometry),input=frame();
 try{const pending=observer.accept(input);while(!release)await new Promise(r=>setImmediate(r));input.seq=999;input.end=999;input.kind='eof';release();const result=await pending;assert.equal(result.seq,1);assert.equal(result.offset,3);assert.equal(result.state,'ready');assert.equal(observer.screen().lines[0],'abc');}
 finally{observer.close();}
});
test('close after parser callback but before await continuation cannot report successful acceptance',async()=>{
 let observer;class ClosingAcknowledgement extends xterm.Terminal{write(bytes,callback){super.write(bytes,()=>{callback();observer.close();});}}
 observer=new XtermObserver(ClosingAcknowledgement,identity,geometry);
 await assert.rejects(observer.accept(frame()),/VT_CLOSED/);assert.equal(observer.status().state,'closed');assert.equal(observer.status().seq,0);assert.equal(observer.screen(),null);
});
test('resize callback cannot replace validated dimensions with later frame mutations',async()=>{
 let input;class MutatingResize extends xterm.Terminal{resize(columns,rows){super.resize(columns,rows);if(input)input.geometry.columns=160;}}
 const observer=new XtermObserver(MutatingResize,identity,geometry,{version:2});
 const resize=(seq,columns,rows)=>({version:2,kind:'resize',identity,seq,start:0,end:0,data:'',geometry:{columns,rows}});
 try{await observer.accept(resize(1,80,24));input=resize(2,40,12);await observer.accept(input);assert.equal(observer.status().columns,40);assert.equal(observer.status().rows,12);}finally{observer.close();}
});
