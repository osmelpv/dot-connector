#!/usr/bin/env node
// Preflight only: the runtime keeps its own Node 22 guards. Run before npm ci, tests or build.
import {fileURLToPath} from 'node:url';import path from 'node:path';
export const REQUIRED_NODE_MAJOR='22';
export function checkNodeVersion(raw=process.versions.node){
 const version=String(raw).replace(/^v/,''),major=/^(\d+)\.\d+\.\d+/.exec(version)?.[1];
 if(major===REQUIRED_NODE_MAJOR)return {ok:true,version,required:`${REQUIRED_NODE_MAJOR}.x`};
 return {ok:false,code:'NODE_22_REQUIRED',version,required:`${REQUIRED_NODE_MAJOR}.x`,
  message:`dot-connector requires Node 22.x (found ${version}). Other Node majors are not supported: the runtime refuses them and the test suite fails. Put an existing Node 22 runtime first in PATH for this shell, then rerun. See CONTRIBUTING.md.`};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=checkNodeVersion();
 if(result.ok)console.log(JSON.stringify(result));else{console.error(JSON.stringify(result));process.exitCode=1;}
}
