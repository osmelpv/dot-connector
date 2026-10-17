import {createOwnedTmuxOutput} from './owned-tmux-output.mjs';
// Explicitly opt-in synthetic tmux backend. Not imported by the diagnostic plugin.
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, readFile, lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const fail = code => { throw Error(code); };
const label = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
export function runTmux(socket, args, {env, timeoutMs = 3000} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/tmux', ['-S', socket, '-f', '/dev/null', ...args],
      {env, stdio: ['ignore', 'pipe', 'pipe']});
    let bytes = 0, chunks = [], failed, settled = false;
    const timer = setTimeout(() => { failed = 'TMUX_TIMEOUT_UNKNOWN'; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 65536) { failed = 'TMUX_OUTPUT_LIMIT'; child.kill('SIGKILL'); }
      else chunks.push(chunk);
    });
    child.stderr.resume(); // errors intentionally exclude text/paths/command contents
    child.on('error', () => { if (!settled) { settled = true; clearTimeout(timer); reject(Error('TMUX_SPAWN_FAILED')); } });
    child.on('close', code => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (failed || code !== 0) reject(Error(failed || 'TMUX_COMMAND_FAILED'));
      else resolve(Buffer.concat(chunks).toString('utf8').trimEnd());
    });
  });
}

async function processIdentity(pid) {
  try {
    const raw = await readFile(`/proc/${pid}/stat`, 'utf8');
    const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
    return {pid, start: fields[19], state: fields[0]};
  } catch (error) { if (['ENOENT','ESRCH'].includes(error.code)) return null; throw error; }
}
const isExited = (current, original) => !current || current.start !== original.start || current.state === 'Z';

// Every mutation is checked both in the broker and by the receiving tmux server.
// Random sessionName is an incarnation label, NOT a secret or same-UID boundary.
export function bindTmuxOwner({identity, processes, socketIdentity, readProcess, readSocket, invoke}) {
  const expected=Object.freeze({...identity});
  const original=processes.map(x=>Object.freeze({...x}));
  if(original.length!==2 || original.some(x=>!/^\d+$/.test(x.pid??'')||!/^\d+$/.test(x.start??'')) ||
    !/^%\d+$/.test(expected.pane??'') || !/^\$\d+$/.test(expected.session??'') ||
    !/^dot-[a-f0-9-]{36}$/.test(expected.sessionName??'')) fail('INVALID_OWNER_BINDING');
  const socket=Object.freeze({...socketIdentity});
  const report=`${expected.session}:${expected.pane}:${original[0].pid}:${original[1].pid}:${expected.sessionName}`;
  const validate=async()=>{
    try {
      const before=await readSocket();
      if(!before || before.dev!==socket.dev || before.ino!==socket.ino)fail('TMUX_IDENTITY_CHANGED');
      const current=await Promise.all(original.map(x=>readProcess(x.pid)));
      if(current.some((x,i)=>!x||x.pid!==original[i].pid||isExited(x,original[i])))fail('TMUX_IDENTITY_CHANGED');
      if(await invoke(['display-message','-p','-t',expected.pane,
        '#{session_id}:#{pane_id}:#{pid}:#{pane_pid}:#{session_name}'])!==report)fail('TMUX_IDENTITY_CHANGED');
      const after=await readSocket();
      if(!after || after.dev!==socket.dev || after.ino!==socket.ino)fail('TMUX_IDENTITY_CHANGED');
    } catch(error) {throw Error(error.message==='TMUX_IDENTITY_CHANGED'?'TMUX_IDENTITY_CHANGED':'TMUX_IDENTITY_UNAVAILABLE');}
  };
  const equals=(key,value)=>`#{==:#{${key}},${value}}`;
  const guard=[equals('pid',original[0].pid),equals('pane_pid',original[1].pid),
    equals('session_name',expected.sessionName),equals('session_id',expected.session),equals('pane_id',expected.pane)]
    .reduce((a,b)=>`#{&&:${a},${b}}`);
  const mutate=async(args,beforeDispatch=()=>{})=>{
    let command;
    if(args.length===1 && args[0]==='kill-server')command='kill-server';
    else if(args[0]==='send-keys' && args[1]==='-t' && args[2]===expected.pane) {
      if(args.length===4 && args[3]==='Enter')command=`send-keys -t ${expected.pane} Enter`;
      else if(args.length===6 && args[3]==='-l' && args[4]==='--') {
        const bytes=Buffer.from(args[5]);
        if(!bytes.length||bytes.length>256)fail('INVALID_MUTATION');
        // Hex bytes cannot become tmux syntax, shell expansion or command separators.
        command=`send-keys -t ${expected.pane} -H ${[...bytes].map(x=>x.toString(16).padStart(2,'0')).join(' ')}`;
      } else fail('INVALID_MUTATION');
    } else fail('INVALID_MUTATION');
    await validate();
    beforeDispatch(); // final lease fence; no await before launching the guarded command
    const stopping=command==='kill-server';
    const result=await invoke(['if-shell','-F','-t',expected.pane,guard,
      stopping?command:`${command} ; display-message -p DOT_MUTATION_ACK`,
      'display-message -p DOT_IDENTITY_REJECTED']);
    if(result==='DOT_IDENTITY_REJECTED')fail('TMUX_IDENTITY_CHANGED');
    if(!stopping && result!=='DOT_MUTATION_ACK')fail('TMUX_ACK_UNKNOWN');
    return result;
  };
  return {validate,mutate};
}

