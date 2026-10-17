import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {parsePlannerJson,createPlan,validatePlan,reviewPlan,detectConfigurator,statusPlan,canonical,requestSchema,planSchema} from '../src/configurator.mjs';
const request=()=>({schemaVersion:1,machineId:'fixture',profiles:[{profileId:'read-project',mode:'Proyecto',folder:{platform:'linux',path:'/fixture/project'},destination:{kind:'local',id:'local-preview'},permissions:{read_files:true}}]});
test('draft defaults deny, project isolation unavailable, no runtime authority',()=>{
 const p=createPlan(request());assert(planSchema.safeParse(p).success);assert(requestSchema.safeParse(request()).success);
 assert.deepEqual(p.intent.profiles[0].permissions,{read_files:true,modify_files:false,execute:false,read_output:false});
 const a=p.assessment.profiles[0];assert.equal(a.available,false);assert.deepEqual(a.isolation,{required:true,state:'unavailable',backend:null});assert.equal(a.terminalInput,false);assert(p.assessment.blockers.includes('approval_channel_unavailable'));assert.equal(p.approval,'pending');assert.equal(validatePlan(p).valid,true);
});
test('separate profiles and permissions are explicit, query cannot acquire write/execute',()=>{
 const r=request();r.profiles.push({...r.profiles[0],profileId:'personal',mode:'Personal',permissions:{execute:true},destination:{kind:'remote',id:'future-target'}});const p=createPlan(r);
 assert.equal(p.assessment.profiles.length,2);assert.notEqual(p.assessment.profiles[0].namespace,p.assessment.profiles[1].namespace);assert(p.assessment.pendingActions.some(x=>x.profileId==='personal'&&x.action==='execute'));
 for(const permission of ['execute','modify_files']){const q=request();q.profiles[0].mode='Consulta';q.profiles[0].permissions={[permission]:true};assert.throws(()=>createPlan(q),/QUERY_CAPABILITY_FORBIDDEN/);}
});
test('no forged approval, backend proof, duplicate profile or secret fields accepted',()=>{
 for(const mutate of [r=>r.approved=true,r=>r.token='never-log-this',r=>r.profiles[0].isolation={verified:true},r=>r.profiles[0].terminalInput=true,r=>r.profiles.push(r.profiles[0]),r=>r.schemaVersion=2,r=>r.action='apply']){const r=request();mutate(r);assert.throws(()=>createPlan(r));}
});
test('lexical resource declarations do not certify paths or allow credential destinations',()=>{
 for(const folder of ['relative','/a/../b','/a\nsecret','/a\u202eb']){const r=request();r.profiles[0].folder.path=folder;assert.throws(()=>createPlan(r));}
 const r=request();r.profiles[0].destination.id='https://user:secret@example.invalid';assert.throws(()=>createPlan(r));
 const w=request();w.profiles[0].folder={platform:'windows',path:'C:\\fixture\\project'};assert.equal(createPlan(w).assessment.profiles[0].folderVerified,false);
});
test('canonical digest binds all plan fields; recomputing hash does not forge availability',()=>{
 const p=createPlan(request()),copy=JSON.parse(JSON.stringify(p));copy.intent.profiles[0].permissions.execute=true;assert.throws(()=>validatePlan(copy),/PLAN_CHANGED/);
 const forged=JSON.parse(JSON.stringify(p));forged.assessment.profiles[0].available=true;const {digest,...body}=forged;forged.digest=createHash('sha256').update(canonical(body)).digest('hex');assert.throws(()=>validatePlan(forged),/PLAN_POLICY_MISMATCH/);
 assert.equal(canonical({b:2,a:1}),canonical({a:1,b:2}));
});
test('review human text and JSON bind exactly the same plan; status observes nothing',()=>{
 const p=createPlan(request()),review=reviewPlan(p);assert.equal(review.digest,p.digest);assert(review.text.includes(p.digest));assert(review.text.includes('/fixture/project'));assert(review.text.includes('read_files=true'));assert(review.text.includes('unavailable'));
 assert.equal(statusPlan(p).process,'unknown');assert.equal(statusPlan(p).connection,'unknown');assert.equal(statusPlan(p).evidence,'none');assert.equal(detectConfigurator().isolationBackend,null);
});
test('bounded JSON parser rejects duplicate escaped keys, nesting, prototype and invalid UTF8',()=>{
 for(const input of ['{"a":1,"\\u0061":2}','{"x":{"a":1,"a":2}}','['.repeat(20)+'0'+']'.repeat(20),'x'.repeat(32769),'{"__proto__":{}}'])assert.throws(()=>parsePlannerJson(Buffer.from(input)));
 assert.throws(()=>parsePlannerJson(Buffer.from([255])));assert.deepEqual(parsePlannerJson(Buffer.from('{"a":[1,2]}')),{a:[1,2]});
});
test('real CLI plan/review/validate/status has versioned JSON, no mutation or approval switch',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'dot-plan-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const input=path.join(dir,'request.json'),output=path.join(dir,'plan.json');await writeFile(input,JSON.stringify(request()));
 const run=(...args)=>JSON.parse(execFileSync(process.execPath,['scripts/configure.mjs',...args],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:dir}}));
 const planned=run('plan','--file',input,'--json');assert.equal(planned.schemaVersion,1);assert.equal(planned.ok,true);await writeFile(output,JSON.stringify(planned));
 for(const command of ['validate','review','status'])assert.equal(run(command,'--file',output).ok,true);
 const human=execFileSync(process.execPath,['scripts/configure.mjs','review','--file',output,'--human'],{encoding:'utf8'});assert(human.includes(planned.result.digest));
 assert.equal(run('detect').result.isolationBackend,null);assert.equal(run('status').result.evidence,'none');
 for(const args of [['apply'],['up'],['plan','--yes'],['review','--stdin'],['detect','--file',input]]){const result=spawnSync(process.execPath,['scripts/configure.mjs',...args],{encoding:'utf8',input:'approved\n'});assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).ok,false);assert(!result.stdout.includes('approved'));}
 assert.deepEqual((await readdir(dir)).sort(),['plan.json','request.json']);
});
