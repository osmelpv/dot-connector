import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolveConsoleMetadata,assertSameConsoleIdentity} from '../src/console-identity.mjs';
const sample=()=>({schema:1,paneId:'pane-1',consoleId:'console-1',client:{pid:22,startTimeTicks:'12345',image:'wsl.exe'},host:{pid:33,startTimeTicks:'12340'},association:{kind:'provider-bound',generation:'generation-1'},observedAtMs:10000,wsl:{distroId:'ubuntu-id',tty:'/dev/pts/2',sessionId:'session-1'}});
test('metadata whitelist excludes content and never grants execution capability',()=>{const v=sample();v.text='secret';v.commandLine='secret';const r=resolveConsoleMetadata([v],'pane-1',10001);assert.equal(JSON.stringify(r).includes('secret'),false);assert.equal(r.capabilities.focuslessInput,false);assert.equal(r.capabilities.attach,false);});
test('multiple candidates fail closed even if one appears valid',()=>{assert.throws(()=>resolveConsoleMetadata([sample(),sample()],'pane-1',10001),/AMBIGUOUS/);assert.throws(()=>resolveConsoleMetadata([],'pane-1',10001),/NOT_FOUND/);});
test('title ancestry and pseudoconsole HWND do not establish association',()=>{for(const kind of ['title','parent-pid','GetConsoleWindow']){const v=sample();v.association.kind=kind;assert.throws(()=>resolveConsoleMetadata([v],'pane-1',10001),/UNPROVEN/);}});
test('host PID cannot substitute for client, and WSL requires distro tty session',()=>{const v=sample();v.client.pid=v.host.pid;assert.throws(()=>resolveConsoleMetadata([v],'pane-1',10001),/CLIENT_REQUIRED/);const w=sample();delete w.wsl;assert.throws(()=>resolveConsoleMetadata([w],'pane-1',10001),/WSL_IDENTITY_REQUIRED/);});
test('stale and future evidence is rejected',()=>{for(const now of [9999,15001])assert.throws(()=>resolveConsoleMetadata([sample()],'pane-1',now),/STALE/);});
test('PID reuse, pane remap, console generation and tty changes invalidate identity',()=>{for(const mutate of [v=>v.client.startTimeTicks='12346',v=>v.paneId='pane-2',v=>v.consoleId='console-2',v=>v.association.generation='generation-2',v=>v.wsl.tty='/dev/pts/3']){const a=sample(),b=sample();mutate(b);assert.throws(()=>assertSameConsoleIdentity(a,b,10001),/CHANGED/);}assert.equal(assertSameConsoleIdentity(sample(),sample(),10001),true);});

test('deterministic invalid identity fuzz cannot enable console capabilities',()=>{
 const values=[null,undefined,{},[],0,-1,NaN,Infinity,'',true,'../pane','pane\n', 'x'.repeat(129)];
 for(const value of values){for(const field of ['paneId','consoleId']){const v=sample();v[field]=value;assert.throws(()=>resolveConsoleMetadata([v],'pane-1',10001));}}
 for(const pid of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'22',null]){const v=sample();v.client.pid=pid;assert.throws(()=>resolveConsoleMetadata([v],'pane-1',10001));}
 for(const ticks of ['', '0','-1','1.0','1e3','1'.repeat(26),{},null]){const v=sample();v.client.startTimeTicks=ticks;assert.throws(()=>resolveConsoleMetadata([v],'pane-1',10001));}
 for(let i=0;i<128;i++){const v=sample();v.paneId='pane-'+i;const r=resolveConsoleMetadata([v],v.paneId,10001);assert.equal(r.capabilities.attach,false);assert.equal(r.capabilities.paste,false);}
 assert.throws(()=>resolveConsoleMetadata(Array(129).fill(sample()),'pane-1',10001),/LIST_INVALID/);
});
