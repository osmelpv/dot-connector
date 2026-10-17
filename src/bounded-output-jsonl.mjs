// Experimental output framing. No process, socket, renderer or input authority.
export class BoundedOutputJsonl {
 #buffer=Buffer.alloc(32768); #used=0; #closed=false; #feeding=false;
 constructor(onFrame){if(typeof onFrame!=='function')throw Error('OUTPUT_CALLBACK_REQUIRED');this.onFrame=onFrame;}
 get retainedBytes(){return this.#closed?0:this.#buffer.length;}
 close(){this.#closed=true;this.#used=0;this.#buffer=Buffer.alloc(0);}
 push(chunk){
  if(this.#closed)throw Error('OUTPUT_PARSER_CLOSED');
  if(this.#feeding){this.close();throw Error('OUTPUT_REENTRANT');}this.#feeding=true;
  try{
   if(!Buffer.isBuffer(chunk)||chunk.length>65536)throw Error('OUTPUT_CHUNK_LIMIT');
   let pos=0,count=0;
   while(pos<chunk.length){
    const newline=chunk.indexOf(10,pos),end=newline<0?chunk.length:newline,length=end-pos;
    if(this.#used+length>32768)throw Error('OUTPUT_LINE_LIMIT');
    chunk.copy(this.#buffer,this.#used,pos,end);this.#used+=length;
    if(newline<0)break;
    if(++count>64)throw Error('OUTPUT_BURST_LIMIT');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(this.#buffer.subarray(0,this.#used));this.#used=0;
    const result=this.onFrame(JSON.parse(text));
    if(result===false||result?.then)throw Error('OUTPUT_ASYNC_QUEUE_FORBIDDEN');
    if(this.#closed)return;
    pos=end+1;
   }
  }catch(error){this.close();throw error;}finally{this.#feeding=false;}
 }
 end(){if(this.#closed)return;const partial=this.#used;this.close();if(partial)throw Error('OUTPUT_TRUNCATED_LINE');}
}
