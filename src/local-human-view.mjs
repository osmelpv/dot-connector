// Explicit loopback observer companion. The existing CLI retains the human controls.
import http from 'node:http';
import {page} from './local-human-view-page.mjs';
import {readFile} from 'node:fs/promises';
const keys=['machineId','projectId','incarnation','session','pane'];
export async function serveOrderedHumanView(client){
 const status=await client.request({action:'status'}),output=status.orderedOutput;
 if(!output?.available||output.version!==2||!output.identity||Object.keys(output.identity).length!==6||
    ![...keys,'streamEpoch'].every(k=>typeof output.identity[k]==='string'&&output.identity[k].length>0&&output.identity[k].length<=64)||
    !keys.every(k=>status.binding?.[k]===client.identity?.[k]&&output.identity[k]===client.identity[k]))throw Error('VIEW_OUTPUT_UNAVAILABLE');
 const binding=Object.freeze({...client.identity}),identity=Object.freeze({...output.identity});
 const assets=new Map(await Promise.all([
  ['/view.mjs','../src/local-human-view-browser.mjs','text/javascript'],
  ['/reader.mjs','../src/human-view-reader.mjs','text/javascript'],
  ['/observer.mjs','../src/xterm-observer.mjs','text/javascript'],
  ['/xterm.js','../node_modules/@xterm/xterm/lib/xterm.js','text/javascript'],
  ['/xterm.css','../node_modules/@xterm/xterm/css/xterm.css','text/css']
 ].map(async([route,file,type])=>[route,{bytes:await readFile(new URL(file,import.meta.url)),type}])));
 assets.set('/',{bytes:Buffer.from(page),type:'text/html'});
 if([...assets.values()].some(asset=>asset.bytes.length>524288)||[...assets.values()].reduce((n,asset)=>n+asset.bytes.length,0)>2097152)throw Error('VIEW_ASSET_LIMIT');
 let origin,host,closing,closed=false,pending=null;const sockets=new Set(),budgets=new WeakMap();
 const server=http.createServer(async(req,res)=>{
  const budget=budgets.get(req.socket);
  if(!budget||budget.responses>=4){req.socket.destroy();return;}
  budget.responses++;let reserved=0,released=false;
  const release=()=>{if(released)return;released=true;budget.responses--;budget.bytes-=reserved;};
  res.once('finish',release);res.once('close',release);
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  const send=(code,data,type='application/json')=>{
   if(res.destroyed)return;
   const body=typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data),bytes=Buffer.byteLength(body);
   if(bytes>524288||budget.bytes+bytes>1048576){req.socket.destroy();return;}
   reserved=bytes;budget.bytes+=bytes;res.writeHead(code,{'Content-Type':type});res.end(body);
  };
  if(closed)return send(503,{error:'VIEW_CLOSED'});
  if(req.headers.host!==host||(req.headers.origin&&req.headers.origin!==origin))return send(403,{error:'VIEW_ORIGIN'});
  if(req.method!=='GET')return send(405,{error:'VIEW_READ_ONLY'});
  if(!req.url||req.url.length>256)return send(400,{error:'VIEW_REQUEST_LIMIT'});
  let url;try{url=new URL(req.url,origin);}catch{return send(400,{error:'VIEW_URL'});}
  if(url.origin!==origin)return send(403,{error:'VIEW_ORIGIN'});
  const api=url.pathname==='/config'||url.pathname==='/frame';
  if(api&&req.headers['sec-fetch-site']!=='same-origin')return send(403,{error:'VIEW_ORIGIN'});
  if(url.pathname==='/config'&&!url.search)return send(200,{identity,version:2,geometry:{atSeq:0,atOffset:0,columns:80,rows:24}});
  if(url.pathname==='/frame'){
   const entries=[...url.searchParams],cursor={};
   if(entries.length!==2||!['afterSeq','offset'].every(k=>url.searchParams.getAll(k).length===1))return send(400,{error:'VIEW_CURSOR'});
   for(const [k,v] of entries){if(!/^(0|[1-9][0-9]{0,15})$/.test(v)||!Number.isSafeInteger(Number(v)))return send(400,{error:'VIEW_CURSOR'});cursor[k]=Number(v);}
   if(pending)return send(429,{error:'VIEW_BUSY_NO_QUEUE'});
   try{
    pending=Promise.resolve().then(()=>client.request({action:'ordered-read',binding,identity,cursor}));
    const frame=await pending;
    const body=JSON.stringify(frame);if(Buffer.byteLength(body)>32768)throw Error('VIEW_FRAME_LIMIT');
    send(200,body);
   }catch(error){console.error('ORDERED_VIEW_READ_FAILED',/^[A-Z_]{1,64}$/.test(error.message)?error.message:'UNAVAILABLE');send(502,{error:/^[A-Z_]{1,64}$/.test(error.message)?error.message:'VIEW_SOURCE_UNAVAILABLE'});}finally{pending=null;}
   return;
  }
  const asset=assets.get(url.pathname);if(!asset||url.search)return send(404,{error:'VIEW_NOT_FOUND'});
  if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return send(403,{error:'VIEW_ORIGIN'});
  send(200,asset.bytes,asset.type);
 });
 server.maxHeadersCount=32;server.headersTimeout=5000;server.requestTimeout=5000;server.keepAliveTimeout=1000;
 server.on('connection',socket=>{if(sockets.size>=8){socket.destroy();return;}sockets.add(socket);budgets.set(socket,{responses:0,bytes:0});socket.setTimeout(10000,()=>socket.destroy());socket.on('close',()=>sockets.delete(socket));});
 server.on('clientError',(_,socket)=>socket.destroy());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 host=`127.0.0.1:${server.address().port}`;origin=`http://${host}`;
 return Object.freeze({url:origin+'/',close:()=>closing??=(async()=>{
  closed=true;const stopped=new Promise(resolve=>server.close(resolve));for(const socket of sockets)socket.destroy();
  await stopped;await pending?.catch(()=>{});
 })()});
}
