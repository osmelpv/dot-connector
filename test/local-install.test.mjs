import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm,access,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {installLocal} from '../src/local-install.mjs';import {bootstrap} from '../src/update-release.mjs';
const exec=promisify(execFile);
test('local archive installer consent, integrity, paths and isolated diagnostic lifecycle',async t=>{
 const parent=await mkdtemp(path.join(tmpdir(),'dot-local-install-test-'));t.after(()=>rm(parent,{recursive:true,force:true}));const bundle=path.join(parent,'bundle');await exec(process.execPath,['scripts/package-local.mjs',bundle]);
 const opts={root:path.join(parent,'project-install'),archive:path.join(bundle,'dot-connector-0.1.10-source.tar.gz'),manifest:path.join(bundle,'local-manifest.json')};
 const result=await installLocal(opts,{kernelRelease:'microsoft'});assert.equal(result.reason,'WINDOWS_PREPARATION_CONSENT_REQUIRED');await assert.rejects(access(opts.root),/ENOENT/);
 assert.equal((await installLocal(opts,{kernelRelease:'generic'})).reason,'NATIVE_LINUX_CONTROL_UNSUPPORTED');
 await assert.rejects(installLocal({...opts,root:'relative'}),/ABSOLUTE_PATH/);
 await assert.rejects(installLocal({...opts,bridgeConfig:'/unused',diagnosticOnly:true}),/MODES_EXCLUSIVE/);
 const link=path.join(parent,'link.tar.gz');await symlink(opts.archive,link);await assert.rejects(installLocal({...opts,archive:link}),/UNSAFE_PATH/);
 const corrupt=path.join(parent,'bad.tar.gz');await writeFile(corrupt,'bad');await assert.rejects(installLocal({...opts,archive:corrupt}),/CHECKSUM/);
 const installed=await installLocal({...opts,diagnosticOnly:true},{prepare:async()=>{},health:async()=>{}});assert.equal(installed.installed,true);assert.equal(installed.capabilities.terminalInput,false);await assert.rejects(access(path.join(opts.root,'lifecycle.lock')),/ENOENT/);
 await assert.rejects(installLocal({...opts,diagnosticOnly:true}),/DESTINATION_EXISTS/);
 const pending=path.join(parent,'finalize-failure');const manifest=JSON.parse(await readFile(opts.manifest));
 await assert.rejects(bootstrap(pending,manifest.version,{localRelease:{manifest,bytes:await readFile(opts.archive)},prepare:async()=>{},health:async()=>{},finalize:async root=>{await access(path.join(root,'lifecycle.lock'));throw Error('FINALIZE_REJECTED');}}),/FINALIZE_REJECTED/);
 await access(path.join(pending,'lifecycle.lock'));
 // Hold a synthetic owner lease; real launcher must refuse control and permit only metadata.
 const lock=path.join(opts.root,'lifecycle.lock');await writeFile(lock,'owner');
 await assert.rejects(exec(process.execPath,[path.join(opts.root,'dot-connector.mjs'),'session']),e=>e.stdout.includes('UPDATE_SESSION_OR_OPERATION_ACTIVE'));
 assert.equal(await readFile(lock,'utf8'),'owner');
});
