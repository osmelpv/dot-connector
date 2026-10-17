// Experimental single-producer byte journal; deliberately not wired to PTY/MCP/input.
import {BoundedOutputJsonl} from './bounded-output-jsonl.mjs';
const fail=code=>{throw Error(code);};
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const names=['machineId','projectId','incarnation','session','pane','streamEpoch'];
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function identity(v){if(!exact(v,names)||!names.every(k=>typeof v[k]==='string'&&v[k].length>0&&v[k].length<=64))fail('OUTPUT_IDENTITY');return Object.freeze({...v});}
const same=(a,b)=>names.every(k=>a[k]===b[k]);
const fields=['version','kind','identity','seq','start','end','data'];
function check(f,version){
 const expected=f?.kind==='resize'?[...fields,'geometry']:fields;
 if(!exact(f,expected)||f.version!==version||!['data','eof','idle','gap',...(version===2?['resize']:[])].includes(f.kind)||!integer(f.seq)||!integer(f.start)||!integer(f.end)||f.end<f.start||typeof f.data!=='string'||f.data.length>21848)fail('OUTPUT_FRAME');
 identity(f.identity);
 if(f.kind==='resize'&&(!exact(f.geometry,['columns','rows'])||!Number.isInteger(f.geometry.columns)||!Number.isInteger(f.geometry.rows)||f.geometry.columns<20||f.geometry.columns>160||f.geometry.rows<5||f.geometry.rows>60||f.seq<1))fail('OUTPUT_GEOMETRY_LIMIT');
 if(f.kind==='data'){
  if(f.seq<1||f.end-f.start<1||f.end-f.start>16384||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data))fail('OUTPUT_FRAME');
  const bytes=Buffer.from(f.data,'base64');if(bytes.length!==f.end-f.start||bytes.toString('base64')!==f.data)fail('OUTPUT_FRAME');return bytes;
 }
 if(f.data!==''||f.start!==f.end||(f.kind==='eof'&&f.seq<1))fail('OUTPUT_FRAME');return Buffer.alloc(0);
}
export class OrderedOutputJournal {
 #events=[]; #bytes=0; #seq=0; #offset=0; #eof=false; #closed=false; #consumers=new Set();
 constructor(binding,{capacity=262144,maxEvents=1024,version=1}={}){
  if(![1,2].includes(version))fail('OUTPUT_VERSION');Object.defineProperty(this,'version',{value:version});
  Object.defineProperty(this,'identity',{value:identity(binding)});
  if(!integer(capacity)||capacity<1||capacity>262144||!integer(maxEvents)||maxEvents<1||maxEvents>1024)fail('OUTPUT_LIMIT');
  Object.defineProperties(this,{capacity:{value:capacity},maxEvents:{value:maxEvents}});
 }
 #frame(kind,seq,start,end,data='',geometry){return {version:this.version,kind,identity:this.identity,seq,start,end,data,...(geometry?{geometry}: {})};}
 #add(kind,bytes,geometry){
  if(this.version===2&&this.#seq===0&&kind!=='resize')fail('OUTPUT_GEOMETRY_REQUIRED');
  if(this.#closed||this.#eof)fail('OUTPUT_CLOSED');
  if(this.#seq===Number.MAX_SAFE_INTEGER||!Number.isSafeInteger(this.#offset+bytes.length))fail('OUTPUT_EXHAUSTED');
  const event={kind,seq:++this.#seq,start:this.#offset,end:this.#offset+bytes.length,bytes:Buffer.from(bytes),geometry};
  this.#offset=event.end;this.#events.push(event);this.#bytes+=bytes.length;
  while(this.#bytes>this.capacity||this.#events.length>this.maxEvents){const old=this.#events.shift();this.#bytes-=old.bytes.length;}
  return event.seq;
 }
 append(bytes){if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>16384||bytes.length>this.capacity)fail('OUTPUT_CHUNK_LIMIT');return this.#add('data',bytes);}
 resize(columns,rows){if(this.version!==2)fail('OUTPUT_VERSION');if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<20||columns>160||rows<5||rows>60)fail('OUTPUT_GEOMETRY_LIMIT');return this.#add('resize',Buffer.alloc(0),Object.freeze({columns,rows}));}
 finish(){const seq=this.#add('eof',Buffer.alloc(0));this.#eof=true;return seq;}
 connect(label){
  if(this.#closed||!['human','agent'].includes(label)||this.#consumers.has(label)||this.#consumers.size>=2)fail('OUTPUT_CONSUMER_LIMIT');
  this.#consumers.add(label);let disconnected=false;
  return Object.freeze({read:cursor=>{if(disconnected)fail('OUTPUT_DISCONNECTED');return this.#read(label,cursor);},close:()=>{if(disconnected)return;disconnected=true;this.#consumers.delete(label);}});
 }
 #read(label,{afterSeq,offset}){
  if(this.#closed||!this.#consumers.has(label))fail('OUTPUT_CLOSED');
  if(!integer(afterSeq)||!integer(offset)||afterSeq>this.#seq||offset>this.#offset)fail('OUTPUT_CURSOR');
  const first=this.#events[0];
  if(first&&afterSeq<first.seq-1)return this.#frame('gap',first.seq-1,first.start,first.start);
  const event=this.#events.find(e=>e.seq===afterSeq+1);
  if(event){if(event.start!==offset)fail('OUTPUT_CURSOR');return this.#frame(event.kind,event.seq,event.start,event.end,event.bytes.toString('base64'),event.geometry);}
  if(offset!==this.#offset||afterSeq!==this.#seq)fail('OUTPUT_CURSOR');
  return this.#frame('idle',this.#seq,this.#offset,this.#offset);
 }
 stats(){return {retainedBytes:this.#bytes,retainedEvents:this.#events.length,consumers:this.#consumers.size,seq:this.#seq,offset:this.#offset,eof:this.#eof,closed:this.#closed};}
 close(){this.#events=[];this.#bytes=0;this.#consumers.clear();this.#closed=true;}
}
export class OrderedOutputReceiver {
 #seq=0; #offset=0; #state='ready';
 constructor(binding,{version=1}={}){if(![1,2].includes(version))fail('OUTPUT_VERSION');Object.defineProperty(this,'version',{value:version});Object.defineProperty(this,'identity',{value:identity(binding)});}
 cursor(){return {afterSeq:this.#seq,offset:this.#offset};}
 get state(){return this.#state;}
 resync(){if(this.#state==='identity_changed'||this.#state==='closed')fail('OUTPUT_CLOSED');this.#seq=0;this.#offset=0;this.#state='ready';return this.cursor();}
 accept(f){
  if(['identity_changed','closed'].includes(this.#state))fail('OUTPUT_CLOSED');
  let bytes;try{bytes=check(f,this.version);}catch(e){this.#state='gap';throw e;}
  if(!same(this.identity,f.identity)){this.#state='identity_changed';fail('OUTPUT_IDENTITY_CHANGED');}
  if(this.#state==='gap')fail('OUTPUT_RESYNC_REQUIRED');
  if(f.kind==='gap'){this.#state='gap';return {state:'gap',bytes:Buffer.alloc(0),resetRequired:true};}
  if(f.kind==='idle'){
   if(f.seq!==this.#seq||f.end!==this.#offset){this.#state='gap';fail('OUTPUT_ORDER');}
   return {state:this.#state,bytes:Buffer.alloc(0)};
  }
  if(f.seq<=this.#seq&&f.end<=this.#offset)return {state:'duplicate',bytes:Buffer.alloc(0)};
  if(this.#state==='eof'||f.seq!==this.#seq+1||f.start!==this.#offset||(this.version===2&&this.#seq===0&&f.kind!=='resize')){this.#state='gap';fail('OUTPUT_ORDER');}
  this.#seq=f.seq;this.#offset=f.end;this.#state=f.kind==='eof'?'eof':'ready';return {state:this.#state,bytes,...(f.kind==='resize'?{geometry:f.geometry}:{})};
 }
 close(){this.#state='closed';}
}
export function createOrderedOutputDecoder(receiver,onResult){
 const parser=new BoundedOutputJsonl(frame=>onResult(receiver.accept(frame))),end=parser.end.bind(parser);
 parser.end=()=>{end();if(receiver.state!=='eof')fail('OUTPUT_UNEXPECTED_END');};
 return parser;
}
