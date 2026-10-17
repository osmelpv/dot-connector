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
if (command === undefined || command === '--help') command = 'help';
if (command === 'profiles') command = `profiles.${args.shift()}`;
const commands = ['help', 'detect', 'plan', 'validate', 'review', 'status', 'wizard', 'profiles.list', 'profiles.duplicate'];

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
    else if (arg === '--human' && ['review', 'help'].includes(command)) options.format = 'human';
    else throw Error('CONFIGURATOR_OPTIONS');
  }
  if ((seen.has('--json') && seen.has('--human')) ||
      (['detect', 'help'].includes(command) && options.file) ||
      (!['help', 'detect', 'status', 'wizard'].includes(command) && !options.file)) {
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
  // A saved error envelope (for example a cancelled wizard redirected to a file) is not a draft.
  if (input?.schemaVersion === 1 && input.ok === false && typeof input.error === 'string') {
    throw Error(input.error === 'CONFIGURATOR_CANCELLED' ? 'CONFIGURATOR_CANCELLED_RESULT' : 'CONFIGURATOR_FAILED_RESULT');
  }
  if (input?.command !== 'plan') return input;
  if (Object.keys(input).sort().join(',') !== 'command,ok,result,schemaVersion' ||
      input.schemaVersion !== 1 || input.ok !== true) throw Error('PLAN_INVALID_SCHEMA');
  return input.result;
}

// Human help mirrors the JSON help result; agents keep JSON when stdout is not a TTY.
function helpText(help) {
  return [
    'dot-connector configurator: drafts only.',
    help.summary,
    '',
    'Commands:',
    ...help.usage.map(line => '  ' + line),
    '',
    'Guide: ' + help.guide,
    'Output: ' + help.output + ' Add --json for machine-readable help.',
    'Files: ' + help.file
  ].join('\n');
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
      case 'help': result = {
        scope: 'draft_only',
        summary: 'All modes (Personal, Proyecto, Consulta) generate drafts only. No connection, permissions or isolation is activated.',
        usage: [
          'node scripts/configure.mjs wizard',
          'node scripts/configure.mjs wizard --file /absolute/draft.json',
          'node scripts/configure.mjs plan --file /absolute/request.json --json',
          'node scripts/configure.mjs validate --file /absolute/draft.json --json',
          'node scripts/configure.mjs profiles duplicate --file /absolute/draft.json --from original --name copy --platform linux --folder /projects/copy --json',
          'node scripts/configure.mjs review --file /absolute/draft.json --human',
          'node scripts/configure.mjs profiles list --file /absolute/draft.json --json',
          'node scripts/configure.mjs detect --json',
          'node scripts/configure.mjs status --json'
        ],
        guide: 'docs/USER-QUICKSTART.md',
        output: 'JSON on stdout; wizard prompts and final instructions on stderr. review --human intentionally emits text.',
        file: 'Use an absolute file path for the OS running Node. Folders inside the draft may declare linux or windows. Never enter secrets.'
      }; break;
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
    const human = options.format === 'human' || (command === 'help' && !options.format && process.stdout.isTTY);
    if (human) process.stdout.write((command === 'help' ? helpText(result) : result.text) + '\n');
    else emit(command === 'profiles.duplicate' ? 'plan' : command, result);
  }
} catch (error) {
  const message = error.message ?? '';
  const code = /^(CONFIGURATOR_|PLAN_|QUERY_)[A-Z_]+$/.test(message) ? message : 'CONFIGURATOR_FAILED';
  const guidance = {
    CONFIGURATOR_COMMAND_UNAVAILABLE: 'Run node scripts/configure.mjs --help for draft commands.',
    CONFIGURATOR_OPTIONS: 'Run node scripts/configure.mjs --help and check the options for your command.',
    CONFIGURATOR_FILE_UNAVAILABLE: 'Use an absolute path to a regular JSON file up to 32 KiB, not a symlink. Example: /projects/example/draft.json on Linux or C:\\Projects\\Example\\draft.json on Windows.',
    CONFIGURATOR_TTY_REQUIRED: 'Run wizard in an interactive terminal, or use plan --file /absolute/request.json --json for agents.',
    CONFIGURATOR_CANCELLED_RESULT: 'This file holds a cancelled wizard result, not a draft. Run the wizard again and save to a new file.',
    CONFIGURATOR_FAILED_RESULT: 'This file holds a failed configurator result, not a draft. Run the wizard again and save to a new file.'
  };
  process.stdout.write(JSON.stringify({
    schemaVersion: 1, command: commands.includes(command) ? command : null,
    ok: false, error: code,
    ...(guidance[code] ? {help: guidance[code]} : {})
  }) + '\n');
  process.exitCode = 1;
}
