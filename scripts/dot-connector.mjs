#!/usr/bin/env node
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {humanCommand} from '../src/human-cli.mjs';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createCommandDispatcher} from '../src/cli-command.mjs';
const emit=x=>process.stdout.write(JSON.stringify(x)+'\n');
const argv=process.argv.slice(2);let client,lines;
try{
 const rawAction=argv.shift();const action=({'--help':'help','--version':'version'})[rawAction]??rawAction;let backend='diagnostic',root;const options={};
 while(argv.length){const key=argv.shift();if(!['--backend','--native-root','--operation','--kind','--text'].includes(key)||!argv.length||Object.hasOwn(options,key))throw Error('INVALID_OPTIONS');options[key]=argv.shift();}backend=options['--backend']??'diagnostic';root=options['--native-root'];
 const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 if(action==='help'||action==='version'){if(Object.keys(options).length)throw Error('INVALID_OPTIONS');emit({ok:true,version,...(action==='help'?{commands:['help','version','status','session','select','authorize'],sessionCommands:['status','read','paste','submit','pause','close'],protocol:'JSON lines; keep session open for snapshots; no queue or retry',human:'select/authorize require an interactive Windows terminal; never self-ARM'}:{})});}
 else if(action==='select'||action==='authorize'){const keys=action==='select'?['--native-root']:['--native-root','--operation','--kind','--text'];if(Object.keys(options).some(k=>!keys.includes(k)))throw Error('INVALID_OPTIONS');emit({ok:true,result:await humanCommand(action,options)});}
 else {
 if(Object.keys(options).some(k=>!['--backend','--native-root'].includes(k)))throw Error('INVALID_OPTIONS');
 if(!['diagnostic','wezterm','native'].includes(backend))throw Error('INVALID_BACKEND');
 if(action!=='status'&&action!=='session')throw Error('USE_SESSION_FOR_READ_PASTE_SUBMIT_PAUSE');
 if(action==='status'&&backend!=='diagnostic')throw Error('USE_SESSION_FOR_TERMINAL_BACKENDS');
 if(root&&backend!=='native')throw Error('INVALID_OPTIONS');
 let entry;
 if(backend==='native'){
  if(process.platform!=='win32'||!root||!path.isAbsolute(root))throw Error('NATIVE_REQUIRES_WINDOWS_AND_EXPLICIT_PRESELECTED_ROOT');
  entry=path.join(root,'native-integration-server.mjs');
 }else entry=fileURLToPath(new URL(backend==='diagnostic'?'../src/plugin-server.mjs':'../src/server.mjs',import.meta.url));
 client=new Client({name:'dot-connector-cli',version});
 const env={};for(const k of ['PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOME'])if(process.env[k])env[k]=process.env[k];
 if(backend==='wezterm')for(const k of ['DOT_STATE','DOT_WEZTERM'])if(process.env[k])env[k]=process.env[k];
 await client.connect(new StdioClientTransport({command:process.execPath,args:[entry,...(backend==='native'?['--human-launched']:[])],env,stderr:'ignore'}));
 const dispatch=createCommandDispatcher(client,backend);
 process.once('SIGINT',()=>{process.exitCode=130;lines?.close();});
 if(action==='status'){const r=await dispatch({id:'status',command:'status',arguments:{}});emit(r);if(!r.ok)process.exitCode=1;}
 else{
  emit({event:'ready',backend,commands:['status','read','paste','submit','pause','close'],automaticRetries:false,queue:false});
  lines=createInterface({input:process.stdin,crlfDelay:Infinity});
  const pending=new Set();let closing=false;
  await new Promise(resolve=>{
   lines.on('line',line=>{
    if(closing){emit({ok:false,error:'SESSION_CLOSING'});return;}
    let value;try{if(Buffer.byteLength(line)>12000)throw Error();value=JSON.parse(line);}catch{emit({ok:false,error:'INVALID_REQUEST'});return;}
    const task=dispatch(value).then(result=>{emit(result);if(result.closing){closing=true;lines.close();}}).finally(()=>pending.delete(task));pending.add(task);
   });
   lines.once('close',resolve);
  });
  if(!closing&&backend!=='diagnostic')emit(await dispatch({id:'eof-pause',command:'pause',arguments:{}}));
  await Promise.allSettled([...pending]);
 }
}
}catch(e){const allowed=['INVALID_OPTIONS','INVALID_BACKEND','USE_SESSION_FOR_READ_PASTE_SUBMIT_PAUSE','USE_SESSION_FOR_TERMINAL_BACKENDS','NATIVE_REQUIRES_WINDOWS_AND_EXPLICIT_PRESELECTED_ROOT'];emit({ok:false,error:allowed.includes(e.message)?e.message:'CONNECTION_OR_RUNTIME_UNAVAILABLE'});process.exitCode=1;}
finally{lines?.close();await client?.close();}
