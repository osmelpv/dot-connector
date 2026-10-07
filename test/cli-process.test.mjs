import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';
const run=promisify(execFile);
test('real CLI help/version/status produce JSON without terminal workers',async()=>{
 for(const action of ['help','version','status']){const {stdout}=await run(process.execPath,['scripts/dot-connector.mjs',action]);const r=JSON.parse(stdout);assert.equal(r.ok,true);if(action==='status'){assert.equal(r.result.target,null);assert.equal(r.result.capabilities.nativeControl,false);}}
});
test('real diagnostic session accepts status and close with JSON-only output',async()=>{
 const child=spawn(process.execPath,['scripts/dot-connector.mjs','session'],{stdio:['pipe','pipe','pipe']});const lines=createInterface({input:child.stdout});let sawStatus=false,sawClose=false;
 const exited=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 try{for await(const line of lines){const r=JSON.parse(line);if(r.event==='ready')child.stdin.write(JSON.stringify({id:'s',command:'status'})+'\n');else if(r.id==='s'){assert.equal(r.ok,true);sawStatus=true;child.stdin.write(JSON.stringify({id:'c',command:'close'})+'\n');}else if(r.id==='c'){assert.equal(r.result.closed,true);sawClose=true;child.stdin.end();}}
 assert.equal(await exited,0);assert.equal(sawStatus,true);assert.equal(sawClose,true);
 }finally{child.stdin.end();child.kill();lines.close();}
});
test('human authorize refuses noninteractive execution without creating a grant',async()=>{
 await assert.rejects(run(process.execPath,['scripts/dot-connector.mjs','authorize','--native-root','/not-a-target','--operation','test','--kind','paste','--text','SAFE']),error=>{const r=JSON.parse(error.stdout);return r.ok===false;});
});
