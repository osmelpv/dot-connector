import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('JSON client consumes piped requests, rejects unknown fields/tools, and exits at EOF without GUI',async()=>{
  const requests=[
    '{broken',
    JSON.stringify({id:'unknown',tool:'shell_exec',arguments:{}}),
    JSON.stringify({id:'extra',tool:'terminal_snapshot',arguments:{paneId:0,submit:true}}),
    JSON.stringify({id:'newline',tool:'terminal_input',arguments:{paneId:0,snapshotId:'x',operationId:'x',kind:'paste',text:'hello\n'}}),
    JSON.stringify({id:'status',tool:'terminal_status',arguments:{}}),
  ];
  const p=spawn(process.execPath,['scripts/local-client.mjs'],{env:{PATH:process.env.PATH},stdio:['pipe','pipe','pipe']});
  let output='',error='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>error+=b);
  const closed=new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',code=>resolve(code));});
  const timer=setTimeout(()=>p.kill(),10000);
  try{p.stdin.end(requests.join('\n')+'\n');assert.equal(await closed,0,error);}
  finally{clearTimeout(timer);}
  const rows=output.trim().split('\n').map(s=>JSON.parse(s));
  assert.equal(rows[0].event,'ready');assert.equal(rows.length,6);
  for(const row of rows.slice(1)){assert.equal(row.ok,false);assert.ok(row.elapsedMs>=0);}
  assert.equal(rows.at(-1).id,'status');
});
