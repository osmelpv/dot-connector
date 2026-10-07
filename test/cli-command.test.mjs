import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCommandDispatcher} from '../src/cli-command.mjs';
const response=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
test('CLI maps distinct backends and preserves snapshot/operation identity without arming',async()=>{
 const calls=[];const dispatch=createCommandDispatcher({callTool:async r=>{calls.push(r);return response({simulation:true});}},'native');
 for(const command of ['status','read','pause'])assert.equal((await dispatch({id:command,command})).ok,true);
 const arguments_={snapshotId:'snap',operationId:'op',text:'DOT_WRITE_TEST'};
 assert.equal((await dispatch({id:'paste',command:'paste',arguments:arguments_})).ok,true);
 assert.equal((await dispatch({id:'submit',command:'submit',arguments:{...arguments_,operationId:'submit-op'}})).ok,true);
 assert.deepEqual(calls.map(x=>x.name),['terminal_status','terminal_snapshot','terminal_pause','terminal_input','terminal_input']);
 assert.equal(calls[3].arguments.kind,'paste');assert.equal(calls[4].arguments.kind,'submit');assert.equal(calls[3].arguments.snapshotId,'snap');
 assert.equal((await dispatch({id:'bad',command:'paste',arguments:{...arguments_,armed:true}})).error,'INVALID_REQUEST');
 assert.equal((await dispatch({id:'bad',command:'paste',arguments:{...arguments_,text:'x\r'}})).error,'INVALID_REQUEST');
 assert.equal((await dispatch({id:'bad',command:'read',arguments:{paneId:0}})).error,'INVALID_REQUEST');
 const wez=createCommandDispatcher({callTool:async()=>response({})},'wezterm');assert.equal((await wez({id:'read',command:'read'})).error,'INVALID_REQUEST');
});
test('CLI refuses overlap, allows pause, sanitizes failure and never retries',async()=>{
 let release,calls=0;const dispatch=createCommandDispatcher({callTool:async r=>{calls++;if(r.name==='terminal_pause')return response({paused:true});await new Promise(r=>release=r);throw Error('private path or terminal data');}},'native');
 const active=dispatch({id:'r',command:'read'});assert.equal((await dispatch({id:'r2',command:'read'})).error,'BUSY_NO_QUEUE');
 assert.equal((await dispatch({id:'p',command:'pause'})).ok,true);release();assert.equal((await active).error,'MCP_REFUSED_OR_OUTCOME_UNKNOWN_NO_RETRY');assert.equal(calls,2);
});
test('diagnostic CLI cannot invoke terminal operations',async()=>{
 let calls=0;const dispatch=createCommandDispatcher({callTool:async()=>{calls++;return response({});}},'diagnostic');
 assert.equal((await dispatch({id:'r',command:'read'})).error,'DIAGNOSTIC_ONLY');assert.equal(calls,0);
});


test('close latches before asynchronous pause and remains closed after unknown outcome', async()=>{
 let release;const calls=[];
 const dispatch=createCommandDispatcher({callTool:args=>{calls.push(args);return new Promise(resolve=>{release=resolve;});}},'native');
 const closing=dispatch({id:'close',command:'close'});
 assert.equal((await dispatch({id:'read',command:'read'})).error,'SESSION_CLOSING');
 assert.equal((await dispatch({id:'paste',command:'paste',arguments:{snapshotId:'snapshot',operationId:'operation',text:'safe'}})).error,'SESSION_CLOSING');
 assert.equal(calls.length,1);assert.equal(calls[0].name,'terminal_pause');
 release({isError:true});const result=await closing;
 assert.equal(result.ok,false);assert.equal(result.closing,true);
 assert.equal((await dispatch({id:'again',command:'status'})).error,'SESSION_CLOSING');
});
