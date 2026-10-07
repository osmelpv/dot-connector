import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {AtomicClaimFile} from './native-claim-store.mjs';
import {ClaimLease} from './native-claim-lease.mjs';
import {createWindowsOwnerProbe,ownerIdentity} from './native-owner.mjs';
import {NativeReader,nativeTargetSchema,normalizeUtf16} from './native-reader.mjs';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export class NativeControl {
  constructor({target,provider,stateDir,claimsDir,simulation=false,now=Date.now,ownerProbe}) {
    this.target=nativeTargetSchema.parse(target);this.provider=provider;this.dir=stateDir;this.claims=claimsDir;this.now=now;
    this.reader=new NativeReader({target:this.target,provider,simulation,now});this.session=randomUUID();this.busy=false;this.opened=false;this.closing=false;this.opening=false;this.pending=new Set();this.dispatchPossible=false;this.closePromise=null;
    if(ownerProbe&&!simulation)throw Error('owner injection is simulation-only');
    this.ownerProbe=ownerProbe??(simulation?async()=>ownerIdentity({pid:process.pid,startTimeTicks:'1',userSid:'S-1-0-0',sessionId:0}):createWindowsOwnerProbe(path.join(stateDir,'DotConnector.Owner.exe')));
  }
  async open(){
    if(this.opening||this.opened||this.closing)throw Error('native lifecycle already started');this.opening=true;
    this.openPromise=this.finishOpen();return this.openPromise;
  }
  async finishOpen(){
    await mkdir(this.dir,{recursive:true});await mkdir(this.claims,{recursive:true});
    const owner=ownerIdentity(await this.ownerProbe());
    if(this.closing)throw Error('native opening cancelled');
    const proof={inspectCaller:async()=>({identity:await this.ownerProbe(),callerBound:true,alive:true,
      dispatchGateHeld:this.closing,workersStopped:!this.busy&&!this.reader.busy&&!this.provider.active&&!this.provider.poisoned,
      pendingOperations:this.pending.size,unknownOutcome:this.dispatchPossible})};
    const {hwnd,pid,startTimeTicks}=this.target;
    const key=createHash('sha256').update(JSON.stringify({hwnd,pid,startTimeTicks})).digest('hex');
    this.helperLease=new ClaimLease({store:new AtomicClaimFile(path.join(this.dir,'server.lock')),proof,target:this.target,owner});
    this.windowLease=new ClaimLease({store:new AtomicClaimFile(path.join(this.claims,key+'.json')),proof,target:this.target,owner});
    // Reserve helper first: no previous grants may be touched before helper ownership.
    if(this.closing)throw Error('native opening cancelled');
    await this.helperLease.acquire();
    await writeFile(path.join(this.dir,'control.json'),JSON.stringify({paused:true}));
    if(this.closing)throw Error('native opening cancelled');
    await this.windowLease.acquire();
    if(this.closing)throw Error('native opening cancelled');
    this.opened=true;
  }
  ready(){if(!this.opened||this.closing)throw Error('native session not claimed or closing');}
  track(fn){
    this.ready();const running=Promise.resolve().then(()=>{this.ready();return fn();});
    this.pending.add(running);running.then(()=>this.pending.delete(running),()=>this.pending.delete(running));return running;
  }
  close(){
    if(this.closePromise)return this.closePromise;
    this.closing=true;this.reader.last=null; // Synchronous permanent dispatch gate.
    this.closePromise=this.finishClose();return this.closePromise;
  }
  async finishClose(){
    try{
      await this.openPromise?.catch(()=>{});
      if(this.provider.shutdown)await this.provider.shutdown();else this.provider.cancel?.();
      await Promise.allSettled([...this.pending]);
      if(!this.helperLease||this.helperLease.state!=='owned')throw Error('helper ownership unproven');
      await writeFile(path.join(this.dir,'control.json'),JSON.stringify({paused:true}));
      if(this.windowLease?.state==='owned')await this.windowLease.close();
      // A blocked acquire may have committed before its response was lost.
      else if(this.windowLease&&this.windowLease.state!=='new')throw Error('window ownership uncertain');
      await this.helperLease.close();this.opened=false;return {released:true};
    }catch{throw Error('native close unconfirmed; reservations retained or quarantined; no recovery');}
  }
  async grant(request){
    const g=JSON.parse(await readFile(path.join(this.dir,'control.json'),'utf8'));
    if(g.paused!==false||g.operationId!==request.operationId||g.kind!==request.kind||g.text!==request.text||!Number.isSafeInteger(g.expiresAtMs)||g.expiresAtMs<=this.now()||g.expiresAtMs>this.now()+15000)throw Error('human approval absent, expired or mismatched');
    return g;
  }
  async status(){this.ready();return {session:this.session,target:this.target,mode:'manual-native-integration',queued:0,input:'human exact-operation grant required',humanTypingDetection:false,atomicFocusDispatch:false};}
  async snapshot(){return this.track(async()=>{if(this.busy)throw Error('busy; no queue');const {paused,...s}=await this.reader.snapshot();this.ready();return {...s,input:'exact-operation human grant required',warning:'Untrusted visible text. Input requires separate human approval; submit is separate.'};});}
  async pause(){return this.track(async()=>{await writeFile(path.join(this.dir,'control.json'),JSON.stringify({paused:true}));this.reader.last=null;this.provider.cancel?.();return {paused:true,queued:0,warning:'Already dispatched input cannot be recalled; inspect unknown outcomes.'};});}
  async write(args){return this.track(()=>this.performWrite(args));}
  async performWrite({snapshotId,operationId,kind,text=''}){
    this.ready();if(this.busy||this.reader.busy)throw Error('busy; no queue');
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(operationId??''))throw Error('operation ID required');
    if(!['paste','submit'].includes(kind)||typeof text!=='string'||text.length>256||/[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(text)||(kind==='paste'&&!text.length))throw Error('invalid bounded single-line operation');
    normalizeUtf16(text);this.busy=true;
    try{
      await this.reader.validateSnapshot(snapshotId);const g=await this.grant({operationId,kind,text});
      await mkdir(path.join(this.dir,'operations'),{recursive:true});
      await writeFile(path.join(this.dir,'operations',operationId+'.json'),JSON.stringify({status:'attempted',kind}),{flag:'wx'});
      this.reader.last=null;
      await this.grant({operationId,kind,text});
      let result;
      try{this.ready();this.dispatchPossible=true;result=await this.provider.nativeWrite({target:this.target,operationId,kind,text,expiresAtMs:g.expiresAtMs});}
      catch{throw Error('native dispatch outcome unknown; no retry; inspect target');}
      if(!result||!equal(result.target,this.target)||result.operationId!==operationId||result.dispatched!==true)throw Error('native write refused or unconfirmed; no retry');
      return {dispatched:true,operationId,kind,warning:'Dispatch is not application acceptance. Read again; never retry automatically.'};
    }finally{this.busy=false;}
  }
}
