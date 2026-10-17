import test from 'node:test';
import assert from 'node:assert/strict';
import {startHumanView} from '../scripts/human-view-qa-helper.mjs';
test('real runtime and CLI opt-in deliver ordered pane output while legacy controls remain usable',{
 skip:process.platform!=='linux'||process.env.DOT_TMUX_LAB_TEST!=='1',timeout:20000
},async t=>{
 const fixture=await startHumanView();t.after(()=>fixture.close());const headers={'Sec-Fetch-Site':'same-origin'};
 const config=await (await fetch(fixture.url+'config',{headers})).json();assert.deepEqual(config.identity,fixture.ready.orderedOutput);
 let seq=0,offset=0,text='';await fixture.marker();
 for(let i=0;i<40;i++){
  const frame=await (await fetch(fixture.url+`frame?afterSeq=${seq}&offset=${offset}`,{headers})).json();
  assert.deepEqual(frame.identity,config.identity);
  if(!seq){assert.equal(frame.kind,'resize');assert.deepEqual(frame.geometry,{columns:80,rows:24});}
  if(frame.kind==='data')text+=Buffer.from(frame.data,'base64').toString();
  seq=frame.seq;offset=frame.end;if(text.includes('LIVE_HUMAN_VIEW'))break;
  await new Promise(r=>setTimeout(r,25));
 }
 assert.match(text,/LIVE_HUMAN_VIEW/);assert.match(fixture.cli.out(),/NOT a VT stream/);
 assert.equal((await fetch(fixture.url+'input',{method:'POST',headers})).status,405);
 assert.deepEqual(await fixture.close(),{runtimeExit:0,cliExit:0,verified:true,fixturesRemoved:true});
 await assert.rejects(fetch(fixture.url));
});
