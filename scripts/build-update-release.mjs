#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const output=process.argv[2];if(!output||!path.isAbsolute(output))throw Error('Absolute existing output directory required');
if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Commit reviewed source first');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),version=JSON.parse(await readFile('package.json','utf8')).version;
const archive=`dot-connector-${version}-source.tar.gz`,destination=path.join(output,archive);
execFileSync('git',['archive','--format=tar.gz','--prefix=dot-connector/','-o',destination,commit]);
const hash=b=>createHash('sha256').update(b).digest('hex'),bytes=await readFile(destination),files={};
for(const name of execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))files[name]=hash(await readFile(name));
await writeFile(path.join(output,`update-manifest-${version}.json`),JSON.stringify({schema:1,repository:'osmelpv/dot-connector',version,commit,archive,size:bytes.length,sha256:hash(bytes),files},null,2)+'\n');
console.log(JSON.stringify({version,commit,archive,sha256:hash(bytes),files:Object.keys(files).length}));
