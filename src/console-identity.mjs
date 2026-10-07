// Pure design contract only: no OS enumeration, attachment, window reads or input.
const fail=code=>{throw Error(code);};
const token=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(x);
const processIdentity=p=>p&&Number.isSafeInteger(p.pid)&&p.pid>0&&p.pid<4294967295&&typeof p.startTimeTicks==='string'&&/^[1-9][0-9]{0,24}$/.test(p.startTimeTicks);
export function validateConsoleAssociation(value,nowMs){
 if(!value||value.schema!==1||!token(value.paneId)||!token(value.consoleId)||!processIdentity(value.client)||!processIdentity(value.host))fail('CONSOLE_IDENTITY_INVALID');
 if(!['pwsh.exe','powershell.exe','wsl.exe'].includes(value.client.image)||value.client.pid===value.host.pid)fail('CONSOLE_CLIENT_REQUIRED');
 if(!Number.isSafeInteger(nowMs)||!Number.isSafeInteger(value.observedAtMs)||value.observedAtMs>nowMs||nowMs-value.observedAtMs>5000)fail('CONSOLE_IDENTITY_STALE');
 if(!value.association||value.association.kind!=='provider-bound'||!token(value.association.generation))fail('CONSOLE_ASSOCIATION_UNPROVEN');
 if(value.client.image==='wsl.exe'&&(!value.wsl||!token(value.wsl.distroId)||!/^\/dev\/pts\/[0-9]{1,8}$/.test(value.wsl.tty)||!token(value.wsl.sessionId)))fail('CONSOLE_WSL_IDENTITY_REQUIRED');
 return value;
}
export function resolveConsoleMetadata(candidates,paneId,nowMs){
 if(!Array.isArray(candidates)||candidates.length>128||!token(paneId))fail('CONSOLE_LIST_INVALID');
 const matches=candidates.filter(v=>v?.paneId===paneId);
 if(matches.length===0)fail('CONSOLE_TARGET_NOT_FOUND');
 if(matches.length!==1)fail('CONSOLE_ASSOCIATION_AMBIGUOUS');
 const v=validateConsoleAssociation(matches[0],nowMs);
 return {schema:1,paneId:v.paneId,consoleId:v.consoleId,client:{pid:v.client.pid,startTimeTicks:v.client.startTimeTicks,image:v.client.image},host:{pid:v.host.pid,startTimeTicks:v.host.startTimeTicks},association:{kind:v.association.kind,generation:v.association.generation},observedAtMs:v.observedAtMs,...(v.wsl?{wsl:{distroId:v.wsl.distroId,tty:v.wsl.tty,sessionId:v.wsl.sessionId}}:{}),capabilities:{metadata:true,attach:false,read:false,paste:false,submit:false,focuslessInput:false,reason:'DESIGN_ONLY_NO_BINDING_PROVIDER'}};
}
export function assertSameConsoleIdentity(before,after,nowMs){
 validateConsoleAssociation(before,nowMs);validateConsoleAssociation(after,nowMs);
 const identity=v=>JSON.stringify([v.paneId,v.consoleId,v.client.pid,v.client.startTimeTicks,v.client.image,v.host.pid,v.host.startTimeTicks,v.association.generation,v.wsl?.distroId,v.wsl?.tty,v.wsl?.sessionId]);
 if(identity(before)!==identity(after))fail('CONSOLE_IDENTITY_CHANGED');
 return true;
}
