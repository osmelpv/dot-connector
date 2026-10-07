import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {AtomicClaimFile} from '../src/native-claim-store.mjs';
async function fixture(t){const dir=await mkdtemp(path.join(tmpdir(),'dot-claim-'));t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,file:path.join(dir,'claim.json')};}
test('real files: exact owner release, clean reacquire and replaced owner refusal',async t=>{
 const {file}=await fixture(t),s=new AtomicClaimFile(file);
 assert.equal(await s.compareExchange('',null,'a'),true);assert.equal(await s.compareExchange('','b',null),false);
 assert.equal(await s.compareExchange('','a',null),true);assert.equal(await s.compareExchange('',null,'c'),true);
 assert.equal(await s.compareExchange('','a',null),false);assert.equal(await readFile(file,'utf8'),'c');
});
test('crash guard, legacy claim and corrupt partial claim never reclaimed',async t=>{
 const {file}=await fixture(t),s=new AtomicClaimFile(file);
 await mkdir(file+'.guard');await assert.rejects(s.compareExchange('',null,'new'),/EEXIST/);
 const f2=file+'2';await writeFile(f2,'legacy');assert.equal(await new AtomicClaimFile(f2).compareExchange('',null,'new'),false);
 const f3=file+'3';await writeFile(f3,'partial');assert.equal(await new AtomicClaimFile(f3).compareExchange('',null,'new'),false);
});
test('multiple OS processes and legacy wx contenders never overwrite a winner',async t=>{
 const {dir}=await fixture(t);
 const source=new URL('../src/native-claim-store.mjs',import.meta.url).href;
 const child=path.join(dir,'contender.mjs');
 await writeFile(child,`import {writeFile} from 'node:fs/promises';import {AtomicClaimFile} from ${JSON.stringify(source)};
 const [file,kind,value]=process.argv.slice(2);try{const won=kind==='legacy'?(await writeFile(file,value,{flag:'wx'}),true):await new AtomicClaimFile(file).compareExchange('',null,value);process.stdout.write(won?'won':'lost');}catch{process.stdout.write('lost');}`);
 for(let round=0;round<4;round++){
  const file=path.join(dir,'race'+round);
  const results=await Promise.all(Array.from({length:8},(_,i)=>new Promise((resolve,reject)=>{
   const c=spawn(process.execPath,[child,file,i%3===0?'legacy':'new',String(i)],{stdio:['ignore','pipe','pipe'],windowsHide:true});
   let out='';c.stdout.on('data',b=>out+=b);c.stderr.resume();c.on('error',reject);c.on('close',code=>code===0?resolve({i,won:out==='won'}):reject(Error('fixture failed')));
  })));
  const winners=results.filter(x=>x.won);assert.equal(winners.length,1);assert.equal(await readFile(file,'utf8'),String(winners[0].i));
 }
});
test('guard from uncertain mutation and directory aliases refuse reuse',async t=>{
 const {file}=await fixture(t);await mkdir(file);const s=new AtomicClaimFile(file);
 await assert.rejects(s.compareExchange('',null,'x'),/INVALID/);assert.ok((await lstat(file+'.guard')).isDirectory());
 await assert.rejects(s.compareExchange('',null,'x'),/EEXIST/);
});
