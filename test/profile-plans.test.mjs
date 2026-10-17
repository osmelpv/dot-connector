import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createPlan, validatePlan, canonical} from '../src/configurator.mjs';

const api = () => import('../src/profile-plans.mjs');
const profile = (i = 0) => ({
  profileId: `p${i}`, mode: 'Proyecto',
  folder: {platform: 'linux', path: `/fixture/project-${i}`},
  destination: {kind: 'remote', id: 'unconnected-alias'},
  permissions: {read_files: true, modify_files: true, execute: true, read_output: true}
});
const plan = (count = 1) => createPlan({schemaVersion: 1, machineId: 'fixture', profiles: Array.from({length: count}, (_, i) => profile(i))});
const options = () => ({schemaVersion: 1, from: 'p0', name: 'copy', folder: {platform: 'linux', path: '/fixture/new-project'}});

test('list validates source and returns detached, explicitly unavailable draft profiles', async () => {
  const {listProfiles} = await api(), source = plan(), before = canonical(source);
  const result = listProfiles(source);
  assert.equal(result.kind, 'profile-list');
  assert.equal(result.digest, source.digest);
  assert.equal(result.executable, false);
  assert.equal(result.profiles[0].available, false);
  assert.equal(result.profiles[0].folderVerified, false);
  assert.equal(result.profiles[0].isolation.state, 'unavailable');
  result.profiles[0].folder.path = '/changed';
  assert.equal(canonical(source), before);
});

test('duplicate resets capabilities and destination, retains mode, recomputes pending policy without mutating original', async () => {
  const {duplicateProfile} = await api(), source = plan(), before = canonical(source);
  const result = duplicateProfile(source, options()), copy = result.intent.profiles[1];
  assert.equal(copy.profileId, 'copy'); assert.equal(copy.mode, 'Proyecto');
  assert.deepEqual(copy.destination, {kind: 'local', id: 'local-preview'});
  assert(Object.values(copy.permissions).every(value => value === false));
  assert.equal(result.approval, 'pending'); assert.equal(validatePlan(result).approved, false);
  assert.notEqual(result.digest, source.digest);
  assert.deepEqual(result.assessment.pendingActions.filter(a => a.profileId === 'copy').map(a => a.action), ['configure_profile', 'verify_isolation']);
  assert.equal(canonical(source), before);
  result.intent.profiles[0].folder.path = '/changed';
  assert.equal(canonical(source), before);
});

test('same validated source and options yield identical digest independent of object key order', async () => {
  const {duplicateProfile} = await api(), source = plan(), o = options();
  const first = duplicateProfile(source, o);
  const second = duplicateProfile(source, {folder: {path: o.folder.path, platform: 'linux'}, name: o.name, from: o.from, schemaVersion: 1});
  assert.equal(first.digest, second.digest);
  assert.equal(validatePlan(second).valid, true);
});

test('collisions, missing source, ninth profile and invalid normalized paths fail without changes', async () => {
  const {duplicateProfile} = await api(), source = plan(), before = canonical(source);
  for (const o of [
    {...options(), name: 'p0'}, {...options(), from: 'missing'},
    {...options(), folder: source.intent.profiles[0].folder},
    {...options(), folder: {platform: 'linux', path: '/fixture/project-0/'}},
    {...options(), folder: {platform: 'linux', path: 'relative'}},
    {...options(), folder: {platform: 'linux', path: '/a/../b'}},
    {...options(), name: 'bad name'}, {...options(), schemaVersion: 2}
  ]) assert.throws(() => duplicateProfile(source, o), /CONFIGURATOR_/);
  assert.throws(() => duplicateProfile(plan(8), options()), /CONFIGURATOR_PROFILE_LIMIT/);
  assert.equal(canonical(source), before);
  const sep = String.fromCharCode(92), windows = profile();
  windows.folder = {platform: 'windows', path: ['C:', 'Fixture', 'Project'].join(sep)};
  const w = createPlan({schemaVersion: 1, machineId: 'fixture', profiles: [windows]});
  assert.throws(() => duplicateProfile(w, {...options(), folder: {platform: 'windows', path: ['c:', 'fixture', 'project', ''].join(sep)}}), /CONFIGURATOR_INVALID_REQUEST/);
});

test('unknown, secret and runtime authority fields are rejected rather than copied or echoed', async () => {
  const {duplicateProfile, listProfiles} = await api();
  for (const key of ['token', 'secret', 'grant', 'lease', 'connection', 'runtimeIdentity', 'approved', 'permissions']) {
    assert.throws(() => duplicateProfile(plan(), {...options(), [key]: 'SYNTHETIC_FORBIDDEN'}), /CONFIGURATOR_INVALID_PROFILE_OPTIONS/);
    const source = plan(); source.intent.profiles[0][key] = 'SYNTHETIC_FORBIDDEN';
    assert.throws(() => listProfiles(source), /PLAN_INVALID_SCHEMA/);
    assert.throws(() => duplicateProfile(source, options()), /PLAN_INVALID_SCHEMA/);
  }
  const o = options(); o.folder.token = 'SYNTHETIC_FORBIDDEN';
  assert.throws(() => duplicateProfile(plan(), o), /CONFIGURATOR_INVALID_PROFILE_OPTIONS/);
});

