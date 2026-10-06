import {spawn} from 'node:child_process';
import path from 'node:path';

export function workerDiagnostic(error){
  const codes={'worker deadline exceeded':'WORKER_DEADLINE_EXCEEDED','worker cancelled':'WORKER_CANCELLED','worker cleanup unconfirmed; supervisor disabled':'CLEANUP_UNCONFIRMED_STOP','worker launch failed':'WORKER_LAUNCH_FAILED','worker input channel failed':'WORKER_INPUT_CHANNEL_FAILED','worker output limit':'WORKER_OUTPUT_LIMIT','worker failed':'WORKER_EXIT_FAILED','invalid worker JSON response':'WORKER_INVALID_JSON'};
  return Object.hasOwn(codes,error?.message)?codes[error.message]:'WORKER_START_OR_PROTOCOL_FAILED';
}

// Supervises an own Node fixture or a direct Windows host (never WSL interop).
// A worker must not spawn descendants. No shell, process search, or arbitrary PID kill.
export class NativeWorkerSupervisor {
  constructor({workerPath,nativeHostPath,hostMode='validate-only',timeoutMs=5000}) {
    if(nativeHostPath){
      if(workerPath||process.platform!=='win32'||!path.win32.isAbsolute(nativeHostPath)||!nativeHostPath.endsWith('.exe'))throw Error('direct Windows own-host path required; WSL interop is not supervised');
      if(hostMode!=='validate-only'&&hostMode!=='read')throw Error('unsupported native host mode');
      this.command=nativeHostPath;this.args=['--'+hostMode];this.cwd=path.dirname(nativeHostPath);
    }else{
      if(typeof workerPath!=='string'||!path.isAbsolute(workerPath)||!workerPath.endsWith('.mjs'))throw Error('explicit absolute own-worker path required');
      this.command=process.execPath;this.args=[workerPath];this.cwd=path.dirname(workerPath);
    }
    if(!Number.isInteger(timeoutMs)||timeoutMs<20||timeoutMs>5000)throw Error('worker deadline out of bounds');
    this.workerPath=workerPath;this.timeoutMs=timeoutMs;this.active=null;this.poisoned=false;
  }
  observe(args){return this.call('observe',args);}
  getVisibleRanges(args){return this.call('getVisibleRanges',args);}
  cancel(){if(this.active){this.active('worker cancelled');return true;}return false;}
  async call(method,args){
    if(method!=='observe'&&method!=='getVisibleRanges')throw Error('unsupported worker method');
    if(this.poisoned)throw Error('worker cleanup unconfirmed; supervisor disabled');
    if(this.active)throw Error('worker busy; no queue');
    const request=JSON.stringify({method,arguments:args});
    if(Buffer.byteLength(request)>16000)throw Error('worker request limit');
    return new Promise((resolve,reject)=>{
      const env={};for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
      const child=spawn(this.command,this.args,{cwd:this.cwd,stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false,env});
      let failure=null,chunks=[],size=0,cleanupTimer;
      const abort=reason=>{
        if(failure)return;failure=reason;
        // Only the process object spawned above is terminated. Wait for close to settle.
        try{if(!child.kill('SIGKILL'))this.poisoned=true;}catch{this.poisoned=true;}
        cleanupTimer=setTimeout(()=>{this.poisoned=true;reject(Error('worker cleanup unconfirmed; supervisor disabled'));},250);
      };
      this.active=abort;
      const timer=setTimeout(()=>abort('worker deadline exceeded'),this.timeoutMs);
      child.on('error',()=>{failure='worker launch failed';});
      child.stdin.on('error',()=>abort('worker input channel failed'));
      child.stderr.resume(); // No raw exception or terminal-content logs.
      child.stdout.on('data',chunk=>{size+=chunk.length;if(size>131072){chunks=[];abort('worker output limit');}else if(!failure)chunks.push(chunk);});
      child.on('close',code=>{
        clearTimeout(timer);clearTimeout(cleanupTimer);this.active=null;
        if(failure||code!==0){reject(Error(failure??'worker failed'));return;}
        try{const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));resolve(JSON.parse(text));}
        catch{reject(Error('invalid worker JSON response'));}
      });
      child.stdin.end(request+'\n');
    });
  }
}
