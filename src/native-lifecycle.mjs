// No forced process exit: wait for owned cleanup, fail closed on uncertainty.
export function bindNativeLifecycle({control,server,transport,input,signals,onFailure=()=>{}}){
 let done;
 const shutdown=()=>{
  if(done)return done;
  const closing=control.close(); // dispatch gate closes synchronously
  done=Promise.resolve().then(async()=>{
   const results=await Promise.allSettled([closing,server.close()]);
   if(results.some(r=>r.status==='rejected'))onFailure();
  }).finally(()=>{input.off('end',shutdown);input.off('close',shutdown);input.off('error',shutdown);for(const name of ['SIGINT','SIGTERM','SIGBREAK','beforeExit'])signals.off(name,shutdown);});
  return done;
 };
 transport.onclose=shutdown;
 input.once('end',shutdown);input.once('close',shutdown);input.once('error',shutdown);
 for(const name of ['SIGINT','SIGTERM','SIGBREAK','beforeExit'])signals.once(name,shutdown);
 return {shutdown};
}
