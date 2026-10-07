export async function operationDeadline(promise,timeoutMs){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>180000)throw Error('INVALID_OPERATION_DEADLINE');
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('OPERATION_TIMEOUT_OUTCOME_UNKNOWN_NO_RETRY')),timeoutMs);})]);}
 finally{clearTimeout(timer);}
}
