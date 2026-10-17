import test from 'node:test';
import assert from 'node:assert/strict';
import {OrderedOutputJournal} from '../src/ordered-output.mjs';
import {OutputPresentation} from '../src/output-presentation.mjs';
const identity={machineId:'fixture',projectId:'synthetic',incarnation:'test',session:'pty',pane:'output',streamEpoch:'one'};
function frames(bytes){const j=new OrderedOutputJournal(identity);for(const b of bytes)j.append(Buffer.from([b]));j.finish();const c=j.connect('human'),out=[];let cursor={afterSeq:0,offset:0};while(true){const f=c.read(cursor);out.push(f);cursor={afterSeq:f.seq,offset:f.end};if(f.kind==='eof')break;}return out;}
test('incremental UTF8 and split dangerous strings are filtered without side effects',()=>{
 const input='A🧪\x1b]52;c;clipboard\x07B\x1b]0;title\x1b\\C\x1b]8;;https://invalid.test\x07link\x1b]8;;\x07D\x1bPquery\x1b\\E\x1b[6nF\x1b[31mG\u202eH\n';
 const p=new OutputPresentation(identity);for(const f of frames(Buffer.from(input)))p.accept(f);
 assert.equal(p.view().text,'A🧪BClinkDEFGH\n');assert.equal(p.view().state,'eof');assert(p.view().omittedControls>0);assert(!('input' in p));assert(!('reply' in p));
});
test('gap clears text and partial decoder/parser state; full-prefix replay restores transcript',()=>{
 const f=frames(Buffer.from('🧪ok')),p=new OutputPresentation(identity);p.accept(f[0]);assert.throws(()=>p.accept(f[2]),/ORDER/);assert.equal(p.view().text,'');
 p.resync();for(const frame of f)p.accept(frame);assert.equal(p.view().text,'🧪ok');assert.equal(p.accept(f.at(-1)).duplicate,true);
 assert.throws(()=>p.accept({...f[0],identity:{...identity,projectId:'other'}}),/IDENTITY_CHANGED/);assert.equal(p.view().text,'');assert.throws(()=>p.resync(),/CLOSED/);
});
test('retention bounded, fixed resize and incomplete UTF8 EOF fails closed',()=>{
 const j=new OrderedOutputJournal(identity),c=j.connect('human'),p=new OutputPresentation(identity);j.append(Buffer.from('a'.repeat(6000)));p.accept(c.read({afterSeq:0,offset:0}));assert.equal(p.view().retainedBytes,4096);assert(p.view().truncated);
 assert.throws(()=>p.resize(120,40),/FIXED_GEOMETRY/);assert.equal(p.view().columns,80);assert.equal(p.view().rows,24);
 const q=new OutputPresentation(identity),f=frames(Buffer.from([0xf0]));q.accept(f[0]);assert.throws(()=>q.accept(f[1]));assert.equal(q.view().text,'');assert.equal(q.view().state,'gap');
});
test('unterminated OSC and C1 controls never grow an escape buffer or leak payload',()=>{
 const j=new OrderedOutputJournal(identity),c=j.connect('human'),p=new OutputPresentation(identity);j.append(Buffer.from('ok\u009dsecret'+'x'.repeat(12000)));p.accept(c.read({afterSeq:0,offset:0}));assert.equal(p.view().text,'ok');assert.equal(p.view().retainedBytes,2);j.finish();p.accept(c.read({afterSeq:1,offset:j.stats().offset}));assert.equal(p.view().state,'eof');
});
