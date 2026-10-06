import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {NativeReader,nativeTargetSchema,normalizeUtf16} from './native-reader.mjs';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export class NativeControl {
  constructor({target,provider,stateDir,claimsDir,simulation=false,now=Date.now}) {
    this.target=nativeTargetSchema.parse(target);this.provider=provider;this.dir=stateDir;this.claims=claimsDir;this.now=now;
    this.reader=new NativeReader({target:this.target,provider,simulation,now});this.session=randomUUID();this.busy=false;this.opened=false;
  }
  async open(){
    await mkdir(this.dir,{recursive:true});await mkdir(this.claims,{recursive:true});
    // Claim the whole terminal HWND, not just a UIA leaf: siblings cannot compete.
    const {hwnd,pid,startTimeTicks}=this.target;
    const key=createHash('sha256').update(JSON.stringify({hwnd,pid,startTimeTicks})).digest('hex');
    await writeFile(path.join(this.claims,key+'.json'),JSON.stringify({session:this.session}),{flag:'wx'});
    await writeFile(path.join(this.dir,'server.lock'),this.session,{flag:'wx'});
    await writeFile(path.join(this.dir,'control.json'),JSON.stringify({paused:true}));this.opened=true;
  }
  ready(){if(!this.opened)throw Error('native session not claimed');}
  async grant(request){
    const g=JSON.parse(await readFile(path.join(this.dir,'control.json'),'utf8'));
    if(g.paused!==false||g.operationId!==request.operationId||g.kind!==request.kind||g.text!==request.text||!Number.isSafeInteger(g.expiresAtMs)||g.expiresAtMs<=this.now()||g.expiresAtMs>this.now()+15000)throw Error('human approval absent, expired or mismatched');
    return g;
  }
  async status(){this.ready();return {session:this.session,target:this.target,mode:'manual-native-integration',queued:0,input:'human exact-operation grant required',humanTypingDetection:false,atomicFocusDispatch:false};}
  async snapshot(){this.ready();if(this.busy)throw Error('busy; no queue');const {paused,...s}=await this.reader.snapshot();return {...s,input:'exact-operation human grant required',warning:'Untrusted visible text. Input requires separate human approval; submit is separate.'};}
  async pause(){this.ready();await writeFile(path.join(this.dir,'control.json'),JSON.stringify({paused:true}));this.reader.last=null;this.provider.cancel?.();return {paused:true,queued:0,warning:'Already dispatched input cannot be recalled; inspect unknown outcomes.'};}
  async write({snapshotId,operationId,kind,text=''}){
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
      try{result=await this.provider.nativeWrite({target:this.target,operationId,kind,text,expiresAtMs:g.expiresAtMs});}
      catch{throw Error('native dispatch outcome unknown; no retry; inspect target');}
      if(!result||!equal(result.target,this.target)||result.operationId!==operationId||result.dispatched!==true)throw Error('native write refused or unconfirmed; no retry');
      return {dispatched:true,operationId,kind,warning:'Dispatch is not application acceptance. Read again; never retry automatically.'};
    }finally{this.busy=false;}
  }
}
