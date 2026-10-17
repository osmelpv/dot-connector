import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {createPlan,validatePlan} from '../src/configurator.mjs';
const native={skip:process.platform!=='linux'||process.env.DOT_TMUX_LAB_TEST!=='1',timeout:20000};
const helper=String.raw`
import os, pty, subprocess, selectors, time, json, tempfile, fcntl, termios, struct, sys, errno, ctypes
config=json.loads(sys.argv[1])
with tempfile.TemporaryDirectory(prefix='dot-wizard-pty-',dir=os.environ.get('TMPDIR')) as root:
 os.mkdir(root+'/home'); os.mkdir(root+'/tmp'); os.mkdir(root+'/declared-target')
 os.symlink(root+'/declared-target',root+'/declared-link')
 marker=root+'/home/not-a-config.json'
 with open(marker,'w') as f: f.write('SYNTHETIC_NOT_READ')
 extra=[]; original_plan=None
 if 'plan' in config:
  original_plan=config['plan'] if isinstance(config['plan'],str) else json.dumps(config['plan'])
  with open(root+'/input-plan.json','w') as f: f.write(original_plan)
  extra=['--file='+root+'/input-plan.json'] if config.get('inlineFile') else ['--file',root+'/input-plan.json']
 extra+=config.get('flags',[])
 before=[]
 for base,dirs,files in os.walk(root):
  before.extend(os.path.relpath(os.path.join(base,n),root) for n in dirs+files)
 libc=ctypes.CDLL(None,use_errno=True)
 watch=libc.inotify_init1(os.O_NONBLOCK|os.O_CLOEXEC)
 if watch<0: raise RuntimeError('LAB_WATCH_UNAVAILABLE')
 for watched in [marker,root+'/declared-target']:
  if libc.inotify_add_watch(watch,watched.encode(),0x00000001|0x00000020)<0: raise RuntimeError('LAB_WATCH_UNAVAILABLE')
 master,slave=pty.openpty()
 fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',config.get('rows',24),config.get('columns',80),0,0))
 def session():
  os.setsid(); fcntl.ioctl(0,termios.TIOCSCTTY,0)
 child=None; out=b''; ui=b''; sent=0; consumed=0; killed=False
 try:
  child=subprocess.Popen([config['node'],config['script'],'wizard']+extra,stdin=slave,stderr=slave,stdout=subprocess.PIPE,cwd=root,env={'PATH':os.environ['PATH'],'HOME':root+'/home','TMPDIR':root+'/tmp','TERM':'xterm'},preexec_fn=session)
  os.close(slave);slave=None
  select=selectors.DefaultSelector();select.register(master,selectors.EVENT_READ,'ui');select.register(child.stdout,selectors.EVENT_READ,'json')
  deadline=time.monotonic()+10
  while select.get_map():
   if time.monotonic()>deadline: raise RuntimeError('WIZARD_LAB_TIMEOUT')
   for key,mask in select.select(.1):
    try: data=os.read(key.fd,4096)
    except OSError as error:
     if error.errno==errno.EIO: data=b''
     else: raise
    if not data: select.unregister(key.fileobj);continue
    if key.data=='json': out+=data
    else: ui+=data
    if len(out)>32768 or len(ui)>131072: raise RuntimeError('WIZARD_LAB_OUTPUT_LIMIT')
   while sent<len(config['answers']):
    found=ui.find(b'(:cancel to cancel): ',consumed)
    if found<0: break
    consumed=found+len(b'(:cancel to cancel): ')
    answer=config['answers'][sent];sent+=1
    if answer=='<CTRL_C>': value=b'\x03'
    elif answer=='<EOF>': value=b'\x04'
    elif answer=='<LINK>': value=(root+'/declared-link\r').encode()
    else: value=(answer+'\r').encode()
    os.write(master,value)
  code=child.wait(timeout=2)
 finally:
  if child and child.poll() is None: child.kill();child.wait(timeout=2);killed=True
  if child and child.stdout:child.stdout.close()
  if slave is not None:os.close(slave)
  os.close(master)
 try: accesses=os.read(watch,4096)
 except BlockingIOError: accesses=b''
 os.close(watch)
 after=[]
 for base,dirs,files in os.walk(root):
  after.extend(os.path.relpath(os.path.join(base,n),root) for n in dirs+files)
 with open(marker) as f: unchanged=f.read()=='SYNTHETIC_NOT_READ'
 source_unchanged=True
 if original_plan is not None:
  with open(root+'/input-plan.json') as f: source_unchanged=f.read()==original_plan
 result={'sourceUnchanged':source_unchanged,'watchedFilesUntouched':len(accesses)==0,'code':code,'stdout':out.decode('utf8'),'stderr':ui.decode('utf8'),'sent':sent,'killed':killed,'filesUnchanged':sorted(before)==sorted(after),'fixtureUnchanged':unchanged,'exited':child.poll() is not None,'columns':config.get('columns',80),'rows':config.get('rows',24)}
print(json.dumps(result))
`;
const answers=['local','review','2','linux','/fixture/project','2','no','EXPORT'];
function run(values,columns=80,rows=24,config={}){const result=spawnSync('python3',['-c',helper,JSON.stringify({node:process.execPath,script:path.resolve('scripts/configure.mjs'),answers:values,columns,rows,...config})],{encoding:'utf8',timeout:15000,maxBuffer:256*1024});assert.equal(result.status,0,result.stderr);const r=JSON.parse(result.stdout);assert(r.exited&&!r.killed);assert(r.filesUnchanged&&r.fixtureUnchanged&&r.watchedFilesUntouched&&r.sourceUnchanged);assert(!r.stdout.includes('SYNTHETIC_NOT_READ'));assert(!r.stderr.includes('SYNTHETIC_NOT_READ'));assert(!r.stdout.includes('\x1b'));assert.equal(r.stdout.trim().split('\n').length,1);return {...r,envelope:JSON.parse(r.stdout)};}
test('real owned PTY wizard exports clean JSON on separate stdout with review on stderr',native,async()=>{const r=run(answers);assert.equal(r.code,0);assert.equal(r.envelope.command,'plan');assert.equal(validatePlan(r.envelope.result).approved,false);assert(r.stderr.includes('CONFIGURATION PLAN'));assert(r.stderr.includes(r.envelope.result.digest));assert(r.stderr.includes('approval pending'));assert(r.stderr.includes('Plan generated; no connection created'));assert(r.stderr.includes('Personal, Proyecto and Consulta are draft-only'));assert(!r.stdout.includes('Plan generated; no connection created'));if(process.env.DOT_WIZARD_PTY_EVIDENCE)await writeFile(process.env.DOT_WIZARD_PTY_EVIDENCE,JSON.stringify(r,null,2)+'\n');});
test('real owned PTY Ctrl+C and Ctrl+D at empty prompts cancel and exit cleanly',native,()=>{for(const key of ['<CTRL_C>','<EOF>']){const r=run(['local',key]);assert.equal(r.code,1);assert.equal(r.envelope.error,'CONFIGURATOR_CANCELLED');assert.equal(r.envelope.result,undefined);}});
test('real owned narrow PTY retries invalid answers and requires exact EXPORT',native,async()=>{const r=run(['bad name','local','review','9','2','linux','relative','/fixture/project','2','no','','yes','EXPORT'],32,8);assert.equal(r.code,0);assert(r.stderr.includes('Invalid answer'));assert.equal(validatePlan(r.envelope.result).valid,true);assert.equal(r.sent,13);if(process.env.DOT_WIZARD_PTY_EVIDENCE)await writeFile(process.env.DOT_WIZARD_PTY_EVIDENCE+'.narrow.json',JSON.stringify(r,null,2)+'\n');});
test('real owned PTY accepts a lexical symlink declaration without claiming it verified',native,()=>{const values=[...answers];values[4]='<LINK>';const r=run(values);assert.equal(r.code,0);assert.equal(r.envelope.result.assessment.profiles[0].folderVerified,false);assert.equal(r.envelope.result.assessment.profiles[0].available,false);assert.equal(r.envelope.result.assessment.profiles[0].isolation.state,'unavailable');});

