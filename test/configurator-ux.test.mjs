import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createPlan,validatePlan} from '../src/configurator.mjs';
const load=()=>import('../src/configurator-wizard.mjs');
const native={skip:process.platform!=='linux'||process.env.DOT_TMUX_LAB_TEST!=='1',timeout:20000};
const draft=(folder='/projects/example')=>createPlan({schemaVersion:1,machineId:'local',profiles:[{profileId:'src',mode:'Personal',folder:{platform:'linux',path:folder},destination:{kind:'local',id:'local-preview'},permissions:{}}]});
async function run(values,plan){const {runWizard}=await load();const shown=[];let index=0;const result=await runWizard({plan,ask:async prompt=>{shown.push(prompt);return values[index++]??null;},write:text=>shown.push(text)});return {result,shown};}
async function failing(values,plan){const {runWizard}=await load();const shown=[];let index=0;const error=await runWizard({plan,ask:async prompt=>{shown.push(prompt);return values[index++]??null;},write:text=>shown.push(text)}).then(()=>null,e=>e);return {error,shown};}
const hints=shown=>shown.filter(s=>s.startsWith('Invalid answer.'));
const example=hint=>/for example (\S+?)[;.]? /.exec(hint)?.[1];
const cli=(args,options={})=>spawnSync(process.execPath,['scripts/configure.mjs',...args],{encoding:'utf8',...options});

test('S1 action choice accepts any letter case while the final EXPORT stays exact',async()=>{
 for(const action of ['EXPORT','Export',' export ']){const {result}=await run([action,'EXPORT'],draft());assert.equal(validatePlan(result).valid,true);}
 const {result}=await run(['DUPLICATE','src','copy','linux','/projects/copy','Export','EXPORT'],draft());
 assert.deepEqual(result.intent.profiles.map(p=>p.profileId),['src','copy']);
 const {error,shown}=await failing(['export','export','Export','eXport'],draft());
 assert.match(error.message,/CONFIGURATOR_INVALID_ANSWER/);assert.equal(hints(shown).length,3);
 assert.ok(hints(shown).every(h=>h.includes('Type EXPORT exactly')));
});

test('S1 action prompt keeps its three-attempt limit and rejects unknown actions',async()=>{
 const {error,shown}=await failing(['apply','yes','approve','export'],draft());
 assert.match(error.message,/CONFIGURATOR_INVALID_ANSWER/);assert.equal(hints(shown).length,3);
});

test('S2 duplicate folder and invalid format get distinct hints with a non-colliding example and no reflection',async()=>{
 const prefix=['local','one','1','linux','/projects/example','1','yes','two','1','linux'],suffix=['/projects/two','1','no','EXPORT'];
 const first=await run([...prefix,'/projects/example','/projects/example/../SYNTH_SECRET_TOKEN',...suffix]);
 const second=await run([...prefix,'relative/SYNTH_SECRET_TOKEN',...suffix]);
 for(const {result} of [first,second])assert.equal(result.intent.profiles.length,2);
 const [duplicate,invalid]=hints(first.shown),[relative]=hints(second.shown);
 assert.match(duplicate,/already declared/);assert.doesNotMatch(invalid,/already declared/);assert.doesNotMatch(relative,/already declared/);
 for(const hint of [duplicate,invalid,relative]){
  assert.ok(!hint.includes('SYNTH_SECRET_TOKEN'),hint);const sample=example(hint);
  assert.ok(sample&&sample!=='/projects/example',hint);
  createPlan({schemaVersion:1,machineId:'local',profiles:[{profileId:'one',mode:'Personal',folder:{platform:'linux',path:'/projects/example'},destination:{kind:'local',id:'local-preview'},permissions:{}},{profileId:'x',mode:'Personal',folder:{platform:'linux',path:sample},destination:{kind:'local',id:'local-preview'},permissions:{}}]});
 }
});

test('S2 folder classification resets on every attempt, including control/bidi rejections',async()=>{
 const bidi='/projects/\u202Eelpmaxe';
 const prefix=['local','one','1','linux','/projects/example','1','yes','two','1','linux'],suffix=['/projects/two','1','no','EXPORT'];
 const created=await run([...prefix,'/projects/example',bidi,...suffix]);
 const edited=await run(['duplicate','src','copy','linux','/projects/example',bidi,'/projects/copy','export','EXPORT'],draft());
 for(const {result,shown} of [created,edited]){
  assert.equal(result.intent.profiles.length,2);
  const [duplicate,control]=hints(shown);
  assert.match(duplicate,/already declared/);assert.doesNotMatch(control,/already declared/);assert.match(control,/^Invalid answer\. Use a normalized absolute Linux path/);
  assert.ok(shown.every(s=>!s.includes('\u202E')&&!s.includes('elpmaxe')),'input must not be echoed');
 }
});

