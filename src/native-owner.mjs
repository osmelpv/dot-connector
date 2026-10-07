import {execFile} from 'node:child_process';
import path from 'node:path';
const decimal=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
export function ownerIdentity(value){
 if(!value||!Number.isInteger(value.pid)||value.pid<1||value.pid>2147483647||!decimal(value.startTimeTicks)||typeof value.userSid!=='string'||!/^S-1-[0-9-]{1,180}$/.test(value.userSid)||!Number.isInteger(value.sessionId)||value.sessionId<0||value.sessionId>2147483647)throw Error('OWNER_IDENTITY_INVALID');
 return Object.freeze({pid:value.pid,startTimeTicks:value.startTimeTicks,userSid:value.userSid,sessionId:value.sessionId});
}
export function createWindowsOwnerProbe(executable){
 if(process.platform!=='win32'||!path.isAbsolute(executable)||path.basename(executable)!=='DotConnector.Owner.exe')throw Error('WINDOWS_OWNER_PROBE_REQUIRED');
 // Always bind to THIS Node caller. No public arbitrary-PID query parameter.
 return async()=>{
  const raw=await new Promise((resolve,reject)=>execFile(executable,[String(process.pid)],{windowsHide:true,shell:false,timeout:3000,maxBuffer:4096,encoding:'utf8'},(error,stdout)=>error?reject(Error('OWNER_PROBE_FAILED')):resolve(stdout)));
  let identity;try{identity=ownerIdentity(JSON.parse(raw));}catch{throw Error('OWNER_PROBE_INVALID');}
  if(identity.pid!==process.pid)throw Error('OWNER_CALLER_MISMATCH');
  return identity;
 };
}
