import path from 'node:path';
import {readFile,lstat,realpath,writeFile} from 'node:fs/promises';
import {bootstrap,validateManifest,unpackArchive} from './update-release.mjs';
import {bridgeCapability} from './project-wsl.mjs';
import {verifyWindowsBridge} from './windows-bridge.mjs';
const fail=code=>{throw Error(code);};
async function plain(file,max){if(!path.isAbsolute(file??''))fail('LOCAL_ABSOLUTE_PATH_REQUIRED');const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max||await realpath(file)!==file)fail('LOCAL_UNSAFE_PATH');return readFile(file);}
export async function installLocal(options,hooks={}){
 const {root,archive,manifest:manifestFile,bridgeConfig,diagnosticOnly=false}=options;
 if(!path.isAbsolute(root??'')||path.resolve(root)!==root)fail('LOCAL_ABSOLUTE_PATH_REQUIRED');
 if(bridgeConfig&&diagnosticOnly)fail('LOCAL_MODES_EXCLUSIVE');
 try{await lstat(root);fail('LOCAL_DESTINATION_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 const m=JSON.parse(await plain(manifestFile,128*1024));validateManifest(m,m.version,m.commit);
 const bytes=await plain(archive,8*1024*1024);unpackArchive(bytes,m);
 const capability=bridgeCapability(process.platform,hooks.kernelRelease??await readFile('/proc/sys/kernel/osrelease','utf8'));
 let config;
 if(bridgeConfig){config=await plain(bridgeConfig,4096);if(!capability.wsl)fail('BRIDGE_REQUIRES_WSL');}
 else if(!diagnosticOnly)return {installed:false,capabilities:capability,reason:capability.wsl?'WINDOWS_PREPARATION_CONSENT_REQUIRED':'NATIVE_LINUX_CONTROL_UNSUPPORTED',next:capability.wsl?'Supply --bridge-config for an already prepared helper, or choose --diagnostic-only. New Windows preparation needs separate explicit consent; no policy is changed.':'Choose --diagnostic-only. Native Linux terminal control is unsupported.'};
 const result=await bootstrap(root,m.version,{...hooks,localRelease:{manifest:m,bytes},finalize:async(installedRoot,installedManifest)=>{
  if(config){const destination=path.join(installedRoot,'windows-bridge.json');await writeFile(destination,config,{flag:'wx',mode:0o600});await verifyWindowsBridge(destination,installedManifest,{release:installedManifest.version,osrelease:hooks.kernelRelease});}
 }});

 return {...result,source:'explicit local archive; hashes are integrity checks, not release authentication',capabilities:{...capability,metadataTransport:!!config,terminalRead:false,terminalInput:false},command:path.join(root,'dot-connector')};
}
