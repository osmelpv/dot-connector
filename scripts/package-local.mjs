#!/usr/bin/env node
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {gzipSync} from 'node:zlib';
import {validateManifest,unpackArchive} from '../src/update-release.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function tar(name,bytes){const h=Buffer.alloc(512);if(Buffer.byteLength(name)>100)throw Error('LOCAL_PATH_TOO_LONG');h.write(name);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write('0',156);h.write('ustar\0',257);h.write('00',263);h.write([...h].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);return Buffer.concat([h,bytes,Buffer.alloc((512-bytes.length%512)%512)]);}
try{
 const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dest=process.argv[2];if(process.argv.length!==3||!path.isAbsolute(dest??''))throw Error('LOCAL_ABSOLUTE_PATH_REQUIRED');
 const names=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:source}).toString().split('\0').filter(Boolean))].sort(),files={},chunks=[];let unpacked=1024;if(names.length>256)throw Error('LOCAL_PACKAGE_TOO_LARGE');
 for(const name of names){const file=path.join(source,name),s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>1024*1024||await realpath(file)!==file)throw Error('LOCAL_UNSAFE_PATH');unpacked+=512+Math.ceil(s.size/512)*512;if(unpacked>20*1024*1024)throw Error('LOCAL_PACKAGE_TOO_LARGE');const b=await readFile(file);files[name]=hash(b);chunks.push(tar('dot-connector/'+name,b));}
 const version=JSON.parse(await readFile(path.join(source,'package.json'))).version,bytes=gzipSync(Buffer.concat([...chunks,Buffer.alloc(1024)])),commit=hash(JSON.stringify(files)).slice(0,40);
 const manifest={schema:1,repository:'osmelpv/dot-connector',version,commit,archive:`dot-connector-${version}-source.tar.gz`,sha256:hash(bytes),size:bytes.length,files};validateManifest(manifest,version,commit);unpackArchive(bytes,manifest);
 await mkdir(dest);await writeFile(path.join(dest,manifest.archive),bytes,{flag:'wx'});await writeFile(path.join(dest,'local-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({localUnpublished:true,identity:'content-derived; not a Git commit or authenticated release',archive:path.join(dest,manifest.archive),manifest:path.join(dest,'local-manifest.json'),sha256:manifest.sha256}));
}catch(e){console.error(/^(LOCAL|UPDATE)_[A-Z_]+$/.test(e.message)?e.message:'LOCAL_PACKAGE_FAILED');process.exitCode=1;}