test('real owned PTY does not echo pasted OSC as active terminal controls',native,()=>{const r=run(['local','\x1b]52;c;SEVMTE8=\x07','review','2','linux','/fixture/project','2','no','EXPORT']);assert.equal(r.code,0);assert.equal(r.envelope.result.intent.profiles[0].profileId,'review');assert(!r.stderr.includes('\x1b]52;'));assert(!r.stderr.includes('SYNTHETIC_NOT_READ'));});

const savedPlan = () => createPlan({schemaVersion: 1, machineId: 'fixture', profiles: [{
  profileId: 'p0', mode: 'Proyecto', folder: {platform: 'linux', path: '/fixture/original'},
  destination: {kind: 'remote', id: 'disconnected'},
  permissions: {read_files: true, modify_files: true, execute: true, read_output: true}
}]});

test('owned narrow PTY loads, lists, selects and duplicates a profile before explicit export', native, async () => {
  const source = savedPlan();
  const result = run(['wrong', 'duplicate', 'missing', 'p0', 'copy', 'linux', '/fixture/new-project', 'export', '', 'EXPORT'], 32, 8, {plan: source});
  assert.equal(result.code, 0);
  assert.equal(result.envelope.command, 'plan');
  assert.equal(validatePlan(result.envelope.result).approved, false);
  const copy = result.envelope.result.intent.profiles[1];
  assert.equal(copy.profileId, 'copy');
  assert(Object.values(copy.permissions).every(value => value === false));
  assert.deepEqual(copy.destination, {kind: 'local', id: 'local-preview'});
  assert(result.stderr.includes('Draft profiles'));
  assert(result.stderr.includes('Capabilities reset to false'));
  assert(result.stderr.includes(result.envelope.result.digest));
  assert.notEqual(result.envelope.result.digest, source.digest);
  if (process.env.DOT_WIZARD_PTY_EVIDENCE) await writeFile(process.env.DOT_WIZARD_PTY_EVIDENCE + '.profiles.json', JSON.stringify(result, null, 2) + '\n');
});