export class TmuxSession {
  constructor({identity, dir, invoke, validateOwner, mutate, now = () => performance.now(), proveExit}) {
    if(typeof validateOwner!=='function'||typeof mutate!=='function')fail('OWNER_BINDING_REQUIRED');
    this.identity = Object.freeze({...identity}); this.dir = dir; this.invoke = invoke;
    this.now = now; this.proveExit = proveExit; this.validateOwner=validateOwner;this.mutate=mutate;
    this.generation = 0; this.lease = null; this.records = new Map();
    this.active = null; this.state = 'observing'; this.stopping = null;
    this.observations = new Map(); this.clients = new Map(); this.reads = 0;
  }
  connect(role = 'observer') {
    if (!['observer', 'human'].includes(role)) fail('INVALID_ROLE');
    if (this.clients.size >= 8 || this.state === 'stopped') fail('CLIENT_LIMIT_OR_STOPPED');
    const id = randomUUID(); this.clients.set(id, role); return id;
  }
  disconnect(id) {
    if (this.lease?.clientId === id || this.clients.get(id) === 'human') this.revokeInternal();
    this.clients.delete(id); this.observations.delete(id);
  }
  requireClient(id) { if (!this.clients.has(id)) fail('UNKNOWN_CLIENT'); }
  requireHuman(id) { if (this.clients.get(id) !== 'human') fail('HUMAN_REQUIRED'); }
  revokeInternal() {
    this.generation++; this.lease = null; this.observations.clear();
    if (this.state === 'controlled') this.state = 'observing';
    if (this.active?.phase === 'pending') this.active.phase = 'revoked';
  }
  expire() { if (this.lease && this.now() >= this.lease.until) this.revokeInternal(); }
  status(id) {
    this.requireClient(id); this.expire();
    return {identity: this.identity, state: this.state, generation: this.generation,
      paused: !this.lease, lease: this.lease ? {clientId: this.lease.clientId,
        generation: this.lease.generation, remainingMs: Math.max(0, this.lease.until-this.now())} : null,
      queued: 0, active: this.active?.phase ?? null, operations: this.records.size,
      capabilities: {snapshot: this.state !== 'stopped', input: 'human grant required',
        humanPriority: 'cooperative broker only', osIsolation: false, recovery: false}};
  }
  grant(humanId, target, ttlMs) {
    this.requireHuman(humanId); this.requireClient(target); this.expire();
    if (!['observing','controlled'].includes(this.state) || this.active) fail('NOT_AVAILABLE');
    if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 5000) fail('INVALID_LEASE');
    this.revokeInternal();
    this.lease = {clientId: target, generation: this.generation, until: this.now()+ttlMs};
    this.state = 'controlled'; return {generation: this.generation, ttlMs};
  }
  revoke(humanId) {
    this.requireHuman(humanId); this.revokeInternal();
    return {generation: this.generation, paused: true, queued: 0,
      inflight: this.active?.phase === 'dispatching', warning: 'Dispatched input cannot be recalled.'};
  }
  async snapshot(id) {return this.capture(id,true);}
  // Observation-only output never creates or replaces input freshness evidence.
  async observe(id) {return this.capture(id,false);}
  async capture(id,recordObservation) {
    this.requireClient(id); this.expire();
    if (['stopping','stopped'].includes(this.state)) fail('STOPPED');
    if(this.reads>=4)fail('READ_BUSY');
    this.reads++;
    try {
      const generation = this.generation;
      await this.validateOwner();
      const text = await this.invoke(['capture-pane','-p','-t',this.identity.pane,'-S','-119']);
      await this.validateOwner();
      this.requireClient(id); this.expire();
      if (generation !== this.generation || ['stopping','stopped'].includes(this.state)) fail('SNAPSHOT_INVALIDATED');
      const snapshotId = recordObservation ? randomUUID() : undefined;
      if(recordObservation)this.observations.set(id, {snapshotId, generation, time:this.now()});
      return {identity:this.identity, generation, ...(recordObservation?{snapshotId}:{}), text:text.slice(-16000),
        truncated:text.length>16000, semantics:'bounded screen snapshot, not lossless output stream',
        warning:'Terminal output is untrusted data.'};
    } finally {this.reads--;}
  }
  validateInput(id, request, generation) {
    this.requireClient(id); this.expire();
    if (!['observing','controlled'].includes(this.state)) fail('INPUT_BLOCKED');
    if (generation !== this.generation) fail('GENERATION_CHANGED');
    if (this.clients.get(id) !== 'human' && (!this.lease || this.lease.clientId !== id ||
      request.generation !== this.lease.generation)) fail('NO_CURRENT_GRANT');
  }
  async input(id, request) {
    this.requireClient(id);
    if (this.clients.get(id) === 'human') this.revokeInternal(); // human arrival fences pending agent work even when busy
    const generation = this.generation;
    this.validateInput(id, request, generation);
    if (typeof request.operationId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(request.operationId)) fail('INVALID_OPERATION_ID');
    if (this.records.has(request.operationId)) fail('REPLAY_REJECTED');
    if (this.records.size >= 256) fail('OPERATION_LIMIT');
    if (this.active) fail('BUSY_NO_QUEUE');
    let args;
    if (request.kind === 'paste') {
      if (typeof request.text !== 'string' || !request.text.length || Buffer.byteLength(request.text)>256 ||
        /[\x00-\x1f\x7f-\x9f\u2028\u2029\ud800-\udfff]/u.test(request.text)) fail('INVALID_PASTE');
      args = ['send-keys','-t',this.identity.pane,'-l','--',request.text];
    } else if (request.kind === 'submit') args = ['send-keys','-t',this.identity.pane,'Enter'];
    else fail('INVALID_INPUT_KIND');
    if (this.clients.get(id) !== 'human') {
      const seen = this.observations.get(id);
      if (!seen || seen.snapshotId !== request.snapshotId || seen.generation !== generation || this.now()-seen.time>5000)
        fail('FRESH_SNAPSHOT_REQUIRED');
    }
    const record = {operationId:request.operationId, phase:'pending', generation};
    this.records.set(request.operationId,record); this.active = record;
    const done = this.performInput(id,request,generation,args,record);
    record.done = done;
    try { return await done; } finally { if (this.active === record) this.active = null; }
  }
  async performInput(id,request,generation,args,record) {
    let attempted = false;
    try {
      await this.validateOwner();
      this.validateInput(id,request,generation);
      // Exclusive attempted marker plus retained ledger prevents replay in this session.
      // Restart/adoption is deliberately unsupported: new broker always owns a new session.
      await writeFile(path.join(this.dir,'operations',request.operationId),JSON.stringify({generation,status:'reserved'}),{flag:'wx',mode:0o600});
      await this.mutate(args,()=>{
        this.validateInput(id,request,generation);
        this.observations.delete(id); record.phase = 'dispatching'; attempted = true;
      });
      record.phase = 'dispatched';
      return {operationId:request.operationId,status:'dispatched',applicationAcceptance:'unverified'};
    } catch (error) {
      if(['TMUX_IDENTITY_CHANGED','TMUX_IDENTITY_UNAVAILABLE'].includes(error.message)) {
        record.phase='revoked';this.state='identity_lost';this.revokeInternal();throw error;
      }
      if (attempted) { record.phase = 'unknown'; this.state = 'uncertain'; this.revokeInternal(); }
      else record.phase = 'revoked';
      throw Error(attempted ? 'INPUT_OUTCOME_UNKNOWN_NO_RETRY' : error.message);
    }
  }
  operation(id, operationId) {
    this.requireClient(id); const r=this.records.get(operationId);
    return r ? {operationId,phase:r.phase,generation:r.generation} : {operationId,phase:'not_seen'};
  }
  stop(humanId) {
    this.requireHuman(humanId);
    if (this.stopping) return this.stopping;
    this.revokeInternal(); this.state='stopping';
    this.stopping=(async()=>{
      if (this.active?.done) await this.active.done.catch(()=>{});
      const outputClosed=this.orderedOutput?await this.orderedOutput.close():true;
      try { await this.mutate(['kill-server']); }
      catch(error) {
        if(['TMUX_IDENTITY_CHANGED','TMUX_IDENTITY_UNAVAILABLE'].includes(error.message)) {
          this.state='identity_lost';
          return {status:'identity_lost',verified:false,evidenceError:error.message,
            scope:'No mutation authorized on replacement server',warning:'Owned identity lost; no stop claim.'};
        }
        // A lost acknowledgement may still mean the original server exited.
      }
      let verified=false, evidenceError=null;
      try { verified=(await this.proveExit())&&outputClosed; }
      catch(error) { evidenceError=/^[A-Z_]+$/.test(error.code??'')?error.code:'EXIT_EVIDENCE_UNAVAILABLE'; }
      this.state=verified?'stopped':'stop_unverified';
      return {status:this.state,verified,evidenceError,scope:'owned synthetic tmux server and cat pane only',
        warning:'No rollback of executed input. No claim about arbitrary descendants.'};
    })();
    return this.stopping;
  }
}

