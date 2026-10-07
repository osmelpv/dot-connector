#!/usr/bin/env node
import path from 'node:path';
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {runUpdate,requireManaged,updateError} from '../src/update-release.mjs';
import {humanCommand} from '../src/human-cli.mjs';
import {createCommandDispatcher} from '../src/cli-command.mjs';
import {OperationLog,readLogs,readActivity,safeError} from '../src/operation-log.mjs';
import {operationDeadline as timed} from '../src/operation-deadline.mjs';
import {verifyWindowsBridge} from '../src/windows-bridge.mjs';
const sourceRoot=fileURLToPath(new URL('..',import.meta.url));
const emit=x=>process.stdout.write(JSON.stringify(x)+'\n');
const argv=process.argv.slice(2);let client,lines,log,safeToUnlock=true,bridgeAttempted=false;
async function logged(operation,fn){
 const started=performance.now(),requestId=await log.start(operation);
 try{const result=await fn();await log.end(requestId,result?.ok===false?safeError(result.error):undefined);return {...result,requestId,durationMs:Math.round((performance.now()-started)*10)/10};}
 catch(e){await log.end(requestId,e.code===-32001?'OPERATION_TIMEOUT_OUTCOME_UNKNOWN_NO_RETRY':safeError(e.message)).catch(()=>{});throw e;}
}
try{
 const rawAction=argv.shift(),action=({'--help':'help','--version':'version'})[rawAction]??rawAction,options={};
 const flags=action==='update'?['--check','--rollback']:['--local'];
 const values=action==='update'?['--version','--channel','--log-dir']:['--backend','--native-root','--operation','--kind','--text','--log-dir','--bridge-config'];
 while(argv.length){const key=argv.shift();if(Object.hasOwn(options,key))throw Error('INVALID_OPTIONS');if(flags.includes(key))options[key]=true;else if(values.includes(key)&&argv.length)options[key]=argv.shift();else throw Error('INVALID_OPTIONS');}
 const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 let sourceManifest;try{sourceManifest=JSON.parse(await readFile(new URL('../.release-manifest.json',import.meta.url),'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('UPDATE_MANAGED_SOURCE_UNREADABLE');}
 const defaultLog=path.join(process.env.DOT_INSTALL_ROOT??(sourceManifest?path.resolve(sourceRoot,'../..'):sourceRoot),sourceManifest||process.env.DOT_INSTALL_ROOT?'logs':'.state/operation-logs');
 const logDir=options['--log-dir']??defaultLog;if(!path.isAbsolute(logDir))throw Error('INVALID_OPTIONS');
 if(action==='logs'||(action==='status'&&options['--local'])){
  if(Object.keys(options).some(k=>!['--log-dir',...(action==='status'?['--local']:[])].includes(k)))throw Error('INVALID_OPTIONS');
  emit({ok:true,version,...(action==='logs'?{events:await readLogs(logDir)}:{activity:await readActivity(logDir)}),scope:'local operation metadata; no terminal observation'});
 }else if(action==='help'||action==='version'){
  if(Object.keys(options).length)throw Error('INVALID_OPTIONS');emit({ok:true,version,...(action==='help'?{commands:['help','version','status','session','select','authorize','update','logs','bridge-check'],sessionCommands:['status','read','paste','submit','pause','close'],metadataStatus:'status --local [--log-dir ABS]',bridge:'session --backend windows-native --bridge-config ABS',protocol:'JSON lines; keep session open for snapshots; no queue or retry',human:'select/authorize require an interactive Windows terminal; never self-ARM'}:{})});
 }else{
  if(sourceManifest)await requireManaged(process.env.DOT_INSTALL_ROOT,process.env.DOT_INSTALL_LEASE);
  if(action==='update'){
   log=await new OperationLog(logDir,'update').open();const updateOptions={};for(const k of ['version','channel','check','rollback'])if(options['--'+k]!==undefined)updateOptions[k]=options['--'+k];
   try{emit(await logged('update',async()=>({ok:true,result:await runUpdate(process.env.DOT_INSTALL_ROOT,process.env.DOT_INSTALL_LEASE,updateOptions)})));}
   catch(e){if(['UPDATE_CHILD_CLEANUP_UNCONFIRMED','UPDATE_ROLLBACK_UNCONFIRMED'].includes(e.message))safeToUnlock=false;emit({ok:false,error:updateError(e)});process.exitCode=1;}
  }else if(action==='select'||action==='authorize'){
   const keys=action==='select'?['--native-root']:['--native-root','--operation','--kind','--text'];if(Object.keys(options).some(k=>!keys.includes(k)))throw Error('INVALID_OPTIONS');emit({ok:true,result:await humanCommand(action,options)});
  }else{
   if(Object.keys(options).some(k=>!['--backend','--native-root','--log-dir','--bridge-config'].includes(k)))throw Error('INVALID_OPTIONS');
   const installRoot=process.env.DOT_INSTALL_ROOT??(sourceManifest?path.resolve(sourceRoot,'../..'):null);
   const defaultBridge=installRoot?path.join(installRoot,'windows-bridge.json'):null;
   let configuredBridge=false;if(defaultBridge){try{await access(defaultBridge);configuredBridge=true;}catch(e){if(e.code!=='ENOENT')throw Error('BRIDGE_VALIDATION_FAILED');}}
   const bridgeConfig=options['--bridge-config']??(configuredBridge?defaultBridge:null);
   const backend=action==='bridge-check'?'windows-native':options['--backend']??(action==='session'&&configuredBridge?'windows-native':'diagnostic'),root=options['--native-root'];
   if(!['diagnostic','wezterm','native','windows-native'].includes(backend))throw Error('INVALID_BACKEND');
   if(!['status','session','bridge-check'].includes(action))throw Error('USE_SESSION_FOR_READ_PASTE_SUBMIT_PAUSE');
   if(action==='status'&&backend!=='diagnostic')throw Error('USE_SESSION_FOR_TERMINAL_BACKENDS');
   if(root&&backend!=='native'||options['--bridge-config']&&backend!=='windows-native')throw Error('INVALID_OPTIONS');
   log=await new OperationLog(logDir,backend).open();let command=process.execPath,args;
   if(backend==='native'){
    if(process.platform!=='win32'||!root||!path.isAbsolute(root))throw Error('NATIVE_REQUIRES_WINDOWS_AND_EXPLICIT_PRESELECTED_ROOT');
    args=[path.join(root,'native-integration-server.mjs'),'--human-launched'];
   }else if(backend==='windows-native'){
    if(!sourceManifest||!bridgeConfig)throw Error('BRIDGE_VALIDATION_FAILED');
    const verified=await logged('bridge-verify',async()=>({ok:true,result:await verifyWindowsBridge(bridgeConfig,sourceManifest,{release:version})}));
    command=verified.result.command;args=[...verified.result.args,action==='bridge-check'?'--bridge-check':'--human-launched'];
   }else args=[fileURLToPath(new URL(backend==='diagnostic'?'../src/plugin-server.mjs':'../src/server.mjs',import.meta.url))];
   client=new Client({name:'dot-connector-cli',version});
   const env={};for(const k of ['PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOME'])if(process.env[k])env[k]=process.env[k];
   if(backend==='wezterm')for(const k of ['DOT_STATE','DOT_WEZTERM'])if(process.env[k])env[k]=process.env[k];
   // WSL supplies a Windows executable path and structured arguments. Never shell-evaluate config.
   bridgeAttempted=backend==='windows-native';
   await logged('connect',async()=>{await timed(client.connect(new StdioClientTransport({command,args,env,stderr:'ignore'}),{timeout:10000}),11000);return {ok:true};});
   const calls={callTool:request=>client.callTool(request,undefined,{timeout:10000})};
   const dispatch=createCommandDispatcher(calls,action==='bridge-check'?'diagnostic':backend==='windows-native'?'native':backend);
   const invoke=async value=>{
    const started=performance.now();let startPromise;
    // Admission, busy reservation and close latch occur synchronously before log I/O.
    const operation=dispatch(value,()=>{startPromise=log.start(value?.command);return startPromise;});
    startPromise??=log.start(value?.command);
    const requestId=await startPromise,result=await operation;
    if(result.error==='OPERATION_TIMEOUT_OUTCOME_UNKNOWN_NO_RETRY'||(bridgeAttempted&&!result.ok&&result.error==='MCP_REFUSED_OR_OUTCOME_UNKNOWN_NO_RETRY'))safeToUnlock=false;
    await log.end(requestId,result.ok?undefined:safeError(result.error));
    return {...result,requestId,durationMs:Math.round((performance.now()-started)*10)/10};
   };
   process.once('SIGINT',()=>{safeToUnlock=false;process.exitCode=130;lines?.close();});
   if(action==='status'||action==='bridge-check'){const r=await invoke({id:'status',command:'status'});emit(r);if(!r.ok)process.exitCode=1;}
   else{
    emit({event:'ready',backend,runId:log.runId,commands:['status','read','paste','submit','pause','close'],automaticRetries:false,queue:false});
    lines=createInterface({input:process.stdin,crlfDelay:Infinity});const pending=new Set();let closing=false;
    await new Promise(resolve=>{
     lines.on('line',line=>{
      if(closing){emit({ok:false,error:'SESSION_CLOSING'});return;}
      let value;try{if(Buffer.byteLength(line)>12000)throw Error();value=JSON.parse(line);}catch{value=null;}
      const task=invoke(value).then(result=>{emit(result);if(result.closing){closing=true;lines.close();}}).catch(()=>{safeToUnlock=false;emit({ok:false,error:'LOG_UNAVAILABLE'});lines.close();}).finally(()=>pending.delete(task));pending.add(task);
     });lines.once('close',resolve);
    });
    if(!closing&&backend!=='diagnostic'){try{emit(await invoke({id:'eof-pause',command:'pause'}));}catch{safeToUnlock=false;}}
    await Promise.allSettled([...pending]);
   }
  }
 }
}catch(e){
 const allowed=['INVALID_OPTIONS','INVALID_BACKEND','USE_SESSION_FOR_READ_PASTE_SUBMIT_PAUSE','USE_SESSION_FOR_TERMINAL_BACKENDS','NATIVE_REQUIRES_WINDOWS_AND_EXPLICIT_PRESELECTED_ROOT','BRIDGE_VALIDATION_FAILED','BRIDGE_REQUIRES_WSL','BRIDGE_HELPER_MISMATCH','BRIDGE_SOURCE_MISMATCH','BRIDGE_NODE_MISMATCH','BRIDGE_VERIFICATION_TIMEOUT','LOG_UNAVAILABLE','OPERATION_TIMEOUT_OUTCOME_UNKNOWN_NO_RETRY'];
 if(bridgeAttempted||e.code===-32001||e.message==='OPERATION_TIMEOUT_OUTCOME_UNKNOWN_NO_RETRY')safeToUnlock=false;
 emit({ok:false,error:allowed.includes(e.message)?e.message:e.message.startsWith('UPDATE_')?updateError(e):'CONNECTION_OR_RUNTIME_UNAVAILABLE'});process.exitCode=1;
}finally{
 lines?.close();
 if(client){try{if(log)await logged('disconnect',async()=>{await timed(client.close(),3000);return {ok:true};});else await timed(client.close(),3000);}catch{safeToUnlock=false;emit({ok:false,error:'OPERATION_TIMEOUT_OUTCOME_UNKNOWN_NO_RETRY'});}}
 try{await log?.close(!safeToUnlock);}catch{safeToUnlock=false;emit({ok:false,error:'LOG_UNAVAILABLE'});process.exitCode=1;}
 if(process.send&&safeToUnlock)await new Promise(resolve=>process.send({event:'dot-cli-closed',lease:process.env.DOT_INSTALL_LEASE},resolve));
 if(!safeToUnlock){process.exitCode=1;process.exit(1);}
}
