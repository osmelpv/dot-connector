#!/usr/bin/env node
// Standalone planner deliberately bypasses the operational CLI/log/config paths.
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createPlan,validatePlan,reviewPlan,detectConfigurator,statusPlan,parsePlannerJson} from '../src/configurator.mjs';
const args=process.argv.slice(2),command=args.shift();
try{
 if(!['detect','plan','validate','review','status'].includes(command))throw Error('CONFIGURATOR_COMMAND_UNAVAILABLE');
 let file,format='json';const seen=new Set();
 while(args.length){const arg=args.shift();if(seen.has(arg))throw Error('CONFIGURATOR_OPTIONS');seen.add(arg);
  if(arg==='--file'&&args.length)file=args.shift();else if(arg==='--json')format='json';else if(arg==='--human'&&command==='review')format='human';else throw Error('CONFIGURATOR_OPTIONS');
 }
 if((seen.has('--json')&&seen.has('--human'))||(command==='detect'&&file)||(!['detect','status'].includes(command)&&!file))throw Error('CONFIGURATOR_OPTIONS');
 let input;
 if(file){
  if(!path.isAbsolute(file))throw Error('CONFIGURATOR_FILE_UNAVAILABLE');
  let h;try{
   const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>32768)throw Error();
   h=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const s=await h.stat();if(!s.isFile()||s.size>32768)throw Error();
   const bytes=Buffer.alloc(32769);let size=0;while(size<bytes.length){const r=await h.read(bytes,size,bytes.length-size,null);if(!r.bytesRead)break;size+=r.bytesRead;}
   input=parsePlannerJson(bytes.subarray(0,size));
  }catch(e){if(e.message.startsWith('CONFIGURATOR_'))throw e;throw Error('CONFIGURATOR_FILE_UNAVAILABLE');}finally{await h?.close();}
 }
 // A previous plan response can be passed directly; no approval/status envelopes accepted.
 if(command!=='plan'&&input?.command==='plan'){
  if(Object.keys(input).sort().join(',')!=='command,ok,result,schemaVersion'||input.schemaVersion!==1||input.ok!==true)throw Error('PLAN_INVALID_SCHEMA');input=input.result;
 }
 const result=command==='detect'?detectConfigurator():command==='plan'?createPlan(input):command==='validate'?validatePlan(input):command==='review'?reviewPlan(input):statusPlan(input);
 process.stdout.write(format==='human'?result.text+'\n':JSON.stringify({schemaVersion:1,command,ok:true,result})+'\n');
}catch(error){const message=error.message??'',code=/^(CONFIGURATOR_|PLAN_|QUERY_)[A-Z_]+$/.test(message)?message:'CONFIGURATOR_FAILED';process.stdout.write(JSON.stringify({schemaVersion:1,command:['detect','plan','validate','review','status'].includes(command)?command:null,ok:false,error:code})+'\n');process.exitCode=1;}
