import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeReader,nativeTargetSchema} from '../src/native-reader.mjs';
const target=()=>({hwnd:'123',pid:7,startTimeTicks:'123456',panePath:[[42,7],[42,8]]});
function fixture(){
  let time=10000;const calls=[];
  const provider={observe:async args=>{calls.push(['observe',args]);return {target:target(),capturedAtMs:time,foregroundHwnd:'123',focusedPanePath:target().panePath};},getVisibleRanges:async args=>{calls.push(['getVisibleRanges',args]);return {target:target(),capturedAtMs:time,source:'TextPattern.GetVisibleRanges',ranges:[{text:'VISIBLE_ONLY',visible:true}],truncated:false};}};
  const reader=new NativeReader({target:target(),provider,now:()=>time,simulation:true});
  return {reader,provider,calls,tick:n=>time+=n};
}
test('native contract reads only bounded visible ranges; input remains unavailable',async()=>{
  const {reader,calls}=fixture();const snapshot=await reader.snapshot();assert.equal(snapshot.text,'VISIBLE_ONLY');assert.equal(snapshot.paused,true);assert.equal(snapshot.source,'TextPattern.GetVisibleRanges');assert.deepEqual(calls.map(c=>c[0]),['observe','getVisibleRanges','observe']);assert.equal(calls[1][1].maxCharacters,16000);assert.equal(calls[1][1].maxRanges,64);assert.equal((await reader.validateSnapshot(snapshot.snapshotId)).inputAllowed,false);await assert.rejects(reader.write({enabled:true}),/unavailable/);
});
test('native contract rejects changed HWND, PID start time, and pane ancestry before text read',async()=>{
  for(const patch of [{hwnd:'124'},{pid:8},{startTimeTicks:'654321'},{panePath:[[42,99]]}]){const {reader,provider,calls}=fixture();const observe=provider.observe;provider.observe=async a=>({...await observe(a),target:{...target(),...patch}});await assert.rejects(reader.snapshot(),/identity changed/);assert.equal(calls.filter(c=>c[0]==='getVisibleRanges').length,0);}
});
test('native contract aborts focus mismatch before read and target switch during read',async()=>{
  const a=fixture();const first=a.provider.observe;a.provider.observe=async args=>({...await first(args),foregroundHwnd:'999'});await assert.rejects(a.reader.snapshot(),/focus mismatch/);assert.equal(a.calls.length,1);
  const b=fixture();const observe=b.provider.observe;let count=0;b.provider.observe=async args=>({...await observe(args),focusedPanePath:++count===2?[[99]]:target().panePath});await assert.rejects(b.reader.snapshot(),/focus mismatch/);assert.equal(b.reader.last,null);
});
test('native contract refuses DocumentRange fallback, hidden text, and excessive ranges or aggregate text',async()=>{
  for(const patch of [{source:'DocumentRange'},{ranges:[{text:'HIDDEN',visible:false}]},{ranges:Array.from({length:65},()=>({text:'x',visible:true}))},{ranges:[{text:'x'.repeat(9000),visible:true},{text:'y'.repeat(9000),visible:true}]}]){const {reader,provider}=fixture();const read=provider.getVisibleRanges;provider.getVisibleRanges=async args=>({...await read(args),...patch});await assert.rejects(reader.snapshot());assert.equal(reader.last,null);}
});
test('native contract rejects stale/future captures and expired snapshots',async()=>{
  for(const capturedAtMs of [0,10001]){const {reader,provider}=fixture();const read=provider.getVisibleRanges;provider.getVisibleRanges=async a=>({...await read(a),capturedAtMs});await assert.rejects(reader.snapshot(),/stale or future/);}
  const {reader,tick}=fixture();const snapshot=await reader.snapshot();tick(30001);await assert.rejects(reader.validateSnapshot(snapshot.snapshotId),/stale/);
});
test('native provider errors do not trigger retries, fallbacks, or leak provider payloads',async()=>{
  const {reader,provider,calls}=fixture();provider.getVisibleRanges=async()=>{throw Error('sensitive provider payload');};await assert.rejects(reader.snapshot(),e=>/no fallback, retry, or elevation/.test(e.message)&&!e.message.includes('sensitive'));assert.equal(calls.length,1);assert.equal(reader.last,null);
  provider.getVisibleRanges=async()=>({target:target(),capturedAtMs:10000,source:'sensitive provider payload',ranges:[],truncated:false});await assert.rejects(reader.snapshot(),e=>e.message==='invalid native provider response; details withheld');
});
test('native contract rejects overlapping requests and freezes its explicit target',async()=>{
  const {reader,provider}=fixture();let release;const read=provider.getVisibleRanges;provider.getVisibleRanges=args=>new Promise(resolve=>release=()=>resolve(read(args)));const first=reader.snapshot();while(!release)await new Promise(r=>setImmediate(r));await assert.rejects(reader.snapshot(),/busy/);assert.throws(()=>reader.target.panePath[0].push(100),TypeError);release();await first;
});
test('native identity uses canonical positive Int64 strings and Int32 PID boundaries',()=>{
  const maximum={...target(),hwnd:'9223372036854775807',startTimeTicks:'9223372036854775807',pid:2147483647};assert.deepEqual(nativeTargetSchema.parse(maximum),maximum);
  for(const field of ['hwnd','startTimeTicks'])for(const value of ['9223372036854775808','99999999999999999999','01','0','-1','1.0','x'])assert.equal(nativeTargetSchema.safeParse({...target(),[field]:value}).success,false);
  for(const pid of [2147483648,0,-1,1.5])assert.equal(nativeTargetSchema.safeParse({...target(),pid}).success,false);
});
test('UTF-16 preserves supplementary pairs, bounds code units and rejects malformed ranges',async()=>{
  for(const [text,truncated,expected] of [['😀'.repeat(8000),false,'😀'.repeat(8000)],['ok\ud83d',true,'ok']]){const {reader,provider}=fixture();const read=provider.getVisibleRanges;provider.getVisibleRanges=async a=>({...await read(a),ranges:[{text,visible:true}],truncated});assert.equal((await reader.snapshot()).text,expected);}
  for(const [text,truncated] of [['\ud83d',false],['\udc00',true],['\ud83dx',true],['😀'.repeat(8001),true]]){const {reader,provider}=fixture();const read=provider.getVisibleRanges;provider.getVisibleRanges=async a=>({...await read(a),ranges:[{text,visible:true}],truncated});await assert.rejects(reader.snapshot());}
});
test('changed identity in visible response and stale capture after final observation abort',async()=>{
  const a=fixture();const read=a.provider.getVisibleRanges;a.provider.getVisibleRanges=async args=>({...await read(args),target:{...target(),startTimeTicks:'999'}});await assert.rejects(a.reader.snapshot(),/identity changed/);
  const b=fixture();const observe=b.provider.observe;let calls=0;b.provider.observe=async args=>{if(++calls===2)b.tick(1001);return observe(args);};await assert.rejects(b.reader.snapshot(),/stale/);assert.equal(b.reader.last,null);
});
test('direct providers require explicit simulation mode',()=>{const {provider}=fixture();assert.throws(()=>new NativeReader({target:target(),provider}),/simulation-only/);});
