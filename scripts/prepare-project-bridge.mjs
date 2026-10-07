#!/usr/bin/env node
import {prepareProjectWindowsBridge} from '../src/project-wsl.mjs';
try{
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--root')throw Error('BRIDGE_EXPLICIT_ROOT_REQUIRED');
 console.log(JSON.stringify({ok:true,result:await prepareProjectWindowsBridge(args[1])}));
}catch(e){console.log(JSON.stringify({ok:false,error:/^BRIDGE_[A-Z_]+$/.test(e.message)?e.message:'BRIDGE_PREPARATION_FAILED'}));process.exitCode=1;}
