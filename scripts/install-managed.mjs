#!/usr/bin/env node
import {prepareProjectWindowsBridge,bridgeCapability} from '../src/project-wsl.mjs';
import {readFile} from 'node:fs/promises';
import {bootstrap,updateError} from '../src/update-release.mjs';
const args=process.argv.slice(2),options={};
try{
 while(args.length){const key=args.shift();if(!['--root','--version'].includes(key)||!args.length||Object.hasOwn(options,key))throw Error('UPDATE_INVALID_OPTIONS');options[key]=args.shift();}
 if(!options['--root']||!options['--version'])throw Error('UPDATE_EXPLICIT_ROOT_AND_VERSION_REQUIRED');
 const result=await bootstrap(options['--root'],options['--version']);
 const capability=bridgeCapability(process.platform,await readFile('/proc/sys/kernel/osrelease','utf8'));
 if(capability.wsl)result.windowsBridge=await prepareProjectWindowsBridge(options['--root']);
 else result.windowsBridge={ready:false,reason:'NATIVE_LINUX_CONTROL_UNSUPPORTED'};
 console.log(JSON.stringify({ok:true,result}));
}catch(e){console.log(JSON.stringify({ok:false,error:/^BRIDGE_[A-Z_]+$/.test(e.message)?e.message:updateError(e)}));process.exitCode=1;}
