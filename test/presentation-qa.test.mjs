import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {OrderedOutputJournal} from '../src/ordered-output.mjs';
import {presentationQaHtml} from '../src/presentation-qa.mjs';
test('standalone filtered QA replays, clears only gapped view and rejects resize',()=>{
 const identity={machineId:'fixture',projectId:'synthetic',incarnation:'one',session:'pty',pane:'output',streamEpoch:'one'},j=new OrderedOutputJournal(identity),frames=[];
 for(const byte of Buffer.from('A🧪\x1b]52;clipboard\x07Z'))j.append(Buffer.from([byte]));j.finish();const c=j.connect('human');let cursor={afterSeq:0,offset:0};while(true){const f=c.read(cursor);frames.push(f);cursor={afterSeq:f.seq,offset:f.end};if(f.kind==='eof')break;}
 const html=presentationQaHtml({source:'test-owned-pty',geometry:[80,24],views:[{label:'human',frames},{label:'agent',frames}]}),payload=html.match(/id="data">([^]*?)<\/script>/)[1],script=html.match(/<script>([^]*?)<\/script>/)[1],elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{textContent:id==='data'?payload:'',addEventListener:(event,fn)=>{get(id).click=fn;}});return elements.get(id);};
 vm.runInNewContext(script,{document:{getElementById:get},TextDecoder,TextEncoder,Uint8Array,atob,btoa},{timeout:1000});
 assert.equal(get('human').textContent,'A🧪Z');assert.equal(get('agent').textContent,'A🧪Z');get('gap').click();assert.equal(get('agent').textContent,'');assert.equal(get('human').textContent,'A🧪Z');assert(get('agent-meta').textContent.startsWith('gap'));
 get('replay').click();assert.equal(get('agent').textContent,'A🧪Z');get('resize').click();assert(get('notice').textContent.includes('Resize deshabilitado'));
});
