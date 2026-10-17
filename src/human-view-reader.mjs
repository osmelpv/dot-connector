// Browser-compatible read recovery only. No input, grants, checkpoints or retained bytes.
const keys=['machineId','projectId','incarnation','session','pane','streamEpoch'];
const fail=code=>{throw Object.assign(Error(code),{code});};
const configOf=value=>{
 if(!value||value.version!==2||!value.identity||Object.keys(value.identity).length!==6||!keys.every(k=>typeof value.identity[k]==='string'&&value.identity[k].length>0&&value.identity[k].length<=64))fail('VIEW_IDENTITY');
 const g=value.geometry;
 if(!g||Object.keys(g).sort().join(',')!=='atOffset,atSeq,columns,rows'||g.atSeq!==0||g.atOffset!==0||g.columns!==80||g.rows!==24)fail('VIEW_GEOMETRY_UNKNOWN');
 return {version:2,identity:Object.freeze({...value.identity}),geometry:Object.freeze({...g})};
};
const delay=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal.aborted){reject(Error('CANCELLED'));return;}
 const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);resolve();};
 const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(Error('CANCELLED'));};
 const timer=setTimeout(done,ms);signal.addEventListener('abort',abort,{once:true});
});
export function createHumanViewReader({fetchJson,createObserver,onStatus=()=>{},wait=delay}){
 const controller=new AbortController();let cancelled=false,observer,pinned,closing,recoveries=0,highSeq=0,highOffset=0;
 const report=(state,reason=null)=>{const result={state,...(reason?{reason}:{}),recoveries};onStatus(result);return result;};
 const done=Promise.resolve().then(async()=>{
  while(!cancelled){
   try{
    const config=configOf(await fetchJson('/config',controller.signal));if(cancelled)break;
    if(pinned&&!keys.every(k=>config.identity[k]===pinned.identity[k]))fail('VIEW_IDENTITY_CHANGED');
    pinned??=config;observer=createObserver(pinned);
    const targetSeq=highSeq,targetOffset=highOffset;let first=true,duplicates=0,rebuilding=recoveries>0;
    if(rebuilding)report('rebuilding');
    while(!cancelled){
     const cursor=observer.status();
     const frame=await fetchJson(`/frame?afterSeq=${cursor.seq}&offset=${cursor.offset}`,controller.signal);if(cancelled)break;
     if(frame?.kind==='gap')fail('VIEW_PREFIX_MISSING');
     if(first&&(frame?.kind!=='resize'||frame.seq!==1||frame.start!==0||frame.end!==0))fail('VIEW_GEOMETRY_UNKNOWN');
     if(frame?.kind==='resize'&&(frame.geometry?.columns!==80||frame.geometry?.rows!==24))fail('VIEW_GEOMETRY_UNKNOWN');
     const next=await observer.accept(frame);if(cancelled)break;first=false;
     if(next.duplicate){if(++duplicates>2)fail('VIEW_NO_PROGRESS');}else if(frame.kind!=='idle')duplicates=0;
     if(rebuilding&&((next.seq===targetSeq&&next.offset!==targetOffset)||(['idle','eof'].includes(frame.kind)&&next.seq<targetSeq)))fail('VIEW_PREFIX_MISSING');
     if(next.seq>highSeq){highSeq=next.seq;highOffset=next.offset;}
     if(next.seq>=targetSeq)rebuilding=false;
     if(next.state==='eof')return report('eof');
     onStatus({state:rebuilding?'rebuilding':'observing',recoveries,seq:next.seq,offset:next.offset});
     await wait(frame.kind==='idle'?150:10,controller.signal);
    }
   }catch(error){
    observer?.close();
    if(cancelled)break;
    if(error.message==='VT_IDENTITY_CHANGED')return report('closed','VIEW_IDENTITY_CHANGED');
    if(error.code!=='VIEW_TRANSPORT'||!pinned)return report('closed',/^[A-Z_]{1,64}$/.test(error.code??'')?error.code:'VIEW_INVALID_SOURCE');
    if(recoveries>=2)return report('closed','VIEW_RETRIES_EXHAUSTED');
    recoveries++;report('recovering');
    try{await wait(250*recoveries,controller.signal);}catch{if(!cancelled)return report('closed','VIEW_RECOVERY_WAIT_FAILED');}
   }
  }
  observer?.close();return report('cancelled');
 });
 return Object.freeze({done,close:()=>closing??=(async()=>{cancelled=true;controller.abort();observer?.close();const result=await done;return result.state==='cancelled'?result:report('cancelled');})()});
}
