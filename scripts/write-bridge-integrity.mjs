#!/usr/bin/env node
// Run only after isolated preparation from the pinned release. No terminal access.
import path from 'node:path';
import {readFile,readdir,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=process.argv[2];if(process.platform!=='win32'||!root||!path.isAbsolute(root))throw Error('Explicit prepared Windows directory required');
const files={};const names=['native-control.mjs','native-reader.mjs','native-supervisor.mjs','native-mcp-server.mjs','native-integration-server.mjs','manual-native-mcp.mjs','package.json','package-lock.json','DotConnector.Native.dll','DotConnector.NativeControl.exe'];
async function record(relative){const file=path.join(root,relative),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)throw Error('Unexpected helper file');files[relative.replaceAll('\\','/')]=createHash('sha256').update(await readFile(file)).digest('hex');}
async function walk(relative){for(const e of await readdir(path.join(root,relative),{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Helper symlink refused');const name=path.join(relative,e.name);if(e.isDirectory())await walk(name);else await record(name);}}
for(const name of names)await record(name);await walk('node_modules');
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const bytes=JSON.stringify({schema:1,version,files},null,2)+'\n';await writeFile(path.join(root,'bridge-integrity.json'),bytes,{flag:'wx'});
console.log(JSON.stringify({version,files:Object.keys(files).length,manifestSha256:createHash('sha256').update(bytes).digest('hex'),nativeCalls:false}));
