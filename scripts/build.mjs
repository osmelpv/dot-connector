import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
export async function sources(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())result.push(...await sources(p));else result.push(p);}return result.sort();}
const files=[...(await sources('src')),...(await sources('profiles'))];
const manifest={version:JSON.parse(await readFile('package.json','utf8')).version,files:{}};
for(const file of files){if(file.endsWith('.mjs'))execFileSync(process.execPath,['--check',file],{stdio:'pipe'});const bytes=await readFile(file);if(file.endsWith('.json'))JSON.parse(bytes);manifest.files[file.replaceAll('\\','/')]=createHash('sha256').update(bytes).digest('hex');}
await mkdir('dist',{recursive:true});await writeFile('dist/build-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Validated ${files.length} source/profile files; deterministic SHA-256 manifest written. Native JS needs no transpilation.`);
