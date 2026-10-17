import test from 'node:test';
import assert from 'node:assert/strict';
import xterm from '@xterm/xterm';
import {OrderedOutputJournal} from '../src/ordered-output.mjs';
import {XtermObserver} from '../src/xterm-observer.mjs';
const identity={machineId:'fixture',projectId:'synthetic',incarnation:'one',session:'pty',pane:'output',streamEpoch:'one'},geometry={atSeq:0,atOffset:0,columns:80,rows:24};
function stream(){const j=new OrderedOutputJournal(identity),c=j.connect('human');let cursor={afterSeq:0,offset:0};return {frame(text){j.append(Buffer.isBuffer(text)?text:Buffer.from(text));const f=c.read(cursor);cursor={afterSeq:f.seq,offset:f.end};return f;},eof(){j.finish();return c.read(cursor);}};}
test('official renderer preserves split UTF8/CSI, colors, cursor addressing and wrap',async()=>{
 const v=new XtermObserver(xterm.Terminal,identity,geometry),s=stream();try{
  for(const byte of Buffer.from('🧪\x1b[31mR\x1b[0m'))await v.accept(s.frame(Buffer.from([byte])));
  assert(v.screen().lines[0].includes('🧪R'));const red=Array.from({length:80},(_,i)=>v.cell(i,0)).find(c=>c.text==='R');assert.equal(red.fg,1);
  await v.accept(s.frame('\x1b[2;5HX'));assert.equal(v.cell(4,1).text,'X');await v.accept(s.frame('\x1b[3;80HYZ'));assert.equal(v.cell(79,2).text,'Y');assert.equal(v.cell(0,3).text,'Z');await v.accept(s.eof());assert.equal(v.status().state,'eof');
 }finally{v.close();}
});
test('alternate screen restores normal screen and dangerous OSC have no default effects',async()=>{
 const v=new XtermObserver(xterm.Terminal,identity,geometry),s=stream();try{
  await v.accept(s.frame('normal'));await v.accept(s.frame('\x1b[?1049hALT'));assert.equal(v.screen().type,'alternate');assert(v.screen().lines[0].includes('ALT'));await v.accept(s.frame('\x1b[?1049l'));assert.equal(v.screen().type,'normal');assert(v.screen().lines[0].includes('normal'));
  for(const byte of Buffer.from('\x1b]52;c;YQ==\x07\x1b]8;;https://invalid.test\x1b\\link\x1b]8;;\x07\x1b]0;title\x07\x1b]1;icon\x07\x1b]2;title\x07\x1b[6n'))await v.accept(s.frame(Buffer.from([byte])));
  assert.equal(v.status().blockedOsc,6);assert.equal(v.status().forwardedInputBytes,0);assert.equal(v.screen().lines[0],'normallink');
 }finally{v.close();}
});
test('duplicates ignored; gap disposes view and requires fresh renderer/full prefix',async()=>{
 const v=new XtermObserver(xterm.Terminal,identity,geometry),s=stream(),a=s.frame('one'),b=s.frame('two');await v.accept(a);assert.equal((await v.accept(a)).duplicate,true);await assert.rejects(v.accept({...b,seq:3}),/VT_ORDER/);assert.equal(v.screen(),null);await assert.rejects(v.accept(b),/RESTART_REQUIRED/);
 const fresh=new XtermObserver(xterm.Terminal,identity,geometry);try{await fresh.accept(a);await fresh.accept(b);assert.equal(fresh.screen().lines[0],'onetwo');}finally{v.close();fresh.close();}
});
test('one bounded async write, cross identity and owner geometry fences',async()=>{
 const v=new XtermObserver(xterm.Terminal,identity,geometry),s=stream(),pending=v.accept(s.frame('a'.repeat(16384)));await assert.rejects(v.accept(s.frame('b')),/BUSY_NO_QUEUE/);await pending;assert.equal(v.status().forwardedInputBytes,0);assert.throws(()=>v.resize(120,40),/FIXED_OWNER/);v.close();
 const other=new XtermObserver(xterm.Terminal,identity,geometry);await assert.rejects(other.accept({...stream().frame('x'),identity:{...identity,streamEpoch:'other'}}),/IDENTITY_CHANGED/);assert.equal(other.screen(),null);other.close();
 assert.throws(()=>new XtermObserver(xterm.Terminal,identity,{...geometry,atOffset:1}),/INITIAL_GEOMETRY/);
});
test('observer options and OSC interception prevent title actions; query/input has no sink',async()=>{
 let terminal;const titles=[];class AuditedTerminal extends xterm.Terminal{constructor(options){super(options);terminal=this;this.onTitleChange(value=>titles.push(value));}}
 const v=new XtermObserver(AuditedTerminal,identity,geometry),s=stream();try{
  assert.equal(terminal.options.disableStdin,true);assert.equal(terminal.options.altClickMovesCursor,false);assert.equal(terminal.options.convertEol,false);assert.deepEqual(terminal.options.windowOptions,{});assert.equal(terminal.options.scrollback,100);
  await v.accept(s.frame('\x1b]0;never-title\x07\x1b]1;never-icon\x07\x1b]2;never-title\x07\x1b]52;c;YQ==\x07\x1b[6n\x1b[c'));
  terminal.input('never-input',true);assert.deepEqual(titles,[]);assert.equal(v.status().blockedOsc,4);assert.equal(v.status().forwardedInputBytes,0);assert.equal(v.screen().lines[0],'');assert.equal(typeof v.writeInput,'undefined');
 }finally{v.close();}
});
