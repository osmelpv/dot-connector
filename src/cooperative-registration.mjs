// Pure model for synthetic evidence only. Never issues a registration or capability.
const token=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(x);
const pid=x=>Number.isInteger(x)&&x>0&&x<4294967295;
const ticks=x=>typeof x==='string'&&/^[1-9][0-9]{0,24}$/.test(x);
const off={registered:false,attach:false,read:false,paste:false,submit:false};
const blocked=(reason,consistent=false)=>({state:'blocked',reason,structurallyConsistent:consistent,capabilities:{...off},proof:'none; caller supplied data cannot attest ownership'});
export function rejectUntrustedRegistration(){return blocked('TRUSTED_BINDING_PROVIDER_UNAVAILABLE');}
export function evaluateRegistrationModel(model,nowMs){
 if(!model||!Number.isSafeInteger(nowMs)||!model.claim||!model.observation)return blocked('REGISTRATION_MODEL_INVALID');
 const {claim:c,observation:o}=model;
 // Labels are test data, not an authentication mechanism.
 if(model.evidenceMode!=='synthetic')return blocked('UNTRUSTED_REGISTRATION_INPUT');
 if(!token(c.paneId)||!token(c.consoleId)||!pid(c.clientPid)||!ticks(c.clientStartTicks)||!pid(c.hostPid)||!ticks(c.hostStartTicks)||c.clientPid===c.hostPid)return blocked('REGISTRATION_IDENTITY_INVALID');
 if(!Number.isSafeInteger(o.observedAtMs)||!Number.isSafeInteger(c.expiresAtMs)||o.observedAtMs>nowMs||nowMs-o.observedAtMs>5000||c.expiresAtMs<=nowMs||c.expiresAtMs>o.observedAtMs+5000)return blocked('REGISTRATION_EXPIRED');
 if(model.revoked!==false||!token(c.generation)||!token(o.generation)||c.generation!==o.generation)return blocked('REGISTRATION_REVOKED_OR_REPLACED');
 if(!Array.isArray(o.paneBindings)||o.paneBindings.length!==1||o.paneBindings[0]!==c.paneId)return blocked('REGISTRATION_ASSOCIATION_AMBIGUOUS');
 if(o.clientPid!==c.clientPid||o.clientStartTicks!==c.clientStartTicks||o.hostPid!==c.hostPid||o.hostStartTicks!==c.hostStartTicks||o.consoleId!==c.consoleId)return blocked('REGISTRATION_PROCESS_OR_CONSOLE_CHANGED');
 if(!token(c.ownerId)||!token(c.logonSessionId)||o.ownerId!==c.ownerId||o.logonSessionId!==c.logonSessionId)return blocked('REGISTRATION_OWNER_OR_SESSION_CHANGED');
 if(!['powershell.exe','pwsh.exe','wsl.exe'].includes(c.clientImage)||o.clientImage!==c.clientImage)return blocked('REGISTRATION_CLIENT_UNSUPPORTED');
 if(c.clientImage==='wsl.exe'){
  if(!c.wsl||!o.wsl||!token(c.wsl.distroId)||!token(c.wsl.bootId)||!pid(c.wsl.pid)||!ticks(c.wsl.startTicks)||!/^\/dev\/pts\/[0-9]{1,8}$/.test(c.wsl.tty)||!token(c.wsl.sessionId))return blocked('REGISTRATION_WSL_EVIDENCE_MISSING');
  for(const k of ['distroId','bootId','pid','startTicks','tty','sessionId'])if(c.wsl[k]!==o.wsl[k])return blocked('REGISTRATION_WSL_SESSION_CHANGED');
 }
 return blocked('TRUSTED_BINDING_PROVIDER_UNAVAILABLE',true);
}
