import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough,Readable} from 'node:stream';
import {OrderedOutputJournal,OrderedOutputReceiver} from '../src/ordered-output.mjs';
import {attachOrderedOutputSource} from '../src/ordered-output-source.mjs';
const identity={machineId:'fixture',projectId:'synthetic',incarnation:'one',session:'pty',pane:'output',streamEpoch:'one'};
test('source adapter splits bytes without decoding and refuses a second producer',async()=>{
 const source=new PassThrough(),journal=new OrderedOutputJournal(identity),consumer=journal.connect('human'),receiver=new OrderedOutputReceiver(identity),got=[];
 const adapter=attachOrderedOutputSource({source,journal,chunkBytes:1,onAvailable:()=>{got.push(receiver.accept(consumer.read(receiver.cursor())).bytes);}});
 assert.throws(()=>attachOrderedOutputSource({source:new PassThrough(),journal}),/OUTPUT_PRODUCER_ALREADY_BOUND/);
 const input=Buffer.from('🧪\x1b[2J\x1b]52;c;YQ==\x07');source.end(input);
 assert.equal((await adapter.done).status,'eof');assert.deepEqual(Buffer.concat(got),input);assert.equal(receiver.state,'eof');assert.equal((await adapter.cancel()).status,'eof');
});
test('oversized chunk, source error, premature close and async consumer do not produce EOF',async()=>{
 for(const mode of ['oversized','error','close','async']){
  const source=new PassThrough(),journal=new OrderedOutputJournal(identity),adapter=attachOrderedOutputSource({source,journal,onAvailable:mode==='async'?async()=>{}:()=>{}});
  if(mode==='oversized')source.write(Buffer.alloc(65537));if(mode==='error')source.destroy(Error('private details'));if(mode==='close')source.destroy();if(mode==='async')source.write(Buffer.from('x'));
  const result=await adapter.done;assert.equal(result.status,'failed');assert(!result.reason.includes('private'));assert.equal(journal.stats().eof,false);assert.equal(journal.stats().retainedBytes,0);
 }
});
test('cancel clears output and fences the source journal rather than implying process death',async()=>{
 const source=new PassThrough(),journal=new OrderedOutputJournal(identity),adapter=attachOrderedOutputSource({source,journal});source.write(Buffer.from('before'));
 const result=await adapter.cancel();assert.equal(result.status,'cancelled');assert.equal(result.processExitVerified,false);assert.equal(journal.stats().retainedBytes,0);assert(source.destroyed);
 assert.throws(()=>attachOrderedOutputSource({source:new PassThrough(),journal}),/OUTPUT_PRODUCER_ALREADY_BOUND/);
});
test('object mode, text mode and already-read sources cannot silently lose byte identity',()=>{
 for(const source of [Readable.from(['object']),new PassThrough().setEncoding('utf8')])assert.throws(()=>attachOrderedOutputSource({source,journal:new OrderedOutputJournal(identity)}),/OUTPUT_SOURCE_NOT_EXCLUSIVE/);
});
