import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {windowsToWsl,verifyWindowsBridge,verifyBridgeInventory} from '../src/windows-bridge.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function helper(t){
 const root=await mkdtemp(path.join(tmpdir(),'dot-bridge-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const names=['native-claim-store.mjs','native-claim-lease.mjs','native-owner.mjs','native-lifecycle.mjs','native-control.mjs','native-reader.mjs','native-supervisor.mjs','native-mcp-server.mjs','native-integration-server.mjs','manual-native-mcp.mjs','package.json','package-lock.json','DotConnector.Native.dll','DotConnector.NativeControl.exe','DotConnector.Owner.exe','node_modules/dependency/index.mjs'];
 const manifest={schema:1,version:'0.1.9',files:{}},source={repository:'osmelpv/dot-connector',version:'0.1.9',files:{}};
 for(const name of names){await mkdir(path.dirname(path.join(root,name)),{recursive:true});const bytes=Buffer.from('fixture '+name);await writeFile(path.join(root,name),bytes);manifest.files[name]=hash(bytes);if(name.endsWith('.mjs')&&!name.startsWith('node_modules'))source.files['src/'+name]=hash(bytes);if(name==='package.json'||name==='package-lock.json')source.files[name]=hash(bytes);}
 return {root,manifest,source};
}
test('Windows paths become data arguments and reject traversal, quotes, UNC and control characters',()=>{
 assert.equal(windowsToWsl('C:\\Program Files\\nodejs\\node.exe'),'/mnt/c/Program Files/nodejs/node.exe');
 for(const value of ['relative','\\\\server\\share','C:\\a\\..\\b','C:\\a/../b','C:\\a"\\b','C:\\a\n\\b','C:\\a\\b:stream'])assert.throws(()=>windowsToWsl(value),/BRIDGE_VALIDATION_FAILED/);
 assert.equal(windowsToWsl('C:\\literal;$(not-a-command)\\node.exe'),'/mnt/c/literal;$(not-a-command)/node.exe');
});
test('native Linux refuses Windows bridge before reading configuration',async()=>{
 await assert.rejects(verifyWindowsBridge('/not-read',{}, {release:'0.1.9',osrelease:'6.1.0-generic'}),/BRIDGE_REQUIRES_WSL/);
});
test('helper inventory verifies executed modules, native binaries and dependencies',async t=>{
 const f=await helper(t);assert.equal((await verifyBridgeInventory(f.root,f.manifest,f.source,'0.1.9')).files,16);
 await writeFile(path.join(f.root,'node_modules/dependency/index.mjs'),'tampered');await assert.rejects(verifyBridgeInventory(f.root,f.manifest,f.source,'0.1.9'),/BRIDGE_HELPER_MISMATCH/);
});
test('source mismatch, extra dependency files and deep directory trees fail before spawn',async t=>{
 const f=await helper(t);await assert.rejects(verifyBridgeInventory(f.root,f.manifest,{...f.source,version:'0.0.0'},'0.1.9'),/SOURCE_MISMATCH/);
 await writeFile(path.join(f.root,'node_modules/extra.mjs'),'unexpected');await assert.rejects(verifyBridgeInventory(f.root,f.manifest,f.source,'0.1.9'),/HELPER_MISMATCH/);await rm(path.join(f.root,'node_modules/extra.mjs'));
 await mkdir(path.join(f.root,'node_modules',...Array(18).fill('deep')),{recursive:true});await assert.rejects(verifyBridgeInventory(f.root,f.manifest,f.source,'0.1.9'),/HELPER_MISMATCH/);
});
test('dependency symlink cannot escape the verified helper root',async t=>{
 const f=await helper(t);await symlink(f.root,path.join(f.root,'node_modules/escape'));
 await assert.rejects(verifyBridgeInventory(f.root,f.manifest,f.source,'0.1.9'),/HELPER_MISMATCH/);
});