test('owned PTY cancellation after preparing a copy leaves the loaded plan untouched', native, () => {
  for (const cancel of ['<CTRL_C>', '<EOF>', ':cancel']) {
    const result = run(['duplicate', 'p0', 'copy', 'linux', '/fixture/new-project', cancel], 80, 24, {plan: savedPlan()});
    assert.equal(result.code, 1);
    assert.equal(result.envelope.error, 'CONFIGURATOR_CANCELLED');
    assert.equal(result.envelope.result, undefined);
  }
});

test('owned PTY can review and export an unchanged loaded draft', native, () => {
  const source = savedPlan();
  const result = run(['export', 'EXPORT'], 80, 24, {plan: {schemaVersion: 1, command: 'plan', ok: true, result: source}});
  assert.equal(result.code, 0);
  assert.deepEqual(result.envelope.result, source);
});

test('owned PTY refuses secret fields, unknown options and oversized files before prompting', native, () => {
  const forbidden = savedPlan(); forbidden.intent.profiles[0].secret = 'SYNTHETIC_FORBIDDEN';
  const unknown = savedPlan(); unknown.extra = 'SYNTHETIC_FORBIDDEN';
  for (const config of [{plan: forbidden}, {plan: unknown}, {plan: 'x'.repeat(32769)}, {plan: savedPlan(), flags: ['--token', 'SYNTHETIC_FORBIDDEN']}]) {
    const result = run([], 80, 24, config);
    assert.equal(result.code, 1);
    assert.equal(result.envelope.ok, false);
    assert(!result.stdout.includes('SYNTHETIC_FORBIDDEN'));
    assert(!result.stderr.includes('SYNTHETIC_FORBIDDEN'));
    assert.equal(result.sent, 0);
    assert.equal(result.stderr, '');
  }
});

test('owned PTY wizard accepts equals file syntax and double-hyphen profile labels', native, () => {
  const intent = savedPlan().intent;
  intent.profiles[0].profileId = '--source';
  const result = run(['duplicate', '--source', '--copy', 'linux', '/fixture/copy', 'export', 'EXPORT'], 80, 24, {plan: createPlan(intent), inlineFile: true});
  assert.equal(result.code, 0);
  assert.equal(result.envelope.result.intent.profiles[1].profileId, '--copy');
  assert.equal(validatePlan(result.envelope.result).valid, true);
});
