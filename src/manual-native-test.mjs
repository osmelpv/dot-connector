import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {NativeWorkerSupervisor,workerDiagnostic} from './native-supervisor.mjs';

if(process.platform!=='win32')throw Error('Run this manual test with Windows Node, not WSL.');
if(process.argv.length>3||(process.argv[2]&&process.argv[2]!=='--check-only'))throw Error('Only --check-only is supported.');
const checking=process.argv[2]==='--check-only';
const directory=path.dirname(fileURLToPath(import.meta.url));
const provider=new NativeWorkerSupervisor({nativeHostPath:path.join(directory,'DotConnector.ManualProbe.exe'),hostMode:checking?'validate-only':'read',timeoutMs:5000});
let cancelled=false;
const cancel=()=>{cancelled=true;provider.cancel();};process.once('SIGINT',cancel);
if(!checking){
  console.log('Manual read-only test. In 10 seconds, the foreground terminal will be the sole target.');
  console.log('Focus your separate empty test terminal with the synthetic output. Do not type during the read.');
  await new Promise(resolve=>setTimeout(resolve,10000));
}
if(cancelled){console.log('{"result":"FAIL","diagnostic":"CANCELLED_BEFORE_READ"}');process.exit(1);}
const start=performance.now();
try{
  const result=await provider.getVisibleRanges({manualTest:true,marker:'DOT_NATIVE_TEST_7F3A2C9B'});
  console.log(JSON.stringify({...result,elapsedMs:Math.round(performance.now()-start)}));
  if(result.result==='FAIL')process.exitCode=1;
}catch(error){
  console.log(JSON.stringify({result:'FAIL',diagnostic:provider.poisoned?'CLEANUP_UNCONFIRMED_STOP':workerDiagnostic(error),elapsedMs:Math.round(performance.now()-start)}));process.exitCode=1;
}finally{process.removeListener('SIGINT',cancel);}
