import {readFile,writeFile,lstat,realpath,unlink,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {OperationLog,safeError} from './operation-log.mjs';
import {verifyInstalled} from './update-release.mjs';
import {windowsToWsl,verifyWindowsBridge} from './windows-bridge.mjs';
const execute=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
export function bridgeCapability(platform,release){return {wsl:platform==='linux'&&/microsoft/i.test(release),nativeLinuxTerminalControl:false,windowsHelperRequired:true};}
export async function prepareProjectWindowsBridge(root,{run=execute,kernelRelease}={}){
 const capability=bridgeCapability(process.platform,kernelRelease??await readFile('/proc/sys/kernel/osrelease','utf8'));
 if(!capability.wsl)throw Error('BRIDGE_REQUIRES_WSL');
 if(!path.isAbsolute(root)||await realpath(root)!==path.resolve(root)||(await lstat(root)).isSymbolicLink())throw Error('BRIDGE_VALIDATION_FAILED');
 const lifecycle=path.join(root,'lifecycle.lock'),lease=randomUUID();
 await writeFile(lifecycle,JSON.stringify({lease,pid:process.pid,kind:'bridge-setup'}),{flag:'wx',mode:0o600});
 let launched=false,completed=false,log;
 try{
  log=await new OperationLog(path.join(root,'logs'),'windows-native').open();
  const span=async(operation,fn)=>{const id=await log.start(operation);try{const value=await fn();await log.end(id);return value;}catch(e){await log.end(id,safeError(e.message)).catch(()=>{});throw e;}};
  const pointer=JSON.parse(await readFile(path.join(root,'current.json'),'utf8')),source=await verifyInstalled(root,pointer);
  const manifest=JSON.parse(await readFile(path.join(source,'.release-manifest.json'),'utf8'));
  if(!manifest.files['scripts/write-bridge-integrity.mjs'])throw Error('BRIDGE_RELEASE_NOT_CAPABLE');
  const configFile=path.join(root,'windows-bridge.json');try{await lstat(configFile);throw Error('BRIDGE_ALREADY_CONFIGURED');}catch(e){if(e.code!=='ENOENT')throw e;}
  const windowsNode='C:\\Program Files\\nodejs\\node.exe',node=windowsToWsl(windowsNode),nodeHash=hash(await readFile(node));
  launched=true;
  const probe=await run(node,['-e',"process.stdout.write(JSON.stringify({platform:process.platform,node:process.version,temp:process.env.TEMP}))"],{timeout:10000,maxBuffer:4096,windowsHide:true});
  launched=false;
  const info=JSON.parse(probe.stdout);if(info.platform!=='win32'||typeof info.temp!=='string')throw Error('BRIDGE_WINDOWS_RUNTIME_UNAVAILABLE');
  windowsToWsl(info.temp);
  const nonce=randomUUID(),nativeRoot=info.temp+'\\dot-connector-'+nonce,windowsSource=info.temp+'\\dot-connector-source-'+nonce;
  const localSource=windowsToWsl(windowsSource);
  // Verified local source copy, not an execution-policy override or an unblocked downloaded script.
  await span('bridge-verify',async()=>{
   await mkdir(localSource);
   const names=['package.json','package-lock.json','scripts/prepare-native-manual.ps1','scripts/write-bridge-integrity.mjs','src/native-uia-provider.cs','src/native-control-host.cs','src/native-claim-store.mjs','src/native-claim-lease.mjs','src/native-owner.mjs','src/native-lifecycle.mjs','src/native-control.mjs','src/native-reader.mjs','src/native-supervisor.mjs','src/native-mcp-server.mjs','src/native-integration-server.mjs','src/manual-native-mcp.mjs'];
   for(const name of names){const bytes=await readFile(path.join(source,name));if(hash(bytes)!==manifest.files[name])throw Error('BRIDGE_SOURCE_MISMATCH');const destination=path.join(localSource,name);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes,{flag:'wx'});}
  });
  const setupLock=path.join(root,'bridge-setup.lock');await writeFile(setupLock,JSON.stringify({schema:1,requestId:nonce,phase:'prepare-windows-helper'}),{flag:'wx',mode:0o600});
  await span('bridge-prepare',async()=>{
   launched=true;
   await run('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-File',windowsSource+'\\scripts\\prepare-native-manual.ps1','-Destination',nativeRoot,'-NodePath',windowsNode],{timeout:180000,maxBuffer:1024*1024,windowsHide:true});
  });
  const helperManifest=await readFile(path.join(windowsToWsl(nativeRoot),'bridge-integrity.json'));
  const config={schema:1,windowsNode,nativeRoot,nodeSha256:nodeHash,helperManifestSha256:hash(helperManifest)};
  await writeFile(configFile,JSON.stringify(config)+'\n',{flag:'wx',mode:0o600});
  await span('bridge-verify',()=>verifyWindowsBridge(configFile,manifest,{release:pointer.version}));
  await unlink(setupLock);completed=true;
  return {ready:true,platform:'WSL-to-Windows',version:pointer.version,nativeCalls:false,targetSelected:false};
 }catch(e){
  if(e.killed||e.signal)throw Error('BRIDGE_PREPARATION_CLEANUP_UNKNOWN');
  if(/^BRIDGE_[A-Z_]+$/.test(e.message))throw e;
  throw Error('BRIDGE_PREPARATION_FAILED');
 }finally{
  const uncertain=launched&&!completed;
  try{await log?.close(uncertain);}finally{if(!uncertain)await unlink(lifecycle);}
 }
}
