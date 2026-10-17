import xterm from '@xterm/xterm';
import {XtermObserver} from '../src/xterm-observer.mjs';
import {writeFile} from 'node:fs/promises';
import {OutputPresentation} from '../src/output-presentation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {OrderedOutputJournal,OrderedOutputReceiver} from '../src/ordered-output.mjs';
import {attachOrderedOutputSource} from '../src/ordered-output-source.mjs';
// Test-only Python stdlib harness. Creates its own PTY and one literal writer child.
// No shell, exec, stdin forwarding, terminal adoption, files or profiles.
const program=String.raw`
import os,sys,pty,tty,signal,errno,json,base64,fcntl,termios,struct
payload=base64.b64decode(sys.argv[1]); repetitions=int(sys.argv[2]); step=int(sys.argv[3])
master,slave=pty.openpty(); tty.setraw(slave)
fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack("HHHH",24,80,0,0))
pid=os.fork()
if pid==0:
    os.close(master)
    try:
        for _ in range(repetitions):
            for pos in range(0,len(payload),step):
                data=payload[pos:pos+step]
                while data:
                    n=os.write(slave,data);data=data[n:]
    finally:
        os.close(slave)
    os._exit(0)
os.close(slave)
class Cancelled(Exception):pass
def stop(signum,frame):raise Cancelled()
signal.signal(signal.SIGTERM,stop)
reason='eof'; status=None
try:
    while True:
        try:data=os.read(master,4096)
        except OSError as error:
            if error.errno==errno.EIO:break
            raise
        if not data:break
        while data:
            n=os.write(1,data);data=data[n:]
except (Cancelled,BrokenPipeError):reason='cancelled'
finally:
    signal.signal(signal.SIGTERM,signal.SIG_IGN)
    rows,columns,_,_=struct.unpack("HHHH",fcntl.ioctl(master,termios.TIOCGWINSZ,b"\0"*8))
    os.close(master)
    waited,status=os.waitpid(pid,0 if reason=='eof' else os.WNOHANG)
    if waited==0:
        try:os.kill(pid,signal.SIGTERM)
        except ProcessLookupError:pass
        waited,status=os.waitpid(pid,0)
    os.write(2,(json.dumps({'event':'cleanup','childReaped':waited==pid,'masterClosed':True,'reason':reason,'childStatus':status,'geometry':[columns,rows]})+'\n').encode())
`;
const native={skip:process.platform!=='linux'||process.env.DOT_TMUX_LAB_TEST!=='1',timeout:15000};
function fixture(t,payload,repetitions=1,step=1){
 const child=spawn('/usr/bin/python3',['-c',program,payload.toString('base64'),String(repetitions),String(step)],{cwd:tmpdir(),env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',b=>stderr=(stderr+b).slice(-4096));
 const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await closed;});
 const identity={machineId:'fixture',projectId:'synthetic',incarnation:randomUUID(),session:'owned-pty',pane:'output',streamEpoch:randomUUID()};
 return {child,closed,identity,evidence:()=>JSON.parse(stderr.trim())};
}
test('owned PTY preserves fragmented UTF8/escapes to two consumers and permits exact reread',native,async t=>{
 const input=Buffer.from('PTY synthetic \x1b[31mRED\x1b[0m 🧪\r\nnormal screen\x1b[?1049hALT SCREEN\x1b[?1049l\x1b[3;5Hcursor X\x1b[4;80HYZ\r\n\x1b]52;c;YQ==\x07\x1b]8;;https://invalid.test\x07not-link\x1b]8;;\x07\x1b]0;blocked-title\x07\x1bPbytes\x1b\\ END'),f=fixture(t,input),journal=new OrderedOutputJournal(f.identity);
 const clients=['human','agent'].map(label=>({reader:journal.connect(label),receiver:new OrderedOutputReceiver(f.identity),presentation:new OutputPresentation(f.identity),chunks:[],frames:[]}));
 const drain=()=>{for(const c of clients){const frame=c.reader.read(c.receiver.cursor());assert.deepEqual(frame.identity,f.identity);c.chunks.push(c.receiver.accept(frame).bytes);c.presentation.accept(frame);c.frames.push(frame);}};
 const adapter=attachOrderedOutputSource({source:f.child.stdout,journal,chunkBytes:1,onAvailable:drain});assert.equal((await adapter.done).status,'eof');
 assert.deepEqual(await f.closed,{code:0,signal:null});assert.equal(f.evidence().childReaped,true);assert.equal(f.evidence().masterClosed,true);assert.equal(f.evidence().childStatus,0);assert.deepEqual(f.evidence().geometry,[80,24]);
 const vt=clients.map(()=>new XtermObserver(xterm.Terminal,f.identity,{atSeq:0,atOffset:0,columns:80,rows:24}));
 try{for(let i=0;i<clients.length;i++)for(const frame of clients[i].frames)await vt[i].accept(frame);assert.deepEqual(vt[0].screen(),vt[1].screen());assert.equal(vt[0].status().state,'eof');for(const v of vt)assert.equal(v.status().forwardedInputBytes,0);}finally{for(const v of vt)v.close();}
 assert.equal(clients[0].presentation.view().text,clients[1].presentation.view().text);assert(!clients[0].presentation.view().text.includes('\x1b'));
 for(const c of clients)assert.throws(()=>c.presentation.resize(120,40),/FIXED_GEOMETRY/);
 if(process.env.DOT_OUTPUT_QA_FILE)await writeFile(process.env.DOT_OUTPUT_QA_FILE,JSON.stringify({geometry:f.evidence().geometry,source:'test-owned-pty',views:clients.map((c,i)=>({label:i?'agent':'human',frames:c.frames}))}));
 for(const c of clients){assert.equal(c.receiver.state,'eof');assert.deepEqual(Buffer.concat(c.chunks),input);c.receiver.resync();const reread=[];while(c.receiver.state!=='eof')reread.push(c.receiver.accept(c.reader.read(c.receiver.cursor())).bytes);assert.deepEqual(Buffer.concat(reread),input);}
 journal.close();assert.equal(journal.stats().retainedBytes,0);
});
test('PTY burst exceeds journal while fast reader drains and slow reader gets a gap',native,async t=>{
 const payload=Buffer.from('0123456789abcdef'.repeat(64)),repetitions=1024,f=fixture(t,payload,repetitions,payload.length),journal=new OrderedOutputJournal(f.identity,{capacity:8192,maxEvents:16});
 const fast=journal.connect('human'),slow=journal.connect('agent'),r=new OrderedOutputReceiver(f.identity),hash=createHash('sha256');let total=0;
 const adapter=attachOrderedOutputSource({source:f.child.stdout,journal,chunkBytes:1024,onAvailable:()=>{const result=r.accept(fast.read(r.cursor()));hash.update(result.bytes);total+=result.bytes.length;assert(journal.stats().retainedBytes<=8192);}});
 assert.equal((await adapter.done).status,'eof');assert.equal((await f.closed).code,0);assert.equal(f.evidence().childReaped,true);
 const expected=createHash('sha256');for(let i=0;i<repetitions;i++)expected.update(payload);assert.equal(hash.digest('hex'),expected.digest('hex'));assert.equal(total,1048576);
 const late=new OrderedOutputReceiver(f.identity);assert.equal(late.accept(slow.read(late.cursor())).state,'gap');assert.equal(late.accept(slow.read(late.resync())).state,'gap');journal.close();
});
test('cancel detaches source and owner separately verifies synthetic PTY process cleanup',native,async t=>{
 const f=fixture(t,Buffer.alloc(1024,120),100000,1024),journal=new OrderedOutputJournal(f.identity);let adapter,requested=false;
 adapter=attachOrderedOutputSource({source:f.child.stdout,journal,onAvailable:()=>{if(!requested){requested=true;queueMicrotask(()=>{void adapter.cancel();f.child.kill('SIGTERM');});}}});
 const result=await adapter.done;assert.equal(result.status,'cancelled');assert.equal(result.processExitVerified,false);
 assert.equal((await f.closed).code,0);assert.equal(f.evidence().childReaped,true);assert.equal(f.evidence().masterClosed,true);assert.equal(journal.stats().retainedBytes,0);assert.equal(journal.stats().eof,false);
});
