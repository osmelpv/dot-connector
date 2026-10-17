import test from 'node:test';
import assert from 'node:assert/strict';
import {OrderedOutputJournal,OrderedOutputReceiver,createOrderedOutputDecoder} from '../src/ordered-output.mjs';
const identity={machineId:'local',projectId:'synthetic',incarnation:'instance',session:'$0',pane:'%0',streamEpoch:'stream-1'};
test('two consumers receive identical ordered binary bytes, split controls and EOF',()=>{
 const journal=new OrderedOutputJournal(identity),human=journal.connect('human'),agent=journal.connect('agent');
 const bytes=Buffer.from('A🧪\x1b]52;c;YQ==\x07\x1b[2J\x1bPbad\x1b\\\x1b]8;;https://invalid.test\x07link\u202e');
 for(const byte of bytes)journal.append(Buffer.from([byte]));journal.finish();
 for(const client of [human,agent]){const receiver=new OrderedOutputReceiver(identity),got=[];
  const decoder=createOrderedOutputDecoder(receiver,result=>{got.push(result.bytes);});
  while(receiver.state!=='eof'){const encoded=Buffer.from(JSON.stringify(client.read(receiver.cursor()))+'\n');for(const byte of encoded)decoder.push(Buffer.from([byte]));}
  decoder.end();assert.deepEqual(Buffer.concat(got),bytes);assert.equal(receiver.cursor().offset,bytes.length);
 }
 assert.throws(()=>journal.append(Buffer.from('late')),/OUTPUT_CLOSED/);assert.throws(()=>journal.finish(),/OUTPUT_CLOSED/);
 journal.close();assert.equal(journal.stats().retainedBytes,0);
});
test('slow consumer gets an explicit gap; replay only resynchronizes a retained prefix',()=>{
 const j=new OrderedOutputJournal(identity,{capacity:4}),fast=j.connect('human'),slow=j.connect('agent'),r=new OrderedOutputReceiver(identity);
 j.append(Buffer.from('ab'));r.accept(fast.read(r.cursor()));j.append(Buffer.from('cd'));r.accept(fast.read(r.cursor()));j.append(Buffer.from('ef'));r.accept(fast.read(r.cursor()));
 const lost=new OrderedOutputReceiver(identity);assert.equal(lost.accept(slow.read(lost.cursor())).state,'gap');assert.throws(()=>lost.accept(fast.read(r.cursor())),/OUTPUT_RESYNC_REQUIRED/);
 assert.equal(lost.accept(slow.read(lost.resync())).state,'gap');assert.equal(j.stats().retainedBytes,4);
 const k=new OrderedOutputJournal(identity),c=k.connect('human'),v=new OrderedOutputReceiver(identity);k.append(Buffer.from('ab'));k.append(Buffer.from('cd'));
 const first=c.read(v.cursor()),second=c.read({afterSeq:1,offset:2});assert.throws(()=>v.accept(second),/OUTPUT_ORDER/);
 v.resync();assert.equal(v.accept(first).bytes.toString(),'ab');assert.equal(v.accept(second).bytes.toString(),'cd');
});
test('duplicates return no bytes; overlap and post-EOF bytes fail closed',()=>{
 const j=new OrderedOutputJournal(identity),c=j.connect('human'),r=new OrderedOutputReceiver(identity);j.append(Buffer.from('abc'));const first=c.read(r.cursor());r.accept(first);
 assert.equal(r.accept(first).state,'duplicate');assert.equal(r.accept(first).bytes.length,0);
 assert.throws(()=>r.accept({...first,seq:2,start:2,end:5}),/OUTPUT_ORDER/);r.resync();r.accept(first);j.finish();const eof=c.read(r.cursor());assert.equal(r.accept(eof).state,'eof');assert.equal(r.accept(eof).state,'duplicate');
 assert.throws(()=>r.accept({...first,seq:3,start:3,end:6}),/OUTPUT_ORDER/);
});
test('identity pinned across all fields, including explicit resync',()=>{
 for(const key of Object.keys(identity)){
  const j=new OrderedOutputJournal(identity),c=j.connect('human'),r=new OrderedOutputReceiver(identity);j.append(Buffer.from('x'));const f=c.read(r.cursor());
  assert.throws(()=>r.accept({...f,identity:{...identity,[key]:'other'}}),/OUTPUT_IDENTITY_CHANGED/);assert.throws(()=>r.resync(),/OUTPUT_CLOSED/);
 }
});
test('retention has byte AND event limits; borrowed buffers cannot mutate journal',()=>{
 const j=new OrderedOutputJournal(identity,{capacity:16,maxEvents:3}),c=j.connect('human'),input=Buffer.from('a');j.append(input);input[0]=98;
 assert.equal(c.read({afterSeq:0,offset:0}).data,'YQ==');
 for(let i=0;i<10000;i++)j.append(Buffer.from('x'));
 assert.equal(j.stats().retainedBytes,3);assert.equal(j.stats().retainedEvents,3);
 assert.throws(()=>j.append(Buffer.alloc(17)),/OUTPUT_CHUNK_LIMIT/);assert.throws(()=>j.connect('third'),/OUTPUT_CONSUMER_LIMIT/);
 assert.throws(()=>j.connect('human'),/OUTPUT_CONSUMER_LIMIT/);assert.throws(()=>c.read({afterSeq:10002,offset:0}),/OUTPUT_CURSOR/);
 c.close();const replacement=j.connect('human');c.close();assert.doesNotThrow(()=>replacement.read({afterSeq:10001,offset:10001}));
});
test('invalid canonical base64, offsets, lengths, fields and kinds reject',()=>{
 const j=new OrderedOutputJournal(identity),c=j.connect('human');j.append(Buffer.from('a'));const valid=c.read({afterSeq:0,offset:0});
 for(const extra of [{data:'YR=='},{data:'%%%='},{data:'YQ=='+' '.repeat(30000)},{end:2},{start:-1},{seq:0},{kind:'vt-eval'},{extra:true}]){
  const r=new OrderedOutputReceiver(identity);assert.throws(()=>r.accept({...valid,...extra}),/OUTPUT_FRAME/);assert.equal(r.state,'gap');
 }
});
test('output history has no lease/freshness token and survives arbitrary observation delay',()=>{
 const j=new OrderedOutputJournal(identity),c=j.connect('agent'),r=new OrderedOutputReceiver(identity);j.append(Buffer.from('historical output'));
 const f=c.read(r.cursor());assert(!('snapshotId' in f));assert(!('generation' in f));assert(!('expiresAt' in f));assert(!('input' in j));
 assert.equal(r.accept(f).bytes.toString(),'historical output');assert(!('input' in r));
});
test('transport ending without protocol EOF is not successful completion',()=>{
 const r=new OrderedOutputReceiver(identity),p=createOrderedOutputDecoder(r,()=>{});
 assert.throws(()=>p.end(),/OUTPUT_UNEXPECTED_END/);assert.equal(p.retainedBytes,0);
});
test('stream identity cannot be reassigned and full 16KiB binary frame fits bounded parser',()=>{
 const j=new OrderedOutputJournal(identity),c=j.connect('agent'),r=new OrderedOutputReceiver(identity);
 assert.throws(()=>{r.identity={...identity,streamEpoch:'bad'};},TypeError);
 assert.throws(()=>{j.identity={...identity,streamEpoch:'bad'};},TypeError);
 const input=Buffer.alloc(16384,255);j.append(input);let output;
 const decoder=createOrderedOutputDecoder(r,result=>{output=result.bytes;});const line=Buffer.from(JSON.stringify(c.read(r.cursor()))+'\n');assert(line.length<32768);decoder.push(line);assert.deepEqual(output,input);decoder.close();
});
