// Experimental bounded snapshot bridge. No network transport or implicit activation.
import net from 'node:net';
import path from 'node:path';
import {chmod} from 'node:fs/promises';
import {readFrames} from './tmux-local.mjs';

const fail=code=>{throw Error(code);};
const bindingKeys=['machineId','projectId','incarnation','session','pane'];
export function safeScreen(text,maxBytes=8192) {
  // Never interpret output as terminal controls, OSC links, clipboard or bidi commands.
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>8192)fail('INVALID_SCREEN_LIMIT');
  // Keep the newest suffix, cutting only between whole code points/escaped tokens.
  const tokens=Array.from(text,c=>/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(c)
    ?`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`:c);
  let bytes=0,start=tokens.length;
  while(start>0){const n=Buffer.byteLength(tokens[start-1]);if(bytes+n>maxBytes)break;bytes+=n;start--;}
  return {text:tokens.slice(start).join(''),truncated:start>0};
}
export class SnapshotBridge {
  constructor(session) {
    this.session=session;this.owner=session.connect('human');this.agent=session.connect();
    this.binding=Object.freeze(Object.fromEntries(bindingKeys.map(k=>[k,session.identity[k]])));
    this.orderedAgent=session.orderedOutput?.connect('agent');this.orderedHuman=null;
    this.sequence=0;this.agentSnapshot=null;this.human=null;this.humanInputActive=false;this.closed=false;this.closing=null;
  }
  check(binding) {
    if(!binding||Object.keys(binding).length!==bindingKeys.length||bindingKeys.some(k=>binding[k]!==this.binding[k]))fail('BINDING_MISMATCH');
    if(this.closed)fail('BRIDGE_CLOSED');
  }
  status() {return {binding:this.binding,...this.session.status(this.agent),sequence:this.sequence,
    humanConnected:Boolean(this.human),
    ...(this.session.orderedOutput?{orderedOutput:{identity:this.session.orderedOutput.identity,version:2,available:!this.session.orderedOutput.stats().closed}}:{}),
    transport:'bounded-mcp-stdio',view:'escaped-text-snapshots',lossless:false,
    authentication:'host-owned-stdio; local-human-socket is same-UID cooperative only',
    cloudConnectionProven:false,reconnect:'new process means new session; never replay input'};}
  async readOutput(client,binding,after) {return this.read(client,binding,after,true);}
  async read(client,binding,after,observationOnly=false) {
    this.check(binding);
    if(!Number.isSafeInteger(after)||after<0||after>this.sequence)fail('INVALID_CURSOR');
    const snapshot=await (observationOnly?this.session.observe(client):this.session.snapshot(client));
    this.check(binding); // close may have completed while snapshot awaited
    if(this.sequence===Number.MAX_SAFE_INTEGER)fail('SEQUENCE_EXHAUSTED');
    const sequence=++this.sequence,screen=safeScreen(snapshot.text);
    if(!observationOnly&&client===this.agent)this.agentSnapshot={sequence,snapshotId:snapshot.snapshotId};
    return {binding:this.binding,sequence,after,resync:after!==sequence-1,
      skippedSnapshots:sequence-after-1,text:screen.text,truncated:screen.truncated||snapshot.truncated,
      snapshotId:snapshot.snapshotId,generation:snapshot.generation,lossless:false,
      warning:'Untrusted escaped terminal text; snapshots may miss intermediate output.'};
  }
  input(request) {
    this.check(request.binding);
    if(!this.agentSnapshot||request.sequence!==this.agentSnapshot.sequence||request.snapshotId!==this.agentSnapshot.snapshotId)
      fail('FRESH_BRIDGE_VIEW_REQUIRED');
    return this.session.input(this.agent,request);
  }
  cancel(binding,operationId,localHuman=false) {
    this.check(binding);this.agentSnapshot=null;
    if(this.humanInputActive&&!localHuman)return {humanPriority:true,inflight:true,
      operation:operationId?this.session.operation(this.agent,operationId):null,
      semantics:'Human input owns the gate; agent cancellation cannot revoke it. Agent authority was already revoked on human arrival.'};
    const revoked=this.session.revoke(this.owner);
    return {...revoked,operation:operationId?this.session.operation(this.agent,operationId):null,
      semantics:'Revokes future/pending input; cannot recall dispatched bytes or interrupt a running application.'};
  }
  operation(binding,operationId) {this.check(binding);return this.session.operation(this.agent,operationId);}
  openHuman() {if(this.closed)fail('BRIDGE_CLOSED');if(this.human)fail('HUMAN_ALREADY_CONNECTED');
    this.human=this.session.connect('human');try{this.orderedHuman=this.session.orderedOutput?.connect('human');}catch{this.orderedHuman=null;}return this.human;}
  disconnectHuman(id) {if(this.human!==id)return;this.orderedHuman?.close();this.orderedHuman=null;this.session.disconnect(id);this.human=null;this.agentSnapshot=null;}
  async humanRequest(id,r) {
    if(this.human!==id)fail('UNKNOWN_HUMAN');
    if(r.action==='status')return this.status();
    this.check(r.binding);
    switch(r.action) {
      case 'read':return this.read(id,r.binding,r.after);
      case 'ordered-read':
        if(!this.orderedHuman)fail('OUTPUT_DISABLED');
        if(!r.identity||Object.keys(r.identity).length!==6||Object.keys(this.session.orderedOutput.identity).some(k=>r.identity[k]!==this.session.orderedOutput.identity[k]))fail('OUTPUT_IDENTITY_CHANGED');
        return this.orderedHuman.read(r.cursor);
      case 'grant':this.agentSnapshot=null;return this.session.grant(id,this.agent,r.ttlMs);
      case 'pause':return this.cancel(r.binding,r.operationId,true);
      case 'input':
        if(this.humanInputActive)fail('BUSY_NO_QUEUE');
        this.agentSnapshot=null;this.humanInputActive=true;
        try{return await this.session.input(id,r);}finally{this.humanInputActive=false;}
      case 'stop':return this.close();
      default:fail('UNKNOWN_ACTION');
    }
  }
  close() {if(this.closing)return this.closing;this.closed=true;this.agentSnapshot=null;this.orderedAgent?.close();this.orderedHuman?.close();
    this.closing=this.session.stop(this.owner);return this.closing;}
}

