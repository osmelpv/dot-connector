// User-run only: interactive selection/ARM are not MCP tools.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {NativeWorkerSupervisor} from './native-supervisor.mjs';
import {nativeTargetSchema} from './native-reader.mjs';
if(process.platform!=='win32'||!process.stdin.isTTY)throw Error('User interactive Windows launch required.');
if(process.argv.length>3||(process.argv[2]&&process.argv[2]!=='--select-only'))throw Error('Only --select-only is supported.');
const selectionOnly=process.argv[2]==='--select-only';
const root=path.dirname(fileURLToPath(import.meta.url));
const ask=createInterface({input:process.stdin,output:process.stdout});
const provider=new NativeWorkerSupervisor({nativeHostPath:path.join(root,'DotConnector.NativeControl.exe'),hostMode:'read'});
let client,cancelled=false;
const pause=async()=>{cancelled=true;await writeFile(path.join(root,'control.json'),JSON.stringify({paused:true}));provider.cancel();if(client)await client.callTool({name:'terminal_pause',arguments:{}}).catch(()=>{});ask.close();};
process.once('SIGINT',()=>{pause().catch(()=>{});});
const countdown=async()=>{console.log('10 seconds: focus the synthetic terminal, then release mouse/keyboard. Do not type during operation.');await new Promise(r=>setTimeout(r,10000));if(cancelled)throw Error('Cancelled; inspect target; no retry.');};
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw Error('MCP operation refused or uncertain; inspect target; no retry.');return JSON.parse(r.content[0].text);};
try{
 console.log('Experimental manual MCP: synthetic PowerShell only, DOT_NATIVE_TEST_7F3A2C9B visible and DOT_WRITE_READY> prompt. Focus/send race remains; cancel cannot retract input.');
 if(await ask.question('Type SELECT to bind your deliberately focused synthetic terminal: ')!=='SELECT')throw Error('Not selected.');
 await countdown();const target=nativeTargetSchema.parse(await provider.selectManualTarget({}));
 await writeFile(path.join(root,'target.json'),JSON.stringify(target),{flag:'wx'});
 console.log(JSON.stringify({selected:target}));
 if(!selectionOnly){
 client=new Client({name:'human-native-integration-check',version:'0.1.7'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'native-integration-server.mjs'),'--human-launched'],cwd:root,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,USERPROFILE:process.env.USERPROFILE}}));
 console.log(JSON.stringify(await client.listTools()));
 while(!cancelled){
  const action=await ask.question('READ / PASTE / SUBMIT / PAUSE / QUIT: ');
  if(action==='QUIT')break;
  if(action==='PAUSE'){console.log(JSON.stringify(await call('terminal_pause')));continue;}
  if(action==='READ'){await countdown();console.log(JSON.stringify(await call('terminal_snapshot')));continue;}
  if(action!=='PASTE'&&action!=='SUBMIT')continue;
  const text=await ask.question(action==='PASTE'?'Exact single-line text to paste (no Enter): ':'Exact pending text you explicitly authorize submitting: ');
  if(await ask.question(`Type ARM ${action} to authorize this exact operation: `)!==`ARM ${action}`)continue;
  const operationId=randomUUID(),kind=action.toLowerCase();
  await writeFile(path.join(root,'control.json'),JSON.stringify({paused:false,operationId,kind,text,expiresAtMs:Date.now()+20000}));
  await countdown();const snapshot=await call('terminal_snapshot');
  console.log(JSON.stringify(await call('terminal_input',{snapshotId:snapshot.snapshotId,operationId,kind,text})));
  await call('terminal_pause');
 }
 }
}catch{console.error('Stopped: refused, cancelled or outcome unconfirmed. Inspect the terminal. No retry or lock cleanup.');process.exitCode=1;}
finally{await writeFile(path.join(root,'control.json'),JSON.stringify({paused:true}));provider.cancel();if(client){await client.callTool({name:'terminal_pause',arguments:{}}).catch(()=>{});await client.close();}ask.close();}
