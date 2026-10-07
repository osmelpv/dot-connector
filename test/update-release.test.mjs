import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {bootstrap,runUpdate,unpackArchive,resolveRelease,compareVersions} from '../src/update-release.mjs';
const exec=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
const launcher=await readFile(new URL('../scripts/managed-launcher.mjs',import.meta.url));
function tarFile(name,bytes,type='0'){
 const h=Buffer.alloc(512);h.write(name,0,100);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write(type,156);h.write('ustar\0',257);h.write('00',263);h.write([...h].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);
 return Buffer.concat([h,bytes,Buffer.alloc((512-bytes.length%512)%512)]);
}
function fixture(version='0.1.7',commit='a'.repeat(40),extra=[]){
 const files={'package.json':Buffer.from(JSON.stringify({name:'dot-connector',version,private:true})),'package-lock.json':Buffer.from('{}'),'scripts/dot-connector.mjs':Buffer.from(`process.on('beforeExit',()=>{if(process.send){process.send({event:'dot-cli-closed',lease:process.env.DOT_INSTALL_LEASE});process.disconnect();}});if(process.argv[2]==='session'){console.log('ready');process.stdin.resume();process.stdin.on('end',()=>{if(process.send)process.send({event:'dot-cli-closed',lease:process.env.DOT_INSTALL_LEASE},()=>process.exit(0));else process.exit(0);});}else console.log(JSON.stringify({ok:true,version:${JSON.stringify(version)}}));`),'scripts/managed-launcher.mjs':launcher,'src/update-release.mjs':Buffer.from('// fixture')};
 const archive=gzipSync(Buffer.concat([...Object.entries(files).map(([name,b])=>tarFile('dot-connector/'+name,b)),...extra,Buffer.alloc(1024)]));
 const manifest={schema:1,repository:'osmelpv/dot-connector',version,commit,archive:`dot-connector-${version}-source.tar.gz`,size:archive.length,sha256:hash(archive),files:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,hash(b)]))};
 const m=Buffer.from(JSON.stringify(manifest)),url=`https://github.com/osmelpv/dot-connector/releases/download/v${version}/`;
 const release={id:7,draft:false,prerelease:true,published_at:'2026-10-07T00:00:00Z',tag_name:'v'+version,assets:[{name:`update-manifest-${version}.json`,state:'uploaded',browser_download_url:url+`update-manifest-${version}.json`,digest:'sha256:'+hash(m)},{name:manifest.archive,state:'uploaded',size:archive.length,browser_download_url:url+manifest.archive,digest:'sha256:'+hash(archive)}]};
 return {release,manifest,archive,download:async target=>{if(target.endsWith(`/releases/tags/v${version}`))return Buffer.from(JSON.stringify(release));if(target.endsWith(`/git/ref/tags/v${version}`))return Buffer.from(JSON.stringify({object:{type:'commit',sha:commit}}));if(target.endsWith('.json'))return m;if(target.endsWith('.tar.gz'))return archive;throw Error('network unavailable');}};
}
async function installed(t){
 const parent=await mkdtemp(path.join(tmpdir(),'dot-update-test-'));t.after(()=>rm(parent,{recursive:true,force:true}));const root=path.join(parent,'installed');
 const first=fixture();await bootstrap(root,'0.1.7',{download:first.download,prepare:async()=>{}});
 const lease=randomUUID();await writeFile(path.join(root,'lifecycle.lock'),JSON.stringify({lease}));
 return {root,lease,first};
}
test('managed update stages verified release, retains opaque user files and supports offline rollback',async t=>{
 const {root,lease}=await installed(t),next=fixture('0.1.8','b'.repeat(40));
 await mkdir(path.join(root,'user','profiles'));for(const name of ['config.json','credentials','profiles/custom'])await writeFile(path.join(root,'user',name),'opaque-'+name);
 await writeFile(path.join(root,'user','operation.lock'),'consumed');
 const result=await runUpdate(root,lease,{version:'0.1.8'},{download:next.download,prepare:async()=>{}});assert.equal(result.version,'0.1.8');
 for(const name of ['config.json','credentials','profiles/custom'])assert.equal(await readFile(path.join(root,'user',name),'utf8'),'opaque-'+name);
 assert.equal(await readFile(path.join(root,'user','operation.lock'),'utf8'),'consumed');
 const rollback=await runUpdate(root,lease,{rollback:true});assert.equal(rollback.version,'0.1.7');assert.equal(rollback.rollback,true);
});
test('checksum corruption never prepares or activates a release',async t=>{
 const {root,lease}=await installed(t),next=fixture('0.1.8','b'.repeat(40));const before=await readFile(path.join(root,'current.json'));
 const download=async url=>url.endsWith('.tar.gz')?Buffer.alloc(next.archive.length):next.download(url);
 await assert.rejects(runUpdate(root,lease,{version:'0.1.8'},{download,prepare:async()=>assert.fail('must not prepare')}),/CHECKSUM/);
 assert.deepEqual(await readFile(path.join(root,'current.json')),before);
});
test('network failure keeps current release usable and check does not download archive',async t=>{
 const {root,lease}=await installed(t),before=await readFile(path.join(root,'current.json')),next=fixture('0.1.8','b'.repeat(40));
 await assert.rejects(runUpdate(root,lease,{version:'0.1.8'},{download:async()=>{throw Error('network failure');}}));assert.deepEqual(await readFile(path.join(root,'current.json')),before);
 const checked=await runUpdate(root,lease,{version:'0.1.8',check:true},{download:async url=>{assert.ok(!url.endsWith('.tar.gz'));return next.download(url);}});assert.equal(checked.changed,true);assert.deepEqual(await readFile(path.join(root,'current.json')),before);
});
test('partial activation failure restores known-good pointer',async t=>{
 const {root,lease}=await installed(t),next=fixture('0.1.8','b'.repeat(40)),before=await readFile(path.join(root,'current.json'));
 await assert.rejects(runUpdate(root,lease,{version:'0.1.8'},{download:next.download,prepare:async()=>{},activate:async(root,pointer)=>{await writeFile(path.join(root,'current.json'),JSON.stringify(pointer));throw Error('disk error after replace');}}),/ACTIVATION_FAILED_ROLLED_BACK/);
 assert.deepEqual(await readFile(path.join(root,'current.json')),before);
});
test('dependency preparation failure leaves prior pointer and no active new release',async t=>{
 const {root,lease}=await installed(t),next=fixture('0.1.8','b'.repeat(40)),before=await readFile(path.join(root,'current.json'));
 await assert.rejects(runUpdate(root,lease,{version:'0.1.8'},{download:next.download,prepare:async()=>{throw Error('npm failed');}}));assert.deepEqual(await readFile(path.join(root,'current.json')),before);
});
test('archive traversal, links and duplicate source files are rejected before extraction',()=>{
 for(const extra of [tarFile('dot-connector/../outside',Buffer.from('x')),tarFile('dot-connector/src/link.mjs',Buffer.alloc(0),'2'),tarFile('dot-connector/package.json',Buffer.from('{}'))]){
  const f=fixture('0.1.7','a'.repeat(40),[extra]);assert.throws(()=>unpackArchive(f.archive,f.manifest),/UPDATE_/);
 }
});
test('real managed launcher rejects update while another managed session owns lifecycle lock',async t=>{
 const {root}=await installed(t);await rm(path.join(root,'lifecycle.lock'));
 const child=spawn(process.execPath,[path.join(root,'dot-connector.mjs'),'session'],{stdio:['pipe','pipe','pipe']});
 const exited=new Promise(resolve=>child.once('close',resolve));
 try{
  await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.once('data',resolve);});
  await assert.rejects(exec(process.execPath,[path.join(root,'dot-connector.mjs'),'update','--version','0.1.8']),e=>JSON.parse(e.stdout).error==='UPDATE_SESSION_OR_OPERATION_ACTIVE');
 }finally{child.stdin.end();await exited;}
 await assert.rejects(access(path.join(root,'lifecycle.lock')),{code:'ENOENT'});
});
test('bootstrap refuses existing root and never modifies its configuration',async t=>{
 const {root}=await installed(t),f=fixture();const sentinel=path.join(root,'user','credentials');await writeFile(sentinel,'opaque');
 await assert.rejects(bootstrap(root,'0.1.7',{download:f.download,prepare:async()=>{}}));assert.equal(await readFile(sentinel,'utf8'),'opaque');
});


