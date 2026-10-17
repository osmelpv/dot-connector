// Opt-in QA: supplies its own synthetic document; no server, PTY or personal profile.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),out=resolve(process.env.OBSERVER_QA_OUTPUT??'browser-qa-evidence');
if(!process.env.PLAYWRIGHT_MODULE)throw Error('Set PLAYWRIGHT_MODULE to an existing authorized Playwright entrypoint');
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)));
await mkdir(out,{recursive:true});
let mcpTrace=null;if(process.env.OBSERVER_QA_FRAMES){const raw=await readFile(process.env.OBSERVER_QA_FRAMES);if(raw.length>65536)throw Error('QA_TRACE_LIMIT');mcpTrace=JSON.parse(raw);if(!Array.isArray(mcpTrace.frames)||mcpTrace.frames.length>1024)throw Error('QA_TRACE_LIMIT');}
const files={
 '/xterm.js':await readFile(root+'/node_modules/@xterm/xterm/lib/xterm.js','utf8'),
 '/xterm.css':await readFile(root+'/node_modules/@xterm/xterm/css/xterm.css','utf8'),
 '/observer.mjs':await readFile(root+'/src/xterm-observer.mjs','utf8')
};
const html=`<!doctype html><html><head><meta charset="utf-8"><title>Observer synthetic QA</title><link rel="stylesheet" href="/xterm.css"><style>
body{margin:24px;background:#101820;color:#e5edf5;font:16px system-ui}h1{font-size:24px}p{color:#b7c9d9}.views{display:flex;gap:24px;flex-wrap:wrap}.panel{padding:16px;border:1px solid #40586e;border-radius:8px;max-width:calc(100vw - 84px);overflow:auto}.terminal{width:max-content}textarea#scratch{display:block;width:350px;height:45px;margin:12px 0}h2{font-size:18px;margin:0 0 12px}#status{white-space:pre-wrap}
</style></head><body><h1>Shared output · synthetic observer QA</h1><p>Two read-only renderers · one ordered fixture · no terminal input connection</p><label>Isolated browser clipboard test<textarea id="scratch"></textarea></label><div class="views"><section class="panel"><h2>Human observer</h2><div id="human" class="terminal"></div></section><section class="panel"><h2>Agent observer</h2><div id="agent" class="terminal"></div></section></div><pre id="status"></pre><script src="/xterm.js"></script><script type="module">
import {XtermObserver} from '/observer.mjs';
const identity={machineId:'fixture',projectId:'synthetic',incarnation:'browser-qa',session:'owned-output',pane:'main',streamEpoch:'one'};
const geometry={atSeq:0,atOffset:0,columns:80,rows:24};
const instances=[];class InstrumentedTerminal extends Terminal{constructor(options){super(options);instances.push(this);}}
const observers=['human','agent'].map(id=>{const o=new XtermObserver(InstrumentedTerminal,identity,geometry,{version:2});o.open(document.getElementById(id));return o;});
let seq=0,offset=0;const frames=[];
const apply=async f=>{for(const o of observers)await o.accept(f);frames.push(f);document.getElementById('status').textContent=JSON.stringify(observers.map(o=>o.status()),null,2);};
window.qa={observers,instances,identity,geometry,frames,
 replay:async trace=>{observers.forEach(o=>o.close());const views=['human','agent'].map(id=>{const o=new XtermObserver(Terminal,trace.identity,geometry,{version:2});o.open(document.getElementById(id));return o;});window.replayedViews=views;for(const frame of trace.frames)for(const view of views)await view.accept(frame);return views.map(o=>({status:o.status(),screen:o.screen()}));},
 resize:async(columns,rows)=>apply({version:2,kind:'resize',identity,seq:++seq,start:offset,end:offset,data:'',geometry:{columns,rows}}),
 data:async(text,chunk=7)=>{const bytes=new TextEncoder().encode(text);for(let i=0;i<bytes.length;i+=chunk){const part=bytes.slice(i,i+chunk),start=offset;offset+=part.length;await apply({version:2,kind:'data',identity,seq:++seq,start,end:offset,data:btoa(String.fromCharCode(...part))});}},
 eof:async()=>apply({version:2,kind:'eof',identity,seq:++seq,start:offset,end:offset,data:''}),
 state:()=>observers.map(o=>({status:o.status(),screen:o.screen()})),
 duplicate:async()=>observers[0].accept(frames.at(-1)),
 gap:async()=>observers[0].accept({version:2,kind:'gap',identity,seq,start:offset,end:offset,data:''}),
 close:()=>observers.forEach(o=>o.close())};
window.ready=true;
</script></body></html>`;
const results=[],errors=[],unexpectedRequests=[];let browser,context;
const check=async(name,fn)=>{await fn();results.push({name,status:'passed'});console.log('PASS '+name);};
try{
 browser=await chromium.launch({headless:true,channel:'chromium',chromiumSandbox:true,timeout:15000});
 context=await browser.newContext({viewport:{width:2000,height:1200},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='https://observer.invalid'){unexpectedRequests.push(u.origin);return route.abort();}if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:html});if(Object.hasOwn(files,u.pathname))return route.fulfill({contentType:u.pathname.endsWith('.css')?'text/css':'text/javascript',body:files[u.pathname]});unexpectedRequests.push(u.pathname);return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('popup',p=>{errors.push('unexpected popup');void p.close();});page.on('dialog',d=>{errors.push('unexpected dialog');void d.dismiss();});
 await page.goto('https://observer.invalid/');await page.waitForFunction(()=>window.ready===true);
 if(mcpTrace){await check('owned PTY frames delivered through real stdio MCP replay identically in two browser observers',async()=>{const views=await page.evaluate(trace=>qa.replay(trace),mcpTrace);assert.deepEqual(views[0].screen,mcpTrace.screen);assert.deepEqual(views[1].screen,mcpTrace.screen);assert(views.every(v=>v.status.state===(mcpTrace.frames.at(-1).kind==='eof'?'eof':'ready')&&v.status.forwardedInputBytes===0));await page.evaluate(()=>document.getElementById('status').textContent='Actual test-owned PTY → ordered journal → OS pipes / MCP → two xterm observers');await page.screenshot({path:out+'/observer-mcp-pty.png',fullPage:true});await page.evaluate(()=>replayedViews.forEach(v=>v.close()));});await page.reload();await page.waitForFunction(()=>window.ready===true);}
 await check('real DOM mount, ordered resize and fragmented UTF-8/VT in two renderers',async()=>{
  await page.evaluate(async()=>{await qa.resize(80,24);await qa.data('first\r\n');await qa.resize(40,12);await qa.data('\x1b[2;40HXY');await qa.resize(100,30);await qa.data('\x1b[2J\x1b[HShared synthetic output\r\n\x1b[31mRED\x1b[0m 🧪\r\n\x1b[?1049hALT SCREEN\x1b[?1049l\x1b[4;5Hcursor X\x1b[5;100HYZ',3);});
  const states=await page.evaluate(()=>qa.state());assert.deepEqual(states[0].screen,states[1].screen);assert.equal(states[0].status.columns,100);assert.equal(states[0].status.rows,30);assert.match(states[0].screen.lines.join('\n'),/RED 🧪/);assert.match(states[0].screen.lines[3],/cursor X/);assert.match(states[0].screen.lines[4],/Y$/);assert.match(states[0].screen.lines[5],/^Z/);
  assert.equal(await page.evaluate(()=>qa.observers[0].cell(0,1).fg),1);
  const sizes=await page.locator('.xterm-screen').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));assert.equal(sizes.length,2);assert(sizes.every(s=>s.w>500&&s.h>200));
 });
 const clipboard=page.locator('#scratch');await clipboard.fill('PRE_OSC_SENTINEL');await clipboard.selectText();await page.keyboard.press('Control+c');
 await check('OSC title, hyperlink and clipboard commands blocked; terminal queries have no input sink',async()=>{
  await page.evaluate(async()=>{await qa.data('\x1b]0;REPLACED\x07\x1b]2;REPLACED\x07\x1b]8;;https://external.invalid/\x07link text\x1b]8;;\x07\x1b]52;c;SU5KRUNURUQ=\x07\x1b[6n\x1b[c',2);});
  await clipboard.fill('');await clipboard.focus();await page.keyboard.press('Control+v');assert.equal(await clipboard.inputValue(),'PRE_OSC_SENTINEL');
  assert.equal(await page.title(),'Observer synthetic QA');assert.equal(await page.locator('.terminal a').count(),0);const s=await page.evaluate(()=>qa.state());assert(s.every(x=>x.status.blockedOsc===5&&x.status.droppedOutboundEvents===0&&x.status.forwardedInputBytes===0),JSON.stringify(s.map(x=>x.status)));
 });
 await check('trusted keyboard, paste shortcut, mouse, wheel and selection cannot change observer',async()=>{
  const scratch=page.locator('#scratch');await scratch.fill('SYNTHETIC_CLIPBOARD_SENTINEL');await scratch.selectText();await page.keyboard.press('Control+c');await scratch.fill('');await page.keyboard.press('Control+v');assert.equal(await scratch.inputValue(),'SYNTHETIC_CLIPBOARD_SENTINEL');
  const before=await page.evaluate(()=>qa.state());const target=page.locator('#human .xterm-helper-textarea');await target.focus();await page.keyboard.type('MUST_NOT_ENTER');await page.keyboard.press('Enter');await page.keyboard.press('Control+v');await page.keyboard.insertText('IME_SYNTHETIC');
  const bounds=await page.locator('#human .xterm-screen').boundingBox();await page.mouse.move(bounds.x+30,bounds.y+20);await page.mouse.down();await page.mouse.move(bounds.x+170,bounds.y+20,{steps:4});await page.mouse.up();await page.mouse.dblclick(bounds.x+60,bounds.y+40);await page.mouse.wheel(0,200);await target.focus();await page.keyboard.press('Control+c');
  await page.locator('#agent .xterm-helper-textarea').focus();await page.keyboard.type('AGENT_MUST_NOT_ENTER');await page.keyboard.press('Control+v');await page.evaluate(()=>qa.instances.forEach(t=>t.paste('PUBLIC_PASTE_API')));
  const after=await page.evaluate(()=>qa.state());assert.deepEqual(after.map(x=>x.screen),before.map(x=>x.screen));assert(after[0].status.blockedDomEvents>before[0].status.blockedDomEvents);assert(after.every(x=>x.status.forwardedInputBytes===0&&x.status.droppedOutboundEvents===0&&x.status.blockedDomEvents>0));assert.equal(await page.evaluate(()=>qa.instances[0].hasSelection()),false);assert.equal(await target.inputValue(),'');
  await scratch.fill('');await scratch.focus();await page.keyboard.press('Control+v');assert.equal(await scratch.inputValue(),'SYNTHETIC_CLIPBOARD_SENTINEL');
 });
 await check('paste/drop/beforeinput/copy events are cancelled in mounted browser DOM (injected events)',async()=>{
  const values=await page.evaluate(()=>{const target=document.querySelector('#human .xterm-helper-textarea');return ['paste','drop','beforeinput','copy','cut'].map(type=>{const e=type==='paste'?new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:new DataTransfer()}):new Event(type,{bubbles:true,cancelable:true});target.dispatchEvent(e);return {type,prevented:e.defaultPrevented};});});assert(values.every(x=>x.prevented));
 });
 await page.locator('#scratch').fill('Synthetic clipboard assertions passed');await page.evaluate(()=>document.getElementById('status').textContent=JSON.stringify(qa.state().map(x=>({seq:x.status.seq,offset:x.status.offset,columns:x.status.columns,rows:x.status.rows,blockedOsc:x.status.blockedOsc,blockedDomEvents:x.status.blockedDomEvents,forwardedInputBytes:x.status.forwardedInputBytes})),null,2));await page.screenshot({path:out+'/observer-wide.png',fullPage:true});
 await check('narrow viewport contains horizontal overflow without changing owner geometry',async()=>{
  await page.setViewportSize({width:700,height:1000});assert.equal(await page.evaluate(()=>qa.observers[0].status().columns),100);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/observer-narrow.png',fullPage:true});
 });
 await check('duplicate, EOF, gap disposal and late frames preserve lifecycle fence',async()=>{
  assert.equal((await page.evaluate(()=>qa.duplicate())).duplicate,true);await page.evaluate(()=>qa.eof());assert((await page.evaluate(()=>qa.state())).every(x=>x.status.state==='eof'));
  await page.evaluate(()=>qa.gap());assert.equal(await page.locator('#human .xterm').count(),0);assert.equal(await page.evaluate(()=>qa.observers[0].screen()),null);assert.equal(await page.evaluate(async()=>{try{await qa.observers[0].accept(qa.frames.at(-1));return 'accepted';}catch(e){return e.message;}}),'VT_RESTART_REQUIRED');await page.evaluate(()=>qa.close());assert.equal(await page.locator('.xterm').count(),0);
 });
 assert.deepEqual(errors,[]);assert.deepEqual(unexpectedRequests,[]);
 const result={status:'passed',browser:browser.version(),sandbox:true,headless:true,personalProfile:false,permissionsGranted:[],network:'all content fulfilled in memory; no server or upstream requests',xterm:JSON.parse(await readFile(root+'/node_modules/@xterm/xterm/package.json')).version,sourceSha256:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')])),results,errors,unexpectedRequests};
 await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){await writeFile(out+'/failure.json',JSON.stringify({error:error.stack,results,errors,unexpectedRequests},null,2));throw error;}
finally{await context?.close();await browser?.close();}

await writeFile(out+'/cleanup.json',JSON.stringify({contextClosed:true,browserClosed:true})+'\n');
