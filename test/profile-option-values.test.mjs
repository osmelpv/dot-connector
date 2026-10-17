import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createPlan, validatePlan} from '../src/configurator.mjs';
import {duplicateProfile} from '../src/profile-plans.mjs';

const request = () => ({schemaVersion: 1, machineId: 'fixture', profiles: [{
  profileId: '--source', mode: 'Personal',
  folder: {platform: 'linux', path: '/fixture/source'},
  destination: {kind: 'local', id: 'local-preview'}
}]});
const run = (...args) => spawnSync(process.execPath, ['scripts/configure.mjs', ...args], {
  encoding: 'utf8', input: 'EXPORT\n'
});
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'dot-option-values-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const file = path.join(root, 'plan=fixture.json');
  const original = JSON.stringify(createPlan(request()));
  await writeFile(file, original);
  return {root, file, original};
}

test('shared schema and duplication support labels beginning with double hyphens', () => {
  const result = duplicateProfile(createPlan(request()), {
    schemaVersion: 1, from: '--source', name: '--copy',
    folder: {platform: 'linux', path: '/fixture/copy'}
  });
  assert.equal(result.intent.profiles[1].profileId, '--copy');
  assert.equal(validatePlan(result).valid, true);
});

test('real CLI reproduces separated-value ambiguity and supports explicit equals values without changing original', async t => {
  const {root, file, original} = await fixture(t);
  assert.equal(run('profiles', 'list', '--file', file).status, 0);
  const ambiguous = run('profiles', 'duplicate', '--file', file, '--from', '--source', '--name', 'copy', '--platform', 'linux', '--folder', '/fixture/copy');
  assert.equal(ambiguous.status, 1);
  assert.equal(JSON.parse(ambiguous.stdout).error, 'CONFIGURATOR_OPTIONS');
  const result = run('profiles', 'duplicate', `--file=${file}`, '--from=--source', '--name=--copy', '--platform=linux', '--folder=/fixture/copy=with-equals', '--json');
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.stderr, '');
  const plan = JSON.parse(result.stdout).result;
  assert.equal(plan.intent.profiles[1].profileId, '--copy');
  assert.equal(plan.intent.profiles[1].folder.path, '/fixture/copy=with-equals');
  assert.equal(validatePlan(plan).valid, true);
  assert.equal(await readFile(file, 'utf8'), original);
  assert.deepEqual(await readdir(root), ['plan=fixture.json']);
});

test('equals file syntax composes with every file command and wizard TTY checks', async t => {
  const {root, file} = await fixture(t);
  for (const command of ['validate', 'review', 'status']) assert.equal(run(command, `--file=${file}`).status, 0);
  assert.equal(run('profiles', 'list', `--file=${file}`, '--json').status, 0);
  const input = path.join(root, 'request.json'); await writeFile(input, JSON.stringify(request()));
  assert.equal(run('plan', `--file=${input}`).status, 0);
  assert.equal(run('review', `--file=${file}`, '--human').status, 0);
  const wizard = run('wizard', `--file=${file}`);
  assert.equal(wizard.status, 1);
  assert.equal(JSON.parse(wizard.stdout).error, 'CONFIGURATOR_TTY_REQUIRED');
});

test('equals syntax rejects empty, repeated, unknown and boolean-valued options without reflecting values', async t => {
  const {file} = await fixture(t);
  for (const args of [
    ['profiles', 'list', '--file='],
    ['profiles', 'list', `--file=${file}`, '--file', file],
    ['profiles', 'list', '--file', file, `--file=${file}`],
    ['profiles', 'list', `--file=${file}`, '--json=true'],
    ['profiles', 'list', `--file=${file}`, '--token=SYNTHETIC_FORBIDDEN'],
    ['profiles', 'duplicate', `--file=${file}`, '--from=', '--name=copy', '--platform=linux', '--folder=/fixture/copy'],
    ['wizard', '--file='], ['wizard', `--file=${file}`, '--file', file],
    ['wizard', '--token=SYNTHETIC_FORBIDDEN'], ['review', `--file=${file}`, '--human=true']
  ]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).error, 'CONFIGURATOR_OPTIONS');
    assert.equal(result.stderr, '');
    assert(!result.stdout.includes('SYNTHETIC_FORBIDDEN'));
  }
});
