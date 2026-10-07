import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('experimental console source has no product/native activation path or global input fallback',async()=>{
 const s=await readFile(new URL('../src/native-console-prototype.cs',import.meta.url),'utf8');
 assert.equal(/new WindowsApi\s*\(/.test(s),false);assert.equal(/SendInput|SetForegroundWindow|SetFocus|ATTACH_PARENT_PROCESS/.test(s),false);assert.ok(s.includes('args[0]!="--self-test"')); // executable accepts self-test only
 for(const file of ['../scripts/prepare-native-manual.ps1','../src/native-integration-server.mjs','../scripts/dot-connector.mjs'])assert.equal((await readFile(new URL(file,import.meta.url),'utf8')).includes('ConsolePrototype'),false);
});
