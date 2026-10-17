#!/usr/bin/env node
// Local human snapshot view. Never interprets received text as VT sequences.
import {serveOrderedHumanView} from '../src/local-human-view.mjs';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {connectLocal} from '../src/tmux-local.mjs';
import {safeScreen} from '../src/tmux-bridge.mjs';
import {resolveInstance,sameBinding} from '../src/human-instances.mjs';
let [socket,mode,...extra]=process.argv.slice(2),expected;
if(socket==='--config'){
 try{
  const [selection,id,once,...rest]=extra;
  if(selection!=='--instance'||!id||rest.length||(once&&!['--once','--ordered-view'].includes(once)))throw Error('INSTANCE_SELECTION_REQUIRED');
  const resolved=await resolveInstance(mode,id);socket=resolved.socket;expected=resolved.binding;mode=once;extra=[];
 }catch(e){console.error(/^(INSTANCE|CONFIG)_[A-Z_]+$/.test(e.message)?e.message:'INSTANCE_DISCOVERY_FAILED');process.exit(2);}
}
if(!socket||extra.length||(mode&&!['--once','--ordered-view'].includes(mode))){console.error('Usage: tmux-bridge-view.mjs SOCKET [--once|--ordered-view]');process.exitCode=2;}
else {
  let client,viewServer;
  try{client=await connectLocal(socket,'human');if(expected&&!sameBinding(expected,client.identity)){client.close();throw Error('INSTANCE_BINDING_MISMATCH');}}
  catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'VIEW_CONNECTION_FAILED');process.exit(1);}
  if(mode==='--ordered-view'){
    try{viewServer=await serveOrderedHumanView(client);console.log('Read-only browser view: '+viewServer.url+' (open manually; controls stay in this CLI)');}
    catch{client.close();console.error('ORDERED_VIEW_UNAVAILABLE');process.exit(1);}
  }
  const binding=client.identity;let after=0,reading=false,closed=false,lastView=null;
  const read=async()=>{if(reading||closed)return;reading=true;try{
    const r=await client.request({action:'read',binding,after});after=r.sequence;
    const screen=safeScreen(r.text),truncated=Boolean(r.truncated||screen.truncated);
    const view=JSON.stringify([screen.text,truncated,r.resync]);
    if(view!==lastView){console.log(`\n[Snapshot ${r.sequence}; resync=${r.resync}; truncated=${truncated}; newest text; NOT a VT stream]\n${screen.text}`);lastView=view;}
  }finally{reading=false;}};
  try {await read();if(mode==='--once')client.close();else {
    console.log('Local cooperative human. /read /grant /pause /paste TEXT /submit /stop /quit. Paste never submits.');
    const rl=createInterface({input:process.stdin,output:process.stdout,terminal:Boolean(process.stdin.isTTY&&process.stdout.isTTY)});
    const timer=setInterval(()=>{read().catch(()=>{console.error('VIEW_DISCONNECTED_OR_UNAVAILABLE');rl.close();});},500);
    let busy=false;
    rl.on('line',async line=>{
      if(busy){console.error('BUSY_NO_QUEUE');return;}busy=true;
      try{
        if(line==='/quit'){closed=true;rl.close();return;}
        if(line==='/read'){await read();return;}
        let r;if(line==='/grant')r={action:'grant',ttlMs:5000};
        else if(line==='/pause')r={action:'pause'};
        else if(line==='/submit')r={action:'input',kind:'submit',operationId:randomUUID()};
        else if(line.startsWith('/paste '))r={action:'input',kind:'paste',text:line.slice(7),operationId:randomUUID()};
        else if(line==='/stop')r={action:'stop'};else throw Error('UNKNOWN_COMMAND');
        console.log(JSON.stringify(await client.request({...r,binding})));
        if(r.action==='stop'){closed=true;rl.close();}else await read();
      }catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'VIEW_OPERATION_FAILED');}
      finally{busy=false;}
    });
    rl.once('close',()=>{clearInterval(timer);closed=true;client.close();void viewServer?.close();});
  }}catch(e){client.close();await viewServer?.close();console.error(/^[A-Z_]+$/.test(e.message)?e.message:'VIEW_FAILED');process.exitCode=1;}
}
