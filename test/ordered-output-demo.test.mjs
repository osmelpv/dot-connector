import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {OrderedOutputReceiver} from '../src/ordered-output.mjs';
test('fixture demo validates both byte streams and renders literal controls without a terminal',()=>{
 const html=execFileSync(process.execPath,['scripts/ordered-output-demo.mjs','--fixtures-only'],{encoding:'utf8',maxBuffer:262144});
 const payload=html.match(/<script type="application\/json" id="fixture-data">([^]*?)<\/script>/)[1],data=JSON.parse(payload),streams=[];
 for(const view of data){const r=new OrderedOutputReceiver(view.frames[0].identity),chunks=[];for(const f of view.frames)chunks.push(r.accept(f).bytes);assert.equal(r.state,'eof');streams.push(Buffer.concat(chunks));}
 assert.deepEqual(streams[0],streams[1]);assert(streams[0].includes(Buffer.from('\x1b]52;')));
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{textContent:id==='fixture-data'?payload:'',addEventListener:()=>{}});return elements.get(id);};
 const script=html.match(/<script>([^]*?)<\/script>/)[1];vm.runInNewContext(script,{document:{getElementById:get},TextDecoder,Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary')},{timeout:1000});
 assert.equal(get('human').textContent,get('agent').textContent);assert(get('human').textContent.includes('🧪'));assert(get('human').textContent.includes('\\u001b]52;'));assert(!get('human').textContent.includes('\x1b'));assert(get('status').textContent.startsWith('Verificado'));
});