test('tampered digest or policy cannot be listed or duplicated', async () => {
  const {duplicateProfile, listProfiles} = await api(), source = plan();
  source.intent.profiles[0].permissions.execute = false;
  assert.throws(() => listProfiles(source), /PLAN_CHANGED/);
  assert.throws(() => duplicateProfile(source, options()), /PLAN_CHANGED/);
});

test('CLI versioned list and duplicate compose with validate/review and never persist output', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'dot-profile-plans-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const file = path.join(root, 'plan.json'), original = JSON.stringify({schemaVersion: 1, command: 'plan', ok: true, result: plan()});
  await writeFile(file, original);
  const run = (...args) => spawnSync(process.execPath, ['scripts/configure.mjs', ...args], {encoding: 'utf8', input: 'approved\n', env: {PATH: process.env.PATH, HOME: root}});
  const listed = run('profiles', 'list', '--file', file, '--json');
  assert.equal(listed.status, 0, listed.stdout); assert.equal(listed.stderr, '');
  assert.equal(JSON.parse(listed.stdout).command, 'profiles.list');
  const copied = run('profiles', 'duplicate', '--file', file, '--from', 'p0', '--name', 'copy', '--platform', 'linux', '--folder', '/fixture/new-project', '--json');
  assert.equal(copied.status, 0, copied.stdout); assert.equal(copied.stderr, '');
  const envelope = JSON.parse(copied.stdout);
  assert.equal(envelope.schemaVersion, 1); assert.equal(envelope.command, 'plan');
  assert.equal(validatePlan(envelope.result).valid, true);
  assert.equal(await readFile(file, 'utf8'), original);
  assert.deepEqual(await readdir(root), ['plan.json']);
  const exported = path.join(root, 'export.json'); await writeFile(exported, copied.stdout);
  for (const cmd of ['validate', 'review', 'status']) assert.equal(run(cmd, '--file', exported).status, 0);
  for (const args of [
    ['profiles', 'list', '--file', file, '--from', 'p0'],
    ['profiles', 'duplicate', '--file', file],
    ['profiles', 'duplicate', '--file', file, '--yes'],
    ['profiles', 'list', '--file', file, '--token', 'SYNTHETIC_FORBIDDEN'],
    ['profiles', 'list', '--file', file, '--file', file],
    ['profiles', 'activate', '--file', file]
  ]) { const rejected = run(...args); assert.equal(rejected.status, 1); assert.equal(JSON.parse(rejected.stdout).ok, false); assert(!rejected.stdout.includes('SYNTHETIC_FORBIDDEN')); }
});

test('all modes retain their semantics without carrying requested access into the copy', async () => {
  const {duplicateProfile} = await api();
  for (const mode of ['Personal', 'Proyecto', 'Consulta']) {
    const source = profile();
    source.mode = mode;
    source.permissions = {read_files: true, read_output: true};
    const result = duplicateProfile(createPlan({schemaVersion: 1, machineId: 'fixture', profiles: [source]}), options());
    assert.equal(result.intent.profiles[1].mode, mode);
    assert(Object.values(result.intent.profiles[1].permissions).every(value => value === false));
    assert.equal(result.assessment.profiles[1].terminalInput, false);
    assert.equal(result.assessment.profiles[1].available, false);
    assert.equal(validatePlan(result).executable, false);
  }
});

test('CLI refuses forged envelopes, secret fields and oversized inputs without echoing data', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'dot-profile-invalid-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const file = path.join(root, 'input.json');
  const envelope = {schemaVersion: 1, command: 'plan', ok: true, result: plan()};
  for (const input of [
    JSON.stringify({...envelope, token: 'SYNTHETIC_FORBIDDEN'}),
    JSON.stringify({...envelope, schemaVersion: 2}),
    JSON.stringify({...envelope, ok: false}),
    JSON.stringify({...envelope, command: 'status'}),
    'x'.repeat(32769)
  ]) {
    await writeFile(file, input);
    for (const args of [
      ['profiles', 'list'],
      ['profiles', 'duplicate', '--from', 'p0', '--name', 'copy', '--platform', 'linux', '--folder', '/fixture/new-project']
    ]) {
      const result = spawnSync(process.execPath, ['scripts/configure.mjs', ...args, '--file', file], {encoding: 'utf8'});
      assert.equal(result.status, 1);
      assert.equal(JSON.parse(result.stdout).ok, false);
      assert.equal(result.stderr, '');
      assert(!result.stdout.includes('SYNTHETIC_FORBIDDEN'));
    }
    assert.equal(await readFile(file, 'utf8'), input);
  }
  assert.deepEqual(await readdir(root), ['input.json']);
});
