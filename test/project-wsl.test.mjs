import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {prepareProjectWindowsBridge} from '../src/project-wsl.mjs';
async function fixture(t){const root=await mkdtemp(path.join(tmpdir(),'dot-setup-test-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
test('native Linux setup stops before filesystem or subprocess access',async()=>{
 let calls=0;await assert.rejects(prepareProjectWindowsBridge('/does-not-exist',{kernelRelease:'6.1-generic',run:async()=>{calls++;}}),/BRIDGE_REQUIRES_WSL/);assert.equal(calls,0);
});
test('setup cannot enter an occupied lifecycle lease',async t=>{
 const root=await fixture(t),lock=path.join(root,'lifecycle.lock');await writeFile(lock,'existing owner');let calls=0;
 await assert.rejects(prepareProjectWindowsBridge(root,{kernelRelease:'microsoft',run:async()=>{calls++;}}),/EEXIST/);
 assert.equal(await readFile(lock,'utf8'),'existing owner');assert.equal(calls,0);
});
test('invalid local release fails before interop and releases only its own setup lease',async t=>{
 const root=await fixture(t);let calls=0;
 await assert.rejects(prepareProjectWindowsBridge(root,{kernelRelease:'microsoft',run:async()=>{calls++;}}),/BRIDGE_PREPARATION_FAILED/);
 assert.equal(calls,0);await assert.rejects(access(path.join(root,'lifecycle.lock')),/ENOENT/);
 assert.equal(JSON.parse(await readFile(path.join(root,'logs/active.json'),'utf8')).state,'closed');
});