export async function serveHumanView(bridge) {
  const socketPath=path.join(bridge.session.dir,'human-view.sock'),sockets=new Set();
  const server=net.createServer(socket=>{
    if(sockets.size>=1){socket.destroy();return;}sockets.add(socket);
    let human=null,inflight=0;
    socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(socket);if(human)bridge.disconnectHuman(human);});
    const send=message=>{const line=JSON.stringify(message)+'\n';
      if(socket.destroyed||Buffer.byteLength(line)>32768||socket.writableLength+Buffer.byteLength(line)>65536){socket.destroy();return;}
      socket.write(line);};
    readFrames(socket,r=>{
      if(!r||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(r.id)||inflight>=4)return false;
      inflight++;
      (async()=>{
        if(!human){if(r.action!=='hello'||r.role!=='human')fail('LOCAL_HUMAN_REQUIRED');
          human=bridge.openHuman();return {clientId:human,identity:bridge.binding};}
        return bridge.humanRequest(human,r);
      })().then(result=>send({id:r.id,ok:true,result}),e=>send({id:r.id,ok:false,
        error:/^[A-Z_]+$/.test(e.message)?e.message:'OPERATION_FAILED'})).finally(()=>inflight--);
      return true;
    },()=>socket.destroy(),4096);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});
  try{await chmod(socketPath,0o600);}catch(e){await new Promise(resolve=>server.close(resolve));throw e;}
  return {socketPath,async close(){for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));}};
}