test('S2 duplicate flow names a repeated folder and suggests a Windows example that does not collide',async()=>{
 const win='C:\\Projects\\Example';
 const plan=createPlan({schemaVersion:1,machineId:'local',profiles:[{profileId:'src',mode:'Personal',folder:{platform:'windows',path:win},destination:{kind:'local',id:'local-preview'},permissions:{}}]});
 const {result,shown}=await run(['duplicate','src','copy','windows','c:\\projects\\example\\','C:\\Projects\\Copy','export','EXPORT'],plan);
 assert.equal(result.intent.profiles.length,2);
 const [hint]=hints(shown);assert.match(hint,/already declared/);
 assert.ok(example(hint)&&example(hint).toLowerCase()!==win.toLowerCase(),hint);assert.ok(!hint.includes('c:\\projects\\example\\'),hint);
});

test('S4 help stays JSON for agents and is readable text on request',()=>{
 for(const args of [['--help'],[],['help'],['--help','--json']]){
  const r=cli(args);assert.equal(r.status,0);assert.equal(r.stderr,'');const out=JSON.parse(r.stdout);
  assert.equal(out.command,'help');assert.equal(out.ok,true);assert.equal(out.result.scope,'draft_only');assert.equal(out.result.guide,'docs/USER-QUICKSTART.md');assert.ok(out.result.usage.includes('node scripts/configure.mjs wizard'));
 }
 const r=cli(['--help','--human']);assert.equal(r.status,0);assert.equal(r.stderr,'');
 assert.throws(()=>JSON.parse(r.stdout));
 for(const text of ['draft','node scripts/configure.mjs wizard','docs/USER-QUICKSTART.md','--json','Never enter secrets'])assert.ok(r.stdout.includes(text),text);
 const both=cli(['--help','--human','--json']);assert.equal(both.status,1);assert.equal(JSON.parse(both.stdout).error,'CONFIGURATOR_OPTIONS');
});

test('S4 help defaults to text on an interactive terminal',native,()=>{
 const helper="import os,pty,sys,json\npid,fd=pty.fork()\nif pid==0:\n os.execv(sys.argv[1],[sys.argv[1],'scripts/configure.mjs','--help'])\nout=b''\nwhile True:\n try:\n  b=os.read(fd,4096)\n except OSError:\n  break\n if not b:\n  break\n out+=b\n_,status=os.waitpid(pid,0)\nprint(json.dumps({'status':os.waitstatus_to_exitcode(status),'out':out.decode()}))";
 const r=spawnSync('/usr/bin/python3',['-c',helper,process.execPath],{encoding:'utf8',cwd:process.cwd()});const {status,out}=JSON.parse(r.stdout);
 assert.equal(status,0);assert.ok(!out.trimStart().startsWith('{'),out);assert.ok(out.includes('node scripts/configure.mjs wizard'));
});

test('S4 validating a cancelled or failed wizard result names it instead of a schema error',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'dot-config-ux-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const cases=[[{schemaVersion:1,command:'wizard',ok:false,error:'CONFIGURATOR_CANCELLED'},'CONFIGURATOR_CANCELLED_RESULT'],[{schemaVersion:1,command:'wizard',ok:false,error:'CONFIGURATOR_INVALID_ANSWER'},'CONFIGURATOR_FAILED_RESULT']];
 for(const [doc,code] of cases){
  const file=path.join(dir,code+'.json');await writeFile(file,JSON.stringify(doc)+'\n');
  for(const args of [['validate','--file',file,'--json'],['review','--file',file,'--human'],['profiles','list','--file',file,'--json']]){
   const r=cli(args);assert.equal(r.status,1);const out=JSON.parse(r.stdout);assert.equal(out.ok,false);assert.equal(out.error,code);assert.match(out.help,/not a draft/);
  }
 }
 const other=path.join(dir,'other.json');await writeFile(other,JSON.stringify({schemaVersion:1,kind:'something-else'}));
 const r=cli(['validate','--file',other,'--json']);assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).error,'PLAN_INVALID_SCHEMA');
});
