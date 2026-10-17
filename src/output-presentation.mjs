// Browser-compatible limited transcript. NOT a VT emulator; no side effects/input.
export class OutputPresentation {
 #identity; #seq=0; #offset=0; #status='ready'; #decoder=new TextDecoder('utf-8',{fatal:true});
 #mode='text'; #stringEsc=false; #chars=[]; #bytes=0; #omitted=0; #truncated=false;
 constructor(identity){this.#identity=Object.freeze(OutputPresentation.identity(identity));}
 static identity(v){const keys=['machineId','projectId','incarnation','session','pane','streamEpoch'];if(!v||typeof v!=='object'||Object.keys(v).length!==6||!keys.every(k=>typeof v[k]==='string'&&v[k].length>0&&v[k].length<=64))throw Error('PRESENTATION_IDENTITY');return {...v};}
 #clear(status){this.#status=status;this.#chars=[];this.#bytes=0;this.#decoder=new TextDecoder('utf-8',{fatal:true});this.#mode='text';this.#stringEsc=false;}
 #put(c){const n=new TextEncoder().encode(c).length;this.#chars.push({c,n});this.#bytes+=n;while(this.#bytes>4096){this.#bytes-=this.#chars.shift().n;this.#truncated=true;}}
 #text(text){for(const c of text){const n=c.codePointAt(0);
  if(this.#mode==='string'||this.#mode==='osc'){
   if(n===0x9c||(this.#mode==='osc'&&n===7)||(this.#stringEsc&&c==='\\')){this.#mode='text';this.#stringEsc=false;continue;}
   this.#stringEsc=n===27;continue;
  }
  if(n===27){this.#mode='escape';this.#omitted++;continue;}
  if(n===0x9b){this.#mode='csi';this.#omitted++;continue;}
  if([0x90,0x98,0x9d,0x9e,0x9f].includes(n)){this.#mode=n===0x9d?'osc':'string';this.#omitted++;continue;}
  if(this.#mode==='csi'){if(n>=0x40&&n<=0x7e)this.#mode='text';continue;}
  if(this.#mode==='escape'){
   if(c==='[')this.#mode='csi';else if(c===']')this.#mode='osc';else if(['P','X','^','_'].includes(c))this.#mode='string';else if(n>=0x20&&n<=0x2f)this.#mode='escapeIntermediate';else this.#mode='text';continue;
  }
  if(this.#mode==='escapeIntermediate'){if(n>=0x30&&n<=0x7e)this.#mode='text';continue;}
  if(n===10){this.#put('\n');continue;}
  if(n<32||(n>=127&&n<=159)||(n>=0x202a&&n<=0x202e)||(n>=0x2066&&n<=0x2069)){this.#omitted++;continue;}
  this.#put(c);
 }}
 accept(f){
  if(['identity_changed','closed'].includes(this.#status))throw Error('PRESENTATION_CLOSED');
  try{
   const names=['version','kind','identity','seq','start','end','data'];
   if(!f||typeof f!=='object'||Object.keys(f).length!==names.length||!names.every(k=>Object.hasOwn(f,k))||f.version!==1||!['data','idle','gap','eof'].includes(f.kind)||![f.seq,f.start,f.end].every(n=>Number.isSafeInteger(n)&&n>=0)||f.end<f.start||typeof f.data!=='string'||f.data.length>21848)throw Error('PRESENTATION_FRAME');
   OutputPresentation.identity(f.identity);
   if(Object.keys(this.#identity).some(k=>f.identity[k]!==this.#identity[k])){this.#clear('identity_changed');throw Error('PRESENTATION_IDENTITY_CHANGED');}
   let bytes=new Uint8Array(0);
   if(f.kind==='data'){
    if(f.seq<1||f.end-f.start<1||f.end-f.start>16384||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data))throw Error('PRESENTATION_FRAME');
    const binary=atob(f.data);if(binary.length!==f.end-f.start||btoa(binary)!==f.data)throw Error('PRESENTATION_FRAME');bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
   }else if(f.data!==''||f.start!==f.end||(f.kind==='eof'&&f.seq<1))throw Error('PRESENTATION_FRAME');
   if(this.#status==='gap')throw Error('PRESENTATION_RESYNC_REQUIRED');
   if(f.kind==='gap'){this.#clear('gap');return this.view();}
   if(f.kind==='idle'){if(f.seq!==this.#seq||f.end!==this.#offset)throw Error('PRESENTATION_ORDER');return this.view();}
   if(f.seq<=this.#seq&&f.end<=this.#offset)return {...this.view(),duplicate:true};
   if(this.#status==='eof'||f.seq!==this.#seq+1||f.start!==this.#offset)throw Error('PRESENTATION_ORDER');
   this.#text(this.#decoder.decode(bytes,{stream:f.kind!=='eof'}));this.#seq=f.seq;this.#offset=f.end;
   if(f.kind==='eof'){if(this.#mode!=='text')this.#omitted++;this.#mode='text';this.#status='eof';}
   return this.view();
  }catch(error){if(this.#status!=='identity_changed')this.#clear('gap');throw error;}
 }
 resync(){if(['identity_changed','closed'].includes(this.#status))throw Error('PRESENTATION_CLOSED');this.#clear('ready');this.#seq=0;this.#offset=0;this.#omitted=0;this.#truncated=false;return this.view();}
 resize(){throw Error('PRESENTATION_FIXED_GEOMETRY');}
 close(){this.#clear('closed');}
 view(){return {identity:this.#identity,seq:this.#seq,offset:this.#offset,state:this.#status,text:this.#chars.map(x=>x.c).join(''),retainedBytes:this.#bytes,truncated:this.#truncated,omittedControls:this.#omitted,columns:80,rows:24,mode:'filtered-transcript-not-vt'};}
}
