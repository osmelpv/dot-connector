// Lab-only protocol model. No filesystem/native adapter; never imported by product.
// Store MUST implement linearizable compareExchange(key, expectedStringOrNull, next).
import {randomUUID} from 'node:crypto';
const decimal=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
const pid=v=>Number.isSafeInteger(v)&&v>0&&v<=2147483647;
const canonicalOwner=o=>{
 if(!o||!pid(o.pid)||!decimal(o.startTimeTicks)||typeof o.userSid!=='string'||!o.userSid||!Number.isSafeInteger(o.sessionId)||o.sessionId<0)throw Error('OWNER_IDENTITY_REQUIRED');
 return {pid:o.pid,startTimeTicks:o.startTimeTicks,userSid:o.userSid,sessionId:o.sessionId};
};
export class ClaimLease {
 #owner;
 constructor({store,proof,target,owner}){
  if(!target||!decimal(target.hwnd)||!pid(target.pid)||!decimal(target.startTimeTicks))throw Error('TARGET_IDENTITY_REQUIRED');
  this.key=JSON.stringify({hwnd:target.hwnd,pid:target.pid,startTimeTicks:target.startTimeTicks});
  this.#owner=Object.freeze(canonicalOwner(owner));this.store=store;this.proof=proof;this.state='new';this.record=null;
 }
 async verify(quiescent){
  // Trusted adapter must attest *this caller*, not merely query some live PID.
  const p=await this.proof.inspectCaller({...this.#owner});
  if(!p||p.callerBound!==true||p.alive!==true||JSON.stringify(canonicalOwner(p.identity))!==JSON.stringify(this.#owner))throw Error('OWNER_UNPROVEN');
  // The adapter holds its dispatch gate closed through CAS; no concurrent worker/input.
  if(quiescent&&(p.dispatchGateHeld!==true||p.workersStopped!==true||p.pendingOperations!==0||p.unknownOutcome!==false))throw Error('NOT_QUIESCENT');
 }
 async acquire(){
  if(this.state!=='new')throw Error('LEASE_STATE');this.state='acquiring';
  try{
   await this.verify(false);
   const record=JSON.stringify({schema:2,owner:this.#owner,nonce:randomUUID(),target:JSON.parse(this.key)});
   if(!await this.store.compareExchange(this.key,null,record))throw Error('CLAIM_EXISTS_NO_RECOVERY');
   this.record=record;this.state='owned';return {claimed:true};
  }catch(e){this.state='blocked';throw e;}
 }
 async close(){
  if(this.state!=='owned')throw Error('LEASE_STATE');this.state='closing';
  try{
   await this.verify(true);
   if(!await this.store.compareExchange(this.key,this.record,null))throw Error('OWNERSHIP_CHANGED');
   this.state='closed';return {released:true};
  }catch(e){this.state='blocked';throw e;}
 }
}
