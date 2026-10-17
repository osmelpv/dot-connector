#!/usr/bin/env node
import {readFile,stat} from 'node:fs/promises';
import {presentationQaHtml} from '../src/presentation-qa.mjs';
if(process.argv.length!==4||process.argv[2]!=='--test-fixture')throw Error('Usage: node scripts/presentation-qa.mjs --test-fixture PATH');
const file=process.argv[3];if((await stat(file)).size>262144)throw Error('TEST_FIXTURE_LIMIT');
process.stdout.write(presentationQaHtml(JSON.parse(await readFile(file,'utf8'))));
