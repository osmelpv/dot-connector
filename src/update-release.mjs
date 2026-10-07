import path from 'node:path';
import {readFile,writeFile,mkdir,lstat,realpath,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const repository='osmelpv/dot-connector',api=`https://api.github.com/repos/${repository}`;
const sha=b=>createHash('sha256').update(b).digest('hex');
const versionPattern=/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const commitPattern=/^[a-f0-9]{40}$/;
const hashPattern=/^[a-f0-9]{64}$/;
const fail=code=>{throw Error(code);};
export const updateError=e=>/^UPDATE_[A-Z_]+$/.test(e?.message??'')?e.message:'UPDATE_FAILED_NO_ACTIVATION_CONFIRMED';
const allowed=/^(README\.md|\.gitignore|package(?:-lock)?\.json|\.agents\/plugins\/marketplace\.json|\.codex-plugin\/plugin\.json|\.mcp\.json|src\/(?:[^/]+\.mjs|native-(?:uia-(?:provider|host)|control-host|manual-(?:probe|writer))\.cs)|profiles\/[^/]+\.json|scripts\/(?:[^/]+\.mjs|start-terminal\.ps1|read-gui-identity\.ps1|prepare-native-manual\.ps1)|test\/[^/]+\.test\.mjs|docs\/[^/]+\.md)$/;
function safeName(name){return typeof name==='string'&&name.length<=180&&!name.includes('\\')&&!name.includes(':')&&!name.split('/').some(p=>!p||p==='.'||p==='..')&&allowed.test(name);}
export async function fetchBytes(url,max=1024*1024){
 let next=new URL(url);const signal=AbortSignal.timeout(30000);
 for(let redirects=0;redirects<=3;redirects++){
  if(next.protocol!=='https:'||next.username||next.password||!['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(next.hostname))fail('UPDATE_UNTRUSTED_DOWNLOAD_URL');
  const response=await fetch(next,{redirect:'manual',signal,headers:{'User-Agent':'dot-connector-updater','Accept':'application/vnd.github+json'}});
  if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();next=new URL(response.headers.get('location'),next);continue;}
  if(!response.ok)fail('UPDATE_RELEASE_OR_NETWORK_UNAVAILABLE');
  if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();fail('UPDATE_DOWNLOAD_TOO_LARGE');}
  const chunks=[];let count=0;for await(const chunk of response.body){count+=chunk.length;if(count>max)fail('UPDATE_DOWNLOAD_TOO_LARGE');chunks.push(chunk);}
  return Buffer.concat(chunks);
 }
 fail('UPDATE_REDIRECT_LIMIT');
}
export function validateManifest(m,version,commit){
 if(!m||m.schema!==1||m.repository!==repository||m.version!==version||m.commit!==commit||!versionPattern.test(version)||!commitPattern.test(commit)||m.archive!==`dot-connector-${version}-source.tar.gz`||!hashPattern.test(m.sha256)||!Number.isSafeInteger(m.size)||m.size<1||m.size>8*1024*1024||!m.files||Array.isArray(m.files))fail('UPDATE_INVALID_MANIFEST');
 const names=Object.keys(m.files);if(names.length<4||names.length>256||names.some(n=>!safeName(n)||!hashPattern.test(m.files[n])))fail('UPDATE_INVALID_MANIFEST');
 for(const n of ['package.json','package-lock.json','scripts/dot-connector.mjs','scripts/managed-launcher.mjs','src/update-release.mjs'])if(!m.files[n])fail('UPDATE_INVALID_MANIFEST');
 return m;
}
export async function resolveRelease(version,download=fetchBytes){
 if(version!==undefined&&!versionPattern.test(version))fail('UPDATE_INVALID_VERSION');
 const json=async url=>JSON.parse((await download(url,1024*1024)).toString('utf8'));
 const release=await json(`${api}/releases/${version?`tags/v${version}`:'latest'}`);
 const resolved=release.tag_name?.slice(1);
 if(release.draft!==false||!release.published_at||!Number.isSafeInteger(release.id)||!versionPattern.test(resolved??'')||release.tag_name!==`v${resolved}`||(version&&resolved!==version)||(!version&&release.prerelease))fail('UPDATE_NOT_PUBLISHED_RELEASE');
 let ref=await json(`${api}/git/ref/tags/v${resolved}`),object=ref.object;
 for(let i=0;object?.type==='tag'&&i<3;i++){if(!commitPattern.test(object.sha))fail('UPDATE_INVALID_TAG');object=(await json(`${api}/git/tags/${object.sha}`)).object;}
 if(object?.type!=='commit'||!commitPattern.test(object.sha))fail('UPDATE_INVALID_TAG');
 const asset=name=>{const matches=release.assets?.filter(a=>a.name===name&&a.state==='uploaded');if(matches?.length!==1||matches[0].browser_download_url!==`https://github.com/${repository}/releases/download/v${resolved}/${name}`)fail('UPDATE_RELEASE_ASSET_MISSING');return matches[0];};
 const manifestAsset=asset(`update-manifest-${resolved}.json`);
 const bytes=await download(manifestAsset.browser_download_url,128*1024);
 if(manifestAsset.digest&&manifestAsset.digest!==`sha256:${sha(bytes)}`)fail('UPDATE_MANIFEST_CHECKSUM_MISMATCH');
 const manifest=validateManifest(JSON.parse(bytes),resolved,object.sha),archive=asset(manifest.archive);
 if(archive.size!==manifest.size||(archive.digest&&archive.digest!==`sha256:${manifest.sha256}`))fail('UPDATE_ARCHIVE_METADATA_MISMATCH');
 return {manifest,archiveUrl:archive.browser_download_url,releaseId:release.id,prerelease:release.prerelease===true};
}
export function unpackArchive(compressed,manifest){
 if(compressed.length!==manifest.size||sha(compressed)!==manifest.sha256)fail('UPDATE_ARCHIVE_CHECKSUM_MISMATCH');
 const tar=gunzipSync(compressed,{maxOutputLength:20*1024*1024}),files=new Map();let ended=false,globalSeen=false;
 const string=b=>b.toString('utf8').replace(/\0.*$/s,'');
 const octal=b=>{const s=string(b).trim();if(!/^[0-7]+$/.test(s))fail('UPDATE_INVALID_ARCHIVE');return parseInt(s,8);};
 for(let offset=0;offset+512<=tar.length;){
  const h=tar.subarray(offset,offset+512);if(h.every(b=>b===0)){ended=true;if(tar.subarray(offset).some(b=>b!==0))fail('UPDATE_INVALID_ARCHIVE');break;}
  let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:h[i];if(sum!==octal(h.subarray(148,156)))fail('UPDATE_INVALID_ARCHIVE');
  const size=octal(h.subarray(124,136)),type=String.fromCharCode(h[156]);if(size>1024*1024||offset+512+size>tar.length)fail('UPDATE_INVALID_ARCHIVE');
  const data=tar.subarray(offset+512,offset+512+size);offset+=512+Math.ceil(size/512)*512;
  if(type==='g'){
   if(globalSeen||files.size||!/^\d+ comment=[a-f0-9]{40}\n$/.test(data.toString())||!data.toString().includes(`comment=${manifest.commit}\n`))fail('UPDATE_UNSUPPORTED_ARCHIVE');globalSeen=true;continue;
  }
  const prefix=string(h.subarray(345,500)),name=(prefix?prefix+'/':'')+string(h.subarray(0,100));
  if(!name.startsWith('dot-connector/')||name.includes('\\')||name.includes(':')||name.split('/').some(p=>p==='.'||p==='..'))fail('UPDATE_UNSAFE_ARCHIVE_PATH');
  const relative=name.slice('dot-connector/'.length);
  if(type==='5'){if(size!==0||!name.endsWith('/'))fail('UPDATE_INVALID_ARCHIVE');continue;}
  if(type!=='0'&&type!=='\0')fail('UPDATE_UNSUPPORTED_ARCHIVE');
  if(!safeName(relative)||files.has(relative)||!Object.hasOwn(manifest.files,relative)||sha(data)!==manifest.files[relative])fail('UPDATE_SOURCE_MANIFEST_MISMATCH');
  files.set(relative,data);
 }
 if(!ended||files.size!==Object.keys(manifest.files).length)fail('UPDATE_SOURCE_MANIFEST_MISMATCH');
 const pkg=JSON.parse(files.get('package.json'));
 if(pkg.name!=='dot-connector'||pkg.version!==manifest.version||pkg.private!==true)fail('UPDATE_PACKAGE_IDENTITY_MISMATCH');
 return files;
}
function validateSlot(slot){if(!slot||!versionPattern.test(slot.version)||!commitPattern.test(slot.commit)||slot.directory!==`${slot.version}-${slot.commit}`)fail('UPDATE_INVALID_POINTER');return slot;}
async function plainDirectory(dir){const st=await lstat(dir);if(!st.isDirectory()||st.isSymbolicLink()||await realpath(dir)!==path.resolve(dir))fail('UPDATE_UNSAFE_INSTALL_PATH');}
async function jsonFile(file){const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128*1024)fail('UPDATE_UNSAFE_INSTALL_PATH');return JSON.parse(await readFile(file,'utf8'));}
export async function requireManaged(root,lease){
 if(process.platform!=='linux'||!path.isAbsolute(root??''))fail('UPDATE_REQUIRES_MANAGED_LINUX_INSTALL');
 await plainDirectory(root);await plainDirectory(path.join(root,'releases'));
 const config=await jsonFile(path.join(root,'managed.json')),lock=await jsonFile(path.join(root,'lifecycle.lock'));
 if(config.schema!==1||config.repository!==repository||typeof lease!=='string'||lease.length!==36||lock.lease!==lease)fail('UPDATE_MANAGED_LEASE_REQUIRED');
 const launcher=path.join(root,'dot-connector.mjs');if((await lstat(launcher)).isSymbolicLink()||sha(await readFile(launcher))!==config.launcherSha256)fail('UPDATE_LAUNCHER_CHANGED');
 return config;
}
export async function verifyInstalled(root,slot){
 validateSlot(slot);const dir=path.join(root,'releases',slot.directory);await plainDirectory(dir);
 const m=validateManifest(await jsonFile(path.join(dir,'.release-manifest.json')),slot.version,slot.commit);
 await verifyTree(dir,m);
 return dir;
}
async function verifyTree(dir,m){
 for(const [name,hash] of Object.entries(m.files)){const file=path.join(dir,name);const stat=await lstat(file);if(await realpath(file)!==file||!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024||sha(await readFile(file))!==hash)fail('UPDATE_INSTALLED_SOURCE_CHANGED');}
}
async function atomicPointer(root,pointer){const temp=path.join(root,`.current-${randomUUID()}.json`);await writeFile(temp,JSON.stringify(pointer)+'\n',{flag:'wx',mode:0o600});await rename(temp,path.join(root,'current.json'));}
function cleanEnv(root){return {PATH:process.env.PATH??'/usr/bin:/bin',HOME:path.join(root,'npm-home'),NPM_CONFIG_USERCONFIG:path.join(root,'empty-npmrc'),NPM_CONFIG_GLOBALCONFIG:path.join(root,'empty-global-npmrc'),NPM_CONFIG_CACHE:path.join(root,'npm-cache'),NPM_CONFIG_REGISTRY:'https://registry.npmjs.org/'};}
export async function prepareRelease(dir,root){
 try{await exec('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:dir,env:cleanEnv(root),timeout:120000,maxBuffer:1024*1024});}catch(e){if(e.killed||e.signal)fail('UPDATE_CHILD_CLEANUP_UNCONFIRMED');fail('UPDATE_DEPENDENCY_PREPARATION_FAILED');}
}
export async function healthCheck(dir,version){
 try{const {stdout}=await exec(process.execPath,[path.join(dir,'scripts/dot-connector.mjs'),'version'],{cwd:dir,env:{PATH:process.env.PATH??'/usr/bin:/bin'},timeout:10000,maxBuffer:65536});const data=JSON.parse(stdout);if(data.ok!==true||data.version!==version)throw Error();}catch(e){if(e.killed||e.signal)fail('UPDATE_CHILD_CLEANUP_UNCONFIRMED');fail('UPDATE_RELEASE_HEALTHCHECK_FAILED');}
}
export async function runUpdate(root,lease,options={},hooks={}){
 await requireManaged(root,lease);
 const current=await jsonFile(path.join(root,'current.json'));validateSlot(current);
 const active=await verifyInstalled(root,current);
 if(options.rollback&&(options.version||options.check))fail('UPDATE_INVALID_OPTIONS');
 const health=hooks.health??healthCheck,activate=hooks.activate??atomicPointer;
 let next;
 if(options.rollback){if(!current.previous)fail('UPDATE_NO_PREVIOUS_RELEASE');next=validateSlot(current.previous);await verifyInstalled(root,next);}
 else{
  const release=await resolveRelease(options.version,hooks.download??fetchBytes),m=release.manifest;
  if(options.check)return {current:current.version,available:m.version,commit:m.commit,releaseId:release.releaseId,prerelease:release.prerelease,changed:current.commit!==m.commit,integrity:'SHA-256; no independent signature'};
  if(current.commit===m.commit&&current.version===m.version)return {updated:false,version:current.version};
  next={version:m.version,commit:m.commit,directory:`${m.version}-${m.commit}`};
  const final=path.join(root,'releases',next.directory);
  try{await lstat(final);fail('UPDATE_RELEASE_DIRECTORY_ALREADY_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
  const bytes=await (hooks.download??fetchBytes)(release.archiveUrl,8*1024*1024),files=unpackArchive(bytes,m);
  const stage=path.join(root,'releases',`.stage-${randomUUID()}`);await mkdir(stage,{mode:0o700});
  for(const [name,data] of files){const target=path.join(stage,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,data,{flag:'wx',mode:0o644});}
  await writeFile(path.join(stage,'.release-manifest.json'),JSON.stringify(m)+'\n',{flag:'wx'});
  await (hooks.prepare??prepareRelease)(stage,root);await verifyTree(stage,m);await health(stage,m.version);
  // Preparation never writes outside staging except the managed npm cache. Verify source again.
  await verifyTree(stage,m);
  await rename(stage,final);
 }
 const nextDir=path.join(root,'releases',next.directory);await verifyInstalled(root,next);await health(nextDir,next.version);
 const pointer={...next,previous:{version:current.version,commit:current.commit,directory:current.directory}};
 try{await activate(root,pointer);await health(nextDir,next.version);}
 catch(e){
  if(e.message==='UPDATE_CHILD_CLEANUP_UNCONFIRMED'){try{await atomicPointer(root,current);}catch{fail('UPDATE_ROLLBACK_UNCONFIRMED');}throw e;}
  try{await atomicPointer(root,current);await health(active,current.version);}catch{fail('UPDATE_ROLLBACK_UNCONFIRMED');}
  fail('UPDATE_ACTIVATION_FAILED_ROLLED_BACK');
 }
 return {updated:true,version:next.version,commit:next.commit,previous:current.version,rollback:options.rollback===true};
}
export async function bootstrap(root,version,hooks={}){
 if(process.platform!=='linux'||process.versions.node.split('.')[0]!=='22'||!path.isAbsolute(root??''))fail('UPDATE_REQUIRES_LINUX_NODE_22_NEW_ROOT');
 const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),resolved=path.resolve(root);
 if(resolved===sourceRoot||resolved.startsWith(sourceRoot+path.sep)||sourceRoot.startsWith(resolved+path.sep))fail('UPDATE_INSTALL_MUST_BE_SEPARATE');
 await plainDirectory(path.dirname(resolved));
 const release=await resolveRelease(version,hooks.download??fetchBytes),m=release.manifest;
 const bytes=await (hooks.download??fetchBytes)(release.archiveUrl,8*1024*1024),files=unpackArchive(bytes,m);
 await mkdir(resolved,{mode:0o700});await mkdir(path.join(resolved,'releases'));await mkdir(path.join(resolved,'user'));await mkdir(path.join(resolved,'npm-home'));
 const lease=randomUUID();await writeFile(path.join(resolved,'lifecycle.lock'),JSON.stringify({lease,pid:process.pid,kind:'bootstrap'}),{flag:'wx'});
 // On bootstrap failure retain the new root and lock for inspection. Never delete or adopt it automatically.
 const slot={version:m.version,commit:m.commit,directory:`${m.version}-${m.commit}`},stage=path.join(resolved,'releases',slot.directory);
 await mkdir(stage);for(const [name,data] of files){const file=path.join(stage,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,data,{flag:'wx'});}
 await writeFile(path.join(stage,'.release-manifest.json'),JSON.stringify(m)+'\n',{flag:'wx'});
 for(const name of ['empty-npmrc','empty-global-npmrc'])await writeFile(path.join(resolved,name),'',{flag:'wx'});
 await (hooks.prepare??prepareRelease)(stage,resolved);await verifyInstalled(resolved,slot);
 await (hooks.health??healthCheck)(stage,m.version);await verifyInstalled(resolved,slot);
 const launcher=files.get('scripts/managed-launcher.mjs');await writeFile(path.join(resolved,'dot-connector.mjs'),launcher,{flag:'wx',mode:0o755});
 await writeFile(path.join(resolved,'managed.json'),JSON.stringify({schema:1,repository,launcherSha256:sha(launcher)})+'\n',{flag:'wx'});
 await writeFile(path.join(resolved,'dot-connector'),'#!/bin/sh\nexec /usr/bin/node "$(dirname "$0")/dot-connector.mjs" "$@"\n',{flag:'wx',mode:0o755});
 await atomicPointer(resolved,slot);
 const {unlink}=await import('node:fs/promises');await unlink(path.join(resolved,'lifecycle.lock'));
 return {installed:true,version:m.version,commit:m.commit,launcher:path.join(resolved,'dot-connector.mjs')};
}