test('failed health after pointer activation restores previous release',async t=>{
 const {root,lease}=await installed(t),next=fixture('0.1.8','b'.repeat(40)),before=await readFile(path.join(root,'current.json'));let healthCalls=0;
 await assert.rejects(runUpdate(root,lease,{version:'0.1.8'},{download:next.download,prepare:async()=>{},health:async(dir,version)=>{if(version==='0.1.8'&&++healthCalls===3)throw Error('health failed');}}),/ACTIVATION_FAILED_ROLLED_BACK/);
 assert.deepEqual(await readFile(path.join(root,'current.json')),before);
});
test('staged source mutation is rejected before invoking release code',async t=>{
 const {root,lease}=await installed(t),next=fixture('0.1.8','b'.repeat(40));let healthCalled=false;
 await assert.rejects(runUpdate(root,lease,{version:'0.1.8'},{download:next.download,prepare:async dir=>writeFile(path.join(dir,'scripts/dot-connector.mjs'),'changed'),health:async()=>{healthCalled=true;}}),/INSTALLED_SOURCE_CHANGED/);
 assert.equal(healthCalled,false);
});


test('stable latest 404 returns no candidate without mutation, other errors remain failures',async t=>{
 const {root,lease}=await installed(t),before=await readFile(path.join(root,'current.json'));
 const missing=async url=>{assert.ok(url.endsWith('/releases/latest'));throw Object.assign(Error('missing'),{status:404});};
 for(const check of [true,false]){const result=await runUpdate(root,lease,{check},{download:missing});assert.equal(result.available,null);assert.equal(result.reason,'NO_PUBLISHED_RELEASE_IN_CHANNEL');assert.equal(result.changed,false);}
 assert.deepEqual(await readFile(path.join(root,'current.json')),before);
 await assert.rejects(runUpdate(root,lease,{check:true},{download:async()=>{throw Object.assign(Error('rate limit'),{status:403});}}),/rate limit/);
});
test('experimental selects highest numeric semver published prerelease, then verifies its pinned assets',async()=>{
 const high=fixture('0.10.0','b'.repeat(40)),low=fixture('0.9.0','c'.repeat(40));
 const list=[low.release,{...high.release,tag_name:'v9.0.0',draft:true},{...high.release,tag_name:'v8.0.0',prerelease:false},{...high.release,tag_name:'v01.99.0'},{...high.release,tag_name:'v10.0.0-beta'},high.release];
 const download=async url=>url.includes('/releases?')?Buffer.from(JSON.stringify(list)):high.download(url);
 const result=await resolveRelease(undefined,download,'experimental');assert.equal(result.manifest.version,'0.10.0');assert.equal(compareVersions('1.0.0','0.999.999')>0,true);
 assert.throws(()=>compareVersions('01.0.0','1.0.0'),/INVALID_VERSION/);
});
test('empty experimental list returns no candidate; ambiguous or truncated lists fail closed',async()=>{
 assert.equal(await resolveRelease(undefined,async()=>Buffer.from('[]'),'experimental'),null);
 const f=fixture();await assert.rejects(resolveRelease(undefined,async()=>Buffer.from(JSON.stringify([f.release,f.release])),'experimental'),/AMBIGUOUS/);
 let pages=0;await assert.rejects(resolveRelease(undefined,async()=>{pages++;return Buffer.from(JSON.stringify(Array(100).fill({draft:true})));},'experimental'),/LIST_LIMIT/);assert.equal(pages,3);
});
test('pinned version retains checksum and missing asset failures even when status is 404',async()=>{
 const f=fixture('0.1.8','b'.repeat(40));
 assert.equal((await resolveRelease('0.1.8',f.download)).manifest.commit,'b'.repeat(40));
 await assert.rejects(resolveRelease('0.1.8',async url=>{if(url.endsWith('.json'))return Buffer.from('{}');return f.download(url);}),/MANIFEST_CHECKSUM_MISMATCH/);
 await assert.rejects(resolveRelease('0.1.8',async url=>{if(url.endsWith('.json'))throw Object.assign(Error('asset missing'),{status:404});return f.download(url);}),/asset missing/);
});
test('automatic channel does not downgrade and same-version changed commit is rejected',async t=>{
 const {root,lease}=await installed(t),old=fixture('0.1.6','b'.repeat(40));
 const download=async url=>url.includes('/releases?')?Buffer.from(JSON.stringify([old.release])):old.download(url);
 const result=await runUpdate(root,lease,{channel:'experimental'},{download});assert.equal(result.reason,'NO_NEWER_RELEASE_IN_CHANNEL');assert.equal(result.updated,false);
 const changed=fixture('0.1.7','b'.repeat(40));await assert.rejects(runUpdate(root,lease,{version:'0.1.7'},{download:changed.download}),/IDENTITY_CHANGED/);
});
test('version and channel are mutually exclusive and invalid channels are refused',async t=>{
 const {root,lease}=await installed(t);await assert.rejects(runUpdate(root,lease,{version:'0.1.8',channel:'experimental'}),/EXCLUSIVE/);
 await assert.rejects(resolveRelease(undefined,async()=>assert.fail('no network'),'other'),/INVALID_CHANNEL/);
});
