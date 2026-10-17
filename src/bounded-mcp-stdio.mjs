import {readFrames} from './tmux-local.mjs';
import {JSONRPCMessageSchema} from '@modelcontextprotocol/sdk/types.js';
// SDK-compatible stdio transport, bounded before JSON parsing. No network socket.
export class BoundedMcpStdio {
  constructor(input=process.stdin,output=process.stdout,{outputReader=false}={}) {
    this.frameLimit=outputReader?32768:16384;
    this.input=input;this.output=output;this.closed=false;this.started=false;
    this.requests=new Set();this.writes=new Set();this.burst=0;this.window=Date.now();
  }
  async start() {
    if(this.started)throw Error('TRANSPORT_ALREADY_STARTED');this.started=true;
    const ended=()=>{void this.close();};this.input.once('end',ended);this.input.once('error',ended);this.output.once('error',ended);
    readFrames(this.input,m=>{
      if(this.closed)return false;
      if(Date.now()-this.window>=1000){this.window=Date.now();this.burst=0;}
      if(++this.burst>64)return false;
      const message=JSONRPCMessageSchema.parse(m);
      if('method' in message && 'id' in message){
        if(String(message.id).length>80||this.requests.size>=4||this.requests.has(message.id))return false;
        this.requests.add(message.id);
      }
      this.onmessage?.(message);return true;
    },()=>{this.onerror?.(Error('MCP_FRAME_OR_RATE_LIMIT'));void this.close();},this.frameLimit);
  }
  send(message) {
    const line=JSON.stringify(message)+'\n',bytes=Buffer.byteLength(line);
    if(this.closed||bytes>32768||this.output.writableLength+bytes>65536||this.writes.size>=8){
      void this.close();return Promise.reject(Error('MCP_OUTPUT_LIMIT_OR_CLOSED'));}
    return new Promise((resolve,reject)=>{
      let timer,settled=false;const done=error=>{if(settled)return;settled=true;clearTimeout(timer);this.writes.delete(done);
        if(error)reject(error);else{if('id' in message)this.requests.delete(message.id);resolve();}};
      this.writes.add(done);
      timer=setTimeout(()=>{done(Error('MCP_WRITE_TIMEOUT'));void this.close();},3000);
      this.output.write(line,error=>done(error));
    });
  }
  async close() {if(this.closed)return;this.closed=true;this.input.pause();
    for(const done of [...this.writes])done(Error('MCP_CLOSED_OUTCOME_UNKNOWN'));
    this.requests.clear();this.onclose?.();}
}
