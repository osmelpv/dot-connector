// Browser-compatible observer. No PTY, transport, writer, credentials or addon.
export class XtermObserver {
 static inputEvents=Object.freeze(['paste','beforeinput','keydown','keypress','keyup','mousedown','mouseup','mousemove','click','dblclick','auxclick','contextmenu','wheel','pointerdown','pointerup','pointermove','touchstart','touchmove','drop','dragover','copy','cut']);
 #guard=null; #block=null; #blockedDom=0; #version=1; #geometryReady=true; #columns=80; #rows=24;
 #terminal; #identity; #seq=0; #offset=0; #state='ready'; #busy=false; #dropped=0; #osc=0; #settle=null;
 constructor(Terminal,identity,geometry,{version=1}={}){
  if(![1,2].includes(version))throw Error('VT_VERSION');this.#version=version;this.#geometryReady=version===1;
  const keys=['machineId','projectId','incarnation','session','pane','streamEpoch'];
  if(!identity||Object.keys(identity).length!==6||!keys.every(k=>typeof identity[k]==='string'&&identity[k].length>0&&identity[k].length<=64))throw Error('VT_IDENTITY');
  if(!geometry||Object.keys(geometry).sort().join(',')!=='atOffset,atSeq,columns,rows'||geometry.atSeq!==0||geometry.atOffset!==0||geometry.columns!==80||geometry.rows!==24)throw Error('VT_INITIAL_GEOMETRY_REQUIRED');
  this.#identity=Object.freeze({...identity});
  this.#terminal=new Terminal({cols:80,rows:24,disableStdin:true,altClickMovesCursor:false,windowOptions:{},convertEol:false,scrollback:100,logLevel:'off',linkHandler:{activate:()=>{},hover:()=>{},leave:()=>{}}});
  // Register before open/write, and consume instead of falling through to built-ins.
  for(const id of [0,1,2,8,52])this.#terminal.parser.registerOscHandler(id,()=>{this.#osc++;return true;});
  // Automatic replies, paste and mouse can never reach a writer: only count/discard.
  this.#terminal.onData(()=>{this.#dropped++;});this.#terminal.onBinary(()=>{this.#dropped++;});
 }
 open(element){if(!['ready','eof'].includes(this.#state)||this.#guard)throw Error('VT_CLOSED');if(typeof element?.addEventListener!=='function')throw Error('VT_ELEMENT');this.#guard=element;this.#block=e=>{e.preventDefault();e.stopImmediatePropagation();this.#blockedDom++;};for(const name of XtermObserver.inputEvents)element.addEventListener(name,this.#block,{capture:true,passive:false});try{this.#terminal.open(element);}catch(error){this.#fence('closed');throw error;}}
 #fence(state){this.#state=state;if(this.#guard){for(const name of XtermObserver.inputEvents)this.#guard.removeEventListener(name,this.#block,true);this.#guard=null;}this.#terminal.dispose();this.#settle?.(Error('VT_CLOSED'));this.#settle=null;}
 async accept(f){
  if(this.#busy)throw Error('VT_BUSY_NO_QUEUE');if(!['ready','eof'].includes(this.#state))throw Error('VT_RESTART_REQUIRED');
  try{
   const fields=['version','kind','identity','seq','start','end','data',...(f?.kind==='resize'?['geometry']:[])];
   if(!f||Object.keys(f).length!==fields.length||!fields.every(k=>Object.hasOwn(f,k))||f.version!==this.#version||!['data','gap','idle','eof',...(this.#version===2?['resize']:[])].includes(f.kind)||![f.seq,f.start,f.end].every(n=>Number.isSafeInteger(n)&&n>=0)||f.end<f.start||typeof f.data!=='string'||f.data.length>21848)throw Error('VT_FRAME');
   if(!f.identity||Object.keys(f.identity).length!==6||Object.keys(this.#identity).some(k=>f.identity[k]!==this.#identity[k])){this.#fence('identity_changed');throw Error('VT_IDENTITY_CHANGED');}
   if(f.kind==='resize'&&(!f.geometry||Object.keys(f.geometry).sort().join(',')!=='columns,rows'||!Number.isInteger(f.geometry.columns)||!Number.isInteger(f.geometry.rows)||f.geometry.columns<20||f.geometry.columns>160||f.geometry.rows<5||f.geometry.rows>60||f.seq<1))throw Error('VT_GEOMETRY_LIMIT');
   let bytes=new Uint8Array(0);
   if(f.kind==='data'){
    if(f.seq<1||f.end-f.start<1||f.end-f.start>16384||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data))throw Error('VT_FRAME');
    const binary=atob(f.data);if(binary.length!==f.end-f.start||btoa(binary)!==f.data)throw Error('VT_FRAME');bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
   }else if(f.data!==''||f.start!==f.end||(f.kind==='eof'&&f.seq<1))throw Error('VT_FRAME');
   if(f.kind==='gap'){this.#fence('gap');return this.status();}
   if(f.kind==='idle'){if(f.seq!==this.#seq||f.end!==this.#offset)throw Error('VT_ORDER');return this.status();}
   if(f.seq<=this.#seq&&f.end<=this.#offset)return {...this.status(),duplicate:true};
   if(this.#state==='eof'||f.seq!==this.#seq+1||f.start!==this.#offset)throw Error('VT_ORDER');
   if(!this.#geometryReady&&(f.kind!=='resize'||f.geometry.columns!==80||f.geometry.rows!==24))throw Error('VT_INITIAL_GEOMETRY_REQUIRED');
   // Snapshot validated primitives before calling renderer code or yielding.
   const accepted={seq:f.seq,end:f.end,kind:f.kind,columns:f.geometry?.columns,rows:f.geometry?.rows};
   if(accepted.kind==='resize'){this.#terminal.resize(accepted.columns,accepted.rows);this.#columns=accepted.columns;this.#rows=accepted.rows;this.#geometryReady=true;}
   if(accepted.kind==='data'){
    this.#busy=true;
    await new Promise((resolve,reject)=>{let done=false;const finish=error=>{if(done)return;done=true;clearTimeout(timer);this.#settle=null;error?reject(error):resolve();};const timer=setTimeout(()=>finish(Error('VT_WRITE_TIMEOUT')),3000);this.#settle=finish;try{this.#terminal.write(bytes,()=>finish());}catch(error){finish(error);}});
   }
   if(this.#state!=='ready')throw Error('VT_CLOSED');
   this.#seq=accepted.seq;this.#offset=accepted.end;if(accepted.kind==='eof')this.#state='eof';this.#busy=false;return this.status();
  }catch(error){if(!['identity_changed','gap','closed'].includes(this.#state))this.#fence('gap');throw error;}finally{this.#busy=false;}
 }
 resize(){throw Error('VT_FIXED_OWNER_GEOMETRY');}
 status(){return {identity:this.#identity,seq:this.#seq,offset:this.#offset,state:this.#state,busy:this.#busy,droppedOutboundEvents:this.#dropped,blockedOsc:this.#osc,forwardedInputBytes:0,columns:this.#columns,rows:this.#rows,blockedDomEvents:this.#blockedDom};}
 screen(){if(!['ready','eof'].includes(this.#state))return null;const b=this.#terminal.buffer.active;return {type:b.type,cursorX:b.cursorX,cursorY:b.cursorY,lines:Array.from({length:this.#rows},(_,i)=>b.getLine(b.viewportY+i)?.translateToString(true)??'')};}
 cell(x,y){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=this.#columns||y<0||y>=this.#rows)throw Error('VT_CELL');if(!['ready','eof'].includes(this.#state))return null;const b=this.#terminal.buffer.active,c=b.getLine(b.viewportY+y)?.getCell(x);return c?{text:c.getChars(),fg:c.getFgColor(),fgMode:c.getFgColorMode(),bold:!!c.isBold()}:null;}
 close(){if(this.#state!=='closed')this.#fence('closed');}
}
