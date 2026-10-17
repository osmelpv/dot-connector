import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {runWizard} from '../src/configurator-wizard.mjs';

test('no arguments and help return useful JSON without creating a plan',()=>{
  for(const args of [[],['--help'],['help']]) {
    const r=spawnSync(process.execPath,['scripts/configure.mjs',...args],{encoding:'utf8'});
    assert.equal(r.status,0);
    const out=JSON.parse(r.stdout);
    assert.equal(out.command,'help'); assert.equal(out.ok,true);
    assert.match(JSON.stringify(out.result),/wizard/);
    assert.match(JSON.stringify(out.result),/draft/i);
    assert.equal(r.stderr,'');
  }
});
test('field errors teach label and platform-specific path rules without reflecting rejected input',async()=>{
  for(const platform of ['linux','windows']) {
    const shown=[];
    const values=['SECRET invalid','local','p','1',platform,'SECRET relative',platform==='linux'?'/fixture/project':'C:\\Projects\\Example','1','no','EXPORT'];
    await runWizard({ask:async()=>values.shift(),write:s=>shown.push(s)});
    const errors=shown.filter(s=>s.startsWith('Invalid answer'));
    assert.equal(errors.length,2);
    assert.match(errors[0],/letters/); assert.doesNotMatch(errors[0],/path/);
    assert.match(errors[1],platform==='linux'?/\/projects\/example/:/C:\\Projects\\Example/);
    assert.doesNotMatch(shown.join('\n'),/SECRET/);
    assert.match(shown.join('\n'),/Personal.*draft/);
    assert.match(shown.at(-1),/Plan generated; no connection created/);
  }
});
test('safe CLI guidance preserves error codes and does not echo unknown arguments',()=>{
  const r=spawnSync(process.execPath,['scripts/configure.mjs','SECRET_COMMAND'],{encoding:'utf8'});
  const out=JSON.parse(r.stdout);
  assert.equal(r.status,1); assert.equal(out.error,'CONFIGURATOR_COMMAND_UNAVAILABLE');
  assert.match(out.help,/--help/); assert.doesNotMatch(r.stdout,/SECRET_COMMAND/);
});
