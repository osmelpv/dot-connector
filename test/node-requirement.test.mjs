import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {REQUIRED_NODE_MAJOR,checkNodeVersion} from '../scripts/check-node.mjs';
test('declared engines and lockfile root match the Node 22 runtime requirement',async()=>{
 const pkg=JSON.parse(await readFile('package.json','utf8')),lock=JSON.parse(await readFile('package-lock.json','utf8'));
 assert.equal(REQUIRED_NODE_MAJOR,'22');assert.equal(pkg.engines.node,'22.x');assert.equal(lock.packages[''].engines.node,'22.x');
});
test('preflight accepts Node 22 and refuses other majors with an actionable message',()=>{
 for(const v of ['v22.0.0','22.23.3'])assert.deepEqual(checkNodeVersion(v),{ok:true,version:v.replace(/^v/,''),required:'22.x'});
 for(const v of ['v20.19.0','v23.0.0','v24.21.0']){const r=checkNodeVersion(v);assert.equal(r.ok,false);assert.equal(r.code,'NODE_22_REQUIRED');
  assert.ok(r.message.includes(`found ${v.replace(/^v/,'')}`)&&r.message.includes('Node 22.x')&&r.message.includes('CONTRIBUTING.md'),r.message);}
 assert.equal(checkNodeVersion('not-a-version').ok,false);
});
test('preflight CLI exits zero on the current Node 22 runtime without stderr',async()=>{
 const {stdout,stderr}=await promisify(execFile)(process.execPath,['scripts/check-node.mjs'],{timeout:5000});
 assert.equal(stderr,'');assert.deepEqual(JSON.parse(stdout),{ok:true,version:process.versions.node,required:'22.x'});
});
