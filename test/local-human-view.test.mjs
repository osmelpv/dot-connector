import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {serveOrderedHumanView} from '../src/local-human-view.mjs';
const identity={machineId:'fixture',projectId:'synthetic',incarnation:'one',session:'$0',pane:'%0',streamEpoch:'one'};
const binding=Object.fromEntries(Object.entries(identity).filter(([k])=>k!=='streamEpoch'));
const headers={'Sec-Fetch-Site':'same-origin'};
function fixture(){const calls=[];return {calls,identity:binding,request:async r=>{
  calls.push(r);
  if(r.action==='status')return {binding,orderedOutput:{identity,version:2,available:true}};
  if(r.action==='ordered-read')return {version:2,kind:'resize',identity,seq:1,start:0,end:0,data:'',geometry:{columns:80,rows:24}};
  throw Error('UNEXPECTED_ACTION');
}};}
test('opt-in HTTP view exposes only bounded reads, with exact host and same-origin guards',async t=>{
  const client=fixture(),view=await serveOrderedHumanView(client);t.after(()=>view.close());
  const page=await fetch(view.url);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);
  const config=await (await fetch(view.url+'config',{headers})).json();assert.deepEqual(config.identity,identity);
  const frame=await (await fetch(view.url+'frame?afterSeq=0&offset=0',{headers})).json();assert.equal(frame.kind,'resize');
  for(const [url,options,code] of [
    ['frame?afterSeq=0&offset=0',{},403],['config',{headers:{...headers,Origin:'https://foreign.invalid'}},403],
    ['input',{headers},404],['config',{method:'POST',headers},405],
    ['frame?afterSeq=-1&offset=0',{headers},400],['frame?afterSeq=0&offset=0&action=input',{headers},400]
  ])assert.equal((await fetch(view.url+url,options)).status,code,url);
  assert.equal(await new Promise((resolve,reject)=>{http.get(view.url+'config',{headers:{...headers,Host:'foreign.invalid'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);}),403);
  assert.equal(await new Promise((resolve,reject)=>{http.get(view.url,{path:'//%',headers},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);}),400);
  assert.deepEqual(client.calls.map(x=>x.action),['status','ordered-read']);
  const a=view.close();assert.equal(view.close(),a);await a;
  await assert.rejects(fetch(view.url));
});
test('view refuses disabled or mismatched output before listening',async()=>{
  for(const status of [{binding},{binding,orderedOutput:{identity:{...identity,pane:'other'},version:2,available:true}}]){
    await assert.rejects(serveOrderedHumanView({identity:binding,request:async()=>status}),/VIEW_OUTPUT_UNAVAILABLE/);
  }
});
test('one in-flight read, response bound, and cleanup join are enforced',async()=>{
  const client=fixture();let release;const original=client.request;
  client.request=r=>r.action==='status'?original(r):new Promise(resolve=>{release=resolve;});
  const view=await serveOrderedHumanView(client);
  try{
    const first=fetch(view.url+'frame?afterSeq=0&offset=0',{headers});
    while(!release)await new Promise(r=>setTimeout(r,5));
    assert.equal((await fetch(view.url+'frame?afterSeq=0&offset=0',{headers})).status,429);
    release({data:'x'.repeat(32769)});assert.equal((await first).status,502);
  }finally{await view.close();}
});
test('shutdown joins a pending read and shares its completion without accepting more connections',async()=>{
  const client=fixture(),original=client.request;let release;
  client.request=r=>r.action==='status'?original(r):new Promise(resolve=>{release=resolve;});
  const view=await serveOrderedHumanView(client);
  const response=fetch(view.url+'frame?afterSeq=0&offset=0',{headers}).catch(()=>null);
  while(!release)await new Promise(r=>setTimeout(r,5));
  let joined=false;const closing=view.close();assert.equal(view.close(),closing);void closing.then(()=>{joined=true;});
  await new Promise(r=>setTimeout(r,10));assert.equal(joined,false);
  release({});await closing;await response;assert.equal(joined,true);
  await assert.rejects(fetch(view.url));
});

test('surface rejects traversal, control routes, foreign fetch metadata and token-like queries',async t=>{
 const client=fixture(),view=await serveOrderedHumanView(client);t.after(()=>view.close());
 assert.equal(new URL(view.url).hostname,'127.0.0.1');assert.equal(new URL(view.url).search,'');
 for(const route of ['../package.json','%2e%2e/etc/passwd','src/local-human-view.mjs','xterm.js?file=/etc/passwd','grant','pause','stop','input']){
  const res=await fetch(view.url+route,{headers});assert.equal(res.status,404,route);assert.equal(res.headers.get('set-cookie'),null);assert.equal(res.headers.get('access-control-allow-origin'),null);
 }
 for(const site of ['cross-site','same-site','none'])assert.equal((await fetch(view.url+'config',{headers:{'Sec-Fetch-Site':site}})).status,403);
 assert.equal((await fetch(view.url+'x'.repeat(257),{headers})).status,400);
 assert.equal((await fetch(view.url+'config?token=synthetic',{headers})).status,404);
 const html=await (await fetch(view.url)).text();assert(!html.includes('http://')&&!html.includes('https://'));
 assert.deepEqual(client.calls.map(r=>r.action),['status']);
});
test('eight idle sockets are bounded and closing the observer does not close its IPC client',async()=>{
 const client=fixture();let closedClient=false;client.close=()=>{closedClient=true;};const view=await serveOrderedHumanView(client),url=new URL(view.url),sockets=[];
 try{
  for(let i=0;i<8;i++)await new Promise((resolve,reject)=>{const socket=net.connect(Number(url.port),url.hostname,resolve);sockets.push(socket);socket.on('error',reject);});
  const ninth=net.connect(Number(url.port),url.hostname);ninth.on('error',()=>{});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('SOCKET_LIMIT_NOT_ENFORCED')),1000);ninth.once('close',()=>{clearTimeout(timer);resolve();});});
  await view.close();assert.equal(closedClient,false);
 }finally{for(const socket of sockets)socket.destroy();await view.close();}
});
test('pipelined asset requests from a nonreading client have a bounded admission count',async()=>{
 const view=await serveOrderedHumanView(fixture()),url=new URL(view.url);
 const socket=net.connect(Number(url.port),url.hostname);socket.on('error',()=>{});
 try{
  await new Promise(resolve=>socket.once('connect',resolve));
  let bytes=0;socket.on('data',b=>{bytes+=b.length;});
  const closed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PIPELINE_NOT_BOUNDED')),1500);socket.once('close',()=>{clearTimeout(timer);resolve();});});
  socket.write(('GET /xterm.js HTTP/1.1\r\nHost: '+url.host+'\r\n\r\n').repeat(100));
  await closed;assert(bytes<=2*1024*1024);
 }finally{socket.destroy();await view.close();}
});
