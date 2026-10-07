import path from 'node:path';
import {readFile,lstat,realpath,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Error(code);};
const hex=/^[a-f0-9]{64}$/;
export function windowsToWsl(value){
 if(typeof value!=='string'||!/^([A-Za-z]):\\/.test(value)||/[\x00-\x1f\x7f"<>|?*]/.test(value)||value.length>240||value.includes('/'))fail('BRIDGE_VALIDATION_FAILED');
 const parts=value.slice(3).split('\\');if(!parts.length||parts.some(x=>!x||x==='.'||x==='..'||x.includes(':')||x.endsWith(' ')||x.endsWith('.')))fail('BRIDGE_VALIDATION_FAILED');
 return '/mnt/'+value[0].toLowerCase()+'/'+parts.join('/');
}
async function fileBytes(file,limit){const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>limit||await realpath(file)!==file)fail('BRIDGE_VALIDATION_FAILED');return readFile(file);}
export async function verifyWindowsBridge(configFile,sourceManifest,{release,osrelease}={}){
 if(process.platform!=='linux'||!(osrelease??await readFile('/proc/sys/kernel/osrelease','utf8')).toLowerCase().includes('microsoft'))fail('BRIDGE_REQUIRES_WSL');
 if(!path.isAbsolute(configFile))fail('BRIDGE_VALIDATION_FAILED');
 const config=JSON.parse(await fileBytes(configFile,4096));
 if(config.schema!==1||Object.keys(config).sort().join(',')!=='helperManifestSha256,nativeRoot,nodeSha256,schema,windowsNode'||!hex.test(config.nodeSha256)||!hex.test(config.helperManifestSha256))fail('BRIDGE_VALIDATION_FAILED');
 const node=windowsToWsl(config.windowsNode),root=windowsToWsl(config.nativeRoot);
 if(path.basename(node).toLowerCase()!=='node.exe'||await realpath(root)!==root||(await lstat(root)).isSymbolicLink())fail('BRIDGE_VALIDATION_FAILED');
 if(hash(await fileBytes(node,150*1024*1024))!==config.nodeSha256)fail('BRIDGE_NODE_MISMATCH');
 const bytes=await fileBytes(path.join(root,'bridge-integrity.json'),1024*1024);if(hash(bytes)!==config.helperManifestSha256)fail('BRIDGE_HELPER_MISMATCH');
 const manifest=JSON.parse(bytes);await verifyBridgeInventory(root,manifest,sourceManifest,release);
 // WSL interop receives an executable and separate argv, never a shell command.
 return {command:node,args:[config.nativeRoot+'\\native-integration-server.mjs'],helperFiles:Object.keys(manifest.files).length};
}

export async function verifyBridgeInventory(root,manifest,sourceManifest,release){
 const expected=sourceManifest;let totalBytes=0,directories=0;const deadline=performance.now()+30000;
 const budget=()=>{if(performance.now()>deadline)fail('BRIDGE_VERIFICATION_TIMEOUT');};
 if(manifest.schema!==1||manifest.version!==release||expected.version!==release||expected.repository!=='osmelpv/dot-connector'||!manifest.files||typeof manifest.files!=='object'||Array.isArray(manifest.files)||Object.keys(manifest.files).length>10000)fail('BRIDGE_SOURCE_MISMATCH');
 const modules=['native-claim-store.mjs','native-claim-lease.mjs','native-owner.mjs','native-lifecycle.mjs','native-control.mjs','native-reader.mjs','native-supervisor.mjs','native-mcp-server.mjs','native-integration-server.mjs','manual-native-mcp.mjs'];
 for(const name of modules)if(manifest.files[name]!==expected.files['src/'+name])fail('BRIDGE_SOURCE_MISMATCH');
 for(const name of ['package.json','package-lock.json'])if(manifest.files[name]!==expected.files[name])fail('BRIDGE_SOURCE_MISMATCH');
 for(const name of ['DotConnector.Native.dll','DotConnector.NativeControl.exe','DotConnector.Owner.exe'])if(!hex.test(manifest.files[name]??''))fail('BRIDGE_HELPER_MISMATCH');
 const allowed=new Set([...modules,'package.json','package-lock.json','DotConnector.Native.dll','DotConnector.NativeControl.exe','DotConnector.Owner.exe']);
 const entries=Object.entries(manifest.files);
 for(const [name,digest] of entries){
  if(!hex.test(digest)||name.includes('\\')||name.includes(':')||name.split('/').some(p=>!p||p==='.'||p==='..')||(!allowed.has(name)&&!name.startsWith('node_modules/')))fail('BRIDGE_HELPER_MISMATCH');
 }
 // Bound parallel filesystem work: WSL mounted Windows files are expensive per syscall.
 for(let offset=0;offset<entries.length;offset+=16){
  budget();const results=await Promise.allSettled(entries.slice(offset,offset+16).map(async([name,digest])=>{
   const data=await fileBytes(path.join(root,...name.split('/')),16*1024*1024);
   if(hash(data)!==digest)fail('BRIDGE_HELPER_MISMATCH');return data.length;
  }));
  for(const result of results){if(result.status==='rejected')throw result.reason;totalBytes+=result.value;}
  if(totalBytes>128*1024*1024)fail('BRIDGE_HELPER_MISMATCH');
 }

 let count=0;async function inspect(dir,relative,depth=0){budget();if(++directories>10000||depth>16||await realpath(dir)!==dir)fail('BRIDGE_HELPER_MISMATCH');for(const item of await readdir(dir,{withFileTypes:true})){const rel=relative+'/'+item.name;if(item.isSymbolicLink())fail('BRIDGE_HELPER_MISMATCH');if(item.isDirectory())await inspect(path.join(dir,item.name),rel,depth+1);else{if(!item.isFile()||!Object.hasOwn(manifest.files,rel)||++count>10000)fail('BRIDGE_HELPER_MISMATCH');}}}
 await inspect(path.join(root,'node_modules'),'node_modules');
 if(!count)fail('BRIDGE_HELPER_MISMATCH');
 return {files:Object.keys(manifest.files).length};
}
