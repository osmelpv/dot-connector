import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createPlan, validatePlan, canonical} from '../src/configurator.mjs';
import {runWizard} from '../src/configurator-wizard.mjs';

const plan = (count = 1) => createPlan({
  schemaVersion: 1, machineId: 'fixture',
  profiles: Array.from({length: count}, (_, i) => ({
    profileId: `p${i}`, mode: 'Proyecto',
    folder: {platform: 'linux', path: `/fixture/project-${i}`},
    destination: {kind: 'remote', id: 'disconnected-alias'},
    permissions: {read_files: true, modify_files: true, execute: true, read_output: true}
  }))
});
const steps = ['duplicate', 'p0', 'copy', 'linux', '/fixture/new-project', 'export', 'EXPORT'];
async function run(source, answers) {
  const text = []; let index = 0;
  const result = await runWizard({plan: source, ask: async () => answers[index++] ?? null, write: value => text.push(value)});
  return {result, text, index};
}

test('existing-plan wizard lists profiles, duplicates with zero access and explicitly exports the validated draft', async () => {
  const source = plan(), original = canonical(source);
  const {result, text} = await run(source, steps);
  assert.equal(validatePlan(result).approved, false);
  assert.equal(result.intent.profiles[1].profileId, 'copy');
  assert(Object.values(result.intent.profiles[1].permissions).every(value => value === false));
  assert.deepEqual(result.intent.profiles[1].destination, {kind: 'local', id: 'local-preview'});
  assert.notEqual(result.digest, source.digest);
  assert(text.join('\n').includes('p0'));
  assert(text.join('\n').includes('Capabilities reset to false'));
  assert(text.join('\n').includes(result.digest));
  assert.equal(canonical(source), original);
});

test('cancellation at every loaded-plan prompt preserves original and emits no plan', async () => {
  const source = plan(), before = canonical(source);
  for (let i = 0; i < steps.length; i++) {
    for (const cancel of [null, ':cancel']) await assert.rejects(run(source, [...steps.slice(0, i), cancel]), /CONFIGURATOR_CANCELLED/);
    assert.equal(canonical(source), before);
  }
});

test('invalid choices and collisions retry without changing source; no automatic export', async () => {
  const source = plan(), before = canonical(source);
  const {result} = await run(source, ['wrong', 'duplicate', 'missing', 'p0', 'p0', 'copy', 'linux', '/fixture/project-0', '/fixture/new-project', 'export', '', 'yes', 'EXPORT']);
  assert.equal(result.intent.profiles.length, 2);
  assert.equal(canonical(source), before);
  await assert.rejects(run(source, ['export', '', 'yes', 'y']), /CONFIGURATOR_INVALID_ANSWER/);
});

test('loaded eight-profile draft can export unchanged but cannot duplicate a ninth', async () => {
  const source = plan(8), {result, text} = await run(source, ['duplicate', 'export', 'EXPORT']);
  assert.deepEqual(result, source);
  assert.notEqual(result, source);
  assert(text.join('\n').includes('eight profiles'));
});

test('secret and unknown fields in loaded plan fail before any value or prompt is displayed', async () => {
  for (const field of ['secret', 'token', 'grant', 'runtimeIdentity']) {
    const source = plan(); source.intent.profiles[0][field] = 'SYNTHETIC_FORBIDDEN';
    const shown = [];
    await assert.rejects(runWizard({plan: source, ask: async () => { shown.push('prompt'); return null; }, write: value => shown.push(value)}), /PLAN_INVALID_SCHEMA/);
    assert(!shown.join('\n').includes('SYNTHETIC_FORBIDDEN'));
    assert(!shown.includes('prompt'));
  }
});

test('wizard --file in nonTTY returns actionable error without loading a named file', () => {
  const result = spawnSync(process.execPath, ['scripts/configure.mjs', 'wizard', '--file', '/fixture/missing-plan.json'], {encoding: 'utf8', input: 'EXPORT\n'});
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).error, 'CONFIGURATOR_TTY_REQUIRED');
  assert.equal(result.stderr, '');
});
