#!/usr/bin/env node
// Standalone draft CLI. Never imports the operational runtime/configuration path.
import {open, lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {
  createPlan, validatePlan, reviewPlan, detectConfigurator, statusPlan, parsePlannerJson
} from '../src/configurator.mjs';
import {interactiveWizard} from '../src/configurator-wizard.mjs';
import {listProfiles, duplicateProfile} from '../src/profile-plans.mjs';

const args = process.argv.slice(2);
let command = args.shift();
if (command === 'profiles') command = `profiles.${args.shift()}`;
const commands = ['detect', 'plan', 'validate', 'review', 'status', 'wizard', 'profiles.list', 'profiles.duplicate'];

function parseOptions() {
  const options = {}, seen = new Set();
  const values = command === 'profiles.duplicate'
    ? ['--file', '--from', '--name', '--platform', '--folder'] : ['--file'];
  while (args.length) {
    const arg = args.shift();
    const separator = arg.indexOf('=');
    const name = separator < 0 ? arg : arg.slice(0, separator);
    if (seen.has(name)) throw Error('CONFIGURATOR_OPTIONS');
    seen.add(name);
    if (values.includes(name)) {
      // Equals explicitly binds an option-looking value. Split only once so a
      // literal equals inside a path/value survives without shell evaluation.
      const inline = separator >= 0;
      const value = inline ? arg.slice(separator + 1) : args.shift();
      if (!value || (!inline && value.startsWith('--'))) throw Error('CONFIGURATOR_OPTIONS');
      options[name.slice(2)] = value;
    } else if (arg === '--json' && command !== 'wizard') options.format = 'json';
    else if (arg === '--human' && command === 'review') options.format = 'human';
    else throw Error('CONFIGURATOR_OPTIONS');
  }
  if ((seen.has('--json') && seen.has('--human')) ||
      (command === 'detect' && options.file) ||
      (!['detect', 'status', 'wizard'].includes(command) && !options.file)) {
    throw Error('CONFIGURATOR_OPTIONS');
  }
  if (command === 'profiles.duplicate' && ['from', 'name', 'platform', 'folder'].some(key => !options[key])) {
    throw Error('CONFIGURATOR_OPTIONS');
  }
  return options;
}

async function readInput(file) {
  if (!path.isAbsolute(file)) throw Error('CONFIGURATOR_FILE_UNAVAILABLE');
  let handle;
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 32768) throw Error();
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 32768) throw Error();
    const bytes = Buffer.alloc(32769);
    let size = 0;
    while (size < bytes.length) {
      const result = await handle.read(bytes, size, bytes.length - size, null);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    return parsePlannerJson(bytes.subarray(0, size));
  } catch (error) {
    if (error.message.startsWith('CONFIGURATOR_')) throw error;
    throw Error('CONFIGURATOR_FILE_UNAVAILABLE');
  } finally {
    await handle?.close();
  }
}

function unwrapPlan(input) {
  if (input?.command !== 'plan') return input;
  if (Object.keys(input).sort().join(',') !== 'command,ok,result,schemaVersion' ||
      input.schemaVersion !== 1 || input.ok !== true) throw Error('PLAN_INVALID_SCHEMA');
  return input.result;
}

function emit(command, result) {
  process.stdout.write(JSON.stringify({schemaVersion: 1, command, ok: true, result}) + '\n');
}

try {
  if (!commands.includes(command)) throw Error('CONFIGURATOR_COMMAND_UNAVAILABLE');
  const options = parseOptions();
  if (command === 'wizard') {
    let existingPlan;
    if (options.file) {
      // Reject noninteractive use before reading the explicitly named plan.
      if (!process.stdin.isTTY || !process.stderr.isTTY) throw Error('CONFIGURATOR_TTY_REQUIRED');
      existingPlan = unwrapPlan(await readInput(options.file));
      validatePlan(existingPlan);
    }
    emit('plan', await interactiveWizard(process.stdin, process.stderr, existingPlan));
  } else {
    let input = options.file ? await readInput(options.file) : undefined;
    if (command !== 'plan') input = unwrapPlan(input);
    let result;
    switch (command) {
      case 'detect': result = detectConfigurator(); break;
      case 'plan': result = createPlan(input); break;
      case 'validate': result = validatePlan(input); break;
      case 'review': result = reviewPlan(input); break;
      case 'status': result = statusPlan(input); break;
      case 'profiles.list': result = listProfiles(input); break;
      case 'profiles.duplicate':
        result = duplicateProfile(input, {
          schemaVersion: 1, from: options.from, name: options.name,
          folder: {platform: options.platform, path: options.folder}
        });
        break;
    }
    if (options.format === 'human') process.stdout.write(result.text + '\n');
    else emit(command === 'profiles.duplicate' ? 'plan' : command, result);
  }
} catch (error) {
  const message = error.message ?? '';
  const code = /^(CONFIGURATOR_|PLAN_|QUERY_)[A-Z_]+$/.test(message) ? message : 'CONFIGURATOR_FAILED';
  process.stdout.write(JSON.stringify({
    schemaVersion: 1, command: commands.includes(command) ? command : null,
    ok: false, error: code,
    ...(code === 'CONFIGURATOR_TTY_REQUIRED' ? {
      help: 'Run wizard in an interactive terminal, or use plan --file /absolute/request.json --json for agents.'
    } : {})
  }) + '\n');
  process.exitCode = 1;
}
