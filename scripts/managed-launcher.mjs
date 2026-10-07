#!/usr/bin/env node
// Stable protocol-v1 launcher. All managed commands hold one fail-closed lifecycle lease.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,unlink,lstat,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url)),lock=path.join(root,'lifecycle.lock');
let owned=false,child,interrupted=false,orderly=false;
try{
 if(process.platform!=='linux'||process.versions.node.split('.')[0]!=='22'||await realpath(root)!==root)throw Error('UPDATE_REQUIRES_MANAGED_LINUX_NODE_22');
 const metadataOnly=process.argv[2]==='logs'||(process.argv[2]==='status'&&process.argv.includes('--local'));
 const lease=randomUUID();
 if(!metadataOnly)try{await writeFile(lock,JSON.stringify({lease,pid:process.pid,kind:process.argv[2]==='update'?'update':'command'}),{flag:'wx',mode:0o600});owned=true;}catch(e){if(e.code==='EEXIST')throw Error('UPDATE_SESSION_OR_OPERATION_ACTIVE');throw e;}
 const file=path.join(root,'current.json');if((await lstat(file)).isSymbolicLink())throw Error('UPDATE_INVALID_POINTER');
 const p=JSON.parse(await readFile(file,'utf8'));
 if(!/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(p.version)||!/^[a-f0-9]{40}$/.test(p.commit)||p.directory!==`${p.version}-${p.commit}`)throw Error('UPDATE_INVALID_POINTER');
 const dir=path.join(root,'releases',p.directory),entry=path.join(dir,'scripts/dot-connector.mjs');
 if(await realpath(dir)!==dir||await realpath(entry)!==entry)throw Error('UPDATE_UNSAFE_INSTALL_PATH');
 const stop=signal=>{interrupted=true;child?.kill(signal);};process.once('SIGINT',()=>stop('SIGINT'));process.once('SIGTERM',()=>stop('SIGTERM'));
 child=spawn(process.execPath,[entry,...process.argv.slice(2)],{cwd:process.cwd(),stdio:['inherit','inherit','inherit','ipc'],shell:false,env:{...process.env,DOT_INSTALL_ROOT:root,DOT_INSTALL_LEASE:lease}});
 child.on('message',message=>{if(message?.event==='dot-cli-closed'&&message.lease===lease)orderly=true;});
 process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{if(signal)interrupted=true;resolve(code??(signal?130:1));});});
}catch(e){process.stdout.write(JSON.stringify({ok:false,error:/^UPDATE_[A-Z_]+$/.test(e.message)?e.message:'UPDATE_MANAGED_LAUNCH_FAILED'})+'\n');process.exitCode=1;}
finally{
 // Forced termination may orphan a descendant; preserve the lease, never guess it is safe to update.
 if(owned&&!interrupted&&orderly)await unlink(lock);
}
