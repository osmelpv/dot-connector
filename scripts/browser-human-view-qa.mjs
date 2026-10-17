// Opt-in QA against a new owned runtime and its real CLI companion; no installed runtime.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startHumanView} from './human-view-qa-helper.mjs';
if(!process.env.PLAYWRIGHT_MODULE||!process.env.HUMAN_VIEW_QA_OUTPUT)throw Error('EXPLICIT_QA_PATHS_REQUIRED');
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)));
const out=resolve(process.env.HUMAN_VIEW_QA_OUTPUT);await mkdir(out,{recursive:true});
let browser,context,fixture,page;const results=[],errors=[],requests=[],responses=[];
try{
 fixture=await startHumanView();
 browser=await chromium.launch({headless:true,channel:'chromium',chromiumSandbox:true,timeout:15000});
 context=await browser.newContext({viewport:{width:1100,height:800},serviceWorkers:'block'});
 const origin=new URL(fixture.url).origin;
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin==='https://foreign.invalid')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Foreign fixture</title>'});if(u.origin!==origin){errors.push('EXTERNAL_REQUEST');return route.abort();}
  requests.push({path:u.pathname,method:route.request().method()});
  if(u.pathname==='/observer.mjs'){
   // Expose the unchanged renderer through a QA-only subclass to inspect its screen.
   const source=await readFile('src/xterm-observer.mjs','utf8');
   return route.fulfill({contentType:'text/javascript',body:source.replace('export class XtermObserver','class BaseObserver')+'\nexport class XtermObserver extends BaseObserver {constructor(...args){super(...args);globalThis.qaObserver=this;(globalThis.qaObservers??=[]).push(this);}}\n'});
  }
  return route.continue();
 });
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('popup',p=>{errors.push('POPUP');void p.close();});
 page.on('response',async r=>{const entry={path:new URL(r.url()).pathname,status:r.status()};responses.push(entry);if(r.status()>=400)entry.body=await r.text().catch(()=>null);});
 await page.goto(fixture.url);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Observing'),null,{timeout:10000});
 await fixture.marker();await page.waitForFunction(()=>globalThis.qaObserver?.screen()?.lines.join('\n').includes('LIVE_HUMAN_VIEW')||/stopped/.test(document.querySelector('#status').textContent),null,{timeout:10000});assert.match(await page.evaluate(()=>qaObserver.screen()?.lines.join('\n')??''),/LIVE_HUMAN_VIEW/);
 assert.deepEqual(await page.evaluate(()=>qaObserver.status().identity),fixture.ready.orderedOutput);
 await page.waitForTimeout(2000);assert.match(await page.locator('#status').textContent(),/^Observing/);
 const foreign=await context.newPage();await foreign.goto('https://foreign.invalid/');
 const denied=await foreign.evaluate(async target=>{try{await fetch(target+'config',{mode:'cors',credentials:'omit'});return false;}catch{return true;}},fixture.url);
 assert.equal(denied,true);await foreign.close();results.push('cross-origin browser cannot read config; no CORS or local-network permission granted');
 results.push('live owned runtime → Unix IPC → CLI loopback → real Chromium renderer');
 const before=await page.evaluate(()=>qaObserver.screen());
 await page.locator('.xterm-helper-textarea').focus();await page.keyboard.type('MUST_NOT_ENTER');await page.keyboard.press('Enter');await page.keyboard.press('Control+v');
 assert.deepEqual(await page.evaluate(()=>qaObserver.screen()),before);
 assert.equal(await page.evaluate(()=>qaObserver.status().forwardedInputBytes),0);
 assert((await page.evaluate(()=>qaObserver.status().blockedDomEvents))>0);
 assert(requests.every(x=>x.method==='GET'&&!/input|grant|pause|stop/.test(x.path)));
 results.push('trusted browser keys/paste blocked; no writer endpoint or automatic input');
 await page.screenshot({path:out+'/live-wide.png',fullPage:true});
 await page.setViewportSize({width:480,height:800});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:out+'/live-narrow.png',fullPage:true});results.push('narrow layout preserves fixed 80×24 owner geometry');

 const originalScreen=await page.evaluate(()=>qaObserver.screen());
 for(const cutMode of ['before-response','after-response']){
  const count=await page.evaluate(()=>qaObservers.length);let cut=false;
  await page.route('**/frame?*',async route=>{if(!cut){cut=true;if(cutMode==='after-response')await route.fetch();return route.abort('failed');}return route.continue();});
  await page.waitForFunction(count=>qaObservers.length>count&&qaObserver.screen()?.lines.join('\n').includes('LIVE_HUMAN_VIEW'),count);
  assert.deepEqual(await page.evaluate(()=>qaObserver.screen()),originalScreen);
  assert.equal(await page.evaluate(()=>qaObservers.slice(0,-1).every(o=>o.screen()===null)),true);
  await page.unroute('**/frame?*');results.push('read-only full-prefix rebuild '+cutMode+' preserves screen without duplicated input');
 }
 await page.route('**/frame?*',route=>route.abort('failed'));
 await page.waitForFunction(()=>/recovery limit reached/.test(document.querySelector('#status').textContent));
 assert.equal(await page.locator('.xterm').count(),0);await page.unroute('**/frame?*');results.push('third transport cut exhausts lifetime budget without reconnecting');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Observing'));
 await page.getByRole('button',{name:'Disconnect view'}).click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Disconnected'));
 assert.equal(await page.locator('.xterm').count(),0);
 const count=requests.length;await page.waitForTimeout(350);assert.equal(requests.length,count);results.push('disconnect aborts polling and disposes renderer without stopping CLI');
 for(const mode of ['gap','identity']){
  await page.route('**/frame?*',async route=>{
   const identity={...fixture.ready.orderedOutput,...(mode==='identity'?{streamEpoch:'wrong'}:{})};
   await route.fulfill({contentType:'application/json',body:JSON.stringify({version:2,kind:mode==='gap'?'gap':'resize',identity,seq:1,start:0,end:0,data:'',...(mode==='identity'?{geometry:{columns:80,rows:24}}:{})})});
  });
  await page.reload();await page.waitForFunction(()=>/stopped/.test(document.querySelector('#status').textContent));
  assert.equal(await page.locator('.xterm').count(),0);await page.unroute('**/frame?*');results.push(mode+' fence stops view without recovery');
 }
 await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Observing'));
 fixture.cli.child.stdin.write('/stop\n');
 await page.waitForFunction(()=>/stopped/.test(document.querySelector('#status').textContent));
 assert.equal(await page.locator('.xterm').count(),0);results.push('closing the owned source invalidates the live reader and disposes its renderer');
 assert.deepEqual(errors,[]);
 await writeFile(out+'/result.json',JSON.stringify({status:'passed',results,browser:browser.version(),sandbox:true,headless:true,credentials:'none',network:'only the test-owned loopback server',errors},null,2)+'\n');
}catch(error){await writeFile(out+'/failure.json',JSON.stringify({error:error.message,errors,responses,cliError:fixture?.cli.err(),runtimeError:fixture?.runtimeError(),status:await page?.locator('#status').textContent().catch(()=>null)},null,2));throw error;}finally{
 await context?.close();await browser?.close();const cleanup=await fixture?.close();
 await writeFile(out+'/cleanup.json',JSON.stringify({contextClosed:true,browserClosed:true,...cleanup})+'\n');
}
console.log(JSON.stringify({status:'passed',results}));