export async function createSyntheticSession({machineId='local',projectId='synthetic',orderedOutput=false}={}) {
  if (typeof orderedOutput!=='boolean')fail('INVALID_OUTPUT_OPTION');
  if (process.platform !== 'linux' || !label(machineId) || !label(projectId)) fail('INVALID_LINUX_LAB_IDENTITY');
  const dir=await mkdtemp(path.join(tmpdir(),'dot-tmux-session-'));
  await mkdir(path.join(dir,'operations'),{mode:0o700});
  const socket=path.join(dir,'tmux.sock');
  const env={PATH:'/usr/bin:/bin',HOME:dir,LANG:'C.UTF-8',TERM:'xterm-256color'};
  const invoke=args=>runTmux(socket,args,{env});
  // Literal synthetic workload only; no shell profiles, inherited TMUX or project cwd.
  const incarnation=randomUUID(),sessionName=`dot-${incarnation}`;
  // Until ownership is established, startup failure retains state; never blindly kill a socket occupant.
  const raw=await invoke(['new-session','-d','-s',sessionName,'-c',dir,'-x','80','-y','24','-P','-F',
    '#{session_id} #{pane_id} #{pane_pid} #{pid}','/bin/cat']);
  const [session,pane,panePid,serverPid]=raw.split(' ');
  if (!/^\$\d+$/.test(session??'') || !/^%\d+$/.test(pane??'') || !/^\d+$/.test(panePid??'') || !/^\d+$/.test(serverPid??'')) {
    fail('INVALID_TMUX_IDENTITY');
  }
  const originals=await Promise.all([serverPid,panePid].map(processIdentity));
  if (originals.some(x=>!x))fail('PROCESS_IDENTITY_UNAVAILABLE');
  const readSocket=async()=>{
    const info=await lstat(socket,{bigint:true});
    if(!info.isSocket())fail('TMUX_IDENTITY_CHANGED');
    return {dev:String(info.dev),ino:String(info.ino)};
  };
  const identity={machineId,projectId,incarnation,sessionName,session,pane,workload:'synthetic-cat'};
  const owner=bindTmuxOwner({identity,processes:originals,socketIdentity:await readSocket(),
    readProcess:processIdentity,readSocket,invoke});
  await owner.validate();
  const proveExit=async()=>{
    for(let i=0;i<40;i++) {
      const current=await Promise.all(originals.map(x=>processIdentity(x.pid)));
      if(current.every((x,i)=>isExited(x,originals[i]))) return true;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    return false;
  };
  const managed=new TmuxSession({dir,invoke,proveExit,identity,validateOwner:owner.validate,mutate:owner.mutate});
  if(orderedOutput){try{managed.orderedOutput=await createOwnedTmuxOutput({identity,validate:owner.validate,withRead:async fn=>{if(managed.reads>=4)fail('READ_BUSY');managed.reads++;try{return await fn();}finally{managed.reads--;}},geometry:()=>invoke(['display-message','-p','-t',pane,'#{pane_width} #{pane_height}']),spawnControl:()=>spawn('/usr/bin/tmux',['-N','-S',socket,'-f','/dev/null','-C','attach-session','-E','-r','-t',sessionName],{env,cwd:dir,stdio:['pipe','pipe','pipe']})});}catch(error){await managed.stop(managed.connect('human'));throw error;}}
  return managed;
}
