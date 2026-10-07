#!/usr/bin/env node
import {bootstrap,updateError} from '../src/update-release.mjs';
const args=process.argv.slice(2),options={};
try{
 while(args.length){const key=args.shift();if(!['--root','--version'].includes(key)||!args.length||Object.hasOwn(options,key))throw Error('UPDATE_INVALID_OPTIONS');options[key]=args.shift();}
 if(!options['--root']||!options['--version'])throw Error('UPDATE_EXPLICIT_ROOT_AND_VERSION_REQUIRED');
 console.log(JSON.stringify({ok:true,result:await bootstrap(options['--root'],options['--version'])}));
}catch(e){console.log(JSON.stringify({ok:false,error:updateError(e)}));process.exitCode=1;}
