import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {NativeWorkerSupervisor,workerDiagnostic} from './native-supervisor.mjs';
if(process.platform!=='win32')throw Error('Use Windows Node, not WSL.');
if(process.argv.length>3||(process.argv[2]&&process.argv[2]!=='--check-only'))throw Error('Only --check-only is supported.');
const checking=process.argv[2]==='--check-only';
const directory=path.dirname(fileURLToPath(import.meta.url));
const pin=JSON.parse(await readFile(path.join(directory,'target.json'),'utf8'));
if(Object.keys(pin).sort().join(',')!=='hwnd,pid,startTimeTicks'||typeof pin.hwnd!=='string'||typeof pin.startTimeTicks!=='string'||!Number.isInteger(pin.pid))throw Error('Invalid pinned test target.');
const provider=new NativeWorkerSupervisor({nativeHostPath:path.join(directory,'DotConnector.ManualWriter.exe'),hostMode:checking?'validate-only':'read',timeoutMs:5000});
let cancelled=false,dialog;
const cancel=()=>{cancelled=true;dialog?.close();provider.cancel();};process.once('SIGINT',cancel);
const operationId=randomUUID();let expiresAtMs;
try{
  if(!checking){
    if(!process.stdin.isTTY)throw Error('Interactive human ARM required.');
    console.log(`One manual action: type DOT_WRITE_TEST without Enter into the pinned empty test window (PID ${pin.pid}, HWND ${pin.hwnd}).`);
    console.log('Keep hands off mouse/keyboard during dispatch. Focus can race with SendInput; no atomic destination guarantee.');
    dialog=createInterface({input:process.stdin,output:process.stdout});
    const answer=await dialog.question('Type ARM to enable this one attempt; anything else cancels: ');dialog.close();dialog=null;
    if(answer!=='ARM'||cancelled){console.log('{"result":"FAIL","diagnostic":"NOT_ARMED_NO_INPUT"}');process.exitCode=1;}
    else{expiresAtMs=Date.now()+20000;console.log('10 seconds: focus the SAME synthetic target window with an empty DOT_WRITE_READY> prompt.');await new Promise(r=>setTimeout(r,10000));}
  }else expiresAtMs=Date.now()+5000;
  if(expiresAtMs&&!cancelled){
    const start=performance.now();const result=await provider.manualWrite({armed:true,expiresAtMs,operationId});
    console.log(JSON.stringify({...result,elapsedMs:Math.round(performance.now()-start)}));if(result.result==='FAIL')process.exitCode=1;
  }else if(cancelled){console.log('{"result":"FAIL","diagnostic":"CANCELLED_NO_RETRY"}');process.exitCode=1;}
}catch(error){console.log(JSON.stringify({result:'FAIL',diagnostic:cancelled?'CANCELLED_OUTCOME_UNCONFIRMED':provider.poisoned?'CLEANUP_UNCONFIRMED_STOP':workerDiagnostic(error),warning:'Do not retry or erase input automatically. Inspect the test terminal.'}));process.exitCode=1;}
finally{dialog?.close();process.removeListener('SIGINT',cancel);}
