#!/usr/bin/env node
import {installLocal} from '../src/local-install.mjs';
try{
 const args=process.argv.slice(2),options={},names={'--root':'root','--archive':'archive','--manifest':'manifest','--bridge-config':'bridgeConfig','--diagnostic-only':'diagnosticOnly'};
 while(args.length){const flag=args.shift(),key=names[flag];if(!key||Object.hasOwn(options,key))throw Error('LOCAL_INVALID_OPTIONS');if(key==='diagnosticOnly')options[key]=true;else{if(!args.length||args[0].startsWith('--'))throw Error('LOCAL_INVALID_OPTIONS');options[key]=args.shift();}}
 const result=await installLocal(options);console.log(JSON.stringify({ok:result.installed===true,result}));if(!result.installed)process.exitCode=2;
}catch(e){console.log(JSON.stringify({ok:false,error:/^(LOCAL|UPDATE|BRIDGE)_[A-Z_]+$/.test(e.message)?e.message:'LOCAL_INSTALL_FAILED'}));process.exitCode=1;}
